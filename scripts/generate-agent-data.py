#!/usr/bin/env python3
from __future__ import annotations

import glob
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

SESSIONS_GLOB = '~/.openclaw/agents/main/sessions/*.jsonl'
OUT_PATH = Path(__file__).resolve().parent.parent / 'data' / 'agents.json'
LOCAL_TZ = ZoneInfo('America/Matamoros')


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        if value.endswith('Z'):
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        dt = datetime.fromisoformat(value)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def short_model(model: str | None) -> str:
    if not model:
        return 'Unknown'
    name = model.split('/')[-1]
    if 'opus' in name:
        return 'Opus'
    if 'gpt-5' in name:
        return 'GPT-5.4'
    if 'minimax' in name:
        return 'MiniMax'
    return name.replace('-', ' ').title()


def extract_text(message: dict) -> str:
    return '\n'.join(
        item.get('text', '')
        for item in (message.get('content') or [])
        if item.get('type') == 'text'
    )


def extract_task_preview(task: str) -> str:
    task = re.sub(r'\s+', ' ', (task or '').strip())
    task = re.sub(r'^#+\s*Task:\s*', '', task, flags=re.I)
    return task[:180] + ('…' if len(task) > 180 else '')


def parse_runtime_minutes(text: str) -> float:
    match = re.search(r'runtime\s+(\d+)m(?:(\d+)s)?', text)
    if match:
        return int(match.group(1)) + (int(match.group(2) or 0) / 60)
    match = re.search(r'runtime\s+(\d+)s', text)
    if match:
        return int(match.group(1)) / 60
    return 0.0


def parse_tokens(text: str) -> int:
    match = re.search(r'tokens\s+([\d.]+)k', text)
    if match:
        return int(float(match.group(1)) * 1000)
    match = re.search(r'tokens\s+(\d[\d,]*)', text)
    if match:
        return int(match.group(1).replace(',', ''))
    return 0


def parse_status(text: str) -> str:
    lowered = text.lower()
    if 'failed' in lowered:
        return 'failed'
    if 'completed successfully' in lowered or 'completed subagent task is ready' in lowered:
        return 'completed'
    if 'running' in lowered:
        return 'running'
    return 'completed' if '<<<begin_untrusted_child_result>>>' in lowered else 'unknown'


def main() -> None:
    spawns: list[dict] = []
    completions: dict[str, dict] = {}
    main_sessions = []
    main_model_counts = Counter()
    main_cost = 0.0
    main_tokens = 0

    for path in sorted(glob.glob(str(Path(SESSIONS_GLOB).expanduser()))):
        events = []
        try:
            with open(path, 'r', encoding='utf-8') as handle:
                for line in handle:
                    try:
                        events.append(json.loads(line))
                    except Exception:
                        continue
        except Exception:
            continue
        if not events:
            continue

        session_start = None
        session_end = None
        current_model = None
        session_tokens = 0
        session_cost = 0.0
        session_spawns = 0

        pending_by_tool_call: dict[str, dict] = {}
        pending_by_key: dict[str, dict] = {}

        for event in events:
            ts = parse_ts(event.get('timestamp'))
            if ts:
                session_start = min(session_start, ts) if session_start else ts
                session_end = max(session_end, ts) if session_end else ts

            if event.get('type') == 'model_change' and event.get('modelId'):
                current_model = event['modelId']
            elif event.get('type') == 'custom' and event.get('customType') == 'model-snapshot':
                current_model = event.get('data', {}).get('modelId') or current_model

            if event.get('type') != 'message':
                continue

            message = event.get('message', {})
            role = message.get('role')

            if role == 'assistant':
                usage = message.get('usage') or {}
                model = message.get('model') or current_model
                if model and model != 'delivery-mirror':
                    main_model_counts[short_model(model)] += 1
                    session_tokens += int((usage.get('input') or 0) + (usage.get('output') or 0))
                    session_cost += float(((usage.get('cost') or {}).get('total') or 0))

                for content in message.get('content') or []:
                    if content.get('type') == 'toolCall' and content.get('name') == 'sessions_spawn':
                        session_spawns += 1
                        record = {
                            'sourceSessionId': Path(path).stem,
                            'toolCallId': content.get('id'),
                            'spawnedAt': ts.astimezone(LOCAL_TZ).isoformat() if ts else None,
                            'task': content.get('arguments', {}).get('task', ''),
                            'taskPreview': extract_task_preview(content.get('arguments', {}).get('task', '')),
                            'label': content.get('arguments', {}).get('label'),
                            'runtime': content.get('arguments', {}).get('runtime'),
                            'mode': content.get('arguments', {}).get('mode'),
                            'status': 'running',
                            'childSessionKey': None,
                            'runId': None,
                            'completionSummary': None,
                            'durationMinutes': 0.0,
                            'tokenUsage': 0,
                            'resultSnippet': None,
                        }
                        pending_by_tool_call[content.get('id')] = record
                        spawns.append(record)

            elif role == 'toolResult':
                if message.get('toolName') == 'sessions_spawn':
                    tool_call_id = message.get('toolCallId')
                    text = extract_text(message)
                    try:
                        payload = json.loads(text)
                    except Exception:
                        payload = {}
                    record = pending_by_tool_call.get(tool_call_id)
                    if record:
                        record['childSessionKey'] = payload.get('childSessionKey')
                        record['runId'] = payload.get('runId')
                        record['status'] = 'running'
                        if payload.get('childSessionKey'):
                            pending_by_key[payload['childSessionKey']] = record

            elif role == 'user':
                text = extract_text(message)
                if 'session_key: agent:main:subagent:' in text:
                    key_match = re.search(r'session_key:\s*(agent:main:subagent:[^\n]+)', text)
                    key = key_match.group(1).strip() if key_match else None
                    result_match = re.search(r'<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>\n(.*?)\n<<<END_UNTRUSTED_CHILD_RESULT>>>', text, re.S)
                    completion = {
                        'sessionKey': key,
                        'status': parse_status(text),
                        'durationMinutes': round(parse_runtime_minutes(text), 1),
                        'tokenUsage': parse_tokens(text),
                        'resultSnippet': (result_match.group(1).strip()[:260] + '…') if result_match and len(result_match.group(1).strip()) > 260 else (result_match.group(1).strip() if result_match else None),
                        'completedAt': ts.astimezone(LOCAL_TZ).isoformat() if ts else None,
                        'completionSummary': re.search(r'task:\s*(.+)', text),
                    }
                    if completion['completionSummary']:
                        completion['completionSummary'] = completion['completionSummary'].group(1).strip()
                    if key:
                        completions[key] = completion
                        record = pending_by_key.get(key)
                        if record:
                            record.update({k: v for k, v in completion.items() if k != 'sessionKey'})

        main_sessions.append({
            'id': Path(path).stem,
            'timestamp': session_start.astimezone(LOCAL_TZ).isoformat() if session_start else None,
            'durationMinutes': round(((session_end - session_start).total_seconds() / 60.0) if session_start and session_end else 0.0, 1),
            'model': short_model(current_model),
            'tokens': session_tokens,
            'cost': round(session_cost, 6),
            'spawnCount': session_spawns,
        })
        main_tokens += session_tokens
        main_cost += session_cost

    spawns.sort(key=lambda item: item.get('spawnedAt') or '', reverse=True)
    recent_agents = spawns[:12]
    task_history = spawns[:20]

    status_counts = Counter(item['status'] for item in spawns)
    model_breakdown = Counter()
    for item in spawns:
        text = (item.get('resultSnippet') or '') + ' ' + (item.get('task') or '')
        lowered = text.lower()
        if 'gpt-5' in lowered:
            model_breakdown['GPT-5.4'] += 1
        elif 'minimax' in lowered:
            model_breakdown['MiniMax'] += 1
        else:
            model_breakdown['Subagent'] += 1

    payload = {
        'generatedAt': datetime.now(LOCAL_TZ).isoformat(),
        'ceo': {
            'name': 'Claw',
            'role': 'CEO / orchestrator',
            'primaryModel': 'Opus',
            'description': 'Keeps the high-context conversation, chooses strategy, and delegates execution to cheaper specialist subagents.',
            'sessionCount': len(main_sessions),
            'totalTokens': main_tokens,
            'totalCost': round(main_cost, 6),
            'totalDelegations': len(spawns),
            'completedDelegations': status_counts.get('completed', 0),
            'averageDelegationTokens': int(sum(item.get('tokenUsage', 0) for item in spawns) / len(spawns)) if spawns else 0,
        },
        'architecture': {
            'headline': 'Opus handles judgment and orchestration; delegated agents absorb execution-heavy work.',
            'lanes': [
                {'label': 'Opus', 'role': 'Conversation, planning, review', 'accent': 'amber'},
                {'label': 'GPT-5.4', 'role': 'Coding, research, file edits', 'accent': 'emerald'},
                {'label': 'MiniMax', 'role': 'Lightweight / low-cost parallel tasks', 'accent': 'sky'},
            ],
            'delegationMix': [
                {'label': label, 'count': count}
                for label, count in model_breakdown.items()
            ],
        },
        'recentAgents': recent_agents,
        'taskHistory': task_history,
        'mainSessions': sorted(main_sessions, key=lambda item: item.get('timestamp') or '', reverse=True)[:20],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(f'Wrote {OUT_PATH} with {len(spawns)} delegated tasks')


if __name__ == '__main__':
    main()

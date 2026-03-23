#!/usr/bin/env python3
from __future__ import annotations

import glob
import json
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

SESSIONS_GLOB = '~/.openclaw/agents/main/sessions/*.jsonl'
OUT_PATH = Path('/tmp/BSOP/data/usage.json')
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


def fmt_money(value: float) -> str:
    return f'${value:,.4f}' if value < 1 else f'${value:,.2f}'


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


def safe_num(value) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def summarize_session(path: str) -> dict | None:
    events = []
    try:
        with open(path, 'r', encoding='utf-8') as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except Exception:
                    continue
    except Exception:
        return None

    if not events:
        return None

    session_id = Path(path).stem
    start = None
    end = None
    default_model = None
    models = defaultdict(lambda: {'input': 0.0, 'output': 0.0, 'cost': 0.0, 'sessions': 0})
    total_input = total_output = total_cost = 0.0
    assistant_messages = 0
    spawn_count = 0
    child_tokens = 0.0
    child_count = 0

    for event in events:
        ts = parse_ts(event.get('timestamp'))
        if ts:
            start = min(start, ts) if start else ts
            end = max(end, ts) if end else ts

        if event.get('type') == 'model_change' and event.get('modelId'):
            default_model = event.get('modelId')

        if event.get('type') == 'custom' and event.get('customType') == 'model-snapshot':
            default_model = event.get('data', {}).get('modelId') or default_model

        if event.get('type') != 'message':
            continue

        message = event.get('message', {})
        role = message.get('role')

        if role == 'assistant':
            usage = message.get('usage') or {}
            model = message.get('model') or default_model or 'unknown'
            input_tokens = safe_num(usage.get('input'))
            output_tokens = safe_num(usage.get('output'))
            cost = safe_num((usage.get('cost') or {}).get('total'))
            if model != 'delivery-mirror':
                total_input += input_tokens
                total_output += output_tokens
                total_cost += cost
                assistant_messages += 1
                models[model]['input'] += input_tokens
                models[model]['output'] += output_tokens
                models[model]['cost'] += cost
                models[model]['sessions'] += 1

            for content in message.get('content', []) or []:
                if content.get('type') == 'toolCall' and content.get('name') == 'sessions_spawn':
                    spawn_count += 1

        elif role == 'user':
            text = '\n'.join(
                item.get('text', '')
                for item in (message.get('content') or [])
                if item.get('type') == 'text'
            )
            if 'session_key: agent:main:subagent:' in text:
                child_count += 1
                match = re.search(r'tokens\s+([\d.]+)k', text)
                if match:
                    child_tokens += float(match.group(1)) * 1000
                else:
                    match = re.search(r'tokens\s+(\d[\d,]*)', text)
                    if match:
                        child_tokens += float(match.group(1).replace(',', ''))

    if not start:
        return None

    lead_model = default_model
    if not lead_model and models:
        lead_model = max(models.items(), key=lambda item: item[1]['cost'])[0]

    return {
        'id': session_id,
        'timestamp': start.astimezone(LOCAL_TZ).isoformat(),
        'endedAt': end.astimezone(LOCAL_TZ).isoformat() if end else None,
        'durationMinutes': round(((end - start).total_seconds() / 60.0) if end and start else 0.0, 1),
        'model': lead_model or 'unknown',
        'modelLabel': short_model(lead_model),
        'inputTokens': int(total_input),
        'outputTokens': int(total_output),
        'totalTokens': int(total_input + total_output),
        'cost': round(total_cost, 6),
        'assistantMessages': assistant_messages,
        'subagentSpawns': spawn_count,
        'childSessions': child_count,
        'childTokens': int(child_tokens),
        'models': [
            {
                'model': model,
                'label': short_model(model),
                'inputTokens': int(values['input']),
                'outputTokens': int(values['output']),
                'totalTokens': int(values['input'] + values['output']),
                'cost': round(values['cost'], 6),
            }
            for model, values in sorted(models.items(), key=lambda item: item[1]['cost'], reverse=True)
            if model != 'delivery-mirror'
        ],
    }


def main() -> None:
    paths = sorted(glob.glob(str(Path(SESSIONS_GLOB).expanduser())))
    sessions = [item for item in (summarize_session(path) for path in paths) if item]
    sessions.sort(key=lambda item: item['timestamp'])

    now = datetime.now(LOCAL_TZ)
    today = now.date()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    def in_today(item: dict) -> bool:
        return datetime.fromisoformat(item['timestamp']).date() == today

    def in_week(item: dict) -> bool:
        return datetime.fromisoformat(item['timestamp']).date() >= week_start

    def in_month(item: dict) -> bool:
        return datetime.fromisoformat(item['timestamp']).date() >= month_start

    total_cost = sum(item['cost'] for item in sessions)
    total_tokens = sum(item['totalTokens'] for item in sessions)
    avg_cost = total_cost / len(sessions) if sessions else 0.0

    by_model = defaultdict(lambda: {'cost': 0.0, 'tokens': 0, 'sessions': 0, 'rawModels': set()})
    daily = defaultdict(lambda: {'cost': 0.0, 'tokens': 0, 'sessions': 0})
    opus_tokens = 0
    delegated_tokens = 0
    total_spawns = 0

    for item in sessions:
        date_key = datetime.fromisoformat(item['timestamp']).date().isoformat()
        daily[date_key]['cost'] += item['cost']
        daily[date_key]['tokens'] += item['totalTokens']
        daily[date_key]['sessions'] += 1
        total_spawns += item['subagentSpawns']
        delegated_tokens += item['childTokens']
        if 'opus' in item['model'].lower():
            opus_tokens += item['totalTokens']

        for model in item.get('models', []):
            label = short_model(model['model'])
            by_model[label]['cost'] += model['cost']
            by_model[label]['tokens'] += model['totalTokens']
            by_model[label]['sessions'] += 1
            by_model[label]['rawModels'].add(model['model'])

    recent = sorted(sessions, key=lambda item: item['timestamp'], reverse=True)[:20]
    trend = sorted(daily.items())[-14:]

    payload = {
        'generatedAt': now.isoformat(),
        'summary': {
            'sessionCount': len(sessions),
            'totalCost': round(total_cost, 6),
            'totalTokens': int(total_tokens),
            'averageCostPerSession': round(avg_cost, 6),
            'costToday': round(sum(item['cost'] for item in sessions if in_today(item)), 6),
            'costThisWeek': round(sum(item['cost'] for item in sessions if in_week(item)), 6),
            'costThisMonth': round(sum(item['cost'] for item in sessions if in_month(item)), 6),
            'totalSubagentSpawns': total_spawns,
        },
        'delegation': {
            'opusTokens': int(opus_tokens),
            'delegatedTokens': int(delegated_tokens),
            'delegatedShare': round((delegated_tokens / (delegated_tokens + opus_tokens)) if (delegated_tokens + opus_tokens) else 0.0, 4),
            'spawnedSessions': sum(item['childSessions'] for item in sessions),
        },
        'costByModel': [
            {
                'label': label,
                'cost': round(values['cost'], 6),
                'tokens': int(values['tokens']),
                'sessions': values['sessions'],
                'models': sorted(values['rawModels']),
                'formattedCost': fmt_money(values['cost']),
            }
            for label, values in sorted(by_model.items(), key=lambda item: item[1]['cost'], reverse=True)
        ],
        'dailyTrend': [
            {
                'date': date,
                'cost': round(values['cost'], 6),
                'tokens': values['tokens'],
                'sessions': values['sessions'],
                'formattedCost': fmt_money(values['cost']),
            }
            for date, values in trend
        ],
        'recentSessions': [
            {
                **item,
                'formattedCost': fmt_money(item['cost']),
            }
            for item in recent
        ],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(f'Wrote {OUT_PATH} with {len(sessions)} sessions')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

SESSIONS_DIR = Path.home() / '.openclaw' / 'agents' / 'main' / 'sessions'
OUT_PATH = Path(__file__).resolve().parent.parent / 'data' / 'usage.json'
LOCAL_TZ = ZoneInfo('America/Matamoros')
SESSION_FILE_RE = re.compile(r'^(?P<id>[0-9a-f-]{36})\.jsonl(?:\.(?:reset|deleted)\..+)?$')
IGNORED_MODELS = {'delivery-mirror', 'gateway-injected', 'auto'}
MODEL_LABELS = {
    'claude-opus-4-6': 'Opus',
    'claude-sonnet-4-6': 'Sonnet',
    'claude-opus-4-5-20251101': 'Opus 4.5',
    'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
    'claude-haiku-4-5-20251001': 'Haiku',
    'claude-3-haiku-20240307': 'Haiku 3',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-mini': 'GPT-5.4 Mini',
    'gpt-5.3-codex': 'Codex',
    'gpt-5.1-codex-mini': 'Codex Mini',
    'gpt-4.1': 'GPT-4.1',
    'gpt-4o': 'GPT-4o',
    'gemini-2.5-flash': 'Gemini Flash',
    'gemini-3.1-pro-preview': 'Gemini Pro',
    'minimax/minimax-m2.5': 'MiniMax',
}
PROVIDER_NORMALIZATION = {
    'anthropic': 'anthropic',
    'claude-proxy': 'anthropic',
    'openai': 'openai',
    'openai-codex': 'openai',
    'google': 'google',
    'openrouter': 'minimax',
    'minimax': 'minimax',
    'moonshot': 'other',
}


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


def safe_num(value: Any) -> float:
    try:
        num = float(value or 0)
        return num if num == num and abs(num) != float('inf') else 0.0
    except Exception:
        return 0.0


def get_usage_cost_total(usage: dict[str, Any]) -> float:
    cost = usage.get('cost') if isinstance(usage, dict) else None
    if isinstance(cost, dict):
        if 'total' in cost:
            return safe_num(cost.get('total'))
        return safe_num(cost.get('input')) + safe_num(cost.get('output')) + safe_num(cost.get('cacheRead')) + safe_num(cost.get('cacheWrite'))
    if isinstance(cost, (int, float, str)):
        return safe_num(cost)
    return 0.0


def extract_provider(message: dict[str, Any], usage: dict[str, Any], model: str | None) -> str:
    provider = message.get('provider') or usage.get('provider') or (usage.get('cost') or {}).get('provider')
    if provider:
        return normalize_provider(str(provider))
    model = (model or '').lower()
    if model.startswith('claude'):
        return 'anthropic'
    if model.startswith('gpt-'):
        return 'openai'
    if 'gemini' in model:
        return 'google'
    if 'minimax' in model:
        return 'minimax'
    if '/' in model:
        return normalize_provider(model.split('/', 1)[0])
    return 'other'


def normalize_provider(provider: str) -> str:
    return PROVIDER_NORMALIZATION.get(provider.lower(), provider.lower())


def short_model(model: str | None) -> str:
    if not model:
        return 'Unknown'
    if model in MODEL_LABELS:
        return MODEL_LABELS[model]
    name = model.split('/')[-1]
    lower = name.lower()
    if 'opus' in lower:
        return 'Opus'
    if 'sonnet' in lower:
        return 'Sonnet'
    if 'haiku' in lower:
        return 'Haiku'
    if lower.startswith('gpt-5'):
        return 'GPT-5.4'
    if 'gemini' in lower:
        return 'Gemini'
    if 'minimax' in lower:
        return 'MiniMax'
    return name.replace('-', ' ').title()


def iter_usage_files() -> list[Path]:
    files: list[Path] = []
    for path in sorted(SESSIONS_DIR.iterdir()):
        if not path.is_file() or path.name.endswith('.lock'):
            continue
        if not SESSION_FILE_RE.match(path.name):
            continue
        files.append(path)
    return files


def iter_records(path: Path):
    try:
        with path.open('r', encoding='utf-8', errors='replace') as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except Exception:
                    continue
    except Exception:
        return


def extract_description(message: dict[str, Any]) -> str:
    parts: list[str] = []
    for item in message.get('content') or []:
        if not isinstance(item, dict):
            continue
        if item.get('type') == 'text' and item.get('text'):
            parts.append(str(item['text']))
    text = re.sub(r'\s+', ' ', ' '.join(parts)).strip()
    if not text:
        return 'No text content'
    return text[:120] + ('…' if len(text) > 120 else '')


def build_payload() -> dict[str, Any]:
    files = iter_usage_files()
    all_sessions: dict[str, dict[str, Any]] = {}
    message_log: list[dict[str, Any]] = []
    daily = defaultdict(lambda: {
        'cost': 0.0,
        'tokens': 0,
        'sessions': set(),
        'messages': 0,
        'userMessages': 0,
        'assistantMessages': 0,
        'toolCalls': 0,
        'toolResults': 0,
        'providers': defaultdict(lambda: {'cost': 0.0, 'messages': 0, 'tokens': 0}),
        'models': defaultdict(lambda: {'cost': 0.0, 'messages': 0, 'tokens': 0, 'provider': 'other'}),
    })

    history = {
        'cost': 0.0,
        'tokens': 0,
        'sessionIds': set(),
        'messages': 0,
        'userMessages': 0,
        'assistantMessages': 0,
        'toolCalls': 0,
        'toolResults': 0,
        'inputTokens': 0,
        'outputTokens': 0,
        'cacheReadTokens': 0,
        'cacheWriteTokens': 0,
        'providers': defaultdict(lambda: {'cost': 0.0, 'messages': 0, 'tokens': 0}),
        'models': defaultdict(lambda: {'cost': 0.0, 'messages': 0, 'tokens': 0, 'provider': 'other'}),
    }

    for path in files:
        match = SESSION_FILE_RE.match(path.name)
        if not match:
            continue
        session_id = match.group('id')
        session = all_sessions.setdefault(session_id, {
            'id': session_id,
            'files': [],
            'start': None,
            'end': None,
            'cost': 0.0,
            'inputTokens': 0,
            'outputTokens': 0,
            'cacheReadTokens': 0,
            'cacheWriteTokens': 0,
            'totalTokens': 0,
            'messages': 0,
            'userMessages': 0,
            'assistantMessages': 0,
            'toolResults': 0,
            'toolCalls': 0,
            'providers': defaultdict(lambda: {'cost': 0.0, 'messages': 0, 'tokens': 0}),
            'models': defaultdict(lambda: {'cost': 0.0, 'messages': 0, 'tokens': 0, 'provider': 'other'}),
        })
        session['files'].append(path.name)
        seen_message_ids: set[str] = set()

        for event in iter_records(path):
            if event.get('type') != 'message':
                continue

            ts = parse_ts(event.get('timestamp'))
            if ts:
                session['start'] = min(session['start'], ts) if session['start'] else ts
                session['end'] = max(session['end'], ts) if session['end'] else ts

            message = event.get('message', {}) or {}
            role = message.get('role')
            if role not in {'user', 'assistant', 'toolResult'}:
                continue

            message_id = message.get('id') or event.get('id')
            dedupe_key = f'{role}:{message_id}' if message_id else None
            if dedupe_key and dedupe_key in seen_message_ids:
                continue
            if dedupe_key:
                seen_message_ids.add(dedupe_key)

            if role == 'toolResult':
                session['toolResults'] += 1
                history['toolResults'] += 1
                if ts:
                    day_key = ts.astimezone(LOCAL_TZ).date().isoformat()
                    daily[day_key]['toolResults'] += 1
                continue

            session['messages'] += 1
            history['messages'] += 1
            history['sessionIds'].add(session_id)

            day_key = ts.astimezone(LOCAL_TZ).date().isoformat() if ts else 'unknown'
            day = daily[day_key]
            day['messages'] += 1
            day['sessions'].add(session_id)

            if role == 'user':
                session['userMessages'] += 1
                history['userMessages'] += 1
                day['userMessages'] += 1
                continue

            session['assistantMessages'] += 1
            history['assistantMessages'] += 1
            day['assistantMessages'] += 1

            usage = message.get('usage') or {}
            model = str(message.get('model') or 'unknown')
            if model in IGNORED_MODELS:
                continue

            provider = extract_provider(message, usage, model)
            input_tokens = int(safe_num(usage.get('input')))
            output_tokens = int(safe_num(usage.get('output')))
            cache_read = int(safe_num(usage.get('cacheRead')))
            cache_write = int(safe_num(usage.get('cacheWrite')))
            total_tokens = int(safe_num(usage.get('total')) or (input_tokens + output_tokens + cache_read + cache_write))
            cost = get_usage_cost_total(usage)
            tool_calls = sum(1 for item in (message.get('content') or []) if isinstance(item, dict) and item.get('type') == 'toolCall')
            status = 'error' if message.get('error') or safe_num(usage.get('errorCount')) > 0 else 'ok'
            description = extract_description(message)

            session['cost'] += cost
            session['inputTokens'] += input_tokens
            session['outputTokens'] += output_tokens
            session['cacheReadTokens'] += cache_read
            session['cacheWriteTokens'] += cache_write
            session['totalTokens'] += total_tokens
            session['toolCalls'] += tool_calls

            history['cost'] += cost
            history['tokens'] += total_tokens
            history['inputTokens'] += input_tokens
            history['outputTokens'] += output_tokens
            history['cacheReadTokens'] += cache_read
            history['cacheWriteTokens'] += cache_write
            history['toolCalls'] += tool_calls

            day['cost'] += cost
            day['tokens'] += total_tokens
            day['toolCalls'] += tool_calls

            session['providers'][provider]['cost'] += cost
            session['providers'][provider]['messages'] += 1
            session['providers'][provider]['tokens'] += total_tokens
            session['models'][model]['cost'] += cost
            session['models'][model]['messages'] += 1
            session['models'][model]['tokens'] += total_tokens
            session['models'][model]['provider'] = provider

            history['providers'][provider]['cost'] += cost
            history['providers'][provider]['messages'] += 1
            history['providers'][provider]['tokens'] += total_tokens
            history['models'][model]['cost'] += cost
            history['models'][model]['messages'] += 1
            history['models'][model]['tokens'] += total_tokens
            history['models'][model]['provider'] = provider

            day['providers'][provider]['cost'] += cost
            day['providers'][provider]['messages'] += 1
            day['providers'][provider]['tokens'] += total_tokens
            day['models'][model]['cost'] += cost
            day['models'][model]['messages'] += 1
            day['models'][model]['tokens'] += total_tokens
            day['models'][model]['provider'] = provider

            message_log.append({
                'timestamp': ts.astimezone(LOCAL_TZ).isoformat() if ts else None,
                'model': model,
                'modelLabel': short_model(model),
                'provider': provider,
                'inputTokens': input_tokens,
                'outputTokens': output_tokens,
                'cacheReadTokens': cache_read,
                'cacheCreationTokens': cache_write,
                'totalTokens': total_tokens,
                'cost': round(cost, 6),
                'formattedCost': fmt_money(cost),
                'durationMs': int(safe_num(message.get('durationMs') or usage.get('durationMs'))),
                'status': status,
                'sessionId': session_id,
                'skillName': message.get('skillName'),
                'description': description,
            })

    session_rows: list[dict[str, Any]] = []
    for session in all_sessions.values():
        start = session['start']
        end = session['end']
        lead_model = 'unknown'
        if session['models']:
            lead_model = max(session['models'].items(), key=lambda item: (item[1]['cost'], item[1]['messages']))[0]
        session_rows.append({
            'id': session['id'],
            'timestamp': start.astimezone(LOCAL_TZ).isoformat() if start else None,
            'endedAt': end.astimezone(LOCAL_TZ).isoformat() if end else None,
            'durationMinutes': round(((end - start).total_seconds() / 60.0) if start and end else 0.0, 1),
            'model': lead_model,
            'modelLabel': short_model(lead_model),
            'inputTokens': session['inputTokens'],
            'outputTokens': session['outputTokens'],
            'cacheReadTokens': session['cacheReadTokens'],
            'cacheWriteTokens': session['cacheWriteTokens'],
            'totalTokens': session['totalTokens'],
            'cost': round(session['cost'], 6),
            'messages': session['messages'],
            'userMessages': session['userMessages'],
            'assistantMessages': session['assistantMessages'],
            'toolCalls': session['toolCalls'],
            'toolResults': session['toolResults'],
            'files': session['files'],
            'models': [
                {
                    'model': model,
                    'label': short_model(model),
                    'provider': values['provider'],
                    'messages': values['messages'],
                    'tokens': values['tokens'],
                    'cost': round(values['cost'], 6),
                }
                for model, values in sorted(session['models'].items(), key=lambda item: (-item[1]['cost'], -item[1]['messages']))
            ],
            'providers': [
                {
                    'provider': provider,
                    'messages': values['messages'],
                    'tokens': values['tokens'],
                    'cost': round(values['cost'], 6),
                }
                for provider, values in sorted(session['providers'].items(), key=lambda item: (-item[1]['cost'], -item[1]['messages']))
            ],
        })

    session_rows = [row for row in session_rows if row['timestamp']]
    session_rows.sort(key=lambda item: item['timestamp'])
    message_log = [row for row in message_log if row['timestamp']]
    message_log.sort(key=lambda item: item['timestamp'])

    latest_date = max((datetime.fromisoformat(row['timestamp']).date() for row in session_rows), default=datetime.now(LOCAL_TZ).date())
    snapshot = daily.get(latest_date.isoformat(), None)
    if snapshot is None:
        snapshot = daily[latest_date.isoformat()]

    now = datetime.now(LOCAL_TZ)
    week_start = now.date() - timedelta(days=now.date().weekday())
    month_start = now.date().replace(day=1)

    def to_ranked_breakdown(mapping: dict[str, Any], key_name: str) -> list[dict[str, Any]]:
        rows = []
        for key, values in sorted(mapping.items(), key=lambda item: (-item[1]['cost'], -item[1]['messages'], item[0])):
            row = {
                key_name: key,
                'cost': round(values['cost'], 6),
                'messages': values['messages'],
                'tokens': int(values['tokens']),
                'formattedCost': fmt_money(values['cost']),
            }
            if key_name == 'model':
                row['label'] = short_model(key)
                row['provider'] = values.get('provider', 'other')
            rows.append(row)
        return rows

    def cache_hit_rate(bucket: dict[str, Any]) -> float:
        denom = bucket['inputTokens'] + bucket['cacheReadTokens']
        return round((bucket['cacheReadTokens'] / denom) if denom else 0.0, 4)

    trend = []
    for date, values in sorted(daily.items()):
        trend.append({
            'date': date,
            'cost': round(values['cost'], 6),
            'tokens': int(values['tokens']),
            'sessions': len(values['sessions']),
            'messages': values['messages'],
            'userMessages': values['userMessages'],
            'assistantMessages': values['assistantMessages'],
            'toolCalls': values['toolCalls'],
            'formattedCost': fmt_money(values['cost']),
        })

    recent_days = []
    for offset in range(13, -1, -1):
        day_date = (now.date() - timedelta(days=offset)).isoformat()
        day_values = daily.get(day_date)
        recent_days.append({
            'date': day_date,
            'models': [] if not day_values else [
                {
                    'model': model,
                    'label': short_model(model),
                    'cost': round(values['cost'], 6),
                    'messages': values['messages'],
                    'tokens': int(values['tokens']),
                }
                for model, values in sorted(day_values['models'].items(), key=lambda item: (-item[1]['cost'], -item[1]['messages'], item[0]))
            ],
        })

    payload = {
        'generatedAt': now.isoformat(),
        'source': {
            'sessionsDir': str(SESSIONS_DIR),
            'filesParsed': len(files),
            'latestActivityDate': latest_date.isoformat(),
        },
        'summary': {
            'sessionCount': len(session_rows),
            'totalCost': round(history['cost'], 6),
            'totalTokens': int(history['tokens']),
            'averageCostPerSession': round((history['cost'] / len(session_rows)) if session_rows else 0.0, 6),
            'costToday': round(sum(item['cost'] for item in session_rows if datetime.fromisoformat(item['timestamp']).date() == now.date()), 6),
            'costThisWeek': round(sum(item['cost'] for item in session_rows if datetime.fromisoformat(item['timestamp']).date() >= week_start), 6),
            'costThisMonth': round(sum(item['cost'] for item in session_rows if datetime.fromisoformat(item['timestamp']).date() >= month_start), 6),
            'messages': history['messages'],
            'userMessages': history['userMessages'],
            'assistantMessages': history['assistantMessages'],
            'toolCalls': history['toolCalls'],
            'toolResults': history['toolResults'],
            'cacheHitRate': cache_hit_rate(history),
        },
        'snapshot': {
            'date': latest_date.isoformat(),
            'sessionCount': len(snapshot['sessions']),
            'totalCost': round(snapshot['cost'], 6),
            'totalTokens': int(snapshot['tokens']),
            'messages': snapshot['messages'],
            'userMessages': snapshot['userMessages'],
            'assistantMessages': snapshot['assistantMessages'],
            'toolCalls': snapshot['toolCalls'],
            'toolResults': snapshot['toolResults'],
            'costByModel': to_ranked_breakdown(snapshot['models'], 'model'),
            'costByProvider': to_ranked_breakdown(snapshot['providers'], 'provider'),
        },
        'usageTotals': {
            'inputTokens': history['inputTokens'],
            'outputTokens': history['outputTokens'],
            'cacheReadTokens': history['cacheReadTokens'],
            'cacheWriteTokens': history['cacheWriteTokens'],
            'cacheHitRate': cache_hit_rate(history),
        },
        'costByModel': to_ranked_breakdown(history['models'], 'model'),
        'costByProvider': to_ranked_breakdown(history['providers'], 'provider'),
        'dailyTrend': trend[-14:],
        'recentSessions': [
            {
                **item,
                'formattedCost': fmt_money(item['cost']),
            }
            for item in sorted(session_rows, key=lambda item: item['timestamp'], reverse=True)[:20]
        ],
        'allSessions': [
            {
                **item,
                'formattedCost': fmt_money(item['cost']),
            }
            for item in sorted(session_rows, key=lambda item: item['timestamp'], reverse=True)
        ],
        'messageLog': [
            item for item in sorted(message_log, key=lambda item: item['timestamp'], reverse=True)[:2000]
        ],
        'modelBreakdownHistory': recent_days,
    }
    return payload


def main() -> None:
    payload = build_payload()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(
        f"Wrote {OUT_PATH} | files={payload['source']['filesParsed']} | sessions={payload['summary']['sessionCount']} | "
        f"snapshot={payload['snapshot']['date']} cost=${payload['snapshot']['totalCost']:.2f}"
    )


if __name__ == '__main__':
    main()

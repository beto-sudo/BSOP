#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo('America/Matamoros')
MANIFEST_DB = Path.home() / '.openclaw' / 'manifest' / 'manifest.db'
OUT_PATH = Path(__file__).resolve().parent.parent / 'data' / 'models.json'

MODEL_METADATA = {
    'claude-opus-4-6': {
        'name': 'Claude Opus 4.6', 'provider': 'Anthropic', 'providerColor': 'amber', 'alias': 'Opus',
        'pricing': {'input': 5.0, 'output': 25.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Complex reasoning, planning, orchestration, nuanced decisions', 'authType': 'api-key',
    },
    'claude-sonnet-4-6': {
        'name': 'Claude Sonnet 4.6', 'provider': 'Anthropic', 'providerColor': 'amber', 'alias': 'Sonnet',
        'pricing': {'input': 3.0, 'output': 15.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Balanced performance, good for most tasks', 'authType': 'api-key',
    },
    'claude-opus-4-5-20251101': {
        'name': 'Claude Opus 4.5', 'provider': 'Anthropic', 'providerColor': 'amber', 'alias': 'Opus 4.5',
        'pricing': {'input': 5.0, 'output': 25.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Previous Opus generation', 'authType': 'api-key',
    },
    'claude-sonnet-4-5-20250929': {
        'name': 'Claude Sonnet 4.5', 'provider': 'Anthropic', 'providerColor': 'amber', 'alias': 'Sonnet 4.5',
        'pricing': {'input': 3.0, 'output': 15.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Previous Sonnet generation', 'authType': 'api-key',
    },
    'claude-haiku-4-5-20251001': {
        'name': 'Claude Haiku 4.5', 'provider': 'Anthropic', 'providerColor': 'amber', 'alias': 'Haiku',
        'pricing': {'input': 0.8, 'output': 4.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Fast, cheap, simple tasks', 'authType': 'api-key',
    },
    'claude-3-haiku-20240307': {
        'name': 'Claude 3 Haiku', 'provider': 'Anthropic', 'providerColor': 'amber', 'alias': 'Haiku 3',
        'pricing': {'input': 0.25, 'output': 1.25, 'unit': 'per 1M tokens'}, 'bestFor': 'Legacy Haiku', 'authType': 'api-key',
    },
    'gpt-5.4': {
        'name': 'GPT-5.4', 'provider': 'OpenAI', 'providerColor': 'emerald', 'alias': 'GPT-5.4',
        'pricing': {'input': 0.0, 'output': 0.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Primary executor, coding, research', 'authType': 'oauth',
    },
    'gpt-5.4-mini': {
        'name': 'GPT-5.4 Mini', 'provider': 'OpenAI', 'providerColor': 'emerald', 'alias': 'Mini',
        'pricing': {'input': 0.0, 'output': 0.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Lightweight tasks', 'authType': 'oauth',
    },
    'gpt-5.3-codex': {
        'name': 'GPT-5.3 Codex', 'provider': 'OpenAI', 'providerColor': 'emerald', 'alias': 'Codex',
        'pricing': {'input': 0.0, 'output': 0.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Code generation specialist', 'authType': 'oauth',
    },
    'gpt-5.1-codex-mini': {
        'name': 'GPT-5.1 Codex Mini', 'provider': 'OpenAI', 'providerColor': 'emerald', 'alias': 'Codex Mini',
        'pricing': {'input': 0.0, 'output': 0.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Compact code tasks', 'authType': 'oauth',
    },
    'gpt-4.1': {
        'name': 'GPT-4.1', 'provider': 'OpenAI', 'providerColor': 'emerald', 'alias': 'GPT-4.1',
        'pricing': {'input': 2.0, 'output': 8.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Previous generation', 'authType': 'api-key',
    },
    'gpt-4o': {
        'name': 'GPT-4o', 'provider': 'OpenAI', 'providerColor': 'emerald', 'alias': '4o',
        'pricing': {'input': 2.5, 'output': 10.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Multimodal', 'authType': 'api-key',
    },
    'gemini-2.5-flash': {
        'name': 'Gemini 2.5 Flash', 'provider': 'Google', 'providerColor': 'sky', 'alias': 'Flash',
        'pricing': {'input': 0.15, 'output': 0.6, 'unit': 'per 1M tokens'}, 'bestFor': 'Ultra-fast, cheap', 'authType': 'api-key',
    },
    'gemini-3.1-pro-preview': {
        'name': 'Gemini 3.1 Pro Preview', 'provider': 'Google', 'providerColor': 'sky', 'alias': 'Pro',
        'pricing': {'input': 2.5, 'output': 15.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Advanced reasoning', 'authType': 'api-key',
    },
    'minimax/minimax-m2.5': {
        'name': 'MiniMax M2.5', 'provider': 'MiniMax', 'providerColor': 'violet', 'alias': 'M2.5',
        'pricing': {'input': 0.5, 'output': 2.0, 'unit': 'per 1M tokens'}, 'bestFor': 'Budget model, heartbeat tasks', 'authType': 'api-key',
    },
}


def query_stats() -> dict[str, dict]:
    stats = {model_id: {
        'totalMessages': 0,
        'inputTokens': 0,
        'outputTokens': 0,
        'cacheReadTokens': 0,
        'cacheCreationTokens': 0,
        'totalCost': 0.0,
        'avgDuration': 0,
        'errorCount': 0,
        'cacheHitRate': 0.0,
        'costPerMessage': 0.0,
        'firstSeen': None,
        'lastSeen': None,
    } for model_id in MODEL_METADATA}

    conn = sqlite3.connect(f'file:{MANIFEST_DB}?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        '''
        SELECT
          model,
          COUNT(*) AS total_messages,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
          COALESCE(SUM(cost_usd), 0) AS total_cost,
          COALESCE(AVG(duration_ms), 0) AS avg_duration,
          SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS error_count,
          MIN(timestamp) AS first_seen,
          MAX(timestamp) AS last_seen
        FROM agent_messages
        WHERE model IS NOT NULL AND model != ''
        GROUP BY model
        '''
    ).fetchall()
    conn.close()

    for row in rows:
        model = row['model']
        if model not in stats:
            continue
        input_tokens = int(row['input_tokens'] or 0)
        cache_read = int(row['cache_read_tokens'] or 0)
        total_messages = int(row['total_messages'] or 0)
        denom = input_tokens + cache_read
        stats[model] = {
            'totalMessages': total_messages,
            'inputTokens': input_tokens,
            'outputTokens': int(row['output_tokens'] or 0),
            'cacheReadTokens': cache_read,
            'cacheCreationTokens': int(row['cache_creation_tokens'] or 0),
            'totalCost': round(float(row['total_cost'] or 0), 6),
            'avgDuration': int(round(float(row['avg_duration'] or 0))),
            'errorCount': int(row['error_count'] or 0),
            'cacheHitRate': round((cache_read / denom) if denom else 0.0, 4),
            'costPerMessage': round((float(row['total_cost'] or 0) / total_messages) if total_messages else 0.0, 6),
            'firstSeen': str(row['first_seen'])[:10] if row['first_seen'] else None,
            'lastSeen': str(row['last_seen'])[:10] if row['last_seen'] else None,
        }
    return stats


def main() -> None:
    stats = query_stats()
    models = []
    for model_id, meta in MODEL_METADATA.items():
        models.append({
            'id': model_id,
            **meta,
            'stats': stats[model_id],
        })

    comparison = [
        {
            'id': item['id'],
            'name': item['name'],
            'alias': item['alias'],
            'provider': item['provider'],
            'providerColor': item['providerColor'],
            **item['stats'],
        }
        for item in sorted(models, key=lambda item: (-item['stats']['totalCost'], -item['stats']['totalMessages'], item['name']))
    ]

    provider_breakdown = {}
    for item in models:
        provider = item['provider']
        bucket = provider_breakdown.setdefault(provider, {
            'provider': provider,
            'color': item['providerColor'],
            'totalCost': 0.0,
            'messages': 0,
            'models': 0,
        })
        bucket['totalCost'] += item['stats']['totalCost']
        bucket['messages'] += item['stats']['totalMessages']
        if item['stats']['totalMessages'] > 0:
            bucket['models'] += 1

    payload = {
        'generatedAt': datetime.now(LOCAL_TZ).isoformat(),
        'models': models,
        'comparison': comparison,
        'providerBreakdown': sorted(provider_breakdown.values(), key=lambda item: (-item['totalCost'], -item['messages'], item['provider'])),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(f'Wrote {OUT_PATH} with {len(models)} models')


if __name__ == '__main__':
    main()

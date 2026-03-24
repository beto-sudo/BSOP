#!/usr/bin/env python3
from __future__ import annotations

"""
Sync parsed OpenClaw usage telemetry into Supabase.

Requires:
  - NEXT_PUBLIC_SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY

The service role key is required for writes. Add it to .env.local or export it in your shell
before running this script.
"""

import importlib.util
import json
import os
from pathlib import Path
from typing import Any

try:
    import requests  # type: ignore
except ImportError:  # pragma: no cover
    import urllib.error
    import urllib.parse
    import urllib.request

    class _FallbackResponse:
        def __init__(self, status_code: int, text: str):
            self.status_code = status_code
            self.text = text
            self.ok = 200 <= status_code < 300

    class _FallbackSession:
        def __init__(self):
            self._headers: dict[str, str] = {}

        @property
        def headers(self):
            return self._headers

        def post(self, url: str, params: dict[str, str] | None = None, headers: dict[str, str] | None = None, data: str | None = None, timeout: int = 60):
            return self._request('POST', url, params=params, headers=headers, data=data, timeout=timeout)

        def delete(self, url: str, params: dict[str, str] | None = None, timeout: int = 60):
            return self._request('DELETE', url, params=params, headers=None, data=None, timeout=timeout)

        def _request(self, method: str, url: str, params: dict[str, str] | None, headers: dict[str, str] | None, data: str | None, timeout: int):
            if params:
                url = f"{url}?{urllib.parse.urlencode(params)}"
            merged_headers = {**self._headers, **(headers or {})}
            request = urllib.request.Request(url, data=(data.encode('utf-8') if data else None), headers=merged_headers, method=method)
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    body = response.read().decode('utf-8', errors='replace')
                    return _FallbackResponse(response.status, body)
            except urllib.error.HTTPError as error:
                body = error.read().decode('utf-8', errors='replace')
                return _FallbackResponse(error.code, body)

    class requests:  # type: ignore
        Response = _FallbackResponse
        Session = _FallbackSession

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / '.env.local'
SOURCE_SCRIPT = REPO_ROOT / 'scripts' / 'generate-usage-data.py'
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key, value)


load_env_file(ENV_PATH)
SUPABASE_URL = SUPABASE_URL or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY or os.getenv('SUPABASE_SERVICE_ROLE_KEY')


def load_usage_module():
    spec = importlib.util.spec_from_file_location('generate_usage_data', SOURCE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Unable to load {SOURCE_SCRIPT}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


usage_module = load_usage_module()
fmt_money = usage_module.fmt_money
build_payload = usage_module.build_payload


class SupabaseRest:
    def __init__(self, base_url: str, service_role_key: str):
        self.base_url = base_url.rstrip('/') + '/rest/v1'
        self.session = requests.Session()
        self.session.headers.update({
            'apikey': service_role_key,
            'Authorization': f'Bearer {service_role_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        })

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> None:
        if not rows:
            return
        response = self.session.post(
            f'{self.base_url}/{table}',
            params={'on_conflict': on_conflict},
            headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
            data=json.dumps(rows),
            timeout=60,
        )
        self._raise(response, f'upsert {table}')

    def delete_all(self, table: str) -> None:
        response = self.session.delete(
            f'{self.base_url}/{table}',
            params={'id': 'gt.0'},
            timeout=60,
        )
        self._raise(response, f'delete {table}')

    @staticmethod
    def _raise(response: requests.Response, action: str) -> None:
        if response.ok:
            return
        detail = response.text.strip()
        raise RuntimeError(f'Supabase {action} failed ({response.status_code}): {detail}')


def summary_row(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        'id': 1,
        'session_count': payload['summary']['sessionCount'],
        'total_cost': payload['summary']['totalCost'],
        'total_tokens': payload['summary']['totalTokens'],
        'avg_cost_per_session': payload['summary']['averageCostPerSession'],
        'cost_today': payload['summary']['costToday'],
        'cost_this_week': payload['summary']['costThisWeek'],
        'cost_this_month': payload['summary']['costThisMonth'],
        'messages': payload['summary']['messages'],
        'user_messages': payload['summary']['userMessages'],
        'assistant_messages': payload['summary']['assistantMessages'],
        'tool_calls': payload['summary']['toolCalls'],
        'tool_results': payload['summary']['toolResults'],
        'cache_hit_rate': payload['summary']['cacheHitRate'],
        'input_tokens': payload['usageTotals']['inputTokens'],
        'output_tokens': payload['usageTotals']['outputTokens'],
        'cache_read_tokens': payload['usageTotals']['cacheReadTokens'],
        'cache_write_tokens': payload['usageTotals']['cacheWriteTokens'],
        'synced_at': payload['generatedAt'],
    }


def main() -> None:
    if not SUPABASE_URL:
        raise SystemExit('Missing NEXT_PUBLIC_SUPABASE_URL')
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise SystemExit('Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local or export it before running.')

    payload = build_payload()
    rest = SupabaseRest(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    rest.upsert('usage_summary', [summary_row(payload)], on_conflict='id')
    rest.upsert('usage_daily', [{
        'date': item['date'],
        'cost': item['cost'],
        'tokens': item['tokens'],
        'sessions': item['sessions'],
        'messages': item['messages'],
        'user_messages': item['userMessages'],
        'assistant_messages': item['assistantMessages'],
        'tool_calls': item['toolCalls'],
        'formatted_cost': item['formattedCost'],
    } for item in payload['dailyTrend']], on_conflict='date')
    rest.upsert('usage_by_model', [{
        'model': item['model'],
        'label': item['label'],
        'provider': item['provider'],
        'cost': item['cost'],
        'messages': item['messages'],
        'tokens': item['tokens'],
        'formatted_cost': item['formattedCost'],
    } for item in payload['costByModel']], on_conflict='model')
    rest.upsert('usage_by_provider', [{
        'provider': item['provider'],
        'cost': item['cost'],
        'messages': item['messages'],
        'tokens': item['tokens'],
        'formatted_cost': item['formattedCost'],
    } for item in payload['costByProvider']], on_conflict='provider')

    rest.delete_all('usage_messages')
    rest.upsert('usage_messages', [{
        'timestamp': item['timestamp'],
        'model': item['model'],
        'model_label': item['modelLabel'],
        'provider': item['provider'],
        'input_tokens': item['inputTokens'],
        'output_tokens': item['outputTokens'],
        'cache_read_tokens': item['cacheReadTokens'],
        'cache_creation_tokens': item['cacheCreationTokens'],
        'total_tokens': item['totalTokens'],
        'cost': item['cost'],
        'formatted_cost': item['formattedCost'],
        'duration_ms': item['durationMs'],
        'status': item['status'],
        'session_id': item['sessionId'],
        'skill_name': item['skillName'],
        'description': item['description'],
    } for item in payload['messageLog'][:500]], on_conflict='id')

    rest.upsert('usage_daily_models', [{
        'date': day['date'],
        'model': item['model'],
        'label': item['label'],
        'cost': item['cost'],
        'messages': item['messages'],
        'tokens': item['tokens'],
    } for day in payload['modelBreakdownHistory'] for item in day['models']], on_conflict='date,model')

    print(
        'Synced usage to Supabase '
        f"| sessions={payload['summary']['sessionCount']} "
        f"| messages={min(len(payload['messageLog']), 500)} recent "
        f"| totalCost={fmt_money(payload['summary']['totalCost'])}"
    )
    print('Run supabase/usage-schema.sql in the Supabase SQL Editor before the first sync.')


if __name__ == '__main__':
    main()

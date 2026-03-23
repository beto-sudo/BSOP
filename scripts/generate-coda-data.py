#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE_CODA = Path('/Users/Beto/.openclaw/workspace/coda')
OUTPUT_PATH = Path('/Users/Beto/BSOP/data/coda.json')

DOCUMENTS = [
    {
        'source': 'DILESA',
        'slug': 'dilesa',
        'name': 'DILESA',
        'description': 'Real estate development, planning, and construction',
        'docId': 'ZNxWl_DI2D',
    },
    {
        'source': 'ANSA',
        'slug': 'ansa',
        'name': 'ANSA',
        'description': 'Stellantis automotive dealership (Chrysler, Dodge, Jeep, Ram)',
        'docId': 'pnqM3j0Yal',
    },
    {
        'source': 'ANSA-Ventas',
        'slug': 'ansa-ventas',
        'name': 'ANSA-Ventas',
        'description': 'Automotive sales management and CRM',
        'docId': 'vVmCl2wBfC',
    },
    {
        'source': 'RDB',
        'slug': 'rdb',
        'name': 'RDB',
        'description': 'Deportivo Rincón del Bosque - Sports club operations',
        'docId': 'yvrM3UilPt',
    },
    {
        'source': 'sr-group',
        'slug': 'sr-group',
        'name': 'SR Group',
        'description': 'SR Group - Family wealth management hub',
        'docId': 'MaXoDlRxXE',
    },
]

PROCESS = {
    'title': 'Coda Architect Audit Process',
    'steps': [
        {'step': 1, 'name': 'Export Schema', 'description': 'Extract all tables, columns, pages, and views from the Coda API'},
        {'step': 2, 'name': 'Analyze Structure', 'description': 'Identify relationships, dependencies, and duplicate patterns'},
        {'step': 3, 'name': 'Score Health', 'description': 'Rate each table 0-10 based on width, formula density, lookups, buttons, and attachments'},
        {'step': 4, 'name': 'Classify Modules', 'description': 'Group tables into functional business modules'},
        {'step': 5, 'name': 'Detect God Tables', 'description': 'Find oversized tables that do too much (>30 columns or complex formulas)'},
        {'step': 6, 'name': 'Suggest KPIs', 'description': 'Generate KPI recommendations based on available data'},
        {'step': 7, 'name': 'Gap Analysis', 'description': 'Compare against org-type template to find missing capabilities'},
        {'step': 8, 'name': 'Generate Report', 'description': 'Compile findings into actionable dashboard'},
    ],
    'auditTypes': [
        {'name': 'Quick Scan', 'description': 'Schema export + basic health scoring (~2 min)'},
        {'name': 'Full Audit', 'description': 'Complete analysis with modules, god tables, KPIs, gaps (~5-10 min)'},
        {'name': 'Comparison', 'description': 'Diff between two snapshots to track changes over time'},
    ],
}


def load_json(path: Path) -> Any:
    with path.open() as handle:
        return json.load(handle)


def candidate_audit_roots(source: str) -> list[Path]:
    base = WORKSPACE_CODA / source
    return [base / 'audits', base]


def find_latest_audit_dir(source: str) -> Path:
    candidates: list[Path] = []
    for root in candidate_audit_roots(source):
        if not root.exists() or not root.is_dir():
            continue
        for child in root.iterdir():
            if not child.is_dir() or child.name == 'latest':
                continue
            if (child / 'reports' / 'summary.json').exists():
                candidates.append(child)
    if not candidates:
        raise FileNotFoundError(f'No audit with reports/summary.json found for {source}')
    return sorted(candidates, key=lambda item: item.name)[-1]


def module_table_count(module: dict[str, Any]) -> int:
    tables = module.get('tables', [])
    return len(tables) if isinstance(tables, list) else 0


def normalize_modules(modules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items = [
        {
            'name': module.get('module', 'Uncategorized'),
            'tableCount': module_table_count(module),
        }
        for module in modules
    ]
    return sorted(items, key=lambda item: (-item['tableCount'], item['name'].lower()))


def normalize_god_tables(god_tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items = []
    for table in god_tables:
        details = table.get('details', {}) if isinstance(table.get('details'), dict) else {}
        items.append(
            {
                'name': table.get('table', 'Untitled'),
                'columnCount': details.get('columnCount', 0),
            }
        )
    items.sort(key=lambda item: (-item['columnCount'], item['name'].lower()))
    return items[:10]


def normalize_top_risk_tables(tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items = []
    for table in tables[:5]:
        items.append(
            {
                'name': table.get('table', 'Untitled'),
                'columnCount': table.get('columns', 0),
                'healthScore': table.get('healthScore', 0),
                'findings': table.get('findings', []),
            }
        )
    return items


def build_document(meta: dict[str, str]) -> dict[str, Any]:
    audit_dir = find_latest_audit_dir(meta['source'])
    summary = load_json(audit_dir / 'reports' / 'summary.json')
    table_health = load_json(audit_dir / 'analysis' / 'table-health.json')
    god_tables = load_json(audit_dir / 'analysis' / 'god-tables.json')
    modules = load_json(audit_dir / 'analysis' / 'modules.json')
    relationships = load_json(audit_dir / 'analysis' / 'relationships.json')
    kpi_suggestions = load_json(audit_dir / 'analysis' / 'kpi-suggestions.json')
    schema_tables = load_json(audit_dir / 'schema' / 'tables.json')
    schema_columns = load_json(audit_dir / 'schema' / 'columns.json')

    health_scores = [float(item.get('healthScore', 0)) for item in table_health]
    avg_score = round(sum(health_scores) / len(health_scores), 2) if health_scores else 0
    max_score = max(health_scores, default=0)
    high_risk_count = sum(1 for score in health_scores if score >= 4)

    return {
        'slug': meta['slug'],
        'name': meta['name'],
        'description': meta['description'],
        'docId': meta['docId'],
        'lastAudit': audit_dir.name,
        'stats': {
            'tables': len(schema_tables),
            'columns': len(schema_columns),
            'pages': summary.get('counts', {}).get('pages', 0),
            'relationships': len(relationships),
            'modules': len(modules),
        },
        'health': {
            'avgScore': avg_score,
            'maxScore': max_score,
            'highRiskCount': high_risk_count,
            'godTables': len(god_tables),
            'kpiSuggestions': len(kpi_suggestions),
            'duplicateGroups': summary.get('duplicateGroups', 0),
        },
        'topRiskTables': normalize_top_risk_tables(summary.get('topRiskTables', [])),
        'modules': normalize_modules(modules),
        'godTablesList': normalize_god_tables(god_tables),
    }


def main() -> None:
    documents = [build_document(meta) for meta in DOCUMENTS]
    payload = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'documents': documents,
        'totals': {
            'totalTables': sum(doc['stats']['tables'] for doc in documents),
            'totalColumns': sum(doc['stats']['columns'] for doc in documents),
            'totalRelationships': sum(doc['stats']['relationships'] for doc in documents),
            'totalGodTables': sum(doc['health']['godTables'] for doc in documents),
            'totalKpiSuggestions': sum(doc['health']['kpiSuggestions'] for doc in documents),
        },
        'process': PROCESS,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n')
    print(f'Wrote {OUTPUT_PATH}')


if __name__ == '__main__':
    main()

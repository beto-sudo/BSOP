import coda from '@/data/coda.json';

export type CodaTopRiskTable = {
  name: string;
  columnCount: number;
  healthScore: number;
  findings: string[];
};

export type CodaModule = {
  name: string;
  tableCount: number;
};

export type CodaGodTable = {
  name: string;
  columnCount: number;
};

export type CodaDocument = {
  slug: string;
  name: string;
  description: string;
  docId: string;
  lastAudit: string;
  stats: {
    tables: number;
    columns: number;
    pages: number;
    relationships: number;
    modules: number;
  };
  health: {
    avgScore: number;
    maxScore: number;
    highRiskCount: number;
    godTables: number;
    kpiSuggestions: number;
    duplicateGroups: number;
  };
  topRiskTables: CodaTopRiskTable[];
  modules: CodaModule[];
  godTablesList: CodaGodTable[];
};

export type CodaData = typeof coda;

export const codaData = coda as CodaData;

export function getHealthColor(score: number) {
  if (score < 2) return '#22c55e';
  if (score < 4) return '#f59e0b';
  return '#ef4444';
}

export function formatAuditTimestamp(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatInt(value: number) {
  return value.toLocaleString('en-US');
}

'use client';

/**
 * Small shared presentational bits used by several documentos sub-components.
 */

import { AlertTriangle, Clock } from 'lucide-react';

import { formatDate, getVencStatus } from './helpers';
import { TIPOS_DOCUMENTO } from './types';

export function VencBadge({ d }: { d: string | null }) {
  if (!d) return <span className="text-[var(--text)]/40">—</span>;
  const st = getVencStatus(d);
  const txt = formatDate(d);
  if (st === 'expired')
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
        <AlertTriangle className="h-3 w-3" />
        {txt}
      </span>
    );
  if (st === 'soon')
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
        <Clock className="h-3 w-3" />
        {txt}
      </span>
    );
  return <span className="text-sm text-[var(--text)]/70">{txt}</span>;
}

export function TipoBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return <span className="text-[var(--text)]/40">—</span>;
  const f = TIPOS_DOCUMENTO.find((t) => t.value === tipo);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-xs font-medium text-[var(--text)]/70">
      {f?.icon} {tipo}
    </span>
  );
}

// Tipo de operación viene normalizado en minúsculas sin acentos del prompt
// de extracción. Para la UI capitalizamos la primera letra y nada más — si
// empezamos a tener muchas variantes, vale la pena moverlo a un lookup con
// colores por categoría.
export function TipoOperacionBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return <span className="text-[var(--text)]/25">—</span>;
  const label = tipo.charAt(0).toUpperCase() + tipo.slice(1);
  return (
    <span
      className="inline-flex items-center rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/8 px-2 py-0.5 text-xs font-medium text-[var(--accent)]"
      title={tipo}
    >
      {label}
    </span>
  );
}

export function FLabel({ children, req }: { children: React.ReactNode; req?: boolean }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
      {req && <span className="text-red-400 ml-0.5">*</span>}
    </div>
  );
}

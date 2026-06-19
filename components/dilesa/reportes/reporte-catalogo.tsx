'use client';

/**
 * Catálogo de reportes — buscador + grid de tarjetas (ADR-047).
 *
 * Reutilizable: lo monta el hub-índice (`/dilesa/reportes`, todos los reportes
 * que el usuario puede ver) y cada módulo (solo los suyos). Recibe la lista ya
 * filtrada por RBAC; aquí solo se busca por texto y se renderiza.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { ReporteDef } from '@/lib/dilesa/reportes/tipos';

export function ReporteCatalogo({
  reportes,
  emptyHint,
}: {
  reportes: readonly ReporteDef[];
  /** Mensaje cuando no hay reportes disponibles (vs. sin coincidencias de búsqueda). */
  emptyHint?: string;
}) {
  const [q, setQ] = useState('');

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return reportes;
    return reportes.filter(
      (r) =>
        r.nombre.toLowerCase().includes(needle) ||
        r.descripcion.toLowerCase().includes(needle) ||
        r.modulo.label.toLowerCase().includes(needle)
    );
  }, [reportes, q]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar reporte…"
          className="pl-9"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          {q
            ? 'Ningún reporte coincide con tu búsqueda.'
            : (emptyHint ?? 'Aún no hay reportes disponibles.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((r) => (
            <ReporteCard key={`${r.modulo.slug}:${r.id}`} reporte={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReporteCard({ reporte }: { reporte: ReporteDef }) {
  const Icon = reporte.icon;
  return (
    <Link
      href={reporte.href}
      className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
          <Icon className="h-5 w-5" />
        </div>
        <Badge tone="neutral">{reporte.modulo.label}</Badge>
      </div>
      <div className="mt-3 text-sm font-semibold leading-tight text-[var(--text)] group-hover:text-[var(--accent)]">
        {reporte.nombre}
      </div>
      <p className="mt-1 line-clamp-3 flex-1 text-xs leading-relaxed text-[var(--text)]/60">
        {reporte.descripcion}
      </p>
      {reporte.pdf ? (
        <div className="mt-3 flex items-center gap-1 text-[11px] text-[var(--text)]/45">
          <FileText className="h-3 w-3" />
          Exportable a PDF
        </div>
      ) : null}
    </Link>
  );
}

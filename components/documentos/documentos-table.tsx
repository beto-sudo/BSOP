'use client';

/**
 * DocumentosTable — list rendering for the documentos module.
 *
 * Migrated to `<DataTable>` (ADR-010). The 4 IA-extraction columns
 * (Operación, Monto, Superficie, $/m²) use `column.showIf` to appear only
 * when the universe of documents has at least one row with that field.
 * PDF/IMG/Anexos cells use `<DataTable.InteractiveCell>` to keep their
 * link clicks from triggering `onRowClick`.
 *
 * Expects rows to have already been enriched with signed URLs upstream
 * (documentos-module.tsx calls getAdjuntoSignedUrls). Each PDF / IMG link
 * here renders a short-lived signed URL straight from `a.url`.
 */

import { AlertTriangle, FileText, Image as ImageIcon, Paperclip, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/module-page';
import { formatCurrency, formatDate, formatPrecioM2, formatSuperficie } from '@/lib/format';

import type { Adjunto, Documento } from './types';
import { TipoBadge, TipoOperacionBadge, VencBadge } from './ui';

export function DocumentosTable({
  loading,
  error,
  filtered,
  documentos,
  adjuntosPorDoc,
  onSelect,
  onCreate,
  semanticActive = false,
}: {
  loading: boolean;
  error: string | null;
  filtered: Documento[];
  documentos: Documento[];
  adjuntosPorDoc: Record<string, Adjunto[]>;
  onSelect: (doc: Documento) => void;
  onCreate: () => void;
  /** When true the rows are already pre-sorted by semantic rank — disable
   *  initialSort so DataTable doesn't override the rank with a default sort. */
  semanticActive?: boolean;
}) {
  // Show derived AI-extraction columns only when at least one document in the
  // entire universe (not just the filtered subset) has data for them.
  const hasTipoOperacion = documentos.some((d) => d.tipo_operacion);
  const hasMonto = documentos.some((d) => d.monto != null);
  const hasSuperficie = documentos.some((d) => d.superficie_m2 != null);
  const hasPrecioM2 = documentos.some((d) => d.precio_m2 != null);

  const columns: Column<Documento>[] = [
    {
      key: 'titulo',
      label: 'Título',
      render: (doc) => {
        const docAdj = adjuntosPorDoc[doc.id] ?? [];
        const pdfs = docAdj.filter((a) => a.rol === 'documento_principal');
        return (
          <div>
            <div className="flex items-center gap-1.5">
              <span className="line-clamp-1 font-medium text-[var(--text)]">{doc.titulo}</span>
              {doc.tipo && doc.tipo !== 'Otro' && pdfs.length === 0 && (
                <span title="Sin PDF principal" className="shrink-0 text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                </span>
              )}
            </div>
            {doc.notaria && (
              <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">{doc.notaria}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'tipo',
      label: 'Tipo',
      width: 'w-32',
      render: (doc) => <TipoBadge tipo={doc.tipo} />,
    },
    {
      key: 'tipo_operacion',
      label: 'Operación',
      width: 'w-40',
      showIf: () => hasTipoOperacion,
      render: (doc) => <TipoOperacionBadge tipo={doc.tipo_operacion} />,
    },
    {
      key: 'monto',
      label: 'Monto',
      width: 'w-32',
      type: 'currency',
      showIf: () => hasMonto,
      cellClassName: 'font-mono text-sm text-[var(--text)]/80',
      render: (doc) =>
        doc.monto != null ? (
          formatCurrency(doc.monto, { decimals: 0, currency: doc.moneda || 'MXN' })
        ) : (
          <span className="text-xs text-[var(--text)]/25">—</span>
        ),
    },
    {
      key: 'superficie_m2',
      label: 'Superficie',
      width: 'w-28',
      align: 'right',
      type: 'number',
      showIf: () => hasSuperficie,
      cellClassName: 'font-mono text-xs text-[var(--text)]/70',
      render: (doc) =>
        doc.superficie_m2 != null ? (
          formatSuperficie(doc.superficie_m2)
        ) : (
          <span className="text-xs text-[var(--text)]/25">—</span>
        ),
    },
    {
      key: 'precio_m2',
      label: '$/m²',
      width: 'w-28',
      align: 'right',
      type: 'number',
      showIf: () => hasPrecioM2,
      cellClassName: 'font-mono text-xs text-[var(--text)]/70',
      render: (doc) =>
        doc.precio_m2 != null ? (
          formatPrecioM2(doc.precio_m2, doc.moneda)
        ) : (
          <span className="text-xs text-[var(--text)]/25">—</span>
        ),
    },
    {
      key: 'descripcion',
      label: 'Descripción',
      sortable: false,
      render: (doc) =>
        doc.descripcion ? (
          <span
            className="line-clamp-2 block max-w-xs text-xs text-[var(--text)]/65"
            title={doc.descripcion}
          >
            {doc.descripcion}
          </span>
        ) : (
          <span className="text-xs text-[var(--text)]/25">—</span>
        ),
    },
    {
      key: 'pdf',
      label: 'PDF',
      width: 'w-24',
      sortable: false,
      render: (doc) => {
        const pdfs = (adjuntosPorDoc[doc.id] ?? []).filter((a) => a.rol === 'documento_principal');
        if (pdfs.length === 0) return <span className="text-xs text-[var(--text)]/25">—</span>;
        return (
          <DataTable.InteractiveCell>
            <div className="flex gap-1">
              {pdfs.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                  title={a.nombre}
                >
                  <FileText className="h-3 w-3" />
                  PDF
                </a>
              ))}
            </div>
          </DataTable.InteractiveCell>
        );
      },
    },
    {
      key: 'img',
      label: 'Imagen',
      width: 'w-24',
      sortable: false,
      render: (doc) => {
        const imgs = (adjuntosPorDoc[doc.id] ?? []).filter((a) => a.rol === 'imagen_referencia');
        if (imgs.length === 0) return <span className="text-xs text-[var(--text)]/25">—</span>;
        return (
          <DataTable.InteractiveCell>
            <div className="flex gap-1">
              {imgs.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/img relative inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
                  title={a.nombre}
                >
                  <ImageIcon className="h-3 w-3" />
                  IMG
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 scale-95 opacity-0 transition-all duration-150 group-hover/img:scale-100 group-hover/img:opacity-100">
                    <img
                      src={a.url}
                      alt={a.nombre}
                      className="max-h-48 max-w-64 rounded-xl border border-[var(--border)] shadow-xl object-contain bg-white"
                    />
                  </span>
                </a>
              ))}
            </div>
          </DataTable.InteractiveCell>
        );
      },
    },
    {
      key: 'anexos',
      label: 'Anexos',
      width: 'w-20',
      sortable: false,
      render: (doc) => {
        const anx = (adjuntosPorDoc[doc.id] ?? []).filter((a) => a.rol === 'anexo');
        if (anx.length === 0) return <span className="text-xs text-[var(--text)]/25">—</span>;
        return (
          <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--panel)] px-2 py-1 text-xs font-medium text-[var(--text)]/50">
            <Paperclip className="h-3 w-3" />
            {anx.length}
          </span>
        );
      },
    },
    {
      key: 'fecha_emision',
      label: 'Emisión',
      width: 'w-28',
      cellClassName: 'text-sm text-[var(--text)]/70',
      render: (doc) => formatDate(doc.fecha_emision),
    },
    {
      key: 'fecha_vencimiento',
      label: 'Vencimiento',
      width: 'w-36',
      render: (doc) => <VencBadge d={doc.fecha_vencimiento} />,
    },
  ];

  return (
    <DataTable<Documento>
      data={filtered}
      columns={columns}
      rowKey="id"
      loading={loading}
      error={error}
      onRowClick={onSelect}
      initialSort={semanticActive ? undefined : { key: 'fecha_emision', dir: 'desc' }}
      showDensityToggle={false}
      emptyTitle={documentos.length === 0 ? 'No hay documentos capturados aún' : 'Sin resultados'}
      emptyAction={
        documentos.length === 0 ? (
          <Button
            size="sm"
            onClick={onCreate}
            className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
          >
            <Plus className="h-4 w-4" />
            Capturar primer documento
          </Button>
        ) : undefined
      }
    />
  );
}

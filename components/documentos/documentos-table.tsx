'use client';

/**
 * DocumentosTable — list rendering for the documentos module.
 *
 * Expects rows to have already been enriched with signed URLs upstream
 * (documentos-module.tsx calls getAdjuntoSignedUrls). Each PDF / IMG link
 * here renders a short-lived signed URL straight from `a.url`.
 */

import { AlertTriangle, FileText, Image as ImageIcon, Paperclip, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableHead } from '@/components/ui/sortable-head';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { Adjunto, Documento } from './types';
import { formatDate, formatMonto, formatPrecioM2, formatSuperficie } from './helpers';
import { TipoBadge, TipoOperacionBadge, VencBadge } from './ui';

type SortCtx = {
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  sortData: <T extends Record<string, unknown>>(rows: T[]) => T[];
};

export function DocumentosTable({
  loading,
  error,
  filtered,
  documentos,
  adjuntosPorDoc,
  onSelect,
  onCreate,
  sort,
}: {
  loading: boolean;
  error: string | null;
  filtered: Documento[];
  documentos: Documento[];
  adjuntosPorDoc: Record<string, Adjunto[]>;
  onSelect: (doc: Documento) => void;
  onCreate: () => void;
  sort: SortCtx;
}) {
  const { sortKey, sortDir, onSort, sortData } = sort;

  // Mostrar columnas derivadas de la extracción IA solo si al menos un
  // documento del dataset las tiene (evita columnas siempre vacías antes de
  // que se corra el pipeline en esa empresa).
  const hasTipoOperacion = documentos.some((d) => d.tipo_operacion);
  const hasMonto = documentos.some((d) => d.monto != null);
  const hasSuperficie = documentos.some((d) => d.superficie_m2 != null);
  const hasPrecioM2 = documentos.some((d) => d.precio_m2 != null);

  if (error) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="space-y-0 divide-y divide-[var(--border)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-5 w-24 ml-auto" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-col items-center justify-center p-16 text-center">
          <FileText className="mb-3 h-10 w-10 text-[var(--text)]/20" />
          <p className="text-sm text-[var(--text)]/55">
            {documentos.length === 0 ? 'No hay documentos capturados aún' : 'Sin resultados'}
          </p>
          {documentos.length === 0 && (
            <Button
              size="sm"
              onClick={onCreate}
              className="mt-4 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
            >
              <Plus className="h-4 w-4" />
              Capturar primer documento
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <Table>
        <TableHeader>
          <TableRow className="border-[var(--border)] hover:bg-transparent">
            <SortableHead
              sortKey="titulo"
              label="Título"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
            />
            <SortableHead
              sortKey="tipo"
              label="Tipo"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="w-32"
            />
            {hasTipoOperacion && (
              <SortableHead
                sortKey="tipo_operacion"
                label="Operación"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="w-40"
              />
            )}
            {hasMonto && (
              <SortableHead
                sortKey="monto"
                label="Monto"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="w-32 text-right"
              />
            )}
            {hasSuperficie && (
              <SortableHead
                sortKey="superficie_m2"
                label="Superficie"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="w-28 text-right"
              />
            )}
            {hasPrecioM2 && (
              <SortableHead
                sortKey="precio_m2"
                label="$/m²"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                className="w-28 text-right"
              />
            )}
            <TableHead className="font-medium text-[var(--text)]/55">Descripción</TableHead>
            <TableHead className="w-24 font-medium text-[var(--text)]/55">PDF</TableHead>
            <TableHead className="w-24 font-medium text-[var(--text)]/55">Imagen</TableHead>
            <TableHead className="w-20 font-medium text-[var(--text)]/55">Anexos</TableHead>
            <SortableHead
              sortKey="fecha_emision"
              label="Emisión"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="w-28"
            />
            <SortableHead
              sortKey="fecha_vencimiento"
              label="Vencimiento"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="w-36"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortData(filtered).map((doc) => {
            const docAdj = adjuntosPorDoc[doc.id] ?? [];
            const pdfs = docAdj.filter((a) => a.rol === 'documento_principal');
            const imgs = docAdj.filter((a) => a.rol === 'imagen_referencia');
            const anx = docAdj.filter((a) => a.rol === 'anexo');
            return (
              <TableRow
                key={doc.id}
                className="border-[var(--border)] cursor-pointer hover:bg-[var(--panel)]/50"
                onClick={() => onSelect(doc)}
              >
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="line-clamp-1 font-medium text-[var(--text)]">
                      {doc.titulo}
                    </span>
                    {doc.tipo && doc.tipo !== 'Otro' && pdfs.length === 0 && (
                      <span title="Sin PDF principal" className="shrink-0 text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  {doc.notaria && (
                    <span className="mt-0.5 block text-xs text-[var(--text)]/40">
                      {doc.notaria}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <TipoBadge tipo={doc.tipo} />
                </TableCell>
                {hasTipoOperacion && (
                  <TableCell>
                    <TipoOperacionBadge tipo={doc.tipo_operacion} />
                  </TableCell>
                )}
                {hasMonto && (
                  <TableCell className="text-right">
                    {doc.monto != null ? (
                      <span className="font-mono text-sm text-[var(--text)]/80">
                        {formatMonto(doc.monto, doc.moneda)}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text)]/25">—</span>
                    )}
                  </TableCell>
                )}
                {hasSuperficie && (
                  <TableCell className="text-right">
                    {doc.superficie_m2 != null ? (
                      <span className="font-mono text-xs text-[var(--text)]/70">
                        {formatSuperficie(doc.superficie_m2)}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text)]/25">—</span>
                    )}
                  </TableCell>
                )}
                {hasPrecioM2 && (
                  <TableCell className="text-right">
                    {doc.precio_m2 != null ? (
                      <span className="font-mono text-xs text-[var(--text)]/70">
                        {formatPrecioM2(doc.precio_m2, doc.moneda)}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text)]/25">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {doc.descripcion ? (
                    <span
                      className="line-clamp-2 block max-w-xs text-xs text-[var(--text)]/65"
                      title={doc.descripcion}
                    >
                      {doc.descripcion}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--text)]/25">—</span>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {pdfs.length > 0 ? (
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
                  ) : (
                    <span className="text-xs text-[var(--text)]/25">—</span>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {imgs.length > 0 ? (
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
                  ) : (
                    <span className="text-xs text-[var(--text)]/25">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {anx.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--panel)] px-2 py-1 text-xs font-medium text-[var(--text)]/50">
                      <Paperclip className="h-3 w-3" />
                      {anx.length}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--text)]/25">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-[var(--text)]/70">
                    {formatDate(doc.fecha_emision)}
                  </span>
                </TableCell>
                <TableCell>
                  <VencBadge d={doc.fecha_vencimiento} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

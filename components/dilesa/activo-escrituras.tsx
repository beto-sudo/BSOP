'use client';

/**
 * ActivoEscrituras — escrituras y documentos legales ligados a un activo del
 * portafolio (iniciativa dilesa-portafolio-expediente). El documento vive en
 * `erp.documentos` (store legal con notaría/folio/extracción IA); aquí se liga
 * 1:N vía `dilesa.activo_documentos`. FK cross-schema → dos queries (no embed).
 *
 * Lectura para todos; ligar/desligar solo admin/Dirección (gate en la action).
 */

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { Button } from '@/components/ui/button';
import { ligarDocumentoActivo, desligarDocumentoActivo } from '@/app/dilesa/portafolio/actions';

type DocMeta = {
  id: string;
  titulo: string;
  tipo: string | null;
  numero_documento: string | null;
  notaria: string | null;
};
type DocLigado = { puenteId: string; rol: string; documento: DocMeta };

const ROL_LABEL: Record<string, string> = {
  escritura: 'Escritura',
  avaluo: 'Avalúo',
  contrato: 'Contrato',
  otro: 'Otro',
};

export function ActivoEscrituras({
  activoId,
  empresaId,
  puedeAdmin,
}: {
  activoId: string;
  empresaId: string;
  puedeAdmin: boolean;
}) {
  const [ligados, setLigados] = useState<DocLigado[]>([]);
  const [disponibles, setDisponibles] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selDoc, setSelDoc] = useState('');
  const [selRol, setSelRol] = useState('escritura');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hace las dos queries (puentes en dilesa + documentos en erp) y arma el merge.
  const fetchData = useCallback(async (): Promise<
    { error: string } | { ligados: DocLigado[]; disponibles: DocMeta[] }
  > => {
    const sb = createSupabaseBrowserClient();
    const { data: puentes, error: e1 } = await sb
      .schema('dilesa')
      .from('activo_documentos')
      .select('id, documento_id, rol')
      .eq('activo_id', activoId)
      .is('deleted_at', null);
    if (e1) return { error: getSupabaseErrorMessage(e1, 'No se pudieron cargar los documentos.') };

    const { data: docs, error: e2 } = await sb
      .schema('erp')
      .from('documentos')
      .select('id, titulo, tipo, numero_documento, notaria, fecha_emision')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .order('fecha_emision', { ascending: false, nullsFirst: false });
    if (e2) return { error: getSupabaseErrorMessage(e2, 'No se pudieron cargar los documentos.') };

    const docById = new Map((docs ?? []).map((d) => [d.id as string, d as unknown as DocMeta]));
    const ligadoIds = new Set((puentes ?? []).map((p) => p.documento_id as string));
    const lig: DocLigado[] = (puentes ?? [])
      .map((p) => {
        const doc = docById.get(p.documento_id as string);
        return doc ? { puenteId: p.id as string, rol: p.rol as string, documento: doc } : null;
      })
      .filter((x): x is DocLigado => x !== null);
    const disp = (docs ?? [])
      .map((d) => d as unknown as DocMeta)
      .filter((d) => !ligadoIds.has(d.id));
    return { ligados: lig, disponibles: disp };
  }, [activoId, empresaId]);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await fetchData();
    if ('error' in r) {
      setError(r.error);
    } else {
      setLigados(r.ligados);
      setDisponibles(r.disponibles);
    }
    setLoading(false);
  }, [fetchData]);

  // Carga inicial: setState tras el await (no síncrono en el effect).
  useEffect(() => {
    let alive = true;
    void fetchData().then((r) => {
      if (!alive) return;
      if ('error' in r) {
        setError(r.error);
      } else {
        setLigados(r.ligados);
        setDisponibles(r.disponibles);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchData]);

  const handleLigar = async () => {
    if (!selDoc) return;
    setBusy(true);
    setError(null);
    const r = await ligarDocumentoActivo(activoId, selDoc, selRol);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setSelDoc('');
    void recargar();
  };

  const handleDesligar = async (puenteId: string) => {
    setBusy(true);
    setError(null);
    const r = await desligarDocumentoActivo(puenteId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    void recargar();
  };

  if (loading) {
    return <p className="py-1 text-sm text-[var(--text)]/50">Cargando documentos…</p>;
  }

  return (
    <div className="grid gap-2">
      {ligados.length === 0 ? (
        <p className="text-sm text-[var(--text)]/50">Sin escrituras ligadas.</p>
      ) : (
        ligados.map((l) => (
          <div
            key={l.puenteId}
            className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-[var(--text)]">{l.documento.titulo}</div>
              <div className="truncate text-xs text-[var(--text)]/60">
                {ROL_LABEL[l.rol] ?? l.rol}
                {l.documento.numero_documento ? ` · ${l.documento.numero_documento}` : ''}
                {l.documento.notaria ? ` · ${l.documento.notaria}` : ''}
              </div>
            </div>
            {puedeAdmin ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void handleDesligar(l.puenteId)}
              >
                Desligar
              </Button>
            ) : null}
          </div>
        ))
      )}

      {puedeAdmin ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select
            value={selDoc}
            onChange={(e) => setSelDoc(e.target.value)}
            className="h-9 min-w-[220px] flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            <option value="">— Elegir documento legal —</option>
            {disponibles.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titulo}
                {d.tipo ? ` (${d.tipo})` : ''}
              </option>
            ))}
          </select>
          <select
            value={selRol}
            onChange={(e) => setSelRol(e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            {Object.entries(ROL_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={busy || !selDoc} onClick={() => void handleLigar()}>
            Ligar
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

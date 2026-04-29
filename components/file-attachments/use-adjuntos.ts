'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: the effect seeds loading state before firing an async
 * fetch. Matches the convention used in the rest of the BSOP app
 * (`<EmpleadoAdjuntos>`, juntas, tasks).
 */

import { useCallback, useEffect, useState } from 'react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';

import type { AdjuntoRow } from './types';

export type UseAdjuntosOpts = {
  empresaId: string;
  entidadTipo: string;
  entidadId: string;
};

export type UseAdjuntosResult = {
  adjuntos: AdjuntoRow[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Fetches adjunto rows for a given entity. Used internally by
 * `<FileAttachments>`; also available for callers that need read access
 * outside the component.
 */
export function useAdjuntos({
  empresaId,
  entidadTipo,
  entidadId,
}: UseAdjuntosOpts): UseAdjuntosResult {
  const [adjuntos, setAdjuntos] = useState<AdjuntoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!empresaId || !entidadId) {
      setAdjuntos([]);
      setLoading(false);
      return;
    }
    const supabase = createSupabaseERPClient();
    const { data, error } = await supabase
      .schema('erp')
      .from('adjuntos')
      .select(
        'id, empresa_id, entidad_tipo, entidad_id, rol, url, nombre, tipo_mime, tamano_bytes, created_at'
      )
      .eq('empresa_id', empresaId)
      .eq('entidad_tipo', entidadTipo)
      .eq('entidad_id', entidadId)
      .order('rol')
      .order('created_at', { ascending: true });
    if (!error) setAdjuntos((data ?? []) as AdjuntoRow[]);
    setLoading(false);
  }, [empresaId, entidadTipo, entidadId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  return { adjuntos, loading, refresh };
}

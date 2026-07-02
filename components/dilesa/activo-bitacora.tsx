'use client';

/**
 * ActivoBitacora — bitácora append-only del activo (S6, iniciativa
 * `dilesa-portafolio-predios`). Notas manuales + entradas automáticas de
 * cambios de etapa/decisión (trigger). Los nombres de autor se resuelven
 * vía `core.v_usuarios_directorio` (RLS self-only en core.usuarios).
 */

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { agregarBitacoraActivo } from '@/app/dilesa/portafolio/actions';

const TIPO_TONE: Record<string, 'info' | 'accent' | 'neutral'> = {
  etapa: 'info',
  decision: 'accent',
};

type Entrada = {
  id: string;
  tipo: string;
  texto: string;
  creado_por: string | null;
  created_at: string;
  autor?: string | null;
};

export function ActivoBitacora({
  activoId,
  empresaId,
  puedeAdmin,
}: {
  activoId: string;
  empresaId: string;
  puedeAdmin: boolean;
}) {
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error: err } = await sb
        .schema('dilesa')
        .from('activo_bitacora')
        .select('id, tipo, texto, creado_por, created_at')
        .eq('empresa_id', empresaId)
        .eq('activo_id', activoId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!vivo) return;
      if (err) {
        setError(getSupabaseErrorMessage(err, 'No se pudo cargar la bitácora.'));
        return;
      }
      const rows = (data ?? []) as Entrada[];
      const autores = Array.from(
        new Set(rows.map((r) => r.creado_por).filter(Boolean))
      ) as string[];
      if (autores.length > 0) {
        const { data: dir } = await sb
          .schema('core')
          .from('v_usuarios_directorio')
          .select('id, nombre')
          .in('id', autores);
        const nombres = new Map((dir ?? []).map((d) => [d.id as string, d.nombre as string]));
        for (const r of rows) r.autor = r.creado_por ? (nombres.get(r.creado_por) ?? null) : null;
      }
      if (vivo) setEntradas(rows);
    })();
    return () => {
      vivo = false;
    };
  }, [activoId, empresaId, refreshKey]);

  async function agregar() {
    if (!nota.trim()) return;
    setBusy(true);
    setError(null);
    const r = await agregarBitacoraActivo({ activoId, texto: nota });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setNota('');
    setRefreshKey((k) => k + 1);
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
        Bitácora
      </h2>

      {puedeAdmin ? (
        <div className="mb-3 flex gap-2">
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void agregar();
            }}
            placeholder="Agregar nota (llamada, visita, acuerdo…)"
          />
          <Button size="sm" onClick={() => void agregar()} disabled={busy || !nota.trim()}>
            Agregar
          </Button>
        </div>
      ) : null}

      {error ? <p className="mb-2 text-sm text-[var(--danger)]">{error}</p> : null}

      {entradas.length === 0 ? (
        <p className="text-sm text-[var(--text)]/50">Sin entradas todavía.</p>
      ) : (
        <ul className="space-y-2.5">
          {entradas.map((e) => (
            <li key={e.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {e.tipo !== 'nota' ? (
                  <Badge tone={TIPO_TONE[e.tipo] ?? 'neutral'}>{e.tipo}</Badge>
                ) : null}
                <span className="text-xs text-[var(--text)]/50">
                  {new Date(e.created_at).toLocaleString('es-MX', {
                    timeZone: 'America/Matamoros',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {e.autor ? ` · ${e.autor}` : ''}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-[var(--text)]/85">{e.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

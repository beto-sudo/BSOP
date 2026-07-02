'use client';

/**
 * ActivoEvaluacionPanel — panel del embudo de compra en el expediente de un
 * TERRENO PROSPECTO (iniciativa `dilesa-portafolio-predios` · S6).
 *
 * Quick-actions sin abrir el form completo: etapa, prioridad, responsable,
 * siguiente acción, "revisado hoy", checklist de due diligence
 * (factibilidades) y comparables $/m² contra los demás prospectos. Los
 * cambios de etapa/decisión quedan en la bitácora vía trigger.
 */

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import { actualizarEmbudoTerreno } from '@/app/dilesa/portafolio/actions';
import {
  DIAS_ESTANCAMIENTO,
  ETAPAS_EMBUDO,
  diasSinRevision,
  promedioPrecioM2,
} from '@/lib/dilesa/evaluacion';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

const selectCls =
  'h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)]';

const DUE_DILIGENCE = [
  { key: 'factibilidad_agua', label: 'Agua' },
  { key: 'factibilidad_drenaje', label: 'Drenaje' },
  { key: 'factibilidad_electricidad', label: 'Electricidad' },
  { key: 'factibilidad_vialidad', label: 'Vialidad' },
] as const;

type Satelite = Record<string, unknown>;

export function ActivoEvaluacionPanel({
  activoId,
  empresaId,
  zona,
  createdAt,
  satelite,
  puedeAdmin,
  onChanged,
}: {
  activoId: string;
  empresaId: string;
  zona: string | null;
  createdAt: string | null;
  satelite: Satelite;
  puedeAdmin: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respEdit, setRespEdit] = useState<string>((satelite.responsable as string) ?? '');
  const [accionEdit, setAccionEdit] = useState<string>((satelite.siguiente_accion as string) ?? '');
  const [comparables, setComparables] = useState<{ zona: number | null; global: number | null }>({
    zona: null,
    global: null,
  });
  const hoy = useMemo(() => hoyISOMatamoros(), []);

  // Derivar estado de props sin effect (patrón "adjust state during render"):
  // al refrescar el satélite tras guardar, se re-sincronizan los inputs.
  const [prevSat, setPrevSat] = useState(satelite);
  if (prevSat !== satelite) {
    setPrevSat(satelite);
    setRespEdit((satelite.responsable as string) ?? '');
    setAccionEdit((satelite.siguiente_accion as string) ?? '');
  }

  // Comparables: $/m² solicitado promedio de los demás prospectos (zona y global).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const { data: activos } = await sb
        .schema('dilesa')
        .from('activos')
        .select('id, zona')
        .eq('empresa_id', empresaId)
        .eq('estado', 'prospecto')
        .eq('tipo', 'terreno')
        .neq('id', activoId)
        .is('deleted_at', null);
      const ids = (activos ?? []).map((a) => a.id);
      if (!vivo || ids.length === 0) return;
      const { data: sats } = await sb
        .schema('dilesa')
        .from('activo_terreno')
        .select('activo_id, precio_solicitado_m2')
        .in('activo_id', ids);
      if (!vivo) return;
      const precioPorId = new Map(
        (sats ?? []).map((s) => [s.activo_id as string, s.precio_solicitado_m2 as number | null])
      );
      const global = promedioPrecioM2(Array.from(precioPorId.values()));
      const zonaIds = (activos ?? [])
        .filter((a) => zona != null && a.zona === zona)
        .map((a) => a.id);
      const enZona = promedioPrecioM2(zonaIds.map((id) => precioPorId.get(id) ?? null));
      setComparables({ zona: enZona, global });
    })();
    return () => {
      vivo = false;
    };
  }, [activoId, empresaId, zona]);

  async function guardar(campos: Record<string, string | boolean | null>) {
    setBusy(true);
    setError(null);
    const r = await actualizarEmbudoTerreno({ activoId, campos, fechaRevision: hoy });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onChanged();
  }

  const etapa = (satelite.etapa as string) ?? 'detectado';
  const dias = diasSinRevision(hoy, (satelite.fecha_ultima_revision as string) ?? null, createdAt);
  const estancado = dias != null && dias > DIAS_ESTANCAMIENTO;
  const precioSol = satelite.precio_solicitado_m2 as number | null;

  return (
    <section className="rounded-lg border border-[var(--accent)]/40 bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          Embudo de compra
        </h2>
        {dias != null ? (
          <span
            className={`text-xs tabular-nums ${
              estancado ? 'font-medium text-[var(--danger)]' : 'text-[var(--text)]/50'
            }`}
          >
            {estancado ? '⚠ ' : ''}
            {dias} días sin revisar
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {puedeAdmin ? (
          <select
            value={etapa}
            disabled={busy}
            onChange={(e) => void guardar({ etapa: e.target.value })}
            className={selectCls}
          >
            {ETAPAS_EMBUDO.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        ) : (
          <Badge tone="info">{ETAPAS_EMBUDO.find((e) => e.value === etapa)?.label ?? etapa}</Badge>
        )}
        {puedeAdmin ? (
          <select
            value={(satelite.prioridad as string) ?? ''}
            disabled={busy}
            onChange={(e) => void guardar({ prioridad: e.target.value || null })}
            className={selectCls}
          >
            <option value="">Prioridad…</option>
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        ) : null}
        {puedeAdmin ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void guardar({})}>
            Revisado hoy
          </Button>
        ) : null}
      </div>

      {puedeAdmin ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input
            value={respEdit}
            onChange={(e) => setRespEdit(e.target.value)}
            onBlur={() => {
              if (respEdit !== ((satelite.responsable as string) ?? '')) {
                void guardar({ responsable: respEdit || null });
              }
            }}
            placeholder="Responsable"
          />
          <Input
            value={accionEdit}
            onChange={(e) => setAccionEdit(e.target.value)}
            onBlur={() => {
              if (accionEdit !== ((satelite.siguiente_accion as string) ?? '')) {
                void guardar({ siguiente_accion: accionEdit || null });
              }
            }}
            placeholder="Siguiente acción"
          />
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
          Due diligence (factibilidades)
        </div>
        <div className="flex flex-wrap gap-3">
          {DUE_DILIGENCE.map((d) => {
            const v = satelite[d.key] as boolean | null | undefined;
            return (
              <label
                key={d.key}
                className="flex items-center gap-1.5 text-sm text-[var(--text)]/80"
              >
                <input
                  type="checkbox"
                  checked={v === true}
                  disabled={!puedeAdmin || busy}
                  onChange={(e) => void guardar({ [d.key]: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {d.label}
              </label>
            );
          })}
        </div>
      </div>

      {precioSol != null || comparables.global != null ? (
        <div className="mt-4 border-t border-[var(--border)]/60 pt-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            Comparables ($/m² solicitado)
          </div>
          <p className="tabular-nums text-[var(--text)]/80">
            Este predio: {precioSol != null ? formatCurrency(precioSol) : '—'}
            {comparables.zona != null ? (
              <>
                {' '}
                · prom. {zona}: {formatCurrency(comparables.zona)}
              </>
            ) : null}
            {comparables.global != null ? (
              <> · prom. prospectos: {formatCurrency(comparables.global)}</>
            ) : null}
          </p>
          {precioSol != null && comparables.global != null ? (
            <p className="mt-0.5 text-xs text-[var(--text)]/50">
              {precioSol > comparables.global
                ? `${(((precioSol - comparables.global) / comparables.global) * 100).toFixed(0)}% arriba del promedio de prospectos.`
                : `${(((comparables.global - precioSol) / comparables.global) * 100).toFixed(0)}% abajo del promedio de prospectos.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
    </section>
  );
}

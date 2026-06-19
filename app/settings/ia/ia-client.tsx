'use client';

/**
 * IaClient — inventario y costo de los usos de IA (iniciativa registro-ia · S3).
 *
 * Importa SOLO de `@/lib/ai/registry` y `@/lib/ai/pricing` (módulos puros) — no
 * del barrel `@/lib/ai`, que arrastraría `run.ts`/`clients.ts` (@ai-sdk) al
 * bundle del cliente.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bot, Coins, RotateCcw, Activity } from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { AI_USOS, AI_USO_IDS, type AiUsoId } from '@/lib/ai/registry';
import { MODELOS_POR_PROVEEDOR } from '@/lib/ai/pricing';
import { clearModeloOverrideAction, setModeloOverrideAction } from './actions';

export type OverrideRow = {
  uso_id: string;
  modelo: string;
  nota: string | null;
  actualizado_en: string;
};

export type IaStats = {
  totalCosto: number;
  totalLlamadas: number;
  errores: number;
  porUso: Record<string, { llamadas: number; costo: number }>;
  porEmpresa: Array<{ empresa: string; llamadas: number; costo: number }>;
  muestreado: boolean;
};

const CRITICIDAD_TONE: Record<string, BadgeTone> = {
  alta: 'danger',
  media: 'warning',
  baja: 'neutral',
};
const EMPRESA_TONE: Record<string, BadgeTone> = {
  cross: 'info',
  dilesa: 'accent',
};

function fmtUsd(n: number): string {
  if (!n) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 text-[var(--text-muted)] dark:text-white/55">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-[var(--text)] dark:text-white">{value}</div>
    </div>
  );
}

export function IaClient({
  overrides,
  stats,
}: {
  overrides: Record<string, OverrideRow>;
  stats: IaStats;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ usoId: string; text: string; error: boolean } | null>(null);

  function aplicar(usoId: AiUsoId, modelo: string) {
    const esDefault = modelo === AI_USOS[usoId].modeloDefault;
    setMsg(null);
    startTransition(async () => {
      const res = esDefault
        ? await clearModeloOverrideAction(usoId)
        : await setModeloOverrideAction(usoId, modelo);
      if (res.ok) {
        setMsg({ usoId, text: 'Guardado', error: false });
        router.refresh();
      } else {
        setMsg({ usoId, text: res.error, error: true });
      }
    });
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--text)] dark:text-white">
          Inteligencia Artificial
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)] dark:text-white/55">
          Inventario de los {AI_USO_IDS.length} usos de IA en producción, el modelo efectivo de cada
          uno (cambiable sin redeploy) y su costo. La fuente de verdad del catálogo vive en el
          código (<code className="text-xs">lib/ai/registry.ts</code>); el guard de CI no deja que
          envejezca.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<Coins className="size-4" />}
          label="Costo estimado"
          value={fmtUsd(stats.totalCosto)}
        />
        <Kpi
          icon={<Activity className="size-4" />}
          label="Llamadas"
          value={stats.totalLlamadas.toLocaleString('es-MX')}
        />
        <Kpi
          icon={<Bot className="size-4" />}
          label="Usos registrados"
          value={String(AI_USO_IDS.length)}
        />
        <Kpi
          icon={<AlertTriangle className="size-4" />}
          label="Con error"
          value={stats.errores.toLocaleString('es-MX')}
        />
      </section>

      {stats.totalLlamadas === 0 && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)] dark:text-white/55">
          Aún no hay invocaciones registradas. El log se llena a medida que corren las extracciones
          (se habilitó con la capa de IA del Sprint 2).
        </p>
      )}
      {stats.muestreado && (
        <p className="text-xs text-amber-500">
          Mostrando las últimas {stats.totalLlamadas.toLocaleString('es-MX')} invocaciones (límite
          de muestra). Los totales pueden estar subestimados.
        </p>
      )}

      {/* Tabla de usos */}
      <section className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface)] text-left text-xs text-[var(--text-muted)] dark:text-white/55">
            <tr>
              <th className="px-4 py-2 font-medium">Proceso</th>
              <th className="px-4 py-2 font-medium">Empresa</th>
              <th className="px-4 py-2 font-medium">Criticidad</th>
              <th className="px-4 py-2 font-medium">Modelo efectivo</th>
              <th className="px-4 py-2 text-right font-medium">Llamadas</th>
              <th className="px-4 py-2 text-right font-medium">Costo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {AI_USO_IDS.map((id) => {
              const uso = AI_USOS[id];
              const ov = overrides[id];
              const efectivo = ov?.modelo ?? uso.modeloDefault;
              const overridden = !!ov && ov.modelo !== uso.modeloDefault;
              const st = stats.porUso[id] ?? { llamadas: 0, costo: 0 };
              const esEmbedding = uso.modalidad === 'embedding';
              const opciones = MODELOS_POR_PROVEEDOR[uso.proveedor];
              return (
                <tr key={id} className="align-top text-[var(--text)] dark:text-white/90">
                  <td className="px-4 py-3">
                    <div className="font-medium">{uso.label}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)] dark:text-white/45">
                      {id} · {uso.proveedor} · {uso.envVar}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)] dark:text-white/45">
                      {uso.descripcion}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={EMPRESA_TONE[uso.empresa] ?? 'neutral'}>{uso.empresa}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={CRITICIDAD_TONE[uso.criticidad] ?? 'neutral'}>
                      {uso.criticidad}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {esEmbedding ? (
                      <div>
                        <code className="text-xs">{efectivo}</code>
                        <div className="mt-1 flex items-start gap-1 text-xs text-amber-500">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          <span>
                            {uso.nota ?? 'Cambiar el modelo de embedding exige reindexar.'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Modelo de ${uso.label}`}
                          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] dark:text-white disabled:opacity-50"
                          value={efectivo}
                          disabled={pending}
                          onChange={(e) => aplicar(id, e.target.value)}
                        >
                          {opciones.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        {overridden ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => aplicar(id, uso.modeloDefault)}
                            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50 dark:text-white/55 dark:hover:text-white"
                            title={`Restablecer al default (${uso.modeloDefault})`}
                          >
                            <RotateCcw className="size-3" />
                          </button>
                        ) : null}
                      </div>
                    )}
                    {overridden && (
                      <div className="mt-1">
                        <Badge tone="accent">override · default {uso.modeloDefault}</Badge>
                      </div>
                    )}
                    {msg && msg.usoId === id && (
                      <div
                        className={`mt-1 text-xs ${msg.error ? 'text-red-500' : 'text-emerald-500'}`}
                      >
                        {msg.text}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {st.llamadas.toLocaleString('es-MX')}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(st.costo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Costo por empresa */}
      {stats.porEmpresa.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--text)] dark:text-white">
            Costo por empresa
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface)] text-left text-xs text-[var(--text-muted)] dark:text-white/55">
                <tr>
                  <th className="px-4 py-2 font-medium">Empresa</th>
                  <th className="px-4 py-2 text-right font-medium">Llamadas</th>
                  <th className="px-4 py-2 text-right font-medium">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {stats.porEmpresa.map((e) => (
                  <tr key={e.empresa} className="text-[var(--text)] dark:text-white/90">
                    <td className="px-4 py-2">
                      <Badge tone={EMPRESA_TONE[e.empresa] ?? 'neutral'}>{e.empresa}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {e.llamadas.toLocaleString('es-MX')}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtUsd(e.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

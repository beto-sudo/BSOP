'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Syringe, Pill, Beaker, Plus, type LucideIcon } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { TONES, type ToneKey } from './tones';
import { ProtocoloDrawer } from './protocolo-drawer';
import { registrarToma } from '@/app/health/actions';
import type { ProtocoloClase, ProtocoloCompuestoConTomas, ProtocoloEstado } from '@/lib/protocolo';

const CLASE_META: Record<ProtocoloClase, { label: string; icon: LucideIcon; tomaLabel: string }> = {
  peptido: { label: 'Péptido', icon: Syringe, tomaLabel: 'inyecciones' },
  suplemento: { label: 'Suplemento', icon: Pill, tomaLabel: 'tomas' },
  oral: { label: 'Oral', icon: Pill, tomaLabel: 'tomas' },
  otro: { label: 'Otro', icon: Beaker, tomaLabel: 'tomas' },
};

// Un tono estable por compuesto, ciclado por posición.
const PALETTE: ToneKey[] = ['hrv', 'bp', 'weight', 'bmi', 'respiration', 'vo2', 'walkHr'];

const ESTADO_BADGE: Record<ProtocoloEstado, string | null> = {
  activo: null,
  pausado:
    'border-amber-300/40 bg-amber-100/60 text-amber-700 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200',
  suspendido:
    'border-rose-300/40 bg-rose-100/60 text-rose-700 dark:border-rose-300/25 dark:bg-rose-300/10 dark:text-rose-200',
  completado:
    'border-slate-300/40 bg-slate-100/60 text-slate-600 dark:border-slate-300/20 dark:bg-slate-300/10 dark:text-slate-300',
};

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    timeZone: 'America/Matamoros',
    day: 'numeric',
    month: 'short',
  });
}

function formatDosis(compuesto: ProtocoloCompuestoConTomas) {
  if (compuesto.dosis_objetivo == null) return '—';
  return `${compuesto.dosis_objetivo}${compuesto.unidad_dosis ? ` ${compuesto.unidad_dosis}` : ''}`;
}

function CompuestoCard({
  compuesto,
  tone,
  onQuick,
  onDetalle,
  quickPending,
}: {
  compuesto: ProtocoloCompuestoConTomas;
  tone: (typeof TONES)[ToneKey];
  onQuick: (c: ProtocoloCompuestoConTomas) => void;
  onDetalle: (c: ProtocoloCompuestoConTomas) => void;
  quickPending: boolean;
}) {
  const meta = CLASE_META[compuesto.clase];
  const Icon = meta.icon;
  const estadoBadge = ESTADO_BADGE[compuesto.estado];
  const activo = compuesto.estado === 'activo';
  // Últimas 14 tomas en orden cronológico (izq → der) para el mini-timeline.
  const recientes = compuesto.tomas.slice(0, 14).reverse();

  return (
    <Surface className="flex h-full flex-col p-5 shadow-sm dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`rounded-2xl border p-3 ${tone.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)] dark:text-white">
              {compuesto.nombre}
            </h3>
            <div className="mt-0.5 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/40">
              {meta.label}
            </div>
          </div>
        </div>
        {estadoBadge ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${estadoBadge}`}
          >
            {compuesto.estado}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex items-end gap-2">
        <div className="text-2xl font-semibold text-[var(--text)] dark:text-white">
          {formatDosis(compuesto)}
        </div>
        {compuesto.frecuencia ? (
          <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
            · {compuesto.frecuencia}
          </div>
        ) : null}
      </div>

      <div className="mt-2 text-xs text-[var(--muted-foreground)] dark:text-white/55">
        {compuesto.ultimaToma ? (
          <>
            Última: {formatFecha(compuesto.ultimaToma)} · {compuesto.totalTomas} {meta.tomaLabel}
          </>
        ) : (
          'Sin registros aún'
        )}
      </div>

      {compuesto.via || compuesto.procedencia ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {compuesto.via ? (
            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)] dark:border-white/10 dark:text-white/50">
              {compuesto.via}
            </span>
          ) : null}
          {compuesto.procedencia ? (
            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)] dark:border-white/10 dark:text-white/50">
              {compuesto.procedencia}
            </span>
          ) : null}
        </div>
      ) : null}

      {recientes.length ? (
        <div className="mt-4">
          <div className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)] dark:text-white/35">
            Últimas {meta.tomaLabel}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {recientes.map((toma) => (
              <span
                key={toma.id}
                title={`${formatFecha(toma.fecha)} · ${toma.dosis}${toma.unidad ? ` ${toma.unidad}` : ''}${toma.nota ? ` · ${toma.nota}` : ''}`}
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: tone.dot }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {compuesto.notas ? (
        <p className="mt-4 line-clamp-3 text-xs leading-relaxed text-[var(--muted-foreground)] dark:text-white/45">
          {compuesto.notas}
        </p>
      ) : null}

      {activo ? (
        <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
          <Button
            size="sm"
            onClick={() => onQuick(compuesto)}
            disabled={quickPending || compuesto.dosis_objetivo == null}
            title={
              compuesto.dosis_objetivo == null
                ? 'Define una dosis objetivo para el registro rápido'
                : `Registrar ${formatDosis(compuesto)} hoy`
            }
          >
            <Plus className="h-4 w-4" />
            {quickPending ? 'Guardando…' : 'Hoy'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDetalle(compuesto)}>
            Registrar…
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}

/**
 * Bitácora de protocolo — tarjetas de compuestos activos (péptidos, suplementos)
 * con dosis vigente, última toma y mini-timeline. Captura por drawer + registro
 * rápido "Hoy" (Sprint 3). El overlay con biomarcadores llega en Sprint 4.
 * Iniciativa salud-protocolo.
 */
export function ProtocoloSection({
  compuestos,
  errors,
}: {
  compuestos: ProtocoloCompuestoConTomas[];
  errors: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCompuestoId, setDrawerCompuestoId] = useState<string | null>(null);

  if (!compuestos.length && !errors.length) return null;

  const activos = compuestos.filter((c) => c.estado === 'activo');

  function quickRegister(c: ProtocoloCompuestoConTomas) {
    if (c.dosis_objetivo == null) return;
    setQuickError(null);
    setQuickId(c.id);
    startTransition(async () => {
      const res = await registrarToma({
        compuestoId: c.id,
        dosis: c.dosis_objetivo as number,
        unidad: c.unidad_dosis,
      });
      setQuickId(null);
      if (res.ok) router.refresh();
      else setQuickError(`${c.nombre}: ${res.error}`);
    });
  }

  function openDrawer(compuestoId: string | null) {
    setQuickError(null);
    setDrawerCompuestoId(compuestoId);
    setDrawerOpen(true);
  }

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300">
            <Syringe className="h-4 w-4" />
            Protocolo
          </div>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text)] dark:text-white">
            Péptidos y suplementos
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)] dark:text-white/55">
            Lo que te estás administrando, su dosis vigente y la bitácora de cada aplicación. El
            cruce con peso, pulso en reposo y presión llega en una próxima fase.
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => openDrawer(activos[0]?.id ?? null)}>
          <Plus className="h-4 w-4" />
          Registrar
        </Button>
      </div>

      {errors.length ? (
        <Surface className="mb-6 border-amber-300/30 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/8 dark:text-amber-100">
          {errors[0]}
        </Surface>
      ) : null}

      {quickError ? (
        <Surface className="mb-6 border-rose-300/30 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-300/20 dark:bg-rose-300/8 dark:text-rose-100">
          {quickError}
        </Surface>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {compuestos.map((compuesto, index) => (
          <CompuestoCard
            key={compuesto.id}
            compuesto={compuesto}
            tone={TONES[PALETTE[index % PALETTE.length]]}
            onQuick={quickRegister}
            onDetalle={(c) => openDrawer(c.id)}
            quickPending={pending && quickId === compuesto.id}
          />
        ))}
      </div>

      <ProtocoloDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        compuestos={compuestos}
        compuestoInicialId={drawerCompuestoId}
      />
    </section>
  );
}

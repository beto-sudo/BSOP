'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Check } from 'lucide-react';
import { registrarToma, crearCompuesto, type CrearCompuestoInput } from '@/app/health/actions';
import type { ProtocoloClase, ProtocoloCompuestoConTomas } from '@/lib/protocolo';

const CLASES: { v: ProtocoloClase; label: string }[] = [
  { v: 'peptido', label: 'Péptido' },
  { v: 'suplemento', label: 'Suplemento' },
  { v: 'oral', label: 'Oral' },
  { v: 'otro', label: 'Otro' },
];

// YYYY-MM-DD en tz local (Matamoros) para el input date.
function todayInput(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Matamoros',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    timeZone: 'America/Matamoros',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const inputCls = 'h-9 rounded-md border bg-background px-2 text-sm';

/**
 * Bitácora simple (iniciativa sanren-peptides, D2). Captura mínima — qué, cuánto,
 * cuándo, nota — reusando `health.protocolo_*` y las server actions de
 * `app/health/actions`. La versión clínica (escalas 0–5, overlay de biomarcadores)
 * vive en Health; aquí es el registro rápido del día a día.
 */
export function BitacoraTab({ compuestos }: { compuestos: ProtocoloCompuestoConTomas[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [compuestoId, setCompuestoId] = useState('');
  const [dosis, setDosis] = useState('');
  const [fecha, setFecha] = useState(todayInput());
  const [nota, setNota] = useState('');

  const [showNuevo, setShowNuevo] = useState(false);
  const [nuevo, setNuevo] = useState({
    nombre: '',
    clase: 'peptido' as ProtocoloClase,
    unidad: 'mg',
    dosis: '',
    frecuencia: '',
  });

  const activos = compuestos.filter((c) => c.estado === 'activo');
  const log = useMemo(
    () =>
      compuestos
        .flatMap((c) => c.tomas.map((t) => ({ ...t, nombre: c.nombre })))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 40),
    [compuestos]
  );

  function quick(c: ProtocoloCompuestoConTomas) {
    if (c.dosis_objetivo == null) return;
    setErr(null);
    setBusyId(c.id);
    start(async () => {
      const r = await registrarToma({
        compuestoId: c.id,
        dosis: c.dosis_objetivo as number,
        unidad: c.unidad_dosis,
      });
      setBusyId(null);
      if (r.ok) router.refresh();
      else setErr(`${c.nombre}: ${r.error}`);
    });
  }

  function submitToma() {
    setErr(null);
    const d = Number(dosis);
    if (!compuestoId) return setErr('Elige un compuesto.');
    if (!Number.isFinite(d) || d <= 0) return setErr('La dosis debe ser un número mayor a 0.');
    const c = compuestos.find((x) => x.id === compuestoId);
    start(async () => {
      const r = await registrarToma({
        compuestoId,
        dosis: d,
        unidad: c?.unidad_dosis ?? null,
        fecha: new Date(`${fecha}T12:00:00`).toISOString(),
        nota: nota || null,
      });
      if (r.ok) {
        setDosis('');
        setNota('');
        router.refresh();
      } else setErr(r.error);
    });
  }

  function submitNuevo() {
    setErr(null);
    if (!nuevo.nombre.trim()) return setErr('El nombre es obligatorio.');
    const input: CrearCompuestoInput = {
      nombre: nuevo.nombre,
      clase: nuevo.clase,
      unidadDosis: nuevo.unidad || null,
      dosisObjetivo: nuevo.dosis ? Number(nuevo.dosis) : null,
      frecuencia: nuevo.frecuencia || null,
    };
    start(async () => {
      const r = await crearCompuesto(input);
      if (r.ok) {
        setShowNuevo(false);
        setNuevo({ nombre: '', clase: 'peptido', unidad: 'mg', dosis: '', frecuencia: '' });
        router.refresh();
      } else setErr(r.error);
    });
  }

  return (
    <div className="space-y-5">
      {err ? (
        <div className="rounded-lg border border-rose-300/40 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-200">
          {err}
        </div>
      ) : null}

      {/* Registro rápido por compuesto activo */}
      {activos.length ? (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Registro rápido
          </div>
          <div className="flex flex-wrap gap-2">
            {activos.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending || c.dosis_objetivo == null}
                onClick={() => quick(c)}
                title={
                  c.dosis_objetivo == null
                    ? 'Define una dosis objetivo para el registro rápido'
                    : `Registrar ${c.dosis_objetivo}${c.unidad_dosis ? ` ${c.unidad_dosis}` : ''} hoy`
                }
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              >
                {busyId === c.id ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {c.nombre}
                <span className="text-muted-foreground">
                  {c.dosis_objetivo != null
                    ? `${c.dosis_objetivo}${c.unidad_dosis ? ` ${c.unidad_dosis}` : ''}`
                    : '—'}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Registro con detalle */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Registrar toma</div>
          <button
            type="button"
            onClick={() => setShowNuevo((s) => !s)}
            className="text-sm text-primary hover:underline"
          >
            {showNuevo ? 'Cancelar' : '+ Nuevo péptido'}
          </button>
        </div>

        {showNuevo ? (
          <div className="mb-4 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2 lg:grid-cols-5">
            <input
              className={inputCls}
              placeholder="Nombre"
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            />
            <select
              className={inputCls}
              value={nuevo.clase}
              onChange={(e) => setNuevo({ ...nuevo, clase: e.target.value as ProtocoloClase })}
            >
              {CLASES.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="Unidad (mg/mcg/UI)"
              value={nuevo.unidad}
              onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })}
            />
            <input
              className={inputCls}
              type="number"
              step="any"
              placeholder="Dosis objetivo"
              value={nuevo.dosis}
              onChange={(e) => setNuevo({ ...nuevo, dosis: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Frecuencia (semanal…)"
              value={nuevo.frecuencia}
              onChange={(e) => setNuevo({ ...nuevo, frecuencia: e.target.value })}
            />
            <div className="sm:col-span-2 lg:col-span-5">
              <button
                type="button"
                disabled={pending}
                onClick={submitNuevo}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {pending ? 'Guardando…' : 'Crear péptido'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select
            className={`${inputCls} lg:col-span-2`}
            value={compuestoId}
            onChange={(e) => setCompuestoId(e.target.value)}
          >
            <option value="">Compuesto…</option>
            {compuestos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.estado !== 'activo' ? ` (${c.estado})` : ''}
              </option>
            ))}
          </select>
          <input
            className={inputCls}
            type="number"
            step="any"
            placeholder="Dosis"
            value={dosis}
            onChange={(e) => setDosis(e.target.value)}
          />
          <input
            className={inputCls}
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Nota (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <div className="lg:col-span-5">
            <button
              type="button"
              disabled={pending}
              onClick={submitToma}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {pending ? 'Guardando…' : 'Registrar toma'}
            </button>
          </div>
        </div>
      </div>

      {/* Bitácora */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Últimas tomas
        </div>
        {log.length ? (
          <div className="divide-y rounded-xl border bg-card">
            {log.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{t.nombre}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {t.dosis}
                    {t.unidad ? ` ${t.unidad}` : ''}
                  </span>
                  {t.nota ? <span className="text-muted-foreground">· {t.nota}</span> : null}
                </div>
                <span className="shrink-0 text-muted-foreground">{fmtFecha(t.fecha)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aún no hay tomas registradas.
          </div>
        )}
      </div>
    </div>
  );
}

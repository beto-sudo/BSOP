'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Check, Calculator, Pencil, Trash2 } from 'lucide-react';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
} from '@/components/detail-page/detail-drawer';
import {
  registrarToma,
  crearCompuesto,
  actualizarToma,
  eliminarToma,
  type CrearCompuestoInput,
} from '@/app/health/actions';
import type { ProtocoloClase, ProtocoloCompuestoConTomas, ProtocoloToma } from '@/lib/protocolo';

const CLASES: { v: ProtocoloClase; label: string }[] = [
  { v: 'peptido', label: 'Péptido' },
  { v: 'suplemento', label: 'Suplemento' },
  { v: 'oral', label: 'Oral' },
  { v: 'otro', label: 'Otro' },
];

type TomaLog = ProtocoloToma & { nombre: string };
type DoseUnit = 'mg' | 'mcg' | 'mL' | 'u';
const DOSE_UNITS: DoseUnit[] = ['mg', 'mcg', 'mL', 'u'];

function todayInput(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Matamoros',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function dateInput(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Matamoros',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    timeZone: 'America/Matamoros',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function normalizeUnit(s: string | null | undefined): DoseUnit {
  const t = (s ?? '').toLowerCase();
  if (t === 'mcg') return 'mcg';
  if (t === 'ml') return 'mL';
  if (t === 'u' || t === 'units' || t === 'unidades' || t === 'ui') return 'u';
  return 'mg';
}

// Conversión de dosis entre unidades. Puente: concentración mg/mL (vial mg / agua mL).
// Jeringa de insulina U-100 → 100 u = 1 mL. mg↔mcg es directo; mg/mcg ↔ mL/u necesita
// la concentración (si no hay vial+agua, sólo se resuelve lo que no la requiere).
function computeConversions(vialMg: number, bacMl: number, dose: number, unit: DoseUnit) {
  const concentracion = vialMg > 0 && bacMl > 0 ? vialMg / bacMl : null; // mg/mL
  let mg: number | null = null;
  let mL: number | null = null;
  if (dose > 0) {
    if (unit === 'mg') mg = dose;
    else if (unit === 'mcg') mg = dose / 1000;
    else if (unit === 'mL') {
      mL = dose;
      mg = concentracion != null ? dose * concentracion : null;
    } else {
      // 'u' (U-100): dose/100 = mL
      mL = dose / 100;
      mg = concentracion != null ? (dose / 100) * concentracion : null;
    }
    if (mL == null && mg != null && concentracion != null && concentracion > 0) {
      mL = mg / concentracion;
    }
  }
  const mcg = mg != null ? mg * 1000 : null;
  const u = mL != null ? mL * 100 : null;
  const dosisPorVial = mg != null && mg > 0 && vialMg > 0 ? Math.floor(vialMg / mg) : null;
  return { concentracion, mg, mcg, mL, u, dosisPorVial };
}

type Conv = ReturnType<typeof computeConversions>;

const round = (n: number | null, d = 2): number | null =>
  n == null ? null : Math.round(n * 10 ** d) / 10 ** d;

const inputCls = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
const labelCls = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';
const selCls = 'h-9 rounded-md border bg-background px-1.5 text-sm';

function Equiv({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number | null;
  highlight?: boolean;
}) {
  return (
    <span className="text-muted-foreground">
      {label}:{' '}
      <span
        className={`font-semibold tabular-nums ${
          highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
        }`}
      >
        {value ?? '—'}
      </span>
    </span>
  );
}

// Panel de equivalencias: misma dosis expresada en todas las unidades.
function EquivPanel({ c }: { c: Conv }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <Equiv
        label="Concentración"
        value={c.concentracion != null ? `${round(c.concentracion, 3)} mg/mL` : '—'}
      />
      <span className="text-muted-foreground/50">≡</span>
      <Equiv label="mg" value={round(c.mg, 4)} />
      <Equiv label="mcg" value={round(c.mcg, 1)} />
      <Equiv label="mL" value={round(c.mL, 3)} />
      <Equiv label="Jalar" value={c.u != null ? `${round(c.u, 1)} u` : '—'} highlight />
      <Equiv label="Dosis/vial" value={c.dosisPorVial} />
    </div>
  );
}

/**
 * Bitácora (iniciativa sanren-peptides, Sprint 4 + 6). Registro rápido +
 * calculadora de reconstitución con conversión entre unidades (mg/mcg/mL/u),
 * guarda el cálculo con la toma + edición/borrado. Reusa health.protocolo_*.
 */
export function BitacoraTab({ compuestos }: { compuestos: ProtocoloCompuestoConTomas[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Registro con calculadora
  const [compuestoId, setCompuestoId] = useState('');
  const [vialMg, setVialMg] = useState('');
  const [bacMl, setBacMl] = useState('');
  const [dosis, setDosis] = useState('');
  const [dosisUnidad, setDosisUnidad] = useState<DoseUnit>('mg');
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

  // Edición
  const [editToma, setEditToma] = useState<TomaLog | null>(null);

  const activos = compuestos.filter((c) => c.estado === 'activo');
  const log = useMemo<TomaLog[]>(
    () =>
      compuestos
        .flatMap((c) => c.tomas.map((t) => ({ ...t, nombre: c.nombre })))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 60),
    [compuestos]
  );

  const calc = computeConversions(
    Number(vialMg) || 0,
    Number(bacMl) || 0,
    Number(dosis) || 0,
    dosisUnidad
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
    const v = Number(vialMg) || 0;
    const b = Number(bacMl) || 0;
    const c = computeConversions(v, b, d, dosisUnidad);
    start(async () => {
      const r = await registrarToma({
        compuestoId,
        dosis: d,
        unidad: dosisUnidad,
        fecha: new Date(`${fecha}T12:00:00`).toISOString(),
        nota: nota || null,
        vial_mg: v || null,
        bac_ml: b || null,
        concentracion: round(c.concentracion, 3),
        unidades: round(c.u, 1),
      });
      if (r.ok) {
        setVialMg('');
        setBacMl('');
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

  function pickCompuesto(id: string) {
    setCompuestoId(id);
    const c = compuestos.find((x) => x.id === id);
    if (!c) return;
    const last = c.tomas[0];
    const lastCalc = c.tomas.find((t) => t.vial_mg != null);
    setVialMg(lastCalc?.vial_mg != null ? String(lastCalc.vial_mg) : '');
    setBacMl(lastCalc?.bac_ml != null ? String(lastCalc.bac_ml) : '');
    setDosis(
      last?.dosis != null
        ? String(last.dosis)
        : c.dosis_objetivo != null
          ? String(c.dosis_objetivo)
          : ''
    );
    setDosisUnidad(normalizeUnit(last?.unidad ?? c.unidad_dosis));
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

      {/* Registro con calculadora */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Calculator className="h-4 w-4 text-emerald-500" />
            Registrar toma — con calculadora de reconstitución
          </div>
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
              placeholder="Unidad (mg/mcg/mL/u)"
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className={labelCls}>Compuesto</div>
            <select
              className={inputCls}
              value={compuestoId}
              onChange={(e) => pickCompuesto(e.target.value)}
            >
              <option value="">Elige…</option>
              {compuestos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.estado !== 'activo' ? ` (${c.estado})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={labelCls}>Fecha</div>
            <input
              className={inputCls}
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div>
            <div className={labelCls}>Dosis</div>
            <div className="flex gap-1.5">
              <input
                className={inputCls}
                type="number"
                step="any"
                placeholder="2.5"
                value={dosis}
                onChange={(e) => setDosis(e.target.value)}
              />
              <select
                className={selCls}
                value={dosisUnidad}
                onChange={(e) => setDosisUnidad(e.target.value as DoseUnit)}
                aria-label="Unidad de dosis"
              >
                {DOSE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className={labelCls}>Vial total (mg)</div>
            <input
              className={inputCls}
              type="number"
              step="any"
              placeholder="30"
              value={vialMg}
              onChange={(e) => setVialMg(e.target.value)}
            />
          </div>
          <div>
            <div className={labelCls}>Agua BAC (mL)</div>
            <input
              className={inputCls}
              type="number"
              step="any"
              placeholder="3"
              value={bacMl}
              onChange={(e) => setBacMl(e.target.value)}
            />
          </div>
          <div className="lg:col-span-2">
            <div className={labelCls}>Nota</div>
            <input
              className={inputCls}
              placeholder="opcional"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
        </div>

        {/* Equivalencias (la misma dosis en mg/mcg/mL/u) */}
        <div className="mt-3">
          <EquivPanel c={calc} />
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            mL y u requieren vial + agua (concentración). u = jeringa de insulina U-100 (100 u = 1
            mL).
          </p>
        </div>

        <div className="mt-3">
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

      {/* Bitácora */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Últimas tomas
        </div>
        {log.length ? (
          <div className="divide-y rounded-xl border bg-card">
            {log.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setEditToma(t)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-medium">{t.nombre}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {t.dosis}
                    {t.unidad ? ` ${t.unidad}` : ''}
                  </span>
                  {t.unidades != null && normalizeUnit(t.unidad) !== 'u' ? (
                    <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                      {t.unidades} u
                    </span>
                  ) : null}
                  {t.nota ? <span className="text-muted-foreground">· {t.nota}</span> : null}
                </div>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {fmtFecha(t.fecha)}
                  <Pencil className="h-3.5 w-3.5 opacity-40" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aún no hay tomas registradas.
          </div>
        )}
      </div>

      <EditTomaDrawer
        toma={editToma}
        onClose={() => setEditToma(null)}
        onSaved={() => {
          setEditToma(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function EditTomaDrawer({
  toma,
  onClose,
  onSaved,
}: {
  toma: TomaLog | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [dosis, setDosis] = useState('');
  const [fecha, setFecha] = useState('');
  const [nota, setNota] = useState('');
  const [vialMg, setVialMg] = useState('');
  const [bacMl, setBacMl] = useState('');
  const [unidad, setUnidad] = useState<DoseUnit>('mg');

  // Prefill cuando cambia la toma seleccionada.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (toma && toma.id !== loadedId) {
    setLoadedId(toma.id);
    setErr(null);
    setConfirmDel(false);
    setDosis(String(toma.dosis));
    setFecha(dateInput(toma.fecha));
    setNota(toma.nota ?? '');
    setVialMg(toma.vial_mg != null ? String(toma.vial_mg) : '');
    setBacMl(toma.bac_ml != null ? String(toma.bac_ml) : '');
    setUnidad(normalizeUnit(toma.unidad));
  }

  const calc = computeConversions(
    Number(vialMg) || 0,
    Number(bacMl) || 0,
    Number(dosis) || 0,
    unidad
  );

  function guardar() {
    if (!toma) return;
    setErr(null);
    const d = Number(dosis);
    if (!Number.isFinite(d) || d <= 0) return setErr('La dosis debe ser un número mayor a 0.');
    const v = Number(vialMg) || 0;
    const b = Number(bacMl) || 0;
    const c = computeConversions(v, b, d, unidad);
    start(async () => {
      const r = await actualizarToma({
        id: toma.id,
        dosis: d,
        unidad,
        fecha: new Date(`${fecha}T12:00:00`).toISOString(),
        nota: nota || null,
        vial_mg: v || null,
        bac_ml: b || null,
        concentracion: round(c.concentracion, 3),
        unidades: round(c.u, 1),
      });
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  }

  function borrar() {
    if (!toma) return;
    setErr(null);
    start(async () => {
      const r = await eliminarToma(toma.id);
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  }

  return (
    <DetailDrawer
      open={!!toma}
      onOpenChange={(o) => !o && onClose()}
      title={toma ? `Editar toma — ${toma.nombre}` : 'Editar toma'}
      description={toma ? fmtFecha(toma.fecha) : undefined}
      footer={
        <div className="flex items-center justify-between gap-3">
          {confirmDel ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-rose-600 dark:text-rose-400">¿Eliminar?</span>
              <button
                type="button"
                disabled={pending}
                onClick={borrar}
                className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Sí, eliminar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDel(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmDel(true)}
              className="inline-flex items-center gap-1 text-sm text-rose-600 hover:underline dark:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={guardar}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      }
    >
      {toma ? (
        <DetailDrawerContent>
          {err ? (
            <div className="mb-4 rounded-lg border border-rose-300/40 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-200">
              {err}
            </div>
          ) : null}
          <DetailDrawerSection title="Toma">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className={labelCls}>Fecha</div>
                <input
                  className={inputCls}
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              <div>
                <div className={labelCls}>Dosis</div>
                <div className="flex gap-1.5">
                  <input
                    className={inputCls}
                    type="number"
                    step="any"
                    value={dosis}
                    onChange={(e) => setDosis(e.target.value)}
                  />
                  <select
                    className={selCls}
                    value={unidad}
                    onChange={(e) => setUnidad(e.target.value as DoseUnit)}
                    aria-label="Unidad de dosis"
                  >
                    {DOSE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className={labelCls}>Nota</div>
                <input
                  className={inputCls}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                />
              </div>
            </div>
          </DetailDrawerSection>
          <DetailDrawerSection title="Reconstitución (calculadora)">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className={labelCls}>Vial total (mg)</div>
                <input
                  className={inputCls}
                  type="number"
                  step="any"
                  value={vialMg}
                  onChange={(e) => setVialMg(e.target.value)}
                />
              </div>
              <div>
                <div className={labelCls}>Agua BAC (mL)</div>
                <input
                  className={inputCls}
                  type="number"
                  step="any"
                  value={bacMl}
                  onChange={(e) => setBacMl(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3">
              <EquivPanel c={calc} />
            </div>
          </DetailDrawerSection>
        </DetailDrawerContent>
      ) : null}
    </DetailDrawer>
  );
}

'use client';

/**
 * AnteproyectoAnalisisFinanciero — sección compacta arriba del detalle
 * del anteproyecto DILESA con paridad funcional a la vista Coda
 * "Análisis Financiero" (Sprint 4B de la iniciativa
 * `dilesa-proyectos-checklist-inline`).
 *
 * Estructura:
 *   - Sección "Predio" — clasificación, áreas, lotes, aprovechamiento.
 *   - Sección "Capital inicial" — valor predio, costo terreno,
 *     infraestructura cabecera, prototipos referencia (chips).
 *   - Sección "Costos: Referencia vs Proyecto" — tabla de 7 conceptos
 *     con costo total derivado al cierre.
 *   - Sección "Resultado" — utilidad proyecto + margen.
 *
 * Captura inline: cada input numérico se commitea on-blur (no en cada
 * keystroke) para no spamear server actions. Patrón consistente con
 * `<TareasChecklist>` Sprint 1/3.
 *
 * Sprint 4C agregará el botón Imprimir PDF. Sprint 4D agregará
 * Análisis AI. Esta sección es 100% data + captura, sin presentación
 * derivada de plano.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  ANALISIS_FILAS_COSTOS,
  CLASIFICACIONES_INMOBILIARIAS,
  deriveAnalisisFinanciero,
  fmtM2,
  fmtMoney,
  fmtMoneyCents,
  fmtNumber,
  fmtPct,
  labelDeClasificacion,
  parseMoneyInput,
  type AnalisisCampo,
  type AnalisisFinancieroSnapshot,
} from './analisis-financiero-types';
import {
  updateAnteproyectoAnalisisCampo,
  updateAnteproyectoClasificaciones,
  updateAnteproyectoInfraCabecera,
  updateAnteproyectoPrototipoReferencia,
  updateAnteproyectoPrototiposReferencia,
} from '@/app/dilesa/proyectos/anteproyectos/actions';

// ── Money input inline ────────────────────────────────────────────────────────

function MoneyCell({
  value,
  onCommit,
  pending,
  align = 'right',
  placeholder = '—',
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  pending: boolean;
  align?: 'left' | 'right';
  placeholder?: string;
}) {
  const [raw, setRaw] = useState<string>(value == null ? '' : String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (editing) return;
    // Sync raw text con valor externo cuando NO estamos editando — un
    // commit exitoso desde el padre actualiza el value, queremos que el
    // botón muestre el nuevo formato.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRaw(value == null ? '' : String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseMoneyInput(raw);
    if ((parsed ?? null) !== (value ?? null)) onCommit(parsed);
  };

  if (editing) {
    return (
      <input
        type="text"
        inputMode="decimal"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setRaw(value == null ? '' : String(value));
            setEditing(false);
          }
        }}
        autoFocus
        disabled={pending}
        className={`h-7 w-full rounded-sm border border-[var(--accent)] bg-[var(--bg)] px-1 text-xs tabular-nums focus:outline-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      className={`h-7 w-full rounded-sm px-1 text-xs tabular-nums hover:bg-[var(--card)] disabled:opacity-50 ${align === 'right' ? 'text-right' : 'text-left'} ${value == null ? 'text-[var(--muted-text)]' : 'text-[var(--text)]'}`}
    >
      {value == null ? placeholder : fmtMoney(value)}
    </button>
  );
}

// ── Clasificaciones multiselect ──────────────────────────────────────────────

function ClasificacionesMultiSelect({
  value,
  onChange,
  pending,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (codigo: string) => {
    const next = value.includes(codigo) ? value.filter((c) => c !== codigo) : [...value, codigo];
    onChange(next);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex w-full items-center justify-between gap-2 rounded-sm border border-transparent px-1 py-0.5 text-right text-xs hover:border-[var(--border)] disabled:opacity-50"
      >
        {value.length === 0 ? (
          <span className="text-[var(--muted-text)]">—</span>
        ) : (
          <span className="flex flex-wrap justify-end gap-1">
            {value.map((c) => (
              <span
                key={c}
                className="inline-flex rounded-full border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px]"
              >
                {labelDeClasificacion(c)}
              </span>
            ))}
          </span>
        )}
        <span className="text-[var(--muted-text)]">▾</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
            tabIndex={-1}
          />
          <div className="absolute right-0 z-40 mt-1 w-56 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-lg">
            {CLASIFICACIONES_INMOBILIARIAS.map((c) => (
              <label
                key={c.codigo}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-xs hover:bg-[var(--card)]"
              >
                <input
                  type="checkbox"
                  checked={value.includes(c.codigo)}
                  onChange={() => toggle(c.codigo)}
                  disabled={pending}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Prototipo referencia (selector único contra dilesa.productos) ────────────

type ProductoOption = {
  id: string;
  nombre: string;
  proyecto_nombre: string | null;
  valor_comercial_referencia: number | null;
  costo_urbanizacion_referencia: number | null;
  costo_materiales_referencia: number | null;
  costo_mo_referencia: number | null;
  registro_ruv_referencia: number | null;
  seguro_calidad_referencia: number | null;
  costo_comercializacion_referencia: number | null;
};

function PrototipoReferenciaSelect({
  value,
  options,
  onChange,
  pending,
}: {
  value: string | null;
  options: ProductoOption[];
  onChange: (productoId: string | null) => void;
  pending: boolean;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      disabled={pending}
      className="h-7 w-full rounded-sm border border-transparent bg-transparent px-1 text-xs hover:border-[var(--border)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
    >
      <option value="">— Ninguno (entrada manual) —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre}
          {o.proyecto_nombre ? ` · ${o.proyecto_nombre}` : ''}
          {o.valor_comercial_referencia != null
            ? ` · ${fmtMoney(o.valor_comercial_referencia)}`
            : ''}
        </option>
      ))}
    </select>
  );
}

// ── Prototipos chips (free-text) ──────────────────────────────────────────────

function PrototiposChips({
  value,
  onChange,
  pending,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (value.includes(t)) {
      setDraft('');
      return;
    }
    onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((p) => (
        <span
          key={p}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[11px]"
        >
          {p}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== p))}
            disabled={pending}
            aria-label={`Quitar ${p}`}
            className="text-[var(--muted-text)] hover:text-red-600 disabled:opacity-50"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        placeholder="agregar…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        disabled={pending}
        className="h-6 w-20 rounded-sm border border-transparent bg-transparent px-1 text-[11px] hover:border-[var(--border)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function AnteproyectoAnalisisFinanciero({
  snapshot,
  productosDisponibles = [],
  onChange,
}: {
  snapshot: AnalisisFinancieroSnapshot;
  /**
   * Catálogo de `dilesa.productos` para el selector de prototipo
   * referencia. Lo carga el padre vía Supabase (filtrado por
   * empresa). Si está vacío, el selector solo muestra "Ninguno" y
   * cae a captura manual de chips.
   */
  productosDisponibles?: ProductoOption[];
  /** Callback opcional para que el padre re-fetcheé tras un commit. */
  onChange?: () => void;
}) {
  // Local snapshot — optimistic update. Re-inicializa cuando cambia
  // el `snapshot.id` (drawer cambia de proyecto). Para refreshes del
  // mismo proyecto, el commit ya escribió local optimistic; no
  // necesitamos pisarlo desde props.
  const [local, setLocal] = useState(snapshot);
  useEffect(() => {
    setLocal(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.id]);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const commitCampo = useCallback(
    (campo: AnalisisCampo, valor: number | null) => {
      setError(null);
      setLocal((prev) => ({ ...prev, [campo]: valor }));
      startTransition(async () => {
        const r = await updateAnteproyectoAnalisisCampo(local.id, campo, valor);
        if (!r.ok) {
          setError(r.error);
          // Rollback on error.
          setLocal((prev) => ({ ...prev, [campo]: snapshot[campo] as number | null }));
        } else {
          onChange?.();
        }
      });
    },
    [local.id, onChange, snapshot]
  );

  const commitInfra = useCallback(
    (next: boolean) => {
      setError(null);
      setLocal((prev) => ({ ...prev, infraestructura_cabecera_necesaria: next }));
      startTransition(async () => {
        const r = await updateAnteproyectoInfraCabecera(local.id, next);
        if (!r.ok) {
          setError(r.error);
          setLocal((prev) => ({
            ...prev,
            infraestructura_cabecera_necesaria: snapshot.infraestructura_cabecera_necesaria,
          }));
        } else {
          onChange?.();
        }
      });
    },
    [local.id, onChange, snapshot.infraestructura_cabecera_necesaria]
  );

  const commitClasificaciones = useCallback(
    (codigos: string[]) => {
      setError(null);
      setLocal((prev) => ({ ...prev, clasificaciones_inmobiliarias: codigos }));
      startTransition(async () => {
        const r = await updateAnteproyectoClasificaciones(local.id, codigos);
        if (!r.ok) {
          setError(r.error);
          setLocal((prev) => ({
            ...prev,
            clasificaciones_inmobiliarias: snapshot.clasificaciones_inmobiliarias,
          }));
        } else {
          onChange?.();
        }
      });
    },
    [local.id, onChange, snapshot.clasificaciones_inmobiliarias]
  );

  const commitPrototipoReferenciaId = useCallback(
    (productoId: string | null) => {
      setError(null);
      // Optimistic — si se selecciona prototipo, también pre-llenamos
      // valor_comercial_referencia con el del producto (mismo que hace
      // el server action). Si productoId=null no tocamos otros campos.
      setLocal((prev) => {
        const proto = productosDisponibles.find((p) => p.id === productoId);
        const next = { ...prev, prototipo_referencia_id: productoId };
        if (proto) {
          const refFields = [
            ['valor_comercial_referencia', 'valor_comercial_referencia'],
            ['costo_urbanizacion_referencia', 'costo_urbanizacion_referencia'],
            ['costo_materiales_referencia', 'costo_materiales_referencia'],
            ['costo_mo_referencia', 'costo_mo_referencia'],
            ['registro_ruv_referencia', 'registro_ruv_referencia'],
            ['seguro_calidad_referencia', 'seguro_calidad_referencia'],
            ['costo_comercializacion_referencia', 'costo_comercializacion_referencia'],
          ] as const;
          for (const [src, dst] of refFields) {
            if (proto[src] != null) (next as Record<string, unknown>)[dst] = proto[src];
          }
        }
        return next;
      });
      startTransition(async () => {
        const r = await updateAnteproyectoPrototipoReferencia(local.id, productoId);
        if (!r.ok) {
          setError(r.error);
          setLocal((prev) => ({
            ...prev,
            prototipo_referencia_id: snapshot.prototipo_referencia_id,
            valor_comercial_referencia: snapshot.valor_comercial_referencia,
            costo_urbanizacion_referencia: snapshot.costo_urbanizacion_referencia,
            costo_materiales_referencia: snapshot.costo_materiales_referencia,
            costo_mo_referencia: snapshot.costo_mo_referencia,
            registro_ruv_referencia: snapshot.registro_ruv_referencia,
            seguro_calidad_referencia: snapshot.seguro_calidad_referencia,
            costo_comercializacion_referencia: snapshot.costo_comercializacion_referencia,
          }));
        } else {
          onChange?.();
        }
      });
    },
    [
      local.id,
      onChange,
      productosDisponibles,
      snapshot.prototipo_referencia_id,
      snapshot.valor_comercial_referencia,
      snapshot.costo_urbanizacion_referencia,
      snapshot.costo_materiales_referencia,
      snapshot.costo_mo_referencia,
      snapshot.registro_ruv_referencia,
      snapshot.seguro_calidad_referencia,
      snapshot.costo_comercializacion_referencia,
    ]
  );

  const commitPrototipos = useCallback(
    (nombres: string[]) => {
      setError(null);
      setLocal((prev) => ({ ...prev, prototipos_referencia: nombres }));
      startTransition(async () => {
        const r = await updateAnteproyectoPrototiposReferencia(local.id, nombres);
        if (!r.ok) {
          setError(r.error);
          setLocal((prev) => ({ ...prev, prototipos_referencia: snapshot.prototipos_referencia }));
        } else {
          onChange?.();
        }
      });
    },
    [local.id, onChange, snapshot.prototipos_referencia]
  );

  const derivados = deriveAnalisisFinanciero(local);

  return (
    <section
      aria-label="Análisis financiero"
      className="rounded-md border border-[var(--border)] bg-[var(--bg)]"
    >
      <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">Análisis financiero</h3>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--muted-text)]">
            {pending ? 'Guardando…' : 'Captura inline'}
          </span>
          <a
            href={`/api/dilesa/anteproyectos/${local.id}/analisis-pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--bg)]"
            title="Abre el análisis financiero como PDF para presentar al consejo o usar como documento amparador"
          >
            Imprimir PDF
          </a>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 p-3 lg:grid-cols-2">
        {/* ── Predio ────────────────────────────────────────────────────── */}
        <div className="rounded-sm border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-text)]">
            Predio
          </div>
          <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
            <dt className="text-[var(--muted-text)]">Clasificación</dt>
            <dd className="min-w-[140px] max-w-[260px]">
              <ClasificacionesMultiSelect
                value={local.clasificaciones_inmobiliarias}
                onChange={commitClasificaciones}
                pending={pending}
              />
            </dd>
            <Row label="Lotes" value={fmtNumber(local.lotes_proyectados)} />
            <Row label="Área total" value={fmtM2(local.area_m2)} />
            <Row label="Área vendible" value={fmtM2(local.area_vendible_m2)} />
            <Row label="Áreas verdes" value={fmtM2(local.areas_verdes_m2)} />
            <Row label="Vialidades" value={fmtM2(local.area_vialidades_m2)} />
            <Row label="Lote promedio" value={fmtM2(local.tamano_lote_promedio)} />
            <Row label="% áreas verdes" value={fmtPct(derivados.pctVerdes)} accent />
            <Row label="Aprovechamiento" value={fmtPct(derivados.aprovechamiento)} accent />
          </dl>
        </div>

        {/* ── Capital ──────────────────────────────────────────────────────── */}
        <div className="rounded-sm border border-[var(--border)] bg-[var(--card)] p-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-text)]">
            Capital inicial
          </div>
          <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
            <dt className="text-[var(--muted-text)]">Costo terreno</dt>
            <dd className="w-32">
              <MoneyCell
                value={local.costo_terreno}
                onCommit={(v) => commitCampo('costo_terreno', v)}
                pending={pending}
              />
            </dd>
            <dt className="text-[var(--muted-text)]">Valor predio</dt>
            <dd className="w-32">
              <MoneyCell
                value={local.valor_predio}
                onCommit={(v) => commitCampo('valor_predio', v)}
                pending={pending}
              />
            </dd>
            <dt className="text-[var(--muted-text)]">$/m² aprovechable</dt>
            <dd className="text-right tabular-nums">
              {fmtMoneyCents(derivados.precioM2Aprovechable)}
            </dd>
            <dt className="text-[var(--muted-text)]">Presupuesto estimado</dt>
            <dd className="w-32">
              <MoneyCell
                value={local.presupuesto_estimado}
                onCommit={(v) => commitCampo('presupuesto_estimado', v)}
                pending={pending}
              />
            </dd>
            <dt className="text-[var(--muted-text)]">Infra cabecera necesaria</dt>
            <dd className="flex items-center justify-end">
              <input
                type="checkbox"
                checked={local.infraestructura_cabecera_necesaria}
                onChange={(e) => commitInfra(e.target.checked)}
                disabled={pending}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
              />
            </dd>
            <dt className="col-span-2 mt-1 text-[var(--muted-text)]">Prototipo referencia</dt>
            <dd className="col-span-2">
              <PrototipoReferenciaSelect
                value={local.prototipo_referencia_id}
                options={productosDisponibles}
                onChange={commitPrototipoReferenciaId}
                pending={pending}
              />
              {local.prototipo_referencia_id == null && (
                <div className="mt-1">
                  <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-text)]">
                    Captura manual (sin prototipo)
                  </div>
                  <PrototiposChips
                    value={local.prototipos_referencia}
                    onChange={commitPrototipos}
                    pending={pending}
                  />
                </div>
              )}
            </dd>
          </dl>
        </div>

        {/* ── Tabla Referencia vs Proyecto ────────────────────────────────── */}
        <div className="rounded-sm border border-[var(--border)] bg-[var(--card)] p-2 lg:col-span-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-text)]">
            Costos: Referencia vs Proyecto
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wide text-[var(--muted-text)]">
                <th className="py-1 pr-2 font-medium">Concepto</th>
                <th className="py-1 pr-2 text-right font-medium">Referencia</th>
                <th className="py-1 pl-2 text-right font-medium">Proyecto</th>
                <th className="py-1 pl-2 text-right font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {ANALISIS_FILAS_COSTOS.map((fila) => {
                const ref = local[fila.referencia] as number | null;
                const proy = local[fila.proyecto] as number | null;
                const delta = ref != null && proy != null ? proy - ref : null;
                return (
                  <tr key={fila.label} className="border-b border-[var(--border)]/40 last:border-0">
                    <td className="py-0.5 pr-2 text-[var(--muted-text)]">{fila.label}</td>
                    <td className="py-0.5 pr-2 w-32">
                      <MoneyCell
                        value={ref}
                        onCommit={(v) => commitCampo(fila.referencia, v)}
                        pending={pending}
                      />
                    </td>
                    <td className="py-0.5 pl-2 w-32">
                      <MoneyCell
                        value={proy}
                        onCommit={(v) => commitCampo(fila.proyecto, v)}
                        pending={pending}
                      />
                    </td>
                    <td
                      className={`py-0.5 pl-2 text-right tabular-nums ${delta == null ? 'text-[var(--muted-text)]' : delta > 0 ? 'text-red-600' : 'text-emerald-700'}`}
                    >
                      {delta == null ? '—' : (delta > 0 ? '+' : '') + fmtMoney(delta)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-[var(--border)] font-semibold">
                <td className="py-1 pr-2 text-[var(--text)]">Costo total</td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {fmtMoney(derivados.costoTotalReferencia)}
                </td>
                <td className="py-1 pl-2 text-right tabular-nums">
                  {fmtMoney(derivados.costoTotalProyecto)}
                </td>
                <td
                  className={`py-1 pl-2 text-right tabular-nums ${derivados.delta == null ? 'text-[var(--muted-text)]' : derivados.delta > 0 ? 'text-red-600' : 'text-emerald-700'}`}
                >
                  {derivados.delta == null
                    ? '—'
                    : (derivados.delta > 0 ? '+' : '') + fmtMoney(derivados.delta)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Resultado ────────────────────────────────────────────────────── */}
        <div className="rounded-sm border border-[var(--border)] bg-[var(--card)] p-2 lg:col-span-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-text)]">
            Resultado
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs lg:grid-cols-4">
            <Row label="Utilidad proyecto" value={fmtMoney(derivados.utilidadProyecto)} accent />
            <Row label="Margen utilidad" value={fmtPct(derivados.margenUtilidad)} accent />
            <Row
              label="Inversión total"
              value={fmtMoney(
                (derivados.costoTotalProyecto ?? 0) +
                  (local.valor_predio ?? local.costo_terreno ?? 0) || null
              )}
            />
            <Row
              label="Valor comercial proyecto"
              value={fmtMoney(local.valor_comercial_proyecto)}
            />
          </dl>
        </div>
      </div>

      {error && <p className="px-3 pb-2 text-xs text-red-600/80">{error}</p>}
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <>
      <dt className="text-[var(--muted-text)]">{label}</dt>
      <dd
        className={`text-right tabular-nums ${accent ? 'font-semibold text-[var(--text)]' : 'text-[var(--text)]'}`}
      >
        {value}
      </dd>
    </>
  );
}

'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de detalle DILESA.
 */

/**
 * Detalle de un prototipo (DILESA) — 4 secciones:
 *   1. Datos generales — nombre, descripción, proyecto, m²
 *      construcción, tiempo construcción, costo materiales/m², último
 *      precio MO/m² (histórico), TOTAL MO calculado.
 *   2. Planos — grid de cards con cada plano del JSONB productos.planos.
 *      Cada card: nombre legible + botón "Abrir" que abre URL en nueva
 *      pestaña (PDF o imagen indistinto — no preview embed, solo link).
 *   3. Plantilla de tareas — tabla agrupada por etapa con: tarea, %
 *      distribución de costo, costo MO calculado (= % × ultimoPrecio ×
 *      m²). Foot con TOTAL MO (que debe coincidir con SUM ± redondeo).
 *   4. KPIs derivados — inventario por estado: arrancadas, en
 *      construcción, terminadas, canceladas; m² acumulados.
 *
 * El "último precio MO/m²" se calcula tomando la `construccion` más
 * reciente con `producto_id` = este prototipo, `precio_mo_x_m2` not
 * null, ordenada por `fecha_arranque` desc. Si no hay, "—".
 *
 * Iniciativa dilesa-construccion · Sprint tabs+protos. Acceso vía
 * sub-slug `dilesa.construccion.prototipos`.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Home,
  Image as ImageIcon,
  Map as MapIcon,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Skeleton } from '@/components/ui/skeleton';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  proyecto_id: string;
  atributos: Record<string, unknown> | null;
  planos: Record<string, unknown> | null;
  valor_comercial_referencia: number | null;
  costo_referencia: number | null;
};

type Etapa = { id: string; nombre: string; orden: number };
type Tarea = { id: string; nombre: string };
type Plantilla = {
  id: string;
  tarea_id: string;
  etapa_id: string;
  porcentaje_costo: number;
  tiempo_dias: number;
};
type Obra = {
  id: string;
  estado: string;
  fecha_arranque: string | null;
  precio_mo_x_m2: number | null;
  m2_construccion: number | null;
};

// ── Planos: mapa de keys del JSONB → label legible (orden de display) ─────
// Coincide con PLANOS_MAP de scripts/import_dilesa_construccion_catalogos.ts.
const PLANOS_LABELS: Array<{ key: string; label: string; group: string }> = [
  { key: 'arq_planta_baja', label: 'Planta Baja', group: 'Arquitectónico' },
  { key: 'arq_planta_alta', label: 'Planta Alta', group: 'Arquitectónico' },
  { key: 'arq_cortes', label: 'Cortes', group: 'Arquitectónico' },
  { key: 'arq_elevaciones', label: 'Elevaciones', group: 'Arquitectónico' },
  { key: 'arq_detalles_constructivos', label: 'Detalles constructivos', group: 'Arquitectónico' },
  { key: 'ej_desplantes', label: 'Desplantes', group: 'Ejecutivo' },
  { key: 'ej_acabados', label: 'Acabados', group: 'Ejecutivo' },
  { key: 'ej_carpinteria', label: 'Carpintería', group: 'Ejecutivo' },
  { key: 'ej_canceleria', label: 'Cancelería', group: 'Ejecutivo' },
  { key: 'ej_herreria', label: 'Herrería', group: 'Ejecutivo' },
  { key: 'ej_detalles', label: 'Detalles', group: 'Ejecutivo' },
  { key: 'ej_plafones', label: 'Plafones', group: 'Ejecutivo' },
  { key: 'ing_estructural', label: 'Estructural', group: 'Ingeniería' },
  { key: 'ing_electrica', label: 'Eléctrica', group: 'Ingeniería' },
  { key: 'ing_hidraulica', label: 'Hidráulica', group: 'Ingeniería' },
  { key: 'ing_sanitaria', label: 'Sanitaria', group: 'Ingeniería' },
  { key: 'ing_gas', label: 'Gas', group: 'Ingeniería' },
];

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function fmtMoney(n: number | null): string | null {
  return n == null ? null : moneyFmt.format(n);
}

function readNumFromAttrs(
  attrs: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  if (!attrs) return null;
  const raw = attrs[key];
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Detecta si una URL parece PDF. Para iconografía en las cards de planos. */
function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url);
}

const EN_CURSO = new Set(['arrancada', 'en_progreso']);
const TERMINADA = new Set(['terminada', 'dtu', 'seguro_calidad', 'extraida']);

/**
 * @module Construcción · Prototipo detail (DILESA)
 * @responsive desktop-only
 */
export default function PrototipoDetailPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.prototipos">
      <DetailInner />
    </RequireAccess>
  );
}

function DetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [producto, setProducto] = useState<Producto | null>(null);
  const [proyectoNombre, setProyectoNombre] = useState<string | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [tareasCat, setTareasCat] = useState<Map<string, Tarea>>(new Map());
  const [plantilla, setPlantilla] = useState<Plantilla[]>([]);
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    (async () => {
      const { data: pRow, error: pErr } = await sb
        .schema('dilesa')
        .from('productos')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (pErr) {
        setError(getSupabaseErrorMessage(pErr, 'No se pudo cargar el prototipo.'));
        setLoading(false);
        return;
      }
      if (!pRow) {
        setError('Prototipo no encontrado.');
        setLoading(false);
        return;
      }
      const prodRow = pRow as unknown as Producto;
      setProducto(prodRow);

      const [prjRes, plRes, etRes, taRes, obrasRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('proyectos')
          .select('nombre')
          .eq('id', prodRow.proyecto_id)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('plantilla_tareas')
          .select('id, tarea_id, etapa_id, porcentaje_costo, tiempo_dias')
          .eq('producto_id', prodRow.id)
          .is('deleted_at', null),
        sb
          .schema('dilesa')
          .from('etapas_construccion')
          .select('id, nombre, orden')
          .is('deleted_at', null)
          .order('orden', { ascending: true }),
        sb.schema('dilesa').from('tareas_construccion').select('id, nombre').is('deleted_at', null),
        sb
          .schema('dilesa')
          .from('construccion')
          .select('id, estado, fecha_arranque, precio_mo_x_m2, m2_construccion')
          .eq('producto_id', prodRow.id)
          .is('deleted_at', null),
      ]);
      if (!activo) return;
      const firstErr = prjRes.error ?? plRes.error ?? etRes.error ?? taRes.error ?? obrasRes.error;
      if (firstErr) {
        setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el detalle.'));
        setLoading(false);
        return;
      }
      setProyectoNombre((prjRes.data?.nombre as string | null) ?? null);
      setPlantilla((plRes.data ?? []) as Plantilla[]);
      setEtapas((etRes.data ?? []) as Etapa[]);
      const tMap = new Map<string, Tarea>();
      for (const t of taRes.data ?? []) tMap.set(t.id as string, { id: t.id, nombre: t.nombre });
      setTareasCat(tMap);
      setObras((obrasRes.data ?? []) as Obra[]);

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [id]);

  // Último precio MO/m² histórico: la obra más reciente con
  // precio_mo_x_m2 not null para este producto.
  const ultimoPrecioMo = useMemo(() => {
    let last: { precio: number; fecha: string } | null = null;
    for (const o of obras) {
      if (o.precio_mo_x_m2 == null || o.fecha_arranque == null) continue;
      if (!last || o.fecha_arranque > last.fecha) {
        last = { precio: Number(o.precio_mo_x_m2), fecha: o.fecha_arranque };
      }
    }
    return last;
  }, [obras]);

  const m2 = useMemo(() => readNumFromAttrs(producto?.atributos, 'm2_construccion'), [producto]);
  const tiempo = useMemo(
    () => readNumFromAttrs(producto?.atributos, 'tiempo_construccion'),
    [producto]
  );
  const costoMateriales = useMemo(
    () => readNumFromAttrs(producto?.atributos, 'costo_materiales'),
    [producto]
  );

  const totalMo = useMemo(() => {
    if (m2 == null || ultimoPrecioMo == null) return null;
    return m2 * ultimoPrecioMo.precio;
  }, [m2, ultimoPrecioMo]);

  const costoMaterialesPorM2 = useMemo(() => {
    if (costoMateriales == null || m2 == null || m2 === 0) return null;
    return costoMateriales / m2;
  }, [costoMateriales, m2]);

  // Plantilla agrupada por etapa con costo MO por tarea calculado.
  const etapasConTareas = useMemo(() => {
    const rows = etapas.map((et) => {
      const items = plantilla
        .filter((p) => p.etapa_id === et.id)
        .map((p) => {
          const tareaInfo = tareasCat.get(p.tarea_id);
          const pctNum = Number(p.porcentaje_costo ?? 0);
          // El porcentaje viene como fracción (0.0021 = 0.21%) tras
          // el import — multiplicamos por 100 para display y por
          // totalMo para el costo en pesos.
          const pctDisplay = pctNum * 100;
          const costoMoTarea = totalMo != null ? pctNum * totalMo : null;
          return {
            plantillaId: p.id,
            nombre: tareaInfo?.nombre ?? '(tarea desconocida)',
            pctDisplay,
            costoMoTarea,
            tiempoDias: Number(p.tiempo_dias ?? 0),
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      const pctEtapa = items.reduce((s, it) => s + it.pctDisplay, 0);
      const costoEtapa = items.reduce((s, it) => s + (it.costoMoTarea ?? 0), 0);
      const tiempoEtapa = items.reduce((s, it) => s + it.tiempoDias, 0);
      return { ...et, items, pctEtapa, costoEtapa, tiempoEtapa };
    });
    return rows.filter((r) => r.items.length > 0);
  }, [etapas, plantilla, tareasCat, totalMo]);

  // Sumas del foot de la tabla de tareas (deben coincidir con totalMo
  // ± redondeo de los porcentajes).
  const totalPctSum = useMemo(
    () => etapasConTareas.reduce((s, et) => s + et.pctEtapa, 0),
    [etapasConTareas]
  );
  const totalCostoSum = useMemo(
    () => etapasConTareas.reduce((s, et) => s + et.costoEtapa, 0),
    [etapasConTareas]
  );
  // Días totales = suma de los días de cada tarea de la plantilla.
  // Asunción: tareas secuenciales (como en Coda). Si en el futuro hay
  // paralelismo, esto deja de ser el plazo real y pasa a ser el esfuerzo.
  const totalTiempoDias = useMemo(
    () => etapasConTareas.reduce((s, et) => s + et.tiempoEtapa, 0),
    [etapasConTareas]
  );

  const kpisInventario = useMemo(() => {
    let enCurso = 0;
    let terminadas = 0;
    let canceladas = 0;
    for (const o of obras) {
      if (EN_CURSO.has(o.estado)) enCurso += 1;
      else if (TERMINADA.has(o.estado)) terminadas += 1;
      else if (o.estado === 'cancelada') canceladas += 1;
    }
    return { enCurso, terminadas, canceladas, total: obras.length };
  }, [obras]);

  // Planos: lista de cards con URL no-vacía en el orden canónico.
  const planosUrls = useMemo(() => {
    const planos = producto?.planos ?? {};
    return PLANOS_LABELS.map((p) => ({
      ...p,
      url: typeof planos[p.key] === 'string' ? (planos[p.key] as string) : null,
    })).filter((p): p is typeof p & { url: string } => !!p.url && p.url.length > 0);
  }, [producto]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !producto) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Prototipo no encontrado.'}
        </div>
      </div>
    );
  }

  const fichaGeneral: { label: string; value: string }[] = (
    [
      ['Prototipo', producto.nombre],
      ['Proyecto', proyectoNombre],
      ['m² de construcción', m2 != null ? `${m2.toFixed(2)} m²` : null],
      [
        'Días totales (plantilla)',
        totalTiempoDias > 0
          ? `${totalTiempoDias.toFixed(1)} días${tiempo != null && Math.abs(tiempo - totalTiempoDias) > 0.5 ? ` · referencia Coda: ${tiempo}` : ''}`
          : tiempo != null
            ? `${tiempo} días (referencia)`
            : null,
      ],
      ['Costo de materiales', fmtMoney(costoMateriales)],
      [
        'Costo materiales por m²',
        costoMaterialesPorM2 != null ? `${moneyFmt.format(costoMaterialesPorM2)} / m²` : null,
      ],
      [
        'Último precio MO × m²',
        ultimoPrecioMo
          ? `${moneyFmt.format(ultimoPrecioMo.precio)} / m² (${ultimoPrecioMo.fecha})`
          : null,
      ],
      ['Total MO del prototipo', fmtMoney(totalMo)],
      ['Valor comercial referencia', fmtMoney(producto.valor_comercial_referencia)],
      ['Costo referencia', fmtMoney(producto.costo_referencia)],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
            <Home className="h-5 w-5 text-[var(--accent)]" />
            {producto.nombre}
          </h1>
          {proyectoNombre ? (
            <p className="mt-1 text-sm text-[var(--text)]/60">{proyectoNombre}</p>
          ) : null}
        </div>
      </header>

      <Section title="Datos generales">
        {fichaGeneral.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin datos capturados.</p>
        ) : (
          <FichaGrid rows={fichaGeneral} cols={3} />
        )}
        {producto.descripcion ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Descripción
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text)]/80">
              {producto.descripcion}
            </p>
          </div>
        ) : null}
      </Section>

      <Section
        title="Planos"
        description={
          planosUrls.length === 0
            ? 'sin planos cargados'
            : `${planosUrls.length} plano(s) registrado(s)`
        }
      >
        {planosUrls.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            Este prototipo no tiene planos cargados todavía en `productos.planos`.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {planosUrls.map((p) => {
              const Icon = isPdfUrl(p.url) ? FileText : ImageIcon;
              return (
                <a
                  key={p.key}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 p-3 hover:border-[var(--accent)] hover:bg-[var(--bg)]/60"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/50">
                      {p.group}
                    </div>
                    <div className="truncate text-sm font-medium text-[var(--text)]">{p.label}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--text)]/40">
                      {isPdfUrl(p.url) ? 'PDF' : 'Imagen / link'}
                      <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Plantilla de tareas de construcción"
        description={
          etapasConTareas.length === 0
            ? 'sin plantilla cargada'
            : `${etapasConTareas.length} etapa(s) · ${plantilla.length} tareas${totalMo != null ? ` · Total MO ${moneyFmt.format(totalMo)}` : ''}`
        }
      >
        {etapasConTareas.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            La plantilla de tareas no está cargada para este prototipo.
          </p>
        ) : (
          <div className="space-y-4">
            {ultimoPrecioMo == null ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
                No hay obras de este prototipo con <code>precio_mo_x_m2</code> capturado todavía. Se
                muestra la plantilla con porcentajes pero sin costos en pesos. Cuando se arranque la
                primera obra del prototipo (form combinado de contrato), el costo MO se calcula
                automáticamente.
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wide text-[var(--text)]/50">
                  <tr>
                    <th className="w-12 px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">Tarea</th>
                    <th className="w-20 px-2 py-1.5 text-right">% costo</th>
                    <th className="w-28 px-2 py-1.5 text-right">Costo MO</th>
                    <th className="w-16 px-2 py-1.5 text-right">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {etapasConTareas.map((et) => (
                    <EtapaRows key={et.id} etapa={et} />
                  ))}
                </tbody>
                <tfoot className="border-t border-[var(--border)] text-xs font-medium">
                  <tr>
                    <td className="px-2 py-2" colSpan={2}>
                      TOTAL ({plantilla.length} tareas)
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{totalPctSum.toFixed(2)}%</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {totalMo != null ? moneyFmt.format(totalCostoSum) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {totalTiempoDias > 0 ? totalTiempoDias.toFixed(1) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>

      <Section title="Inventario en construcción">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Kpi label="En curso" value={kpisInventario.enCurso.toString()} accent />
          <Kpi label="Terminadas" value={kpisInventario.terminadas.toString()} />
          <Kpi label="Canceladas" value={kpisInventario.canceladas.toString()} muted />
          <Kpi label="Total histórico" value={kpisInventario.total.toString()} />
        </div>
      </Section>
    </div>
  );
}

function EtapaRows({
  etapa,
}: {
  etapa: {
    id: string;
    nombre: string;
    orden: number;
    items: Array<{
      plantillaId: string;
      nombre: string;
      pctDisplay: number;
      costoMoTarea: number | null;
      tiempoDias: number;
    }>;
    pctEtapa: number;
    costoEtapa: number;
  };
}) {
  return (
    <>
      <tr className="bg-[var(--bg)]/40 text-[10px] uppercase tracking-wide text-[var(--text)]/60">
        <td className="px-2 py-1.5 font-mono tabular-nums">{etapa.orden}</td>
        <td className="px-2 py-1.5 font-medium" colSpan={2}>
          <span className="inline-flex items-center gap-2">
            <MapIcon className="h-3 w-3" />
            {etapa.nombre}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {etapa.costoEtapa > 0 ? moneyFmt.format(etapa.costoEtapa) : '—'}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{etapa.pctEtapa.toFixed(2)}%</td>
      </tr>
      {etapa.items.map((it, idx) => (
        <tr key={it.plantillaId} className="border-b border-[var(--border)]/30 last:border-0">
          <td className="px-2 py-1 text-right text-[11px] tabular-nums text-[var(--text)]/40">
            {idx + 1}
          </td>
          <td className="px-2 py-1 text-[var(--text)]/80">{it.nombre}</td>
          <td className="px-2 py-1 text-right tabular-nums text-[var(--text)]/60">
            {it.pctDisplay.toFixed(2)}%
          </td>
          <td className="px-2 py-1 text-right tabular-nums text-[var(--text)]">
            {it.costoMoTarea != null ? moneyFmt.format(it.costoMoTarea) : '—'}
          </td>
          <td className="px-2 py-1 text-right tabular-nums text-[var(--text)]/50">
            {it.tiempoDias > 0 ? it.tiempoDias : '—'}
          </td>
        </tr>
      ))}
    </>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/dilesa/construccion/prototipos"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a prototipos
    </Link>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          {title}
        </h2>
        {description ? <span className="text-xs text-[var(--text)]/50">{description}</span> : null}
      </div>
      {children}
    </section>
  );
}

function FichaGrid({ rows, cols = 2 }: { rows: { label: string; value: string }[]; cols?: 2 | 3 }) {
  const gridCls =
    cols === 3
      ? 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2';
  return (
    <dl className={gridCls}>
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            {r.label}
          </dt>
          <dd className="mt-0.5 text-sm text-[var(--text)]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Kpi({
  label,
  value,
  accent = false,
  muted = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={
        'rounded-md border bg-[var(--bg)]/30 px-3 py-2 ' +
        (accent
          ? 'border-[var(--accent)]/40'
          : muted
            ? 'border-[var(--border)] opacity-60'
            : 'border-[var(--border)]')
      }
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text)]/50">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text)]">{value}</div>
    </div>
  );
}

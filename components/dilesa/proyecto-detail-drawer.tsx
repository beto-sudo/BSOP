'use client';

/**
 * ProyectoDetailDrawer — detalle de un proyecto DILESA con su tabla de
 * unidades.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 4 (detalle de lectura).
 * Se abre al hacer click en una fila de `ProyectosModule`. Muestra la ficha
 * del proyecto (alcance + costos) y la lista de sus `dilesa.unidades`
 * (lotes/casas importados de Coda), filtrable por estado y tipo de lote.
 *
 * Lectura pura — la captura/edición es entregable posterior.
 */

import { useMemo, useState, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { DetailDrawer, DetailDrawerContent, DetailDrawerSection } from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Boxes } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

export type ProyectoDetalle = {
  id: string;
  tipo: string;
  nombre: string;
  estado: string;
  clave_interna: string | null;
  proyecto_padre_id: string | null;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  fecha_licencia: string | null;
  area_m2: number | null;
  area_vendible_m2: number | null;
  areas_verdes_m2: number | null;
  lotes_proyectados: number | null;
  presupuesto_estimado: number | null;
  costo_terreno: number | null;
  costo_urbanizacion: number | null;
  costo_construccion: number | null;
  costo_comercializacion: number | null;
  notas: string | null;
};

export const TIPO_LABEL: Record<string, string> = {
  anteproyecto: 'Anteproyecto',
  desarrollo: 'Desarrollo',
  remodelacion: 'Remodelación',
  reconversion: 'Reconversión',
  subdivision: 'Subdivisión',
  comercializacion: 'Comercialización',
  operacion: 'Operación',
};

export const ESTADO_TONE: Record<string, BadgeTone> = {
  propuesta: 'neutral',
  analisis: 'info',
  aprobado: 'info',
  ejecutando: 'warning',
  completado: 'success',
  archivado: 'neutral',
};

export const ESTADO_LABEL: Record<string, string> = {
  propuesta: 'Propuesta',
  analisis: 'Análisis',
  aprobado: 'Aprobado',
  ejecutando: 'Ejecutando',
  completado: 'Completado',
  archivado: 'Archivado',
};

// ─── Unidades ─────────────────────────────────────────────────────────────────

type Unidad = {
  id: string;
  identificador: string;
  estado: string;
  tipo_lote: string | null;
  area_m2: number | null;
  m2_construccion: number | null;
  precio: number | null;
  producto: { nombre: string } | null;
};

/** Orden del ciclo de vida — usado para ordenar la columna estado. */
const UNIDAD_ESTADO_ORDEN = [
  'planeada',
  'lote_urbanizado',
  'en_construccion',
  'terminada',
  'asignada',
  'vendida',
  'escriturada',
  'entregada',
];

const UNIDAD_ESTADO_LABEL: Record<string, string> = {
  planeada: 'Planeada',
  lote_urbanizado: 'Lote urbanizado',
  en_construccion: 'En construcción',
  terminada: 'Terminada',
  asignada: 'Asignada',
  vendida: 'Vendida',
  escriturada: 'Escriturada',
  entregada: 'Entregada',
};

const UNIDAD_ESTADO_TONE: Record<string, BadgeTone> = {
  planeada: 'neutral',
  lote_urbanizado: 'neutral',
  en_construccion: 'warning',
  terminada: 'info',
  asignada: 'warning',
  vendida: 'success',
  escriturada: 'success',
  entregada: 'success',
};

// ─── Formato ──────────────────────────────────────────────────────────────────

const numberFmt = new Intl.NumberFormat('es-MX');
const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function fmtM2(n: number | null): string | null {
  return n == null ? null : `${numberFmt.format(n)} m²`;
}

function fmtMoney(n: number | null): string | null {
  return n == null ? null : moneyFmt.format(n);
}

function fmtInt(n: number | null): string | null {
  return n == null ? null : numberFmt.format(n);
}

function fmtFecha(s: string | null): string | null {
  if (!s) return null;
  // Columna DATE ('YYYY-MM-DD'): se parsea como medianoche local para que el
  // día no se corra al formatear.
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const unidadColumns: Column<Unidad>[] = [
  { key: 'identificador', label: 'Lote', type: 'text', sticky: true, width: 'min-w-[140px]' },
  {
    key: 'estado',
    label: 'Estado',
    type: 'custom',
    accessor: (u) => UNIDAD_ESTADO_ORDEN.indexOf(u.estado),
    render: (u) => (
      <Badge tone={UNIDAD_ESTADO_TONE[u.estado] ?? 'neutral'}>
        {UNIDAD_ESTADO_LABEL[u.estado] ?? u.estado}
      </Badge>
    ),
  },
  { key: 'tipo_lote', label: 'Tipo de lote', type: 'text', render: (u) => u.tipo_lote ?? '—' },
  {
    key: 'producto',
    label: 'Prototipo',
    type: 'custom',
    accessor: (u) => u.producto?.nombre ?? '',
    render: (u) => u.producto?.nombre ?? '—',
  },
  { key: 'area_m2', label: 'Sup. lote', type: 'number' },
  { key: 'm2_construccion', label: 'M² constr.', type: 'number' },
  { key: 'precio', label: 'Precio', type: 'currency' },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export function ProyectoDetailDrawer({
  proyecto,
  open,
  onOpenChange,
}: {
  proyecto: ProyectoDetalle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');

  // Carga las unidades del proyecto al abrir el drawer. Los setState van solo
  // dentro del `.then` (no síncronos dentro del effect).
  useEffect(() => {
    if (!open || !proyecto) return;
    let activo = true;
    void createSupabaseBrowserClient()
      .schema('dilesa')
      .from('unidades')
      .select(
        'id, identificador, estado, tipo_lote, area_m2, m2_construccion, precio, producto:productos(nombre)'
      )
      .eq('proyecto_id', proyecto.id)
      .is('deleted_at', null)
      .order('identificador')
      .then(({ data, error: err }) => {
        if (!activo) return;
        if (err) {
          setError(getSupabaseErrorMessage(err, 'No se pudieron cargar las unidades.'));
          setUnidades([]);
        } else {
          setError(null);
          setUnidades((data ?? []) as unknown as Unidad[]);
        }
        setLoadedId(proyecto.id);
      });
    return () => {
      activo = false;
    };
  }, [open, proyecto]);

  const loading = open && proyecto != null && loadedId !== proyecto.id;

  const tiposPresentes = useMemo(
    () => Array.from(new Set(unidades.map((u) => u.tipo_lote).filter(Boolean))).sort() as string[],
    [unidades]
  );
  const estadosPresentes = useMemo(
    () =>
      Array.from(new Set(unidades.map((u) => u.estado))).sort(
        (a, b) => UNIDAD_ESTADO_ORDEN.indexOf(a) - UNIDAD_ESTADO_ORDEN.indexOf(b)
      ),
    [unidades]
  );

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return unidades.filter((u) => {
      if (estadoFiltro && u.estado !== estadoFiltro) return false;
      if (tipoFiltro && u.tipo_lote !== tipoFiltro) return false;
      if (q && !u.identificador.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [unidades, search, estadoFiltro, tipoFiltro]);

  if (!proyecto) return null;

  const ficha: { label: string; value: string }[] = (
    [
      ['Clave interna', proyecto.clave_interna],
      ['Inicio', fmtFecha(proyecto.fecha_inicio)],
      ['Fin estimado', fmtFecha(proyecto.fecha_fin_estimada)],
      ['Licencia de fraccionamiento', fmtFecha(proyecto.fecha_licencia)],
      ['Área total', fmtM2(proyecto.area_m2)],
      ['Área vendible', fmtM2(proyecto.area_vendible_m2)],
      ['Áreas verdes', fmtM2(proyecto.areas_verdes_m2)],
      ['Lotes proyectados', fmtInt(proyecto.lotes_proyectados)],
      ['Presupuesto estimado', fmtMoney(proyecto.presupuesto_estimado)],
      ['Costo de terreno', fmtMoney(proyecto.costo_terreno)],
      ['Costo de urbanización', fmtMoney(proyecto.costo_urbanizacion)],
      ['Costo de construcción', fmtMoney(proyecto.costo_construccion)],
      ['Costo de comercialización', fmtMoney(proyecto.costo_comercializacion)],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null)
    .map(([label, value]) => ({ label, value }));

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={proyecto.nombre}
      meta={
        <>
          <Badge tone="neutral">{TIPO_LABEL[proyecto.tipo] ?? proyecto.tipo}</Badge>
          <Badge tone={ESTADO_TONE[proyecto.estado] ?? 'neutral'}>
            {ESTADO_LABEL[proyecto.estado] ?? proyecto.estado}
          </Badge>
        </>
      }
    >
      <DetailDrawerContent>
        <DetailDrawerSection title="Datos del proyecto" divider={false}>
          {ficha.length > 0 ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {ficha.map((r) => (
                <div key={r.label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                    {r.label}
                  </dt>
                  <dd className="mt-0.5 text-sm text-[var(--text)]">{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-[var(--text)]/60">
              Sin datos de alcance ni costos capturados.
            </p>
          )}
          {proyecto.notas ? (
            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                Notas
              </div>
              <p className="mt-0.5 whitespace-pre-line text-sm text-[var(--text)]/80">
                {proyecto.notas}
              </p>
            </div>
          ) : null}
        </DetailDrawerSection>

        <DetailDrawerSection
          title="Unidades"
          description={
            loading
              ? 'Cargando…'
              : `${filtradas.length}${
                  filtradas.length !== unidades.length ? ` de ${unidades.length}` : ''
                } ${unidades.length === 1 ? 'unidad' : 'unidades'}`
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar lote…"
                className="w-44 pl-9"
              />
            </div>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
            >
              <option value="">Todos los estados</option>
              {estadosPresentes.map((e) => (
                <option key={e} value={e}>
                  {UNIDAD_ESTADO_LABEL[e] ?? e}
                </option>
              ))}
            </select>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
            >
              <option value="">Todos los tipos</option>
              {tiposPresentes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <DataTable
            data={filtradas}
            columns={unidadColumns}
            rowKey="id"
            loading={loading}
            error={error}
            sticky={{ header: false }}
            showDensityToggle={false}
            density="compact"
            initialSort={{ key: 'identificador', dir: 'asc' }}
            emptyTitle="Sin unidades"
            emptyDescription="Este proyecto no tiene unidades registradas."
            emptyIcon={<Boxes className="h-6 w-6" />}
          />
        </DetailDrawerSection>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

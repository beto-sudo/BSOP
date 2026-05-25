'use client';

/**
 * ConstruccionModule — lista de construcciones DILESA.
 *
 * Iniciativa dilesa-construccion · Sprint 3 (UI lectura). Lista filtrable
 * de las ~1,372 obras importadas en Sprint 2: código de obra, unidad,
 * prototipo, contratista, avance % (barra visual), estado, fechas críticas.
 * Click en una fila navega a `/dilesa/construccion/[id]` con la ficha
 * completa, MO, timeline de etapas con sus tareas pendientes/terminadas,
 * y el contrato asociado (si lo tiene).
 *
 * Carga cross-schema con 5 queries paralelas (construcciones + unidades
 * + productos + proyectos + personas) y lookups en memoria Map<id,nombre>.
 * Patrón ya validado en `ventas-module.tsx` — evita embeds problemáticos
 * de PostgREST cuando la tabla embebida existe en > 1 schema y permite
 * filtros sobre los nombres derivados sin hits adicionales.
 *
 * Avance % visual: barra horizontal con color escalado (rojo <33,
 * ámbar 33-66, verde ≥66). El % viene pre-calculado en la tabla
 * (`avance_pct` se actualiza por trigger `tg_construccion_avance` cada
 * vez que se inserta/elimina una tarea terminada — ADR-032).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { DataTable, type Column } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { HardHat, Plus, RefreshCw, Search } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type ConstruccionRow = {
  id: string;
  codigo: string;
  unidad_id: string;
  producto_id: string;
  contratista_id: string;
  supervisor_persona_id: string | null;
  fecha_arranque: string | null;
  fecha_compromiso_terminar: string | null;
  fecha_terminada: string | null;
  avance_pct: number;
  estado: string;
};

type ConstruccionListaRow = ConstruccionRow & {
  /** Identificador "Coda-style": M3-L9-LDLE-ISC (con sufijo prototipo). */
  identificadorCompleto: string;
  proyectoNombre: string;
  prototipo: string | null;
  contratistaNombre: string;
  contratistaAbreviacion: string | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  arrancada: 'info',
  en_progreso: 'warning',
  terminada: 'success',
  dtu: 'success',
  seguro_calidad: 'success',
  extraida: 'success',
  cancelada: 'neutral',
};

const ESTADO_LABEL: Record<string, string> = {
  arrancada: 'Arrancada',
  en_progreso: 'En progreso',
  terminada: 'Terminada',
  dtu: 'DTU',
  seguro_calidad: 'Seguro calidad',
  extraida: 'Extraída',
  cancelada: 'Cancelada',
};

/** Umbrales de color para la barra de avance (alineado con ADR-032: 20% = listo para venta). */
function avanceColorClass(pct: number): string {
  if (pct >= 66) return 'bg-emerald-500';
  if (pct >= 33) return 'bg-amber-500';
  if (pct >= 20) return 'bg-amber-400';
  return 'bg-rose-500';
}

/** Barra de avance con número a la derecha. Patrón inline — no hay
 *  componente Progress canónico en el repo todavía. */
function AvanceBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]/40">
        <div
          className={`h-full rounded-full ${avanceColorClass(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--text)]/70">
        {clamped.toFixed(0)}%
      </span>
    </div>
  );
}

export function ConstruccionModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeArrancar =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.arrancar')?.write === true;
  const [obras, setObras] = useState<ConstruccionListaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [contratistaFiltro, setContratistaFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [avanceFiltro, setAvanceFiltro] = useState<'' | 'lt20' | '20a66' | 'gte66' | 'completa'>(
    ''
  );

  const fetchObras = useCallback(async (): Promise<{
    data?: ConstruccionListaRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();

    // Construcciones — sin embeds, filtros eq(empresa_id) para evitar URLs
    // > 8KB que rompen Cloudflare cuando se cruza `.in(ids[])`.
    const { data: rawObras, error: oErr } = await sb
      .schema('dilesa')
      .from('construccion')
      .select(
        'id, codigo, unidad_id, producto_id, contratista_id, supervisor_persona_id, fecha_arranque, fecha_compromiso_terminar, fecha_terminada, avance_pct, estado'
      )
      .eq('empresa_id', empresaId)
      .is('deleted_at', null);
    if (oErr) {
      return { error: getSupabaseErrorMessage(oErr, 'No se pudieron cargar las construcciones.') };
    }
    const obrasArr = (rawObras ?? []) as ConstruccionRow[];

    // Lookups paralelos: unidades + productos + proyectos + personas
    // (contratistas) + contratistas_datos para abreviación. Todos por
    // `.eq(empresa_id)` siguiendo el patrón ventas-module.
    const [unidadesRes, productosRes, proyectosRes, personasRes, datosRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('unidades')
        .select('id, identificador, proyecto_id')
        .eq('empresa_id', empresaId),
      sb
        .schema('dilesa')
        .from('productos')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'contratista'),
      sb
        .schema('dilesa')
        .from('contratistas_datos')
        .select('persona_id, abreviacion')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);

    const firstErr =
      unidadesRes.error ??
      productosRes.error ??
      proyectosRes.error ??
      personasRes.error ??
      datosRes.error;
    if (firstErr) {
      return {
        error: getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los datos auxiliares.'),
      };
    }

    const unidadMap = new Map<string, { identificador: string; proyecto_id: string }>();
    for (const u of unidadesRes.data ?? []) {
      unidadMap.set(u.id as string, {
        identificador: u.identificador as string,
        proyecto_id: u.proyecto_id as string,
      });
    }
    const productoMap = new Map<string, string>();
    for (const p of productosRes.data ?? []) productoMap.set(p.id as string, p.nombre as string);
    const proyectoMap = new Map<string, string>();
    for (const p of proyectosRes.data ?? []) proyectoMap.set(p.id as string, p.nombre as string);
    const personaMap = new Map<string, string>();
    for (const p of personasRes.data ?? []) {
      const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
      personaMap.set(p.id as string, nombre || '(sin nombre)');
    }
    const abrevMap = new Map<string, string | null>();
    for (const d of datosRes.data ?? []) {
      abrevMap.set(d.persona_id as string, (d.abreviacion as string | null) ?? null);
    }

    return {
      data: obrasArr.map((o) => {
        const u = unidadMap.get(o.unidad_id);
        const proto = productoMap.get(o.producto_id) ?? null;
        const protoSufijo = proto ? proto.split('-').pop() : null;
        const identificadorBase = u?.identificador ?? o.codigo;
        return {
          ...o,
          identificadorCompleto: protoSufijo
            ? `${identificadorBase}-${protoSufijo}`
            : identificadorBase,
          proyectoNombre: u?.proyecto_id ? (proyectoMap.get(u.proyecto_id) ?? '') : '',
          prototipo: proto,
          contratistaNombre: personaMap.get(o.contratista_id) ?? '(sin contratista)',
          contratistaAbreviacion: abrevMap.get(o.contratista_id) ?? null,
        };
      }),
    };
  }, [empresaId]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchObras();
    if (e) {
      setError(e);
      setObras([]);
    } else setObras(data ?? []);
    setLoading(false);
  }, [fetchObras]);

  useEffect(() => {
    let activo = true;
    void fetchObras().then(({ data, error: e }) => {
      if (!activo) return;
      if (e) {
        setError(e);
        setObras([]);
      } else setObras(data ?? []);
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchObras]);

  const proyectosPresentes = useMemo(
    () => [...new Set(obras.map((o) => o.proyectoNombre).filter(Boolean))].sort(),
    [obras]
  );
  const contratistasPresentes = useMemo(
    () =>
      [...new Set(obras.map((o) => o.contratistaNombre).filter((n): n is string => !!n))].sort(),
    [obras]
  );
  const estadosPresentes = useMemo(() => [...new Set(obras.map((o) => o.estado))].sort(), [obras]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return obras.filter((o) => {
      if (proyectoFiltro && o.proyectoNombre !== proyectoFiltro) return false;
      if (contratistaFiltro && o.contratistaNombre !== contratistaFiltro) return false;
      if (estadoFiltro && o.estado !== estadoFiltro) return false;
      if (avanceFiltro === 'lt20' && o.avance_pct >= 20) return false;
      if (avanceFiltro === '20a66' && (o.avance_pct < 20 || o.avance_pct >= 66)) return false;
      if (avanceFiltro === 'gte66' && o.avance_pct < 66) return false;
      if (avanceFiltro === 'completa' && o.avance_pct < 100) return false;
      if (q) {
        const hay =
          o.identificadorCompleto.toLowerCase().includes(q) ||
          o.codigo.toLowerCase().includes(q) ||
          o.contratistaNombre.toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [obras, search, proyectoFiltro, contratistaFiltro, estadoFiltro, avanceFiltro]);

  const columns: Column<ConstruccionListaRow>[] = [
    {
      key: 'identificadorCompleto',
      label: 'Unidad',
      type: 'text',
      sticky: true,
      width: 'min-w-[180px]',
    },
    { key: 'proyectoNombre', label: 'Proyecto', type: 'text' },
    {
      key: 'prototipo',
      label: 'Prototipo',
      type: 'text',
      render: (o) => o.prototipo ?? '—',
    },
    {
      key: 'contratistaNombre',
      label: 'Contratista',
      type: 'custom',
      accessor: (o) => o.contratistaNombre,
      render: (o) =>
        o.contratistaAbreviacion ? (
          <span title={o.contratistaNombre}>
            <span className="font-medium">{o.contratistaAbreviacion}</span>
            <span className="ml-1 text-[var(--text)]/40">·</span>
            <span className="ml-1 text-[var(--text)]/60">{o.contratistaNombre}</span>
          </span>
        ) : (
          o.contratistaNombre
        ),
    },
    {
      key: 'avance_pct',
      label: 'Avance',
      type: 'custom',
      accessor: (o) => o.avance_pct,
      render: (o) => <AvanceBar pct={o.avance_pct} />,
    },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      render: (o) => (
        <Badge tone={ESTADO_TONE[o.estado] ?? 'neutral'}>
          {ESTADO_LABEL[o.estado] ?? o.estado}
        </Badge>
      ),
    },
    { key: 'fecha_arranque', label: 'Arranque', type: 'date' },
    { key: 'fecha_compromiso_terminar', label: 'Compromiso', type: 'date' },
  ];

  const onRowClick = (o: ConstruccionListaRow) => {
    router.push(`/dilesa/construccion/${o.id}`);
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <HardHat className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Construcción</h1>
          <p className="text-sm text-[var(--text)]/60">
            Obras en curso e históricas — avance, contratista, fechas críticas. El avance lo
            recalcula el trigger al cerrar tareas; pasa de planeada a en_construccion al cruzar 20%.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar unidad o contratista…"
            className="w-72 pl-9"
          />
        </div>
        <select
          value={proyectoFiltro}
          onChange={(e) => setProyectoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los proyectos</option>
          {proyectosPresentes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={contratistaFiltro}
          onChange={(e) => setContratistaFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los contratistas</option>
          {contratistasPresentes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los estados</option>
          {estadosPresentes.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e] ?? e}
            </option>
          ))}
        </select>
        <select
          value={avanceFiltro}
          onChange={(e) =>
            setAvanceFiltro(e.target.value as '' | 'lt20' | '20a66' | 'gte66' | 'completa')
          }
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Cualquier avance</option>
          <option value="lt20">&lt; 20% (sin disparar venta)</option>
          <option value="20a66">20%-66%</option>
          <option value="gte66">≥ 66%</option>
          <option value="completa">100% completada</option>
        </select>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
        <span className="ml-auto text-sm text-[var(--text)]/60">
          {filtrados.length} de {obras.length} obras
        </span>
        {puedeArrancar ? (
          <Link
            href="/dilesa/construccion/arrancar"
            className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Arrancar construcción
          </Link>
        ) : null}
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={onRowClick}
        initialSort={{ key: 'identificadorCompleto', dir: 'asc' }}
        emptyTitle="Sin obras"
        emptyDescription="No hay construcciones que coincidan con los filtros actuales."
        emptyIcon={<HardHat className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}

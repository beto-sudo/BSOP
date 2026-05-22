'use client';

/**
 * ProyectosModule — lista de proyectos DILESA.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 4. Lectura del schema
 * `dilesa` v2: tabla `proyectos` (master). v0 = lista + filtros; el detalle
 * (sub-proyectos, activos input/output, modelo financiero) y la captura son
 * entregables posteriores.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Landmark, RefreshCw, Search } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Proyecto = {
  id: string;
  tipo: string;
  nombre: string;
  estado: string;
  fecha_inicio: string | null;
  presupuesto_estimado: number | null;
  proyecto_padre_id: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  anteproyecto: 'Anteproyecto',
  desarrollo: 'Desarrollo',
  remodelacion: 'Remodelación',
  reconversion: 'Reconversión',
  subdivision: 'Subdivisión',
  comercializacion: 'Comercialización',
  operacion: 'Operación',
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  propuesta: 'neutral',
  analisis: 'info',
  aprobado: 'info',
  ejecutando: 'warning',
  completado: 'success',
  archivado: 'neutral',
};

const ESTADO_LABEL: Record<string, string> = {
  propuesta: 'Propuesta',
  analisis: 'Análisis',
  aprobado: 'Aprobado',
  ejecutando: 'Ejecutando',
  completado: 'Completado',
  archivado: 'Archivado',
};

export function ProyectosModule({ empresaId }: { empresaId: string }) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('');

  const fetchProyectos = useCallback(
    () =>
      createSupabaseBrowserClient()
        .schema('dilesa')
        .from('proyectos')
        .select('id, tipo, nombre, estado, fecha_inicio, presupuesto_estimado, proyecto_padre_id')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('nombre'),
    [empresaId]
  );

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchProyectos();
    if (err) {
      setError(getSupabaseErrorMessage(err, 'No se pudieron cargar los proyectos.'));
      setProyectos([]);
    } else {
      setProyectos((data ?? []) as Proyecto[]);
    }
    setLoading(false);
  }, [fetchProyectos]);

  // La carga inicial no llama cargar() directo: los setState van después del
  // await para no dispararlos síncronamente dentro del effect.
  useEffect(() => {
    let activo = true;
    void fetchProyectos().then(({ data, error: err }) => {
      if (!activo) return;
      if (err) {
        setError(getSupabaseErrorMessage(err, 'No se pudieron cargar los proyectos.'));
        setProyectos([]);
      } else {
        setProyectos((data ?? []) as Proyecto[]);
      }
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchProyectos]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proyectos.filter((p) => {
      if (tipoFiltro && p.tipo !== tipoFiltro) return false;
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [proyectos, search, tipoFiltro]);

  const columns: Column<Proyecto>[] = [
    { key: 'nombre', label: 'Nombre', type: 'text', sticky: true, width: 'min-w-[220px]' },
    {
      key: 'tipo',
      label: 'Tipo',
      type: 'custom',
      render: (p) => <Badge tone="neutral">{TIPO_LABEL[p.tipo] ?? p.tipo}</Badge>,
    },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      render: (p) => (
        <Badge tone={ESTADO_TONE[p.estado] ?? 'neutral'}>
          {ESTADO_LABEL[p.estado] ?? p.estado}
        </Badge>
      ),
    },
    { key: 'fecha_inicio', label: 'Inicio', type: 'date' },
    { key: 'presupuesto_estimado', label: 'Presupuesto', type: 'currency' },
  ];

  const tiposPresentes = useMemo(
    () => Array.from(new Set(proyectos.map((p) => p.tipo))).sort(),
    [proyectos]
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Proyectos</h1>
          <p className="text-sm text-[var(--text)]/60">
            Proyectos de desarrollo e intervención sobre los activos del portafolio.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-64 pl-9"
          />
        </div>
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los tipos</option>
          {tiposPresentes.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t] ?? t}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        emptyTitle="Sin proyectos"
        emptyDescription="Aún no hay proyectos. Se llenará al importar los datos de Coda."
        emptyIcon={<Landmark className="h-6 w-6" />}
      />
    </div>
  );
}

'use client';

/**
 * PortafolioModule — lista del portafolio de activos DILESA.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 4. Lectura del schema
 * `dilesa` v2: tabla `activos` (master). v0 = lista + filtros; el detalle
 * rico y la captura son entregables posteriores.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Building2, RefreshCw, Search } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { ActivoDetailDrawer } from '@/components/dilesa/activo-detail-drawer';

type Activo = {
  id: string;
  tipo: string;
  nombre: string;
  estado: string;
  municipio: string | null;
  area_m2: number | null;
  valor_estimado: number | null;
  activo_padre_id: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  terreno: 'Terreno',
  espectacular: 'Espectacular',
  unipolar: 'Unipolar',
  casa: 'Casa',
  local: 'Local',
  plaza: 'Plaza',
  edificio: 'Edificio',
  nave: 'Nave',
  departamento: 'Departamento',
  lote: 'Lote',
  infraestructura: 'Infraestructura',
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  prospecto: 'neutral',
  adquirido: 'info',
  operando: 'success',
  en_intervencion: 'warning',
  desincorporado: 'danger',
};

const ESTADO_LABEL: Record<string, string> = {
  prospecto: 'Prospecto',
  adquirido: 'Adquirido',
  operando: 'Operando',
  en_intervencion: 'En intervención',
  desincorporado: 'Desincorporado',
};

export function PortafolioModule({ empresaId }: { empresaId: string }) {
  const [activos, setActivos] = useState<Activo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('');
  const [detalle, setDetalle] = useState<{ id: string; tipo: string } | null>(null);

  const fetchActivos = useCallback(
    () =>
      createSupabaseBrowserClient()
        .schema('dilesa')
        .from('activos')
        .select('id, tipo, nombre, estado, municipio, area_m2, valor_estimado, activo_padre_id')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('nombre'),
    [empresaId]
  );

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchActivos();
    if (err) {
      setError(getSupabaseErrorMessage(err, 'No se pudieron cargar los activos.'));
      setActivos([]);
    } else {
      setActivos((data ?? []) as Activo[]);
    }
    setLoading(false);
  }, [fetchActivos]);

  // La carga inicial no llama cargar() directo: los setState van después del
  // await para no dispararlos síncronamente dentro del effect.
  useEffect(() => {
    let activo = true;
    void fetchActivos().then(({ data, error: err }) => {
      if (!activo) return;
      if (err) {
        setError(getSupabaseErrorMessage(err, 'No se pudieron cargar los activos.'));
        setActivos([]);
      } else {
        setActivos((data ?? []) as Activo[]);
      }
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchActivos]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activos.filter((a) => {
      if (tipoFiltro && a.tipo !== tipoFiltro) return false;
      if (q && !a.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activos, search, tipoFiltro]);

  const columns: Column<Activo>[] = [
    { key: 'nombre', label: 'Nombre', type: 'text', sticky: true, width: 'min-w-[220px]' },
    {
      key: 'tipo',
      label: 'Tipo',
      type: 'custom',
      render: (a) => <Badge tone="neutral">{TIPO_LABEL[a.tipo] ?? a.tipo}</Badge>,
    },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      render: (a) => (
        <Badge tone={ESTADO_TONE[a.estado] ?? 'neutral'}>
          {ESTADO_LABEL[a.estado] ?? a.estado}
        </Badge>
      ),
    },
    { key: 'municipio', label: 'Municipio', type: 'text' },
    { key: 'area_m2', label: 'Área (m²)', type: 'number' },
    { key: 'valor_estimado', label: 'Valor estimado', type: 'currency' },
  ];

  const tiposPresentes = useMemo(
    () => Array.from(new Set(activos.map((a) => a.tipo))).sort(),
    [activos]
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Portafolio</h1>
          <p className="text-sm text-[var(--text)]/60">
            Activos de DILESA — terrenos, lotes, locales, plazas, espectaculares y demás.
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
        onRowClick={(a) => setDetalle({ id: a.id, tipo: a.tipo })}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        emptyTitle="Sin activos"
        emptyDescription="Aún no hay activos en el portafolio. Se llenará al importar los datos de Coda."
        emptyIcon={<Building2 className="h-6 w-6" />}
      />

      <ActivoDetailDrawer
        activoId={detalle?.id ?? null}
        activoTipo={detalle?.tipo ?? null}
        open={detalle != null}
        onOpenChange={(o) => {
          if (!o) setDetalle(null);
        }}
      />
    </div>
  );
}

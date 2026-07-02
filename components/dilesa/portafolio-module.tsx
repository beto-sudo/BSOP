'use client';

/**
 * PortafolioModule — lista del portafolio de activos DILESA.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 4. Lectura del schema
 * `dilesa` v2: tabla `activos` (master). v0 = lista + filtros; el detalle
 * rico y la captura son entregables posteriores.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import { Building2, Plus, RefreshCw, Search, Sparkles, Tags } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { ActivoCaptureDrawer } from '@/components/dilesa/activo-capture-drawer';
import { DestinosCatalogoDialog } from '@/components/dilesa/destinos-catalogo-dialog';
import { EscriturasMatchingDialog } from '@/components/dilesa/escrituras-matching-dialog';
import { useEffectiveUser } from '@/components/providers';

type Activo = {
  id: string;
  tipo: string;
  nombre: string;
  estado: string;
  etiqueta: string | null;
  zona: string | null;
  municipio: string | null;
  area_m2: number | null;
  valor_estimado: number | null;
  activo_padre_id: string | null;
  destino_id: string | null;
  destino: { label: string } | null;
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
  const router = useRouter();
  const [activos, setActivos] = useState<Activo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('');
  const [estadoFiltro, setEstadoFiltro] = useState<string>('');
  const [destinoFiltro, setDestinoFiltro] = useState<string>('');
  const [municipioFiltro, setMunicipioFiltro] = useState<string>('');
  const [zonaFiltro, setZonaFiltro] = useState<string>('');
  const [destinosOpen, setDestinosOpen] = useState(false);
  const [matchingOpen, setMatchingOpen] = useState(false);
  // false = cerrado · null = alta · string = edición de ese activo.
  const [captura, setCaptura] = useState<string | null | false>(false);
  const { data: effectiveUser } = useEffectiveUser();
  const puedeAdmin =
    !!effectiveUser?.isAdmin || (effectiveUser?.direccionEmpresaIds ?? []).includes(empresaId);

  const fetchActivos = useCallback(
    () =>
      createSupabaseBrowserClient()
        .schema('dilesa')
        .from('activos')
        .select(
          'id, tipo, nombre, estado, etiqueta, zona, municipio, area_m2, valor_estimado, activo_padre_id, destino_id, destino:portafolio_destinos(label)'
        )
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        // Inventario = patrimonio: los prospectos/descartados viven en el tab
        // Evaluación, y las caras de espectacular en el expediente del padre.
        .not('estado', 'in', '(prospecto,descartado)')
        .neq('tipo', 'cara')
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
      if (estadoFiltro && a.estado !== estadoFiltro) return false;
      if (destinoFiltro && (a.destino?.label ?? '') !== destinoFiltro) return false;
      if (municipioFiltro && (a.municipio ?? '') !== municipioFiltro) return false;
      if (zonaFiltro && (a.zona ?? '') !== zonaFiltro) return false;
      if (
        q &&
        !a.nombre.toLowerCase().includes(q) &&
        !(a.etiqueta ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [activos, search, tipoFiltro, estadoFiltro, destinoFiltro, municipioFiltro, zonaFiltro]);

  // KPIs sobre el conjunto filtrado (la foto de lo que se está viendo).
  const kpis = useMemo<ModuleKpi[]>(() => {
    const valor = filtrados.reduce((acc, a) => acc + (a.valor_estimado ?? 0), 0);
    const operando = filtrados.filter((a) => a.estado === 'operando').length;
    const superficie = filtrados.reduce((acc, a) => acc + (a.area_m2 ?? 0), 0);
    return [
      { key: 'valor', label: 'Valor estimado', value: formatCurrency(valor) },
      { key: 'total', label: 'Activos', value: String(filtrados.length) },
      {
        key: 'superficie',
        label: 'Superficie',
        value: `${Math.round(superficie).toLocaleString('es-MX')} m²`,
      },
      { key: 'operando', label: 'Operando', value: String(operando) },
    ];
  }, [filtrados]);

  const destinosPresentes = useMemo(
    () =>
      Array.from(new Set(activos.map((a) => a.destino?.label).filter(Boolean) as string[])).sort(),
    [activos]
  );
  const municipiosPresentes = useMemo(
    () => Array.from(new Set(activos.map((a) => a.municipio).filter(Boolean) as string[])).sort(),
    [activos]
  );
  const zonasPresentes = useMemo(
    () => Array.from(new Set(activos.map((a) => a.zona).filter(Boolean) as string[])).sort(),
    [activos]
  );
  const estadosPresentes = useMemo(
    () => Array.from(new Set(activos.map((a) => a.estado))).sort(),
    [activos]
  );

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
    {
      key: 'destino',
      label: 'Destino',
      type: 'custom',
      render: (a) =>
        a.destino ? (
          <Badge tone="accent">{a.destino.label}</Badge>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'etiqueta',
      label: 'Etiqueta',
      type: 'custom',
      render: (a) =>
        a.etiqueta ? (
          <span className="block max-w-[180px] truncate text-[var(--text)]/80">{a.etiqueta}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    { key: 'zona', label: 'Zona', type: 'text' },
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
            Patrimonio de DILESA — terrenos, lotes, casas, locales y espectaculares. Los prospectos
            en evaluación viven en su propio tab hasta ser adquiridos.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={4} />

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
        {destinosPresentes.length > 0 ? (
          <select
            value={destinoFiltro}
            onChange={(e) => setDestinoFiltro(e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            <option value="">Todos los destinos</option>
            {destinosPresentes.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        ) : null}
        {municipiosPresentes.length > 0 ? (
          <select
            value={municipioFiltro}
            onChange={(e) => setMunicipioFiltro(e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            <option value="">Todos los municipios</option>
            {municipiosPresentes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : null}
        {zonasPresentes.length > 0 ? (
          <select
            value={zonaFiltro}
            onChange={(e) => setZonaFiltro(e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            <option value="">Todas las zonas</option>
            {zonasPresentes.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
        {puedeAdmin ? (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCaptura(null)}
              className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo activo
            </button>
            <button
              type="button"
              onClick={() => setDestinosOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
            >
              <Tags className="h-3.5 w-3.5" />
              Destinos
            </button>
            <button
              type="button"
              onClick={() => setMatchingOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ligar escrituras
            </button>
          </div>
        ) : null}
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={(a) => router.push(`/dilesa/portafolio/activo/${a.id}`)}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        emptyTitle="Sin activos"
        emptyDescription="Aún no hay activos en el portafolio. Se llenará al importar los datos de Coda."
        emptyIcon={<Building2 className="h-6 w-6" />}
      />

      {puedeAdmin ? (
        <>
          <ActivoCaptureDrawer
            key={captura === false ? 'closed' : (captura ?? 'nuevo')}
            empresaId={empresaId}
            activoId={captura === false ? null : captura}
            open={captura !== false}
            onOpenChange={(o) => {
              if (!o) setCaptura(false);
            }}
            onSaved={() => void cargar()}
          />
          <DestinosCatalogoDialog
            empresaId={empresaId}
            open={destinosOpen}
            onOpenChange={setDestinosOpen}
          />
          <EscriturasMatchingDialog open={matchingOpen} onOpenChange={setMatchingOpen} />
        </>
      ) : null}
    </div>
  );
}

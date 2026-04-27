'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect --
 * Cleanup PR (#30): pre-existing debt. `any` in Supabase row mapping;
 * set-state-in-effect in data-sync pattern. Both are behavioral rewrites,
 * out of scope for bulk lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { FilterCombobox } from '@/components/ui/filter-combobox';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Search, RefreshCw, Loader2, CalendarDays } from 'lucide-react';
import { JUNTA_ESTADO_CONFIG as ESTADO_CONFIG, type JuntaEstado } from '@/lib/status-tokens';
import { FieldLabel } from '@/components/ui/field-label';

// ─── Types ────────────────────────────────────────────────────────────────────

type Junta = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  fecha_hora: string;
  duracion_minutos: number | null;
  lugar: string | null;
  estado: JuntaEstado;
  tipo: string | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string | null;
};

const TIPO_CONFIG: Record<string, { label: string; icon: string }> = {
  operativa: { label: 'Operativa', icon: '⚙️' },
  directiva: { label: 'Directiva', icon: '🏛️' },
  seguimiento: { label: 'Seguimiento', icon: '📊' },
  emergencia: { label: 'Emergencia', icon: '🚨' },
  Consejo: { label: 'Consejo', icon: '🏢' },
  'Comite Ejecutivo': { label: 'Comité Ejecutivo', icon: '👔' },
  Ventas: { label: 'Ventas', icon: '💰' },
  'Atención PosVenta': { label: 'Atención PosVenta', icon: '🔧' },
  Administración: { label: 'Administración', icon: '📁' },
  Mercadotecnia: { label: 'Mercadotecnia', icon: '📣' },
  Construcción: { label: 'Construcción', icon: '🏗️' },
  'Compras y Admon. Inventario': { label: 'Compras y Admon. Inventario', icon: '📦' },
  Maquinaria: { label: 'Maquinaria', icon: '🚜' },
  Proyectos: { label: 'Proyectos', icon: '🗂️' },
  'Rincón del Bosque': { label: 'Rincón del Bosque', icon: '🌲' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function EstadoBadge({ estado }: { estado: Junta['estado'] }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function JuntasInner() {
  const router = useRouter();
  const supabase = createSupabaseERPClient();

  const [empresaIds, setEmpresaIds] = useState<string[]>([]);
  const [juntas, setJuntas] = useState<Junta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    titulo: '',
    fecha_hora: '',
    lugar: '',
    duracion_minutos: '60',
    tipo: '' as string,
    estado: 'programada' as Junta['estado'],
  });

  const fetchEmpresaIds = useCallback(async (): Promise<string[]> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: coreUser } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', (user.email ?? '').toLowerCase())
      .maybeSingle();

    if (!coreUser) return [];

    const { data: ueData } = await supabase
      .schema('core')
      .from('usuarios_empresas')
      .select('empresa_id')
      .eq('usuario_id', coreUser.id)
      .eq('activo', true);

    const ids = (ueData ?? []).map((r: any) => r.empresa_id as string);
    setEmpresaIds(ids);
    return ids;
  }, [supabase]);

  const fetchJuntas = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setJuntas([]);
        return;
      }
      const { data, error: err } = await supabase
        .schema('erp')
        .from('juntas')
        .select('*')
        .in('empresa_id', ids)
        .order('fecha_hora', { ascending: false });

      if (err) {
        setError(err.message);
        return;
      }
      setJuntas((data ?? []) as Junta[]);
    },
    [supabase]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const init = async () => {
      const ids = await fetchEmpresaIds();
      if (cancelled) return;
      await fetchJuntas(ids);
      if (!cancelled) setLoading(false);
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchEmpresaIds, fetchJuntas]);

  const handleCreate = async () => {
    if (!createForm.titulo.trim() || !createForm.fecha_hora || empresaIds.length === 0) return;
    setCreating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: coreUser } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();

    const payload = {
      empresa_id: empresaIds[0],
      titulo: createForm.titulo.trim(),
      fecha_hora: createForm.fecha_hora,
      lugar: createForm.lugar.trim() || null,
      duracion_minutos: parseInt(createForm.duracion_minutos) || 60,
      tipo: createForm.tipo || null,
      estado: createForm.estado,
      creado_por: coreUser?.id ?? null,
    };

    const { data: newJunta, error: err } = await supabase
      .schema('erp')
      .from('juntas')
      .insert(payload)
      .select()
      .single();

    setCreating(false);

    if (err) {
      alert(`Error al crear junta: ${err.message}`);
      return;
    }

    setShowCreate(false);
    setCreateForm({
      titulo: '',
      fecha_hora: '',
      lugar: '',
      duracion_minutos: '60',
      tipo: '',
      estado: 'programada',
    });

    if (newJunta) {
      router.push(`/inicio/juntas/${newJunta.id}`);
    }
  };

  const filtered = juntas.filter((j) => {
    if (search && !j.titulo.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterEstado !== 'all' && j.estado !== filterEstado) return false;
    return true;
  });

  const columns: Column<Junta>[] = [
    {
      key: 'titulo',
      label: 'Título',
      cellClassName: 'font-medium text-[var(--text)]',
      render: (j) => <span className="line-clamp-1">{j.titulo}</span>,
    },
    {
      key: 'tipo',
      label: 'Tipo',
      width: 'w-24',
      cellClassName: 'text-sm text-[var(--text)]/70',
      render: (j) =>
        j.tipo ? (
          <>
            {TIPO_CONFIG[j.tipo]?.icon} {TIPO_CONFIG[j.tipo]?.label}
          </>
        ) : (
          <span className="text-[var(--text-subtle)]">—</span>
        ),
    },
    {
      key: 'estado',
      label: 'Estado',
      width: 'w-28',
      render: (j) => <EstadoBadge estado={j.estado} />,
    },
    {
      key: 'fecha_hora',
      label: 'Fecha y hora',
      width: 'w-48',
      cellClassName: 'text-sm text-[var(--text)]/70',
      render: (j) => formatDateTime(j.fecha_hora),
    },
    {
      key: 'lugar',
      label: 'Lugar',
      width: 'w-32',
      cellClassName: 'text-sm text-[var(--text)]/70',
      render: (j) => <span className="line-clamp-1">{j.lugar ?? '—'}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Juntas</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Agenda y minutas de juntas operativas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setLoading(true);
              await fetchJuntas(empresaIds);
              setLoading(false);
            }}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Crear nueva junta
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]"
              aria-hidden="true"
            />
            <Input
              aria-label="Buscar juntas"
              placeholder="Buscar juntas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <FilterCombobox
            value={filterEstado}
            onChange={setFilterEstado}
            options={Object.entries(ESTADO_CONFIG).map(([k, v]) => ({
              id: k,
              label: v.label,
            }))}
            placeholder="Estado"
            searchPlaceholder="Buscar estado..."
            clearLabel="Todos los estados"
            className="w-40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <DataTable<Junta>
          data={filtered}
          columns={columns}
          rowKey="id"
          loading={loading}
          error={error}
          onRowClick={(junta) => router.push(`/inicio/juntas/${junta.id}`)}
          initialSort={{ key: 'fecha_hora', dir: 'desc' }}
          showDensityToggle={false}
          emptyIcon={<CalendarDays className="h-10 w-10 text-[var(--text)]/20" />}
          emptyTitle={
            juntas.length === 0
              ? 'No hay juntas registradas aún'
              : 'No hay juntas que coincidan con los filtros'
          }
          emptyAction={
            juntas.length === 0 ? (
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              >
                <Plus className="h-4 w-4" />
                Crear primera junta
              </Button>
            ) : undefined
          }
        />
      </div>

      {!loading && juntas.length > 0 && (
        <p className="text-right text-xs text-[var(--text-subtle)]">
          {filtered.length} de {juntas.length} {juntas.length === 1 ? 'junta' : 'juntas'}
        </p>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Crear nueva junta</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <FieldLabel>Título *</FieldLabel>
              <Input
                placeholder="Ej: Revisión semanal de operaciones..."
                value={createForm.titulo}
                onChange={(e) => setCreateForm((f) => ({ ...f, titulo: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Fecha y hora *</FieldLabel>
                <Input
                  type="datetime-local"
                  value={createForm.fecha_hora}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fecha_hora: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
              <div>
                <FieldLabel>Duración (min)</FieldLabel>
                <Input
                  type="number"
                  min="15"
                  step="15"
                  value={createForm.duracion_minutos}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, duracion_minutos: e.target.value }))
                  }
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Tipo</FieldLabel>
                <Combobox
                  value={createForm.tipo ?? ''}
                  onChange={(v) => setCreateForm((f) => ({ ...f, tipo: v }))}
                  options={Object.entries(TIPO_CONFIG).map(([k, v]) => ({
                    value: k,
                    label: `${v.icon} ${v.label}`,
                  }))}
                  placeholder="Sin tipo"
                  allowClear
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
              <div>
                <FieldLabel>Estado</FieldLabel>
                <Combobox
                  value={createForm.estado}
                  onChange={(v) => setCreateForm((f) => ({ ...f, estado: v as Junta['estado'] }))}
                  options={Object.entries(ESTADO_CONFIG).map(([k, v]) => ({
                    value: k,
                    label: v.label,
                  }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Lugar</FieldLabel>
              <Input
                placeholder="Ej: Sala de juntas, Zoom..."
                value={createForm.lugar}
                onChange={(e) => setCreateForm((f) => ({ ...f, lugar: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createForm.titulo.trim() || !createForm.fecha_hora}
              className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Crear junta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="rdb">
      <JuntasInner />
    </RequireAccess>
  );
}

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FilterCombobox } from '@/components/ui/filter-combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, RefreshCw, Loader2, CalendarDays, ChevronRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Junta = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  fecha_hora: string;
  duracion_minutos: number | null;
  lugar: string | null;
  estado: 'programada' | 'en_curso' | 'completada' | 'cancelada';
  tipo: string | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<Junta['estado'], { label: string; cls: string }> = {
  programada: { label: 'Programada', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  en_curso: { label: 'En curso', cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  completada: {
    label: 'Completada',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/50 border-[var(--border)]',
  },
  cancelada: { label: 'Cancelada', cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
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

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('fecha_hora', 'desc');
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Juntas</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">
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
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40"
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
        {error ? (
          <div role="alert" className="flex items-center justify-center p-16 text-red-400">
            Error: {error}
          </div>
        ) : loading ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="divide-y divide-[var(--border)]"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-5 w-20 ml-auto" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
            <span className="sr-only">Cargando juntas…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <CalendarDays className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">
              {juntas.length === 0
                ? 'No hay juntas registradas aún'
                : 'No hay juntas que coincidan con los filtros'}
            </p>
            {juntas.length === 0 && (
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="mt-4 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              >
                <Plus className="h-4 w-4" />
                Crear primera junta
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead
                  sortKey="titulo"
                  label="Título"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="tipo"
                  label="Tipo"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-24"
                />
                <SortableHead
                  sortKey="estado"
                  label="Estado"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-28"
                />
                <SortableHead
                  sortKey="fecha_hora"
                  label="Fecha y hora"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-48"
                />
                <SortableHead
                  sortKey="lugar"
                  label="Lugar"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-32"
                />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(filtered).map((junta) => (
                <TableRow
                  key={junta.id}
                  className="cursor-pointer border-[var(--border)] transition-colors hover:bg-[var(--panel)]"
                  onClick={() => router.push(`/inicio/juntas/${junta.id}`)}
                >
                  <TableCell>
                    <span className="line-clamp-1 font-medium text-[var(--text)]">
                      {junta.titulo}
                    </span>
                  </TableCell>
                  <TableCell>
                    {junta.tipo ? (
                      <span className="text-sm text-[var(--text)]/70">
                        {TIPO_CONFIG[junta.tipo]?.icon} {TIPO_CONFIG[junta.tipo]?.label}
                      </span>
                    ) : (
                      <span className="text-[var(--text)]/40">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <EstadoBadge estado={junta.estado} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70">
                      {formatDateTime(junta.fecha_hora)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70 line-clamp-1">
                      {junta.lugar ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-[var(--text)]/30" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && juntas.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">
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
                <Select
                  value={createForm.tipo ?? ''}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, tipo: v || '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.icon} {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Estado</FieldLabel>
                <Select
                  value={createForm.estado}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({ ...f, estado: v as Junta['estado'] }))
                  }
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

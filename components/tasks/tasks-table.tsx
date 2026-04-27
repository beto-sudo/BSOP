'use client';

/**
 * TasksTable — renders the tasks grid.
 *
 * Internamente usa `<DataTable>` (ADR-010). La API externa del componente
 * preserva las dos variantes:
 *
 *  - `variant="simple"` → rdb/inicio. 5 columns, no inline editing,
 *     no actions cell, row click opens edit.
 *  - `variant="rich"`   → DILESA. Adds actions cell (quick-complete +
 *     open updates), inline estado + avance editing (admin/direccion only),
 *     extra "Avance" + "Días" columns.
 *
 * El sort se maneja internamente con DataTable; los callers ya no
 * necesitan pasar `useSortableTable` props.
 */

import { Check, Loader2, MessageSquarePlus, Plus, TicketCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DataTable, type Column } from '@/components/module-page';
import { formatDate } from '@/lib/format';
import {
  Empleado,
  ErpTask,
  ESTADO_ORDER,
  EstadoBadge,
  PRIORIDAD_OPTIONS,
  PrioridadBadge,
  PrioridadTextBadge,
  ProgressBar,
  TaskEstado,
} from './tasks-shared';

export type SortableTask = ErpTask & {
  asignado_nombre: string | null;
  prioridad_peso: number | null;
};

export type TasksTableProps = {
  variant: 'simple' | 'rich';
  tasks: ErpTask[];
  totalCount: number;
  empleadoMap: Map<string, Empleado>;
  loading: boolean;
  error: string | null;
  onRowClick: (task: ErpTask) => void;
  onCreateEmpty?: () => void;

  // Rich-only ----------------------------------------------------------------
  /** Direccion or admin — unlocks the actions column + inline editing. */
  canEditInline?: boolean;
  /** Task id currently being quick-completed (shows spinner). */
  completingTaskId?: string | null;
  onQuickComplete?: (taskId: string) => void;
  onOpenUpdates?: (taskId: string) => void;
  onInlineEstadoChange?: (taskId: string, estado: TaskEstado) => void;
  onInlineAvanceChange?: (taskId: string, value: number) => void;
  inlineAvance?: { taskId: string; value: number } | null;
  setInlineAvance?: (v: { taskId: string; value: number } | null) => void;
};

export function TasksTable(props: TasksTableProps) {
  const { variant, totalCount, loading, error, onCreateEmpty } = props;

  // Empty state copy depends on whether the universe is truly empty or just
  // filtered out — DataTable receives the parametrized copy below.
  const emptyTitle =
    totalCount === 0 ? 'No hay tareas creadas aún' : 'No hay tareas que coincidan con los filtros';
  const emptyAction =
    totalCount === 0 && onCreateEmpty ? (
      <Button
        size="sm"
        onClick={onCreateEmpty}
        className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
      >
        <Plus className="h-4 w-4" />
        Crear primera tarea
      </Button>
    ) : undefined;

  const columns = variant === 'simple' ? buildSimpleColumns(props) : buildRichColumns(props);

  return (
    <DataTable<ErpTask>
      data={props.tasks}
      columns={columns as Column<ErpTask>[]}
      rowKey="id"
      loading={loading}
      error={error}
      onRowClick={props.onRowClick}
      initialSort={{ key: 'created_at', dir: 'desc' }}
      showDensityToggle={false}
      emptyIcon={<TicketCheck className="h-10 w-10 text-[var(--text)]/20" />}
      emptyTitle={emptyTitle}
      emptyAction={emptyAction}
    />
  );
}

// ─── Simple variant columns (rdb + inicio) ────────────────────────────────────

function buildSimpleColumns({ empleadoMap }: TasksTableProps): Column<ErpTask>[] {
  return [
    {
      key: 'titulo',
      label: 'Título',
      render: (task) => (
        <>
          <span className="line-clamp-1 font-medium text-[var(--text)]">{task.titulo}</span>
          {task.entidad_tipo && (
            <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
              {task.entidad_tipo}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      width: 'w-28',
      render: (task) => <EstadoBadge estado={task.estado} />,
    },
    {
      key: 'prioridad',
      label: 'Prioridad',
      width: 'w-28',
      accessor: (t) => {
        const idx = (PRIORIDAD_OPTIONS as readonly string[]).indexOf(t.prioridad ?? '');
        return idx === -1 ? null : idx;
      },
      render: (task) => <PrioridadBadge prioridad={task.prioridad} />,
    },
    {
      key: 'asignado_a',
      label: 'Asignado a',
      width: 'w-40',
      accessor: (t) => empleadoMap.get(t.asignado_a ?? '')?.nombre ?? null,
      cellClassName: 'text-sm text-[var(--text)]/70',
      render: (task) => empleadoMap.get(task.asignado_a ?? '')?.nombre ?? '—',
    },
    {
      key: 'fecha_vence',
      label: 'Vence',
      width: 'w-28',
      cellClassName: 'text-sm text-[var(--text)]/70',
      render: (task) => formatDate(task.fecha_vence),
    },
  ];
}

// ─── Rich variant columns (DILESA) ────────────────────────────────────────────

function buildRichColumns(props: TasksTableProps): Column<ErpTask>[] {
  const {
    empleadoMap,
    canEditInline = false,
    completingTaskId,
    onQuickComplete,
    onOpenUpdates,
    onInlineEstadoChange,
    onInlineAvanceChange,
    inlineAvance,
    setInlineAvance,
  } = props;

  const cols: Column<ErpTask>[] = [];

  if (canEditInline) {
    cols.push({
      key: 'actions',
      label: '',
      sortable: false,
      width: 'w-10',
      render: (task) => (
        <DataTable.InteractiveCell>
          <div className="flex items-center gap-1">
            {task.estado !== 'completado' && task.estado !== 'cancelado' ? (
              <button
                type="button"
                title="Completar tarea"
                disabled={completingTaskId === task.id}
                onClick={() => onQuickComplete?.(task.id)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 transition hover:bg-green-500/20 disabled:opacity-50"
              >
                {completingTaskId === task.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </button>
            ) : (
              <Check className="h-4 w-4 text-green-400/40" />
            )}
            <button
              type="button"
              title="Ver / agregar avances"
              onClick={() => onOpenUpdates?.(task.id)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
            >
              <MessageSquarePlus className="h-3 w-3" />
            </button>
          </div>
        </DataTable.InteractiveCell>
      ),
    });
  }

  cols.push({
    key: 'titulo',
    label: 'Tarea',
    width: 'min-w-[140px] max-w-[220px]',
    cellClassName: 'whitespace-normal',
    render: (task) => (
      <>
        <span className="line-clamp-1 font-medium text-[var(--text)]">{task.titulo}</span>
        <span className="mt-0.5 line-clamp-1 block text-xs text-[var(--text-subtle)]">
          {[task.departamento_nombre, task.descripcion].filter(Boolean).join(' · ') || ' '}
        </span>
      </>
    ),
  });

  cols.push({
    key: 'prioridad',
    label: 'Prioridad',
    width: 'min-w-[100px]',
    render: (task) => <PrioridadTextBadge text={task.prioridad} />,
  });

  cols.push({
    key: 'estado',
    label: 'Estado',
    width: 'min-w-[90px]',
    render: (task) => {
      if (canEditInline && task.estado !== 'completado' && task.estado !== 'cancelado') {
        return (
          <DataTable.InteractiveCell>
            <Popover>
              <PopoverTrigger className="cursor-pointer">
                <EstadoBadge estado={task.estado} />
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="start">
                <div className="flex flex-col gap-0.5">
                  {ESTADO_ORDER.map((est) => (
                    <button
                      key={est}
                      type="button"
                      onClick={() => onInlineEstadoChange?.(task.id, est)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--panel)] ${
                        task.estado === est ? 'bg-[var(--panel)]' : ''
                      }`}
                    >
                      <EstadoBadge estado={est} />
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </DataTable.InteractiveCell>
        );
      }
      return <EstadoBadge estado={task.estado} />;
    },
  });

  cols.push({
    key: 'porcentaje_avance',
    label: 'Avance',
    width: 'min-w-[90px]',
    accessor: (t) => t.porcentaje_avance ?? 0,
    render: (task) => {
      if (canEditInline) {
        return (
          <DataTable.InteractiveCell>
            <Popover
              open={inlineAvance?.taskId === task.id}
              onOpenChange={(open) => {
                if (open) {
                  setInlineAvance?.({ taskId: task.id, value: task.porcentaje_avance ?? 0 });
                } else if (inlineAvance && inlineAvance.taskId === task.id) {
                  onInlineAvanceChange?.(task.id, inlineAvance.value);
                }
              }}
            >
              <PopoverTrigger className="cursor-pointer">
                <ProgressBar value={task.porcentaje_avance ?? 0} />
              </PopoverTrigger>
              <PopoverContent className="w-48 p-3" align="start">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[var(--text)]/60">
                    <span>Avance</span>
                    <span className="font-medium text-[var(--text)]">
                      {inlineAvance?.taskId === task.id
                        ? inlineAvance.value
                        : (task.porcentaje_avance ?? 0)}
                      %
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={
                      inlineAvance?.taskId === task.id
                        ? inlineAvance.value
                        : (task.porcentaje_avance ?? 0)
                    }
                    onChange={(e) =>
                      setInlineAvance?.(
                        inlineAvance && inlineAvance.taskId === task.id
                          ? { ...inlineAvance, value: Number(e.target.value) }
                          : { taskId: task.id, value: Number(e.target.value) }
                      )
                    }
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </DataTable.InteractiveCell>
        );
      }
      return <ProgressBar value={task.porcentaje_avance ?? 0} />;
    },
  });

  cols.push({
    key: 'asignado_a',
    label: 'Responsable',
    width: 'min-w-[120px]',
    accessor: (t) => empleadoMap.get(t.asignado_a ?? '')?.nombre ?? null,
    cellClassName: 'text-xs text-[var(--text)]/70',
    render: (task) => (
      <span className="block truncate">
        {empleadoMap.get(task.asignado_a ?? '')?.nombre ?? '—'}
      </span>
    ),
  });

  cols.push({
    key: 'fecha_compromiso',
    label: 'Compromiso',
    width: 'min-w-[95px]',
    cellClassName: 'text-xs text-[var(--text)]/60',
    render: (task) => formatDate(task.fecha_compromiso),
  });

  cols.push({
    key: 'created_at',
    label: 'Días',
    width: 'min-w-[55px]',
    cellClassName: 'text-xs text-[var(--text)]/60',
    accessor: (t) => new Date(t.created_at).getTime(),
    render: (task) => {
      const days = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400000);
      return days === 0 ? 'Hoy' : `${days}d`;
    },
  });

  return cols;
}

'use client';

/**
 * TasksTable — renders the tasks grid.
 *
 * Variants:
 *  - `variant="simple"` → used by rdb/inicio. 5 columns, no inline editing,
 *     no actions cell, row click opens edit.
 *  - `variant="rich"`   → used by DILESA. Adds actions cell (quick-complete +
 *     open updates), inline estado + avance editing (admin/direccion only),
 *     extra "Avance" + "Días" columns.
 */

import { Check, Loader2, MessageSquarePlus, Plus, TicketCheck } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empleado,
  ErpTask,
  ESTADO_ORDER,
  EstadoBadge,
  formatDate,
  PRIORIDAD_OPTIONS,
  PrioridadBadge,
  PrioridadTextBadge,
  ProgressBar,
  TaskEstado,
} from './tasks-shared';

// ── Row type the table actually renders (after the enrichment step in parent)

export type SortableTask = ErpTask & {
  asignado_nombre: string | null;
  prioridad_peso: number | null;
};

type SortKey = string;
type SortDir = 'asc' | 'desc';

export type TasksTableProps = {
  variant: 'simple' | 'rich';
  tasks: ErpTask[];
  filteredCount: number;
  totalCount: number;
  empleadoMap: Map<string, Empleado>;
  loading: boolean;
  error: string | null;
  onRowClick: (task: ErpTask) => void;
  onCreateEmpty?: () => void;

  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  sortData: <T extends Record<string, unknown>>(rows: T[]) => T[];

  // Rich-only ------------------------------------------------------------------
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
  const { variant, filteredCount, totalCount, loading, error, onCreateEmpty } = props;

  if (error) {
    return <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>;
  }

  if (loading) {
    return (
      <div className="space-y-0 divide-y divide-[var(--border)]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-5 w-20 ml-auto" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (filteredCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <TicketCheck className="mb-3 h-10 w-10 text-[var(--text)]/20" />
        <p className="text-sm text-[var(--text)]/55">
          {totalCount === 0
            ? 'No hay tareas creadas aún'
            : 'No hay tareas que coincidan con los filtros'}
        </p>
        {totalCount === 0 && onCreateEmpty && (
          <Button
            size="sm"
            onClick={onCreateEmpty}
            className="mt-4 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
          >
            <Plus className="h-4 w-4" />
            Crear primera tarea
          </Button>
        )}
      </div>
    );
  }

  return variant === 'simple' ? <SimpleTable {...props} /> : <RichTable {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple variant (rdb + inicio)
// ─────────────────────────────────────────────────────────────────────────────

function SimpleTable({
  tasks,
  empleadoMap,
  onRowClick,
  sortKey,
  sortDir,
  onSort,
  sortData,
}: TasksTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-[var(--border)] hover:bg-transparent">
          <SortableHead sortKey="titulo" label="Título" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHead sortKey="estado" label="Estado" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
          <SortableHead sortKey="prioridad_peso" label="Prioridad" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
          <SortableHead sortKey="asignado_nombre" label="Asignado a" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-40" />
          <SortableHead sortKey="fecha_vence" label="Vence" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortData(
          tasks.map((t) => ({
            ...t,
            prioridad_peso: t.prioridad
              ? (PRIORIDAD_OPTIONS as readonly string[]).indexOf(t.prioridad)
              : null,
            asignado_nombre: empleadoMap.get(t.asignado_a ?? '')?.nombre ?? null,
          })),
        ).map((task) => {
          const empleado = empleadoMap.get(task.asignado_a ?? '');
          return (
            <TableRow
              key={task.id}
              className="cursor-pointer border-[var(--border)] transition-colors hover:bg-[var(--panel)]"
              onClick={() => onRowClick(task)}
            >
              <TableCell>
                <span className="line-clamp-1 font-medium text-[var(--text)]">{task.titulo}</span>
                {task.entidad_tipo && (
                  <span className="mt-0.5 block text-xs text-[var(--text)]/40">{task.entidad_tipo}</span>
                )}
              </TableCell>
              <TableCell>
                <EstadoBadge estado={task.estado} />
              </TableCell>
              <TableCell>
                <PrioridadBadge prioridad={task.prioridad} />
              </TableCell>
              <TableCell>
                <span className="text-sm text-[var(--text)]/70">{empleado ? empleado.nombre : '—'}</span>
              </TableCell>
              <TableCell>
                <span className="text-sm text-[var(--text)]/70">{formatDate(task.fecha_vence)}</span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rich variant (DILESA)
// ─────────────────────────────────────────────────────────────────────────────

function RichTable({
  tasks,
  empleadoMap,
  onRowClick,
  sortKey,
  sortDir,
  onSort,
  sortData,
  canEditInline = false,
  completingTaskId,
  onQuickComplete,
  onOpenUpdates,
  onInlineEstadoChange,
  onInlineAvanceChange,
  inlineAvance,
  setInlineAvance,
}: TasksTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-[var(--border)] hover:bg-transparent">
          {canEditInline && <TableHead className="w-10 min-w-[40px]" />}
          <SortableHead sortKey="titulo" label="Tarea" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[140px] max-w-[220px]" />
          <SortableHead sortKey="prioridad" label="Prioridad" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[100px]" />
          <SortableHead sortKey="estado" label="Estado" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[90px]" />
          <SortableHead sortKey="porcentaje_avance" label="Avance" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[90px]" />
          <SortableHead sortKey="asignado_nombre" label="Responsable" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[120px]" />
          <SortableHead sortKey="fecha_compromiso" label="Compromiso" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[95px]" />
          <SortableHead sortKey="created_at" label="Días" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[55px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortData(
          tasks.map((t) => ({
            ...t,
            asignado_nombre: empleadoMap.get(t.asignado_a ?? '')?.nombre ?? null,
          })),
        ).map((task) => {
          const empleado = empleadoMap.get(task.asignado_a ?? '');
          return (
            <TableRow
              key={task.id}
              className="cursor-pointer border-[var(--border)] transition-colors hover:bg-[var(--panel)]"
              onClick={() => onRowClick(task)}
            >
              {canEditInline && (
                <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
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
                </TableCell>
              )}

              <TableCell className="whitespace-normal">
                <span className="line-clamp-1 font-medium text-[var(--text)]">{task.titulo}</span>
                <span className="mt-0.5 block text-xs text-[var(--text)]/40 line-clamp-1">
                  {[task.departamento_nombre, task.descripcion].filter(Boolean).join(' · ') || ' '}
                </span>
              </TableCell>

              <TableCell>
                <PrioridadTextBadge text={task.prioridad} />
              </TableCell>

              {/* Inline estado editing */}
              <TableCell onClick={(e) => (canEditInline ? e.stopPropagation() : undefined)}>
                {canEditInline && task.estado !== 'completado' && task.estado !== 'cancelado' ? (
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
                            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--panel)] ${task.estado === est ? 'bg-[var(--panel)]' : ''}`}
                          >
                            <EstadoBadge estado={est} />
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <EstadoBadge estado={task.estado} />
                )}
              </TableCell>

              {/* Avance inline */}
              <TableCell onClick={(e) => (canEditInline ? e.stopPropagation() : undefined)}>
                {canEditInline ? (
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
                            {inlineAvance?.taskId === task.id ? inlineAvance.value : (task.porcentaje_avance ?? 0)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={
                            inlineAvance?.taskId === task.id ? inlineAvance.value : (task.porcentaje_avance ?? 0)
                          }
                          onChange={(e) =>
                            setInlineAvance?.(
                              inlineAvance && inlineAvance.taskId === task.id
                                ? { ...inlineAvance, value: Number(e.target.value) }
                                : { taskId: task.id, value: Number(e.target.value) },
                            )
                          }
                          className="w-full accent-[var(--accent)]"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <ProgressBar value={task.porcentaje_avance ?? 0} />
                )}
              </TableCell>

              <TableCell>
                <span className="text-xs text-[var(--text)]/70 truncate block">
                  {empleado ? empleado.nombre : '—'}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-[var(--text)]/60">{formatDate(task.fecha_compromiso)}</span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-[var(--text)]/60">
                  {(() => {
                    const days = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400000);
                    return days === 0 ? 'Hoy' : `${days}d`;
                  })()}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

'use client';

/**
 * TasksFiltersBar — presentational filters bar for TasksModule.
 *
 * Renders search + estado + prioridad + asignado filters (and depto in the
 * rich variant). State is owned by the parent; this component only accepts
 * values + setters and renders the UI.
 *
 * Extracted from tasks-module.tsx to keep that file under the 900 LOC
 * soft-limit. Behavior preserved 1:1.
 */

import { useMemo } from 'react';
import { Search } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

import {
  Combobox,
  ESTADO_CONFIG,
  PRIORIDAD_OPTIONS,
  type ComboboxOption,
  type Empleado,
  type ErpTask,
} from './tasks-shared';

export type TasksFiltersBarProps = {
  variant: 'simple' | 'rich';

  /** Task list — used to derive the set of available departments (rich only). */
  tasks: ErpTask[];

  // Search
  search: string;
  onSearchChange: (value: string) => void;

  // Estado
  filterEstado: string;
  onFilterEstadoChange: (value: string) => void;

  // Prioridad
  filterPrioridad: string;
  onFilterPrioridadChange: (value: string) => void;

  // Asignado
  filterAsignado: string;
  onFilterAsignadoChange: (value: string) => void;

  // Depto (rich only)
  filterDepto: string;
  onFilterDeptoChange: (value: string) => void;

  // Empleados — used for the simple-variant <Select> list and the rich-variant
  // Combobox options.
  empleados: Empleado[];
  empleadoOptions: ComboboxOption[];
};

export function TasksFiltersBar({
  variant,
  tasks,
  search,
  onSearchChange,
  filterEstado,
  onFilterEstadoChange,
  filterPrioridad,
  onFilterPrioridadChange,
  filterAsignado,
  onFilterAsignadoChange,
  filterDepto,
  onFilterDeptoChange,
  empleados,
  empleadoOptions,
}: TasksFiltersBarProps) {
  const isRich = variant === 'rich';

  const estadoOptions = useMemo<ComboboxOption[]>(
    () => Object.entries(ESTADO_CONFIG).map(([k, v]) => ({ id: k, label: v.label })),
    []
  );
  const prioridadOptions = useMemo<ComboboxOption[]>(
    () => PRIORIDAD_OPTIONS.map((p) => ({ id: p, label: p })),
    []
  );
  const deptoOptions = useMemo<ComboboxOption[]>(() => {
    if (!isRich) return [];
    const deptos = new Set<string>();
    tasks.forEach((t) => {
      if (t.departamento_nombre) {
        t.departamento_nombre.split(',').forEach((d) => {
          const trimmed = d.trim();
          if (trimmed) deptos.add(trimmed);
        });
      }
    });
    return [...deptos].sort().map((d) => ({ id: d, label: d }));
  }, [tasks, isRich]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            placeholder={
              isRich ? 'Buscar por título, descripción o responsable...' : 'Buscar tareas...'
            }
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>

        {isRich ? (
          <>
            <Combobox
              value={filterEstado}
              onChange={onFilterEstadoChange}
              options={estadoOptions}
              placeholder="Estado"
              searchPlaceholder="Buscar estado..."
              allowClear
              clearLabel="Todos"
              className="w-40"
            />
            <Combobox
              value={filterPrioridad}
              onChange={onFilterPrioridadChange}
              options={prioridadOptions}
              placeholder="Prioridad"
              searchPlaceholder="Buscar prioridad..."
              allowClear
              clearLabel="Todas"
              className="w-36"
            />
            <Combobox
              value={filterAsignado}
              onChange={onFilterAsignadoChange}
              options={empleadoOptions}
              placeholder="Asignado a"
              searchPlaceholder="Buscar responsable..."
              allowClear
              clearLabel="Todos"
              className="w-48"
            />
            <Combobox
              value={filterDepto}
              onChange={onFilterDeptoChange}
              options={deptoOptions}
              placeholder="Depto"
              searchPlaceholder="Buscar departamento..."
              allowClear
              clearLabel="Todos"
              className="w-44"
            />
          </>
        ) : (
          <>
            <Select value={filterEstado} onValueChange={(v) => onFilterEstadoChange(v ?? 'all')}>
              <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterPrioridad}
              onValueChange={(v) => onFilterPrioridadChange(v ?? 'all')}
            >
              <SelectTrigger className="w-36 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {PRIORIDAD_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterAsignado}
              onValueChange={(v) => onFilterAsignadoChange(v ?? 'all')}
            >
              <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue placeholder="Asignado a" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {empleados.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
    </div>
  );
}

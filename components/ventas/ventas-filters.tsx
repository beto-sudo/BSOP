'use client';

import { FilterCombobox } from '@/components/ui/filter-combobox';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw, CalendarDays } from 'lucide-react';
import { ActiveFiltersChip } from '@/components/module-page';
import type { CorteOption } from './types';
import { STATUS_OPTIONS } from './types';
import { formatDate } from './utils';

export type VentasFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  corteFilter: string;
  onCorteFilterChange: (value: string) => void;
  cortes: CorteOption[];
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  presetKey: string;
  onPresetChange: (preset: string | null) => void;
  loading: boolean;
  onRefresh: () => void;
  count: number;
  activeCount: number;
  onClearAll: () => void;
};

export function VentasFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  corteFilter,
  onCorteFilterChange,
  cortes,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  presetKey,
  onPresetChange,
  loading,
  onRefresh,
  count,
  activeCount,
  onClearAll,
}: VentasFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-52">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por folio o estado…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Combobox
        value={statusFilter}
        onChange={(v) => onStatusFilterChange(v || 'all')}
        options={STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
        className="w-44"
      />

      <FilterCombobox
        value={corteFilter}
        onChange={onCorteFilterChange}
        options={cortes.map((corte) => {
          const label = corte.corte_nombre
            ? `${corte.corte_nombre}`
            : `${corte.caja_nombre ?? 'Corte'} ${formatDate(corte.hora_inicio)}`;
          const estado = corte.estado?.toLowerCase() === 'abierto' ? ' 🟢' : '';
          return { id: corte.id, label: `${label}${estado}` };
        })}
        placeholder="Corte"
        searchPlaceholder="Buscar corte..."
        clearLabel="Todos los cortes"
        className="w-52"
      />

      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="w-36"
          aria-label="Fecha desde"
        />
        <span className="text-muted-foreground">—</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="w-36"
          aria-label="Fecha hasta"
        />
      </div>
      <Combobox
        value={presetKey}
        onChange={onPresetChange}
        options={[
          { value: 'hoy', label: 'Hoy' },
          { value: 'ayer', label: 'Ayer' },
          { value: 'semana', label: 'Esta semana' },
          { value: '7dias', label: 'Últimos 7 días' },
          { value: 'mes', label: 'Este mes' },
          { value: '30dias', label: 'Últimos 30 días' },
          { value: 'ano', label: 'Este año' },
        ]}
        placeholder="Rango..."
        className="w-[140px]"
      />

      <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Actualizar">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </Button>

      <ActiveFiltersChip count={activeCount} onClearAll={onClearAll} />

      <span className="text-sm text-muted-foreground">
        {loading ? 'Cargando…' : `${count} pedido${count !== 1 ? 's' : ''}`}
      </span>
    </div>
  );
}

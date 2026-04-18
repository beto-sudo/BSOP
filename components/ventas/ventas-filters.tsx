'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw, CalendarDays } from 'lucide-react';
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

      <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v ?? 'all')}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={corteFilter} onValueChange={(v) => onCorteFilterChange(v ?? 'all')}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Todos los cortes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los cortes</SelectItem>
          {cortes.map((corte) => {
            const label = corte.corte_nombre
              ? `${corte.corte_nombre}`
              : `${corte.caja_nombre ?? 'Corte'} ${formatDate(corte.hora_inicio)}`;
            const estado = corte.estado?.toLowerCase() === 'abierto' ? ' 🟢' : '';
            return (
              <SelectItem key={corte.id} value={corte.id}>
                {label}
                {estado}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

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
      <Select value={presetKey} onValueChange={onPresetChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Rango..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hoy">Hoy</SelectItem>
          <SelectItem value="ayer">Ayer</SelectItem>
          <SelectItem value="semana">Esta semana</SelectItem>
          <SelectItem value="7dias">Últimos 7 días</SelectItem>
          <SelectItem value="mes">Este mes</SelectItem>
          <SelectItem value="30dias">Últimos 30 días</SelectItem>
          <SelectItem value="ano">Este año</SelectItem>
          <SelectItem value="custom" className="hidden">
            Personalizado
          </SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Actualizar">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </Button>

      <span className="text-sm text-muted-foreground">
        {loading ? 'Cargando…' : `${count} pedido${count !== 1 ? 's' : ''}`}
      </span>
    </div>
  );
}

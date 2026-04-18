import { CalendarDays, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ESTADO_OPTIONS } from './types';

export function CortesFilters({
  estadoFilter,
  onEstadoChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  presetKey,
  onPresetChange,
  onRefresh,
  loading,
  filteredCount,
}: {
  estadoFilter: string;
  onEstadoChange: (v: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  presetKey: string;
  onPresetChange: (v: string | null) => void;
  onRefresh: () => void;
  loading: boolean;
  filteredCount: number;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select value={estadoFilter} onValueChange={(v) => onEstadoChange(v ?? 'all')}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ESTADO_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
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
        {loading ? 'Cargando…' : `${filteredCount} corte${filteredCount !== 1 ? 's' : ''}`}
      </span>
    </div>
  );
}

import { CalendarDays, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
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
      <Combobox
        value={estadoFilter}
        onChange={(v) => onEstadoChange(v || 'all')}
        options={ESTADO_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
        className="w-44"
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

      <span className="text-sm text-muted-foreground">
        {loading ? 'Cargando…' : `${filteredCount} corte${filteredCount !== 1 ? 's' : ''}`}
      </span>
    </div>
  );
}

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OccupancyHeatmap } from './occupancy-heatmap';
import type { OccupancyRow, ResourceRow, SportFilter } from './types';

export function OccupancySection({
  sportFilter,
  onSportFilterChange,
  filteredOccupancy,
  resources,
}: {
  sportFilter: SportFilter;
  onSportFilterChange: (value: SportFilter) => void;
  filteredOccupancy: OccupancyRow[];
  resources: ResourceRow[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Ocupación</h2>
          <p className="text-sm text-[var(--text)]/55">
            Vista cruzada de canchas por hora dentro del rango seleccionado.
          </p>
        </div>
        <div className="w-full max-w-[220px]">
          <Select
            value={sportFilter}
            onValueChange={(value) => onSportFilterChange(value as SportFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Filtrar deporte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los deportes</SelectItem>
              <SelectItem value="PADEL">Solo padel</SelectItem>
              <SelectItem value="TENNIS">Solo tennis</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <OccupancyHeatmap rows={filteredOccupancy} resources={resources} sportFilter={sportFilter} />
    </section>
  );
}

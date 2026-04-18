import { useMemo } from 'react';
import type { OccupancyRow, ResourceRow, SportFilter } from './types';
import { normalizeSport } from './utils';

export function OccupancyHeatmap({
  rows,
  resources,
  sportFilter,
}: {
  rows: OccupancyRow[];
  resources: ResourceRow[];
  sportFilter: SportFilter;
}) {
  const resourceSportMap = useMemo(
    () =>
      new Map(
        resources.map((resource) => [
          resource.resource_name ?? '',
          normalizeSport(resource.sport_id),
        ])
      ),
    [resources]
  );

  const filteredResources = useMemo(() => {
    const sorted = [...resources].sort((a, b) =>
      (a.resource_name ?? '').localeCompare(b.resource_name ?? '', 'es', { numeric: true })
    );
    return sorted.filter(
      (resource) => sportFilter === 'all' || normalizeSport(resource.sport_id) === sportFilter
    );
  }, [resources, sportFilter]);

  const hours = useMemo(() => {
    const found = Array.from(
      new Set(
        rows.map((row) => row.hora).filter((value): value is number => typeof value === 'number')
      )
    ).sort((a, b) => a - b);
    return found.length ? found : Array.from({ length: 18 }, (_, index) => index + 6);
  }, [rows]);

  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      const resourceName = row.resource_name ?? '';
      const sport = resourceSportMap.get(resourceName) ?? 'OTRO';
      if (sportFilter !== 'all' && sport !== sportFilter) return;
      if (row.hora == null) return;
      const key = `${resourceName}__${row.hora}`;
      map.set(key, (map.get(key) ?? 0) + (row.reservas ?? 0));
    });
    return map;
  }, [resourceSportMap, rows, sportFilter]);

  const maxReservations = Math.max(...Array.from(cellMap.values()), 1);

  const colorForValue = (value: number) => {
    if (!value) return 'rgba(148, 163, 184, 0.08)';
    const alpha = 0.18 + (value / maxReservations) * 0.72;
    return sportFilter === 'TENNIS'
      ? `rgba(14, 165, 233, ${alpha})`
      : `rgba(16, 185, 129, ${alpha})`;
  };

  return (
    <div className="overflow-x-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-[var(--text)]">Mapa de ocupación</div>
          <div className="text-sm text-[var(--text)]/55">
            Intensidad por hora y cancha. Más oscuro = más reservas.
          </div>
        </div>
        <div className="text-xs text-[var(--text)]/45">{filteredResources.length} canchas</div>
      </div>
      <div className="min-w-[760px]">
        <div
          className="grid"
          style={{ gridTemplateColumns: `180px repeat(${hours.length}, minmax(42px, 1fr))` }}
        >
          <div className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/45">
            Cancha
          </div>
          {hours.map((hour) => (
            <div
              key={hour}
              className="border-b border-[var(--border)] px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text)]/45"
            >
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
          {filteredResources.map((resource) => (
            <div key={resource.resource_id} className="contents">
              <div className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm text-[var(--text)]">
                <div className="font-medium">{resource.resource_name ?? 'Sin nombre'}</div>
                <div className="text-xs text-[var(--text)]/45">
                  {normalizeSport(resource.sport_id)}
                </div>
              </div>
              {hours.map((hour) => {
                const value = cellMap.get(`${resource.resource_name ?? ''}__${hour}`) ?? 0;
                return (
                  <div
                    key={`${resource.resource_id}-${hour}`}
                    className="flex h-12 items-center justify-center border-b border-[var(--border)] text-xs font-medium text-[var(--text)]"
                    style={{ backgroundColor: colorForValue(value) }}
                    title={`${resource.resource_name ?? 'Cancha'} · ${hour}:00 · ${value} reserva${value === 1 ? '' : 's'}`}
                  >
                    {value || ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

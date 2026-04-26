'use client';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ActiveFiltersChipProps {
  count: number;
  onClearAll: () => void;
  className?: string;
}

/**
 * Shows "N filtros activos" with a clear-all action. Renders nothing when
 * `count === 0`. Use as a child of `<ModuleFilters>` (typically last). See ADR-007.
 */
export function ActiveFiltersChip({ count, onClearAll, className }: ActiveFiltersChipProps) {
  if (count === 0) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClearAll}
      className={['gap-1.5 text-xs', className].filter(Boolean).join(' ')}
      aria-label={`Limpiar ${count} filtro${count !== 1 ? 's' : ''} activo${count !== 1 ? 's' : ''}`}
    >
      <span className="font-medium">
        {count} filtro{count !== 1 ? 's' : ''} activo{count !== 1 ? 's' : ''}
      </span>
      <X className="h-3 w-3" />
    </Button>
  );
}

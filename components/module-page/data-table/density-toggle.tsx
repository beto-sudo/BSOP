'use client';
import { Rows3, Rows4 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Density } from './types';

export interface DensityToggleProps {
  density: Density;
  onChange: (next: Density) => void;
}

/**
 * Toggle compact/comfortable density. See ADR-010 DT4.
 */
export function DensityToggle({ density, onChange }: DensityToggleProps) {
  const next: Density = density === 'compact' ? 'comfortable' : 'compact';
  const Icon = density === 'compact' ? Rows3 : Rows4;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => onChange(next)}
      aria-label={`Cambiar a densidad ${next}`}
      title={density === 'compact' ? 'Densidad cómoda' : 'Densidad compacta'}
    >
      <Icon className="size-4" />
    </Button>
  );
}

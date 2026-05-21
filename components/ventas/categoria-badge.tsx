'use client';

import { Badge } from '@/components/ui/badge';

// Badge de categoría con el color hex del catálogo. Sin color (incluida la
// fila "Sin categoría") cae a un badge outline neutro.
export function CategoriaBadge({ nombre, color }: { nombre: string; color: string | null }) {
  if (!color)
    return (
      <Badge variant="outline" className="text-xs">
        {nombre}
      </Badge>
    );
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}10`,
        color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {nombre}
    </span>
  );
}

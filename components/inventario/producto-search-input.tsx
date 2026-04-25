'use client';

import { useMemo } from 'react';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';

export interface ProductoOption {
  id: string;
  nombre: string;
  codigo?: string | null;
  unidad?: string | null;
  categoria?: string | null;
}

export interface ProductoSearchInputProps {
  productos: ProductoOption[];
  value: string | null;
  onChange: (productoId: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Combobox de productos con búsqueda fuzzy por nombre + código.
 * Scanner-USB friendly: el código de barras llega como typing rápido al
 * CommandInput y se filtra por keywords (incluye `codigo`).
 */
export function ProductoSearchInput({
  productos,
  value,
  onChange,
  placeholder = 'Buscar producto…',
  className,
  disabled,
}: ProductoSearchInputProps) {
  const options = useMemo<ComboboxOption[]>(
    () =>
      productos.map((p) => ({
        value: p.id,
        label: p.nombre,
        searchLabel: p.nombre,
        sub: [p.codigo, p.unidad, p.categoria].filter(Boolean).join(' · ') || undefined,
        keywords: [p.codigo, p.categoria, p.unidad].filter(
          (v): v is string => typeof v === 'string' && v.length > 0
        ),
      })),
    [productos]
  );

  return (
    <Combobox
      value={value ?? ''}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Nombre o código…"
      emptyText="Sin productos"
      className={className}
      disabled={disabled}
    />
  );
}

'use client';

/**
 * FilterCombobox — dropdown estándar de BSOP para filtros de tabla.
 *
 * Patrón:
 *   - Muestra el placeholder (e.g. "Estado", "Tipo") mientras el filtro está
 *     en "ver todo" — así en glance sabes QUÉ columna filtras.
 *   - Cuando seleccionas un valor, el trigger muestra el label de ese valor.
 *   - `allowClear` agrega una opción al tope del dropdown ("Todos" por
 *     default) que dispara `onChange('all')` y regresa al placeholder.
 *   - Con `searchPlaceholder` incluye input de búsqueda (shadcn Command).
 *
 * Convención de BSOP: el valor "all" representa "sin filtrar". Los filtros
 * aguas abajo tratan 'all' como no-op (`filter !== 'all' && row.x !== filter`).
 *
 * Estandarizar este componente en TODAS las tablas: cualquier tabla con
 * columnas filtrables por valores enum (estado, tipo, depto, categoría, etc.)
 * debe usarlo en vez de un <Select> con un SelectItem value="all"
 * "Todos los..." — ese patrón dejaba "all" literal visible en el trigger.
 */

import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export type FilterComboboxOption = { id: string; label: string };

export function FilterCombobox({
  value,
  onChange,
  options,
  placeholder = 'Filtrar...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Sin resultados',
  allowClear = true,
  clearLabel = 'Todos',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: FilterComboboxOption[];
  /** Texto que aparece cuando `value === 'all'` o vacío. Usar el nombre de la columna filtrada. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Agrega opción "Todos" al tope que resetea a `'all'`. Default true para filtros. */
  allowClear?: boolean;
  clearLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const isCleared = value === 'all' || value === '';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 h-9 text-sm hover:bg-[var(--panel)]/80 transition-colors ${className ?? 'w-full'}`}
      >
        <span className={`truncate ${selected ? '' : 'text-[var(--text)]/50'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-40" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value={`__clear__${clearLabel}`}
                  onSelect={() => {
                    onChange('all');
                    setOpen(false);
                  }}
                  data-checked={isCleared}
                >
                  {clearLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  data-checked={value === o.id}
                >
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

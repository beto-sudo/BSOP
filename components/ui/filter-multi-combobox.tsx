'use client';

/**
 * FilterMultiCombobox — variante multi-select del `FilterCombobox` estándar.
 *
 * Mismo trigger/anatomía que el single-select, pero cada opción TOGGLEA sin
 * cerrar el popover y el valor es un array de ids. Semántica aguas abajo:
 * la fila debe cumplir TODAS las opciones seleccionadas (AND) — el array
 * vacío significa "sin filtrar".
 *
 * Trigger:
 *   - `[]`            → placeholder (nombre de la columna filtrada).
 *   - 1 seleccionada  → su label.
 *   - N seleccionadas → "label +N-1" (e.g. "Esquina +2").
 *
 * "Todos" al tope limpia la selección (onChange([])).
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
import type { FilterComboboxOption } from '@/components/ui/filter-combobox';

export function FilterMultiCombobox({
  value,
  onChange,
  options,
  placeholder = 'Filtrar...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Sin resultados',
  clearLabel = 'Todas',
  className,
}: {
  value: readonly string[];
  onChange: (v: string[]) => void;
  options: readonly FilterComboboxOption[];
  /** Texto que aparece sin selección. Usar el nombre de la columna filtrada. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.id));
  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]!.label
        : `${selected[0]!.label} +${selected.length - 1}`;

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 h-9 text-sm hover:bg-[var(--panel)]/80 transition-colors ${className ?? 'w-full'}`}
      >
        <span className={`truncate ${selected.length > 0 ? '' : 'text-[var(--text)]/50'}`}>
          {triggerLabel}
        </span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-40" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`__clear__${clearLabel}`}
                onSelect={() => {
                  onChange([]);
                  setOpen(false);
                }}
                data-checked={value.length === 0}
              >
                {clearLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.label}
                  onSelect={() => toggle(o.id)}
                  data-checked={value.includes(o.id)}
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

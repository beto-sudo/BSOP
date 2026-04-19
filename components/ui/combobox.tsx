'use client';

import * as React from 'react';
import { ChevronDownIcon, XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export interface ComboboxOption {
  value: string;
  label: string;
  sub?: string;
  keywords?: string[];
  disabled?: boolean;
}

export interface ComboboxProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  size?: 'sm' | 'default';
  id?: string;
  name?: string;
  'aria-label'?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados',
  disabled = false,
  className,
  allowClear = false,
  size = 'default',
  id,
  name,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => options.find((o) => o.value === value), [options, value]);
  const displayLabel = selected?.label ?? (value ? '' : '');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(triggerProps) => (
          <button
            {...triggerProps}
            type="button"
            id={id}
            name={name}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              'flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent pr-2 pl-2.5 text-left text-sm whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
              size === 'sm' ? 'h-7' : 'h-8',
              className
            )}
          >
            <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>
              {selected ? displayLabel : placeholder}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              {allowClear && selected && !disabled && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Limpiar selección"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange('');
                  }}
                  className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </span>
              )}
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </span>
          </button>
        )}
      />
      <PopoverContent
        align="start"
        sideOffset={4}
        className="min-w-(--anchor-width) max-w-[min(calc(100vw-1rem),28rem)] w-auto p-0 gap-0"
      >
        <Command
          filter={(itemValue, search, keywords) => {
            const haystack = `${itemValue} ${(keywords ?? []).join(' ')}`.toLowerCase();
            const needle = search.toLowerCase().trim();
            if (!needle) return 1;
            return haystack.includes(needle) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  keywords={[opt.label, ...(opt.keywords ?? []), ...(opt.sub ? [opt.sub] : [])]}
                  disabled={opt.disabled}
                  data-checked={opt.value === value ? 'true' : 'false'}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{opt.label}</span>
                    {opt.sub && (
                      <span className="truncate text-xs text-muted-foreground">{opt.sub}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

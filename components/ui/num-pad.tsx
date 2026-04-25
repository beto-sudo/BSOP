'use client';

import { Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NumPadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  /** Quick values that paste a whole number (e.g. [0, 0.25, 0.5, 1, 5, 10]). */
  quickValues?: number[];
  className?: string;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0'] as const;

export function NumPad({ value, onChange, onSubmit, quickValues, className }: NumPadProps) {
  const append = (k: string) => {
    if (k === '.' && value.includes('.')) return;
    if (value === '0' && k !== '.') {
      onChange(k);
      return;
    }
    onChange(value + k);
  };

  const backspace = () => {
    if (value.length <= 1) {
      onChange('0');
      return;
    }
    onChange(value.slice(0, -1));
  };

  const setQuick = (n: number) => {
    onChange(String(n));
  };

  return (
    <div className={cn('w-full select-none', className)}>
      {quickValues && quickValues.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {quickValues.map((n) => (
            <Button
              key={n}
              type="button"
              variant="outline"
              size="sm"
              className="min-w-[3rem] tabular-nums"
              onClick={() => setQuick(n)}
            >
              {n}
            </Button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <Button
            key={k}
            type="button"
            variant="outline"
            className="h-14 text-2xl tabular-nums"
            onClick={() => append(k)}
          >
            {k}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="h-14"
          onClick={backspace}
          aria-label="Borrar último dígito"
        >
          <Delete className="size-5" />
        </Button>
      </div>
      {onSubmit && (
        <Button type="button" className="mt-3 h-14 w-full text-base" onClick={onSubmit}>
          Aceptar
        </Button>
      )}
    </div>
  );
}

'use client';

import * as React from 'react';
import {
  Controller,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  useFormContext,
} from 'react-hook-form';

import { FieldLabel } from '@/components/ui/field-label';
import { cn } from '@/lib/utils';

export type FormFieldRenderProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControllerRenderProps<TFieldValues, TName> & {
  /** Stable id derived from the field name — bind to the input via `id={field.id}`. */
  id: string;
  /** Convenience flag: true when the field has an active error. */
  invalid: boolean;
  /** Set as `aria-describedby` on the input — points to the error/description text. */
  describedBy?: string;
};

export type FormFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  name: TName;
  label?: React.ReactNode;
  required?: boolean;
  description?: React.ReactNode;
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean;
  className?: string;
  children: (field: FormFieldRenderProps<TFieldValues, TName>) => React.ReactElement;
};

/**
 * `<FormField>` — single source of truth for label + control + error + a11y.
 *
 * - Wires `react-hook-form`'s `Controller` so non-native inputs (Combobox,
 *   Textarea, Select) work out of the box.
 * - Generates a stable `id` from the field name and binds it to the
 *   `<FieldLabel>` via `htmlFor`. The render-prop receives `id` so the
 *   caller forwards it to the input.
 * - Hooks up `aria-invalid` + `aria-describedby` when an error is present.
 * - Errors render below the input (ADR-008 T2 — never alerts/toasts for
 *   validation feedback).
 */
export function FormField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  name,
  label,
  required,
  description,
  hideLabel,
  className,
  children,
}: FormFieldProps<TFieldValues, TName>) {
  const { control } = useFormContext<TFieldValues>();
  const reactId = React.useId();
  const id = `f-${reactId}-${name}`;
  const errorId = `${id}-error`;
  const descId = description ? `${id}-desc` : undefined;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const invalid = !!fieldState.error;
        const describedBy =
          [invalid ? errorId : null, descId].filter(Boolean).join(' ') || undefined;

        const enriched: FormFieldRenderProps<TFieldValues, TName> = {
          ...field,
          id,
          invalid,
          describedBy,
        };

        return (
          <div className={cn('space-y-1.5', className)}>
            {label ? (
              <FieldLabel
                htmlFor={id}
                required={required}
                className={hideLabel ? 'sr-only' : undefined}
              >
                {label}
              </FieldLabel>
            ) : null}

            {children(enriched)}

            {description ? (
              <p id={descId} className="text-xs text-[var(--text)]/50">
                {description}
              </p>
            ) : null}

            {invalid ? (
              <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
                {fieldState.error?.message ?? 'Campo inválido'}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}

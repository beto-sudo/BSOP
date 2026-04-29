'use client';

import { Loader2 } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FormActionsProps = {
  /** Cancel button label. Defaults to "Cancelar". */
  cancelLabel?: string;
  /** Idle submit label. Defaults to "Guardar". */
  submitLabel?: string;
  /** Submitting submit label. Defaults to "Guardando...". */
  submittingLabel?: string;
  /** Hide the cancel button (e.g. when the dialog is closed via X only). */
  hideCancel?: boolean;
  /** Called when the cancel button is pressed. */
  onCancel?: () => void;
  /** Force-disable the submit button beyond `formState.isSubmitting`. */
  submitDisabled?: boolean;
  /** Visual variant of the submit button. */
  submitVariant?: ComponentProps<typeof Button>['variant'];
  /** Optional leading icon inside the submit button (replaced by spinner while submitting). */
  submitIcon?: ReactNode;
  /** Custom className on the wrapper. */
  className?: string;
  /** Stretch buttons to fill width (drawer/sheet style). Defaults to false. */
  stretch?: boolean;
};

/**
 * `<FormActions>` — standardized submit/cancel buttons for `<Form>`.
 *
 * Auto-detects `formState.isSubmitting` from context: shows the spinner,
 * disables both buttons, swaps the label to "Guardando..." (or
 * `submittingLabel`).
 *
 * Copy convention: "Cancelar" / "Guardar" / "Guardando...". Override only
 * when the action verb is materially different (e.g. "Crear tarea",
 * "Aprobar", "Enviar a revisión") — keep the verb consistent with the
 * action being taken, not generic.
 */
export function FormActions({
  cancelLabel = 'Cancelar',
  submitLabel = 'Guardar',
  submittingLabel = 'Guardando...',
  hideCancel,
  onCancel,
  submitDisabled,
  submitVariant = 'default',
  submitIcon,
  className,
  stretch,
}: FormActionsProps) {
  const { formState } = useFormContext();
  const submitting = formState.isSubmitting;

  return (
    <div
      className={cn(
        'flex items-center gap-2 pt-4 border-t border-[var(--border)]',
        stretch ? '' : 'justify-end',
        className
      )}
    >
      {!hideCancel ? (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          className={stretch ? 'flex-1' : undefined}
        >
          {cancelLabel}
        </Button>
      ) : null}
      <Button
        type="submit"
        variant={submitVariant}
        disabled={submitting || submitDisabled}
        className={cn('gap-1.5', stretch && 'flex-1')}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : submitIcon ? (
          submitIcon
        ) : null}
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </div>
  );
}

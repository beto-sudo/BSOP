'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useWizard } from './wizard-context';

export type WizardActionsProps = {
  /** Submit button copy on the last step. Default `'Guardar'`. */
  submitLabel?: React.ReactNode;
  /** Submit button copy while the caller's `onSubmit` runs. Default `'Guardando...'`. */
  submittingLabel?: React.ReactNode;
  /** Optional cancel button on the left. */
  cancelLabel?: React.ReactNode;
  onCancel?: () => void;
  /**
   * Force-disable the primary action beyond `submitting`. Use when the
   * caller has cross-step preconditions to block submit (e.g. file
   * uploads in progress). Validation gates are NOT pre-empted here —
   * zod errors should drive feedback, not button disable.
   */
  submitDisabled?: boolean;
  /** Stretch buttons full-width (recommended in drawers). Default `false`. */
  stretch?: boolean;
  className?: string;
};

/**
 * `<WizardActions>` — footer Atrás/Siguiente/Submit for `<Wizard>`.
 *
 * Auto-detects state from `<Wizard>` context:
 * - First step → "Atrás" disabled.
 * - Not last step → primary button shows "Siguiente" with right-chevron, calls `goNext()`.
 * - Last step → primary button shows `submitLabel`, type="submit" so the surrounding
 *   `<form>` triggers the wizard's submit handler.
 * - `submitting` → primary disabled, spinner + `submittingLabel`.
 *
 * Sized to live inside a `<DetailDrawer footer={<WizardActions ... />}>` —
 * the drawer adds its own border-top + padding, so this component only
 * lays out the buttons.
 */
export function WizardActions({
  submitLabel = 'Guardar',
  submittingLabel = 'Guardando...',
  cancelLabel,
  onCancel,
  submitDisabled,
  stretch = false,
  className,
}: WizardActionsProps) {
  const { isFirstStep, isLastStep, goBack, goNext, submitting } = useWizard();
  const showCancel = cancelLabel != null && onCancel != null;

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <div className="flex items-center gap-2">
        {showCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={submitting}
            className={cn('rounded-xl text-[var(--text)]', stretch && 'flex-1')}
          >
            {cancelLabel}
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={goBack}
          disabled={isFirstStep || submitting}
          className={cn(
            'gap-1.5 rounded-xl border-[var(--border)] text-[var(--text)]',
            stretch && 'flex-1'
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Atrás
        </Button>

        {isLastStep ? (
          <Button
            type="submit"
            disabled={submitting || submitDisabled}
            className={cn(
              'gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60',
              stretch && 'flex-1'
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {submittingLabel}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => {
              void goNext();
            }}
            disabled={submitting}
            className={cn(
              'gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90',
              stretch && 'flex-1'
            )}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import type { FieldErrors, FieldValues } from 'react-hook-form';

import { cn } from '@/lib/utils';

import { useWizard } from './wizard-context';

export type WizardStepperProps = {
  className?: string;
  /**
   * When `true`, shows a small "N pendiente(s)" subtitle under each step
   * label that already has been visited but still has errors. Default `true`.
   */
  showPending?: boolean;
};

/**
 * `<WizardStepper>` — step indicator rendered at the top of the wizard.
 *
 * Reads steps + active state from `<Wizard>` context. Each step button:
 * - active → accent fill with the step number.
 * - complete (visited + no errors in its fields) → green check.
 * - inactive/pending → muted number outline.
 *
 * Tapping a step jumps to it via `goTo()`. Forward jumps still validate
 * intermediate steps in `<Wizard>`'s `tryAdvance` logic — this control
 * only allows jumping back to a previously visited step or to the next
 * one when the current one is valid (handled by `<Wizard>`).
 */
export function WizardStepper({ className, showPending = true }: WizardStepperProps) {
  const { steps, currentStepIdx, goTo, form } = useWizard();
  const errors = form.formState.errors as FieldErrors<FieldValues>;

  const stepErrorCount = (fields: ReadonlyArray<string>): number =>
    fields.reduce((acc, name) => (errors[name as keyof typeof errors] ? acc + 1 : acc), 0);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-b border-[var(--border)] pb-4',
        className
      )}
      role="list"
      aria-label="Pasos del formulario"
    >
      {steps.map((s, idx) => {
        const isActive = idx === currentStepIdx;
        const isVisited = idx < currentStepIdx;
        const errCount = stepErrorCount(s.fields as ReadonlyArray<string>);
        const isComplete = isVisited && errCount === 0;
        const isPending = isVisited && errCount > 0;
        return (
          <div key={s.id} role="listitem" className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => goTo(s.id)}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition',
                isActive && 'bg-[var(--accent)] text-white',
                !isActive && isComplete && 'bg-green-500/15 text-green-400',
                !isActive &&
                  !isComplete &&
                  'bg-[var(--panel)] text-[var(--text)]/50 border border-[var(--border)]'
              )}
              title={`Ir al paso ${idx + 1}`}
            >
              {isComplete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : idx + 1}
            </button>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-xs font-medium',
                  isActive ? 'text-[var(--text)]' : 'text-[var(--text)]/50'
                )}
              >
                {s.label}
              </p>
              {showPending && isPending && (
                <p className="text-[10px] text-red-400">{errCount} pendiente(s)</p>
              )}
            </div>
            {idx < steps.length - 1 && <div className="h-px flex-1 bg-[var(--border)]" />}
          </div>
        );
      })}
    </div>
  );
}

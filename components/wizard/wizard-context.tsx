'use client';

import * as React from 'react';
import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * Shape of a step extracted from a `<WizardStep>` element. Built once per
 * render by `<Wizard>` from its direct children, then passed via context to
 * the stepper / actions / nav helpers.
 */
export type WizardStepDescriptor<TFieldValues extends FieldValues = FieldValues> = {
  id: string;
  label: React.ReactNode;
  /** Fields validated by `form.trigger(fields)` before advancing this step. */
  fields: ReadonlyArray<FieldPath<TFieldValues>>;
};

export type WizardContextValue<TFieldValues extends FieldValues = FieldValues> = {
  steps: ReadonlyArray<WizardStepDescriptor<TFieldValues>>;
  currentStepIdx: number;
  currentStepId: string;
  isFirstStep: boolean;
  isLastStep: boolean;
  /** Advance after validating the current step. No-op (with errors shown) if invalid. */
  goNext: () => Promise<void>;
  /** Step back (no validation). */
  goBack: () => void;
  /** Jump to a step by id. Used by `<WizardStepper>` taps and post-submit error nav. */
  goTo: (stepId: string) => void;
  /** True once the user attempted to advance — toggles inline error visibility. */
  showErrors: boolean;
  /** True while the caller's `onSubmit` is running. */
  submitting: boolean;
  /** RHF form handle — `<WizardActions>` reads `form.formState.isSubmitting`. */
  form: UseFormReturn<TFieldValues>;
};

const WizardContext = React.createContext<WizardContextValue | null>(null);

export function WizardContextProvider<TFieldValues extends FieldValues>({
  value,
  children,
}: {
  value: WizardContextValue<TFieldValues>;
  children: React.ReactNode;
}) {
  return (
    <WizardContext.Provider value={value as unknown as WizardContextValue}>
      {children}
    </WizardContext.Provider>
  );
}

/**
 * `useWizard()` — read the active step + nav helpers from inside any
 * descendant of `<Wizard>`. Throws if called outside a wizard.
 */
export function useWizard<
  TFieldValues extends FieldValues = FieldValues,
>(): WizardContextValue<TFieldValues> {
  const ctx = React.useContext(WizardContext);
  if (!ctx) {
    throw new Error('useWizard must be used inside a <Wizard> component');
  }
  return ctx as unknown as WizardContextValue<TFieldValues>;
}

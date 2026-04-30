'use client';

import * as React from 'react';
import {
  FormProvider,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import { cn } from '@/lib/utils';

import { WizardContextProvider, type WizardStepDescriptor } from './wizard-context';
import type { WizardStepProps } from './wizard-step';

export type WizardProps<TFieldValues extends FieldValues> = {
  /** RHF form handle from `useZodForm` (or any compatible `useForm`). */
  form: UseFormReturn<TFieldValues>;
  /**
   * Called once the user submits on the last step AND all steps' fields
   * pass validation. Receives typed values from the unified zod schema.
   */
  onSubmit: SubmitHandler<TFieldValues>;
  /**
   * Children must include `<WizardStep>` elements (one per step) and may
   * include `<WizardStepper>` and `<WizardActions>` placed wherever the
   * caller wants them. Any other element is rendered in place.
   */
  children: React.ReactNode;
  className?: string;
  id?: string;
};

function isWizardStepElement<TFieldValues extends FieldValues>(
  el: React.ReactNode
): el is React.ReactElement<WizardStepProps<TFieldValues>> {
  if (!React.isValidElement(el)) return false;
  const type = el.type as { displayName?: string } | string;
  return typeof type !== 'string' && type.displayName === 'WizardStep';
}

/**
 * `<Wizard>` — multi-step form orchestrator built on `react-hook-form`.
 *
 * Wraps a single `useForm` instance (one zod schema covering all steps) and
 * coordinates step navigation with per-step partial validation.
 *
 * Anatomy:
 *
 *   <Wizard form={form} onSubmit={handleSubmit}>
 *     <WizardStepper />
 *     <WizardStep id="identidad" label="Identidad" fields={['nombre','rfc']}>...</WizardStep>
 *     <WizardStep id="puesto"    label="Puesto"    fields={['departamento_id']}>...</WizardStep>
 *     <WizardStep id="expediente" label="Expediente" fields={[]}>...</WizardStep>
 *     <WizardActions submitLabel="Crear" submittingLabel="Creando..." />
 *   </Wizard>
 *
 * Behavior:
 *
 * - Active `<WizardStep>` children render in place; inactive steps are
 *   not mounted (zero render cost off-screen).
 * - "Siguiente" calls `form.trigger(currentStep.fields)`. If invalid,
 *   `showErrors` flips to `true` and the wizard stays put. Step body
 *   reads `showErrors` via `useWizard()` if it wants to render summary
 *   error chips.
 * - On the last step, "Submit" calls `form.trigger()` over ALL fields.
 *   If any step has errors, the wizard navigates to the first such step
 *   and shows errors. Otherwise calls `onSubmit(values)`.
 * - `submitting` reflects the caller's async `onSubmit` — auto-disables
 *   nav buttons via `<WizardActions>`.
 *
 * The wizard does NOT manage mutations or rollback. The caller's
 * `onSubmit` owns the entire submit pipeline (inserts + storage uploads
 * + rollback). See ADR-025 W4.
 */
export function Wizard<TFieldValues extends FieldValues>({
  form,
  onSubmit,
  children,
  className,
  id,
}: WizardProps<TFieldValues>) {
  const childArray = React.Children.toArray(children);

  // Pass 1: extract step descriptors for context (stepper + nav helpers).
  // Memoized on `children` so step nav callbacks below stay stable across
  // re-renders that don't change the step structure.
  const steps = React.useMemo(() => {
    const out: WizardStepDescriptor<TFieldValues>[] = [];
    React.Children.forEach(children, (child) => {
      if (isWizardStepElement<TFieldValues>(child)) {
        out.push({
          id: child.props.id,
          label: child.props.label,
          fields: child.props.fields,
        });
      }
    });
    return out;
  }, [children]);

  if (steps.length === 0) {
    throw new Error(
      '<Wizard> requires at least one <WizardStep> child. Got: ' +
        childArray.length +
        ' children with no <WizardStep>.'
    );
  }

  const [currentStepIdx, setCurrentStepIdx] = React.useState(0);
  const [showErrors, setShowErrors] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Clamp on hot-reload / step-list shrinkage.
  React.useEffect(() => {
    if (currentStepIdx >= steps.length) {
      setCurrentStepIdx(Math.max(0, steps.length - 1));
    }
  }, [currentStepIdx, steps.length]);

  const currentStep = steps[Math.min(currentStepIdx, steps.length - 1)];
  const isFirstStep = currentStepIdx === 0;
  const isLastStep = currentStepIdx === steps.length - 1;

  const goBack = React.useCallback(() => {
    setShowErrors(false);
    setCurrentStepIdx((idx) => Math.max(0, idx - 1));
  }, []);

  const goNext = React.useCallback(async () => {
    const fields = currentStep.fields;
    const ok = fields.length === 0 ? true : await form.trigger(fields as FieldPath<TFieldValues>[]);
    if (!ok) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setCurrentStepIdx((idx) => Math.min(steps.length - 1, idx + 1));
  }, [currentStep.fields, form, steps.length]);

  const goTo = React.useCallback(
    (stepId: string) => {
      const idx = steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return;
      setShowErrors(false);
      setCurrentStepIdx(idx);
    },
    [steps]
  );

  const handleFormSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!isLastStep) {
        await goNext();
        return;
      }
      const ok = await form.trigger();
      if (!ok) {
        const errors = form.formState.errors as FieldErrors<TFieldValues>;
        const firstStepWithError = steps.findIndex((s) =>
          (s.fields as ReadonlyArray<string>).some(
            (name) => errors[name as keyof typeof errors] != null
          )
        );
        if (firstStepWithError >= 0) {
          setCurrentStepIdx(firstStepWithError);
        }
        setShowErrors(true);
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit(form.getValues());
      } finally {
        setSubmitting(false);
      }
    },
    [form, goNext, isLastStep, onSubmit, steps]
  );

  // Pass 2: render children, swapping inactive `<WizardStep>`s with `null`
  // and unwrapping the active step's body.
  let stepCounter = -1;
  const renderedChildren = childArray.map((child) => {
    if (!isWizardStepElement<TFieldValues>(child)) return child;
    stepCounter += 1;
    if (stepCounter !== currentStepIdx) return null;
    const props = child.props;
    return (
      <div key={props.id} className={cn('space-y-4', props.className)} data-wizard-step={props.id}>
        {props.description ? (
          <p className="text-xs text-[var(--text-muted)]">{props.description}</p>
        ) : null}
        {props.children}
      </div>
    );
  });

  return (
    <FormProvider {...form}>
      <WizardContextProvider
        value={{
          steps,
          currentStepIdx,
          currentStepId: currentStep.id,
          isFirstStep,
          isLastStep,
          goNext,
          goBack,
          goTo,
          showErrors,
          submitting,
          form,
        }}
      >
        <form id={id} noValidate onSubmit={handleFormSubmit} className={cn('space-y-5', className)}>
          {renderedChildren}
        </form>
      </WizardContextProvider>
    </FormProvider>
  );
}

// Re-export for convenience: most callers import `<Wizard>` + `<WizardStep>` together.
export { WizardStep } from './wizard-step';

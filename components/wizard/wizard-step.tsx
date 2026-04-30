'use client';

import * as React from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';

import { useWizard } from './wizard-context';

export type WizardStepProps<TFieldValues extends FieldValues = FieldValues> = {
  /** Stable id used for nav (`goTo(id)`) and as a render key. */
  id: string;
  /** Label shown in `<WizardStepper>`. */
  label: React.ReactNode;
  /**
   * Field paths validated by `form.trigger(fields)` when the user advances
   * past this step. Empty array = step has no validation gate.
   */
  fields: ReadonlyArray<FieldPath<TFieldValues>>;
  /** Optional copy shown above the body when active. */
  description?: React.ReactNode;
  /** Additional classes for the step body wrapper. */
  className?: string;
  children: React.ReactNode;
};

/**
 * `<WizardStep>` — declarative slot for one step of a multi-step wizard.
 *
 * Rendered as a child of `<Wizard>`. The wizard scans its children at render
 * time, extracts each step's `{id, label, fields}` into a descriptor list,
 * and renders the active step's `children` only. Inactive steps are not
 * mounted, so heavy step bodies don't pay a render cost when off-screen.
 *
 * Note: `<WizardStep>` returns `null` when called directly. The wizard
 * pulls `children` off `props` and renders them inside its own layout.
 */
export function WizardStep<TFieldValues extends FieldValues = FieldValues>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- props consumed by <Wizard> via React.Children scan; this component is a marker
  _props: WizardStepProps<TFieldValues>
): React.ReactElement | null {
  return null;
}

/**
 * Tag used by `<Wizard>` to identify `<WizardStep>` children at render time.
 * Cheaper than `child.type === WizardStep` in scenarios where the component
 * gets re-imported or wrapped by HOCs/dev tooling.
 */
WizardStep.displayName = 'WizardStep';

/**
 * Convenience hook for step bodies — returns `true` when this step's id
 * matches the active step. Useful for conditional auto-focus or one-time
 * effects keyed to step entry.
 */
export function useIsActiveStep(stepId: string): boolean {
  const { currentStepId } = useWizard();
  return currentStepId === stepId;
}

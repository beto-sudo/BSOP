'use client';

import * as React from 'react';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';

export type UseDirtyConfirmProps = {
  /** Read from `form.formState.isDirty`. */
  isDirty: boolean;
  /** Called when the user confirms the close (or when not dirty). */
  onConfirmClose: () => void;
  /** Override the default copy. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * `useDirtyConfirm` — gate drawer/sheet/dialog close on a dirty form.
 *
 * Returns a `requestClose()` callback to wire into the `onOpenChange`
 * handler of the surrounding container, plus a `confirmDialog` JSX node
 * to render somewhere inside it. If the form is not dirty, `requestClose`
 * fires `onConfirmClose` immediately.
 *
 * Pairs with `<ConfirmDialog>` (ADR-008) — same visual + a11y treatment
 * as destructive confirmations across the app.
 *
 * Usage:
 *
 *   const { requestClose, confirmDialog } = useDirtyConfirm({
 *     isDirty: form.formState.isDirty,
 *     onConfirmClose: () => setOpen(false),
 *   });
 *
 *   <Sheet open={open} onOpenChange={(v) => (v ? setOpen(true) : requestClose())}>
 *     {confirmDialog}
 *     ...
 *   </Sheet>
 */
export function useDirtyConfirm({
  isDirty,
  onConfirmClose,
  title = '¿Descartar cambios?',
  description = 'Tienes cambios sin guardar. Si cierras ahora se perderán.',
  confirmLabel = 'Descartar',
  cancelLabel = 'Seguir editando',
}: UseDirtyConfirmProps) {
  const [open, setOpen] = React.useState(false);

  const requestClose = React.useCallback(() => {
    if (isDirty) {
      setOpen(true);
    } else {
      onConfirmClose();
    }
  }, [isDirty, onConfirmClose]);

  const handleConfirm = React.useCallback(() => {
    setOpen(false);
    onConfirmClose();
  }, [onConfirmClose]);

  const confirmDialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      onConfirm={handleConfirm}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      confirmVariant="destructive"
    />
  );

  return { requestClose, confirmDialog };
}

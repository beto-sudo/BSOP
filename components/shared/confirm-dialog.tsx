'use client';

import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { VariantProps } from 'class-variance-authority';

type ConfirmButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;

export type ConfirmDialogProps = {
  /** Controlled open state. */
  open: boolean;
  /** Called when the user cancels or the dialog is dismissed. */
  onOpenChange: (open: boolean) => void;
  /**
   * Triggered when the user confirms. Can be async; the button disables
   * itself while the promise resolves. Receives the captured motivo when
   * `requireMotivo` is set (undefined otherwise).
   */
  onConfirm: (motivo?: string) => void | Promise<void>;
  /** Dialog title. Keep it short (“¿Eliminar departamento?”). */
  title: React.ReactNode;
  /** Optional longer explanation. Supports ReactNode for formatting. */
  description?: React.ReactNode;
  /** Confirm button label. Defaults to "Eliminar". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancelar". */
  cancelLabel?: string;
  /**
   * Visual variant of the confirm button.
   * Defaults to "destructive" since this dialog is mainly for delete flows.
   * Use "default" for non-destructive but still-needs-confirm actions.
   */
  confirmVariant?: ConfirmButtonVariant;
  /**
   * Si true, pide un motivo obligatorio (audit trail) y lo pasa a `onConfirm`.
   * Usado por la iniciativa p2p-cancelaciones para cancelar con motivo.
   */
  requireMotivo?: boolean;
  /** Placeholder del campo de motivo (solo si `requireMotivo`). */
  motivoPlaceholder?: string;
};

/**
 * ConfirmDialog — shared confirmation dialog for destructive or irreversible
 * row actions. Replaces `window.confirm(...)` everywhere in the app.
 *
 * Usage:
 *
 *   const [open, setOpen] = useState(false)
 *
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     onConfirm={async () => { await softDelete(row.id) }}
 *     title="¿Eliminar departamento?"
 *     description="Esta acción marcará el registro como eliminado. Se puede restaurar desde auditoría."
 *     confirmLabel="Eliminar"
 *   />
 *
 * The dialog waits for `onConfirm` to resolve before closing, and disables
 * the confirm button during that window to prevent double-submits.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'destructive',
  requireMotivo = false,
  motivoPlaceholder = 'Motivo (ej. error de captura, duplicado…)',
}: ConfirmDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [motivo, setMotivo] = React.useState('');

  // Limpia el motivo cada vez que el diálogo se reabre.
  React.useEffect(() => {
    if (open) setMotivo('');
  }, [open]);

  const canConfirm = !requireMotivo || motivo.trim().length > 0;

  const handleConfirm = React.useCallback(async () => {
    setLoading(true);
    try {
      await onConfirm(requireMotivo ? motivo.trim() : undefined);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [onConfirm, onOpenChange, requireMotivo, motivo]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {requireMotivo ? (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="confirm-motivo">
              Motivo *
            </label>
            <Input
              id="confirm-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={motivoPlaceholder}
              autoFocus
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            disabled={loading || !canConfirm}
            onClick={(event) => {
              // Prevent AlertDialog from auto-closing before the async work
              // completes. We close it manually in `handleConfirm`.
              event.preventDefault();
              void handleConfirm();
            }}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

'use client';

import { useMemo } from 'react';
import { useToast } from '@/components/ui/toast';

type ToastAction = { label: string; onClick: () => void };

export interface FeedbackBaseOpts {
  description?: string;
  action?: ToastAction;
  /** Override the default 5s auto-dismiss. */
  timeout?: number;
}

export interface FeedbackErrorOpts extends FeedbackBaseOpts {
  /** Override the default "No se pudo completar la acción" title. */
  title?: string;
}

export interface UndoableOpts {
  title: string;
  /** Sync or async undo handler. */
  undo: () => void | Promise<void>;
  /** Defaults to "Deshacer". */
  undoLabel?: string;
  description?: string;
  /** Defaults to 5000ms — long enough for the user to react. */
  timeout?: number;
}

/**
 * Ergonomic wrapper over `useToast()` for post-mutation feedback.
 *
 * Pairs with `<ConfirmDialog>` for destructive confirmations. See ADR-008
 * for the convention on toast vs banner vs confirm.
 *
 * Usage:
 *
 *   const feedback = useActionFeedback();
 *
 *   try {
 *     await save();
 *     feedback.success('Puesto actualizado');
 *   } catch (e) {
 *     feedback.error(e); // infers e.message automatically
 *   }
 *
 * Undoable soft-delete:
 *
 *   feedback.undoable({
 *     title: 'Departamento eliminado',
 *     undo: () => restore(id),
 *   });
 */
export function useActionFeedback() {
  const toast = useToast();

  return useMemo(
    () => ({
      success: (title: string, opts: FeedbackBaseOpts = {}) =>
        toast.add({
          title,
          description: opts.description,
          type: 'success',
          timeout: opts.timeout,
          actionProps: opts.action
            ? { onClick: opts.action.onClick, children: opts.action.label }
            : undefined,
        }),

      info: (title: string, opts: FeedbackBaseOpts = {}) =>
        toast.add({
          title,
          description: opts.description,
          type: 'info',
          timeout: opts.timeout,
          actionProps: opts.action
            ? { onClick: opts.action.onClick, children: opts.action.label }
            : undefined,
        }),

      warning: (title: string, opts: FeedbackBaseOpts = {}) =>
        toast.add({
          title,
          description: opts.description,
          type: 'warning',
          timeout: opts.timeout,
          actionProps: opts.action
            ? { onClick: opts.action.onClick, children: opts.action.label }
            : undefined,
        }),

      /**
       * Show an error toast. `err` can be an Error, a string, or an unknown
       * value — the message is inferred and used as the description by default.
       */
      error: (err: unknown, opts: FeedbackErrorOpts = {}) => {
        const message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'Error desconocido';
        toast.add({
          title: opts.title ?? 'No se pudo completar la acción',
          description: opts.description ?? message,
          type: 'error',
          timeout: opts.timeout,
          actionProps: opts.action
            ? { onClick: opts.action.onClick, children: opts.action.label }
            : undefined,
        });
      },

      undoable: ({
        title,
        undo,
        undoLabel = 'Deshacer',
        description,
        timeout = 5000,
      }: UndoableOpts) =>
        toast.add({
          title,
          description,
          type: 'default',
          timeout,
          actionProps: { onClick: () => void undo(), children: undoLabel },
        }),
    }),
    [toast]
  );
}

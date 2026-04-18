'use client';

import * as React from 'react';
import { MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

/**
 * Declarative shape for the Edit action. If omitted, the menu item is hidden.
 */
type EditAction = {
  /** Click handler. Called with no args. */
  onClick: () => void;
  /** Label override. Defaults to "Editar". */
  label?: string;
  /** Disable the action (still visible, but grayed out). */
  disabled?: boolean;
};

/**
 * Declarative shape for the Activo/Inactivo toggle. If omitted, hidden.
 * The component chooses the label and icon based on `activo`.
 */
type ToggleAction = {
  /** Current state of the row. Drives label + icon. */
  activo: boolean;
  /** Called when the user clicks the menu item. Can be async. */
  onClick: () => void | Promise<void>;
  /** Override the "Desactivar" / "Activar" defaults. */
  activateLabel?: string;
  deactivateLabel?: string;
  disabled?: boolean;
};

/**
 * Declarative shape for the soft-delete action. If omitted, hidden.
 * Triggers a ConfirmDialog before `onConfirm` runs. Use this for all
 * destructive row actions in the app — do NOT wire `window.confirm`.
 */
type DeleteAction = {
  /** Called only after the user confirms. Can be async. */
  onConfirm: () => void | Promise<void>;
  /** Menu item label. Defaults to "Eliminar". */
  label?: string;
  /** Dialog title. Defaults to "¿Eliminar registro?". */
  confirmTitle?: React.ReactNode;
  /**
   * Dialog description. Defaults to a generic soft-delete explanation.
   * Keep it specific — e.g. name the entity and its consequences.
   */
  confirmDescription?: React.ReactNode;
  /** Confirm button label. Defaults to "Eliminar". */
  confirmLabel?: string;
  disabled?: boolean;
};

export type RowActionsProps = {
  onEdit?: EditAction;
  onToggle?: ToggleAction;
  onDelete?: DeleteAction;
  /**
   * Custom aria-label for the trigger button. Defaults to "Acciones".
   * Pass something specific for screen-reader context, e.g.
   *   aria-label={`Acciones para ${row.nombre}`}
   */
  ariaLabel?: string;
  /** Optional extra menu items rendered above the delete separator. */
  children?: React.ReactNode;
};

/**
 * RowActions — BSOP standard row-level action menu.
 *
 * Visual: a kebab (⋮) icon button that opens a DropdownMenu. Use for every
 * table row that needs edit / toggle / delete controls. Declarative API —
 * pass only the actions you want to expose.
 *
 * Order within the menu (top → bottom):
 *   1. Editar
 *   2. Activar / Desactivar
 *   3. (optional extra items via `children`)
 *   4. ── separator ──
 *   5. Eliminar   (destructive, confirmed via AlertDialog)
 *
 * Example:
 *
 *   <RowActions
 *     ariaLabel={`Acciones para ${dep.nombre}`}
 *     onEdit={{ onClick: () => openEdit(dep) }}
 *     onToggle={{
 *       activo: dep.activo,
 *       onClick: () => handleToggle(dep),
 *     }}
 *     onDelete={{
 *       onConfirm: () => softDelete(dep.id),
 *       confirmTitle: `¿Eliminar “${dep.nombre}”?`,
 *       confirmDescription:
 *         "Esta acción marcará el departamento como eliminado. " +
 *         "Los empleados asignados conservarán su historial.",
 *     }}
 *   />
 */
export function RowActions({
  onEdit,
  onToggle,
  onDelete,
  ariaLabel = 'Acciones',
  children,
}: RowActionsProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const hasAnyAction =
    Boolean(onEdit) || Boolean(onToggle) || Boolean(onDelete) || Boolean(children);

  if (!hasAnyAction) return null;

  const toggleLabel = onToggle
    ? onToggle.activo
      ? (onToggle.deactivateLabel ?? 'Desactivar')
      : (onToggle.activateLabel ?? 'Activar')
    : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={ariaLabel}
              // Stop row-click handlers (drawer openers etc.) from firing.
              onClick={(e) => e.stopPropagation()}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4}>
          {onEdit && (
            <DropdownMenuItem
              disabled={onEdit.disabled}
              onClick={(e) => {
                e.stopPropagation();
                onEdit.onClick();
              }}
            >
              <Pencil />
              {onEdit.label ?? 'Editar'}
            </DropdownMenuItem>
          )}

          {onToggle && (
            <DropdownMenuItem
              disabled={onToggle.disabled}
              onClick={(e) => {
                e.stopPropagation();
                void onToggle.onClick();
              }}
            >
              {onToggle.activo ? <PowerOff /> : <Power />}
              {toggleLabel}
            </DropdownMenuItem>
          )}

          {children}

          {onDelete && (onEdit || onToggle || children) && <DropdownMenuSeparator />}

          {onDelete && (
            <DropdownMenuItem
              variant="destructive"
              disabled={onDelete.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
            >
              <Trash2 />
              {onDelete.label ?? 'Eliminar'}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {onDelete && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={onDelete.onConfirm}
          title={onDelete.confirmTitle ?? '¿Eliminar registro?'}
          description={
            onDelete.confirmDescription ??
            'Esta acción marcará el registro como eliminado. Se preserva el historial para auditoría.'
          }
          confirmLabel={onDelete.confirmLabel ?? 'Eliminar'}
        />
      )}
    </>
  );
}

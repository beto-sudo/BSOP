'use client';

import * as React from 'react';
import { RowActions, type RowActionsProps } from '@/components/shared/row-actions';

/**
 * Una acción primaria visible en la fila (ADR-049 AE1): icono con tooltip.
 * Usa `href` para descargas (abre en pestaña nueva) u `onClick` para acciones.
 */
export type QuickAction = {
  /** Icono (ej. `<FileDown className="h-4 w-4" />`). */
  icon: React.ReactNode;
  /** Texto para tooltip + aria-label (obligatorio por accesibilidad). */
  label: string;
  onClick?: () => void;
  /** Si se pasa, el icono es un link de descarga (target=\_blank) en vez de botón. */
  href?: string;
  disabled?: boolean;
  /** Si true, no se renderiza (para condicionar por estado/permiso sin romper el orden). */
  hidden?: boolean;
};

export type RowQuickActionsProps = {
  /**
   * Acciones primarias visibles (ADR-049 AE1: las que el usuario más usa desde la
   * lista). Las marcadas `hidden` se omiten; el resto se topa a 3 para no
   * ensanchar la tabla.
   */
  quick: QuickAction[];
  /** El menú ⋯ con las secundarias/destructivas (mismo API que `<RowActions>`). */
  menu?: RowActionsProps;
};

const ICON_BTN =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text)]/60 transition-colors hover:bg-[var(--card)] hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-40';

/**
 * RowQuickActions — patrón estándar de acciones de fila (ADR-049 AE3).
 *
 * 1-3 acciones primarias VISIBLES como iconos (con tooltip) seguidas del menú ⋯
 * con el resto. Resuelve que las acciones que el usuario más usa (imprimir,
 * enviar, aprobar) no queden escondidas en el kebab. Los iconos reusan los mismos
 * handlers que el menú y el footer del drawer (ADR-044 DA1/DA4: sin caminos
 * paralelos). El contenedor frena el row-click (no abre el drawer).
 */
export function RowQuickActions({ quick, menu }: RowQuickActionsProps) {
  const visibles = quick.filter((a) => !a.hidden).slice(0, 3);
  if (visibles.length === 0 && !menu) return null;
  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {visibles.map((a) =>
        a.href ? (
          <a
            key={a.label}
            href={a.href}
            target="_blank"
            rel="noreferrer"
            title={a.label}
            aria-label={a.label}
            className={ICON_BTN}
          >
            {a.icon}
          </a>
        ) : (
          <button
            key={a.label}
            type="button"
            title={a.label}
            aria-label={a.label}
            disabled={a.disabled}
            onClick={a.onClick}
            className={ICON_BTN}
          >
            {a.icon}
          </button>
        )
      )}
      {menu ? <RowActions {...menu} /> : null}
    </div>
  );
}

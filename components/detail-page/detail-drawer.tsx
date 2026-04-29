'use client';

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * `<DetailDrawer>` — sibling to `<DetailPage>` for entity-detail surfaces
 * that should keep the listing context (ADR-009 D2).
 *
 * Anatomy (top to bottom):
 *
 *   DetailDrawer (Sheet, side="right")
 *   ├── DetailDrawerHeader (title + description + meta + actions)
 *   ├── DetailDrawerContent (scrollable; default fills available height)
 *   └── DetailDrawerFooter (sticky, optional — for primary actions)
 *
 * Standardizes:
 * - Side, max-width, and base padding.
 * - Sticky scroll behaviour: header + footer stay, content scrolls.
 * - Header anatomy: title (h2 implicit via SheetTitle) + description + meta + actions.
 * - Print stylesheet: `print:max-w-full print:p-0` so the drawer prints
 *   like a full page when triggered with `window.print()`.
 *
 * Usage:
 *
 *   <DetailDrawer
 *     open={open}
 *     onOpenChange={setOpen}
 *     title={item.nombre}
 *     description={`${item.categoria} · ${item.unidad}`}
 *     actions={<Button onClick={() => window.print()}>Imprimir</Button>}
 *   >
 *     <DetailDrawerContent>
 *       ...sections...
 *     </DetailDrawerContent>
 *   </DetailDrawer>
 *
 * For drawers with a sticky footer (e.g. Save/Cancel for an edit form),
 * pass `footer` directly:
 *
 *   <DetailDrawer ... footer={<FormActions onCancel={onClose} />}>
 *     <DetailDrawerContent>...</DetailDrawerContent>
 *   </DetailDrawer>
 */

export type DetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Status meta (badges, dates) displayed under the title. */
  meta?: React.ReactNode;
  /** Primary actions for the entity (print, edit, etc.). Top-right. */
  actions?: React.ReactNode;
  /** Sticky footer with primary actions. Optional. */
  footer?: React.ReactNode;
  /** `sm:max-w-*` Tailwind class. Default `sm:max-w-[600px]`. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Side of the screen. Default `'right'`. */
  side?: 'right' | 'left' | 'top' | 'bottom';
  className?: string;
  children: React.ReactNode;
};

const SIZE_CLASS: Record<NonNullable<DetailDrawerProps['size']>, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-[600px]',
  lg: 'sm:max-w-[800px]',
  xl: 'sm:max-w-[1000px]',
};

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  meta,
  actions,
  footer,
  size = 'md',
  side = 'right',
  className,
  children,
}: DetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          'flex flex-col gap-0 p-0 print:max-w-full print:p-0',
          SIZE_CLASS[size],
          className
        )}
      >
        <DetailDrawerHeader title={title} description={description} meta={meta} actions={actions} />

        <div className="flex-1 min-h-0">{children}</div>

        {footer ? (
          <div className="border-t border-[var(--border)] px-6 py-3 print:hidden">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export type DetailDrawerHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Drawer-specific header. Stand-alone when not using `<DetailDrawer>` directly.
 *
 * Layout (single row in desktop, stacked on mobile):
 *   [title + description + meta]   [actions]
 *
 * The native `SheetClose` (X button) lives in the top-right of `<SheetContent>`
 * regardless of whether `actions` is set; place secondary actions inline so
 * they don't collide with the X.
 */
export function DetailDrawerHeader({
  title,
  description,
  meta,
  actions,
  className,
}: DetailDrawerHeaderProps) {
  return (
    <SheetHeader
      className={cn(
        'gap-1 border-b border-[var(--border)] px-6 pt-6 pb-4 print:px-0 print:pt-0 print:border-0',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <SheetTitle className="text-base font-semibold leading-tight">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-xs">{description}</SheetDescription>
          ) : null}
          {meta ? <div className="flex items-center gap-2 pt-1">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="shrink-0 hidden sm:flex items-center gap-2 print:hidden mr-8">
            {actions}
          </div>
        ) : null}
      </div>
    </SheetHeader>
  );
}

export type DetailDrawerContentProps = {
  /** Wrap content in a scrollable area. Default `true`. Disable for callers
   * that already scroll inside (e.g. sub-tabs that lazy-load). */
  scroll?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Body of the drawer. Wraps `<ScrollArea>` so `header + footer` stay sticky
 * while the content scrolls.
 *
 * Print stylesheet: removes the scroll container so the printer treats the
 * page as a normal flow.
 */
export function DetailDrawerContent({
  scroll = true,
  className,
  children,
}: DetailDrawerContentProps) {
  if (!scroll) {
    return <div className={cn('px-6 py-4 print:px-0 print:py-0', className)}>{children}</div>;
  }
  return (
    <ScrollArea className="h-full print:h-auto">
      <div className={cn('px-6 py-4 print:px-0 print:py-0', className)}>{children}</div>
    </ScrollArea>
  );
}

export type DetailDrawerFooterProps = {
  className?: string;
  children: React.ReactNode;
};

/**
 * Standalone footer when not using the `footer` prop on `<DetailDrawer>`.
 * Adds the same divider + padding contract.
 */
export function DetailDrawerFooter({ className, children }: DetailDrawerFooterProps) {
  return (
    <div className={cn('border-t border-[var(--border)] px-6 py-3 print:hidden', className)}>
      {children}
    </div>
  );
}

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
 * - Side, max-width, and base padding (DD1).
 * - Sticky scroll behaviour (DD3).
 * - Header anatomy: title (h2 implicit via SheetTitle) + description + meta + actions (DD2).
 * - Header reserves fixed space for the native X close button (DD7), title clamps to 2 lines (DD8),
 *   actions stack vertically on mobile and stay visible (DD9).
 * - Print stylesheet by construction (DD5).
 *
 * Sub-components for body composition:
 * - `<DetailDrawerSection>` — canonical sub-section with title/description/divider (DD10).
 * - `<DetailDrawerSkeleton>` — loading placeholder (DD11).
 */

export type DetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Status meta (badges, dates) displayed under the title. */
  meta?: React.ReactNode;
  /** Primary actions for the entity (print, edit, etc.). Top-right on desktop, stacked on mobile. */
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
 * Layout:
 *   - Mobile (<640px): stacked — title group on top, actions row below (DD9).
 *   - Desktop (≥640px): single row — title group left, actions right (DD2).
 *
 * The native `SheetClose` (X button, `absolute top-3 right-3`, 28×28px) lives
 * in the top-right of `<SheetContent>`. The header reserves `pr-14` (56px) on
 * the container so neither the title nor the actions collide with it (DD7).
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
        'gap-1 border-b border-[var(--border)] px-6 pt-6 pb-4 pr-14 print:px-0 print:pt-0 print:pr-6 print:border-0',
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <SheetTitle className="text-base font-semibold leading-tight line-clamp-2 break-words">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="text-xs">{description}</SheetDescription>
          ) : null}
          {meta ? <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="shrink-0 flex flex-wrap items-center gap-2 print:hidden">{actions}</div>
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

export type DetailDrawerSectionProps = {
  /** Section heading — h3 implicit. */
  title?: React.ReactNode;
  /** Optional muted description below the title. */
  description?: React.ReactNode;
  /** Render a `pt-4 border-t` separator above the section. Default `true`. */
  divider?: boolean;
  /** Inner padding mode. `'default'` adds top spacing between sections; `'none'` removes all spacing. Default `'default'`. */
  padding?: 'default' | 'none';
  className?: string;
  children: React.ReactNode;
};

/**
 * Canonical sub-section inside `<DetailDrawerContent>` (DD10).
 *
 * - `divider` adds `pt-4 border-t` for visual separation between sections.
 * - First section in a drawer typically passes `divider={false}` to skip the
 *   leading border (the header already has its own bottom border).
 * - Title is rendered as `<h3 text-sm font-semibold>`, description below.
 *
 * Replaces ad-hoc `space-y-4`/`space-y-6` + manual `<h3>` + manual dividers
 * patterns scattered across drawers.
 */
export function DetailDrawerSection({
  title,
  description,
  divider = true,
  padding = 'default',
  className,
  children,
}: DetailDrawerSectionProps) {
  return (
    <section
      className={cn(
        padding === 'default' && (divider ? 'mt-4 pt-4 border-t border-[var(--border)]' : 'mt-1'),
        padding === 'default' && 'first:mt-0 first:pt-0 first:border-t-0',
        className
      )}
    >
      {title ? (
        <div className={cn('mb-2', description ? 'space-y-0.5' : '')}>
          <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
          {description ? <p className="text-xs text-[var(--text-subtle)]">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type DetailDrawerSkeletonProps = {
  /** Show a row of stat cards at the top. Default `true`. */
  showStats?: boolean;
  /** Number of body lines. Default `4`. */
  lines?: number;
  /** Show a sub-section with rows below. Default `true`. */
  showSection?: boolean;
  /** Number of rows in the sub-section. Default `5`. */
  sectionRows?: number;
  className?: string;
};

/**
 * Loading placeholder rendered inside `<DetailDrawerContent>` while data
 * fetches (DD11).
 *
 * Does NOT include the header — the caller passes `title` to the
 * `<DetailDrawer>` from the row that was clicked (always known in advance).
 *
 * Usage:
 *
 *   <DetailDrawer title={item.nombre} ...>
 *     {loading
 *       ? <DetailDrawerSkeleton />
 *       : <DetailDrawerContent>...</DetailDrawerContent>}
 *   </DetailDrawer>
 */
export function DetailDrawerSkeleton({
  showStats = true,
  lines = 4,
  showSection = true,
  sectionRows = 5,
  className,
}: DetailDrawerSkeletonProps) {
  return (
    <div
      className={cn('px-6 py-4 print:px-0 print:py-0', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Cargando…</span>
      {showStats ? (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--border)] bg-muted/40 px-3 py-2.5"
            >
              <div className="h-3 w-16 rounded bg-muted animate-pulse" />
              <div className="mt-2 h-5 w-20 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : null}

      {lines > 0 ? (
        <div className={cn('space-y-2', showStats && 'mt-4')}>
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-3 rounded bg-muted animate-pulse',
                i === 0 ? 'w-3/4' : i % 2 === 0 ? 'w-full' : 'w-5/6'
              )}
            />
          ))}
        </div>
      ) : null}

      {showSection ? (
        <div className="mt-6 pt-4 border-t border-[var(--border)]">
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: sectionRows }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1">
                <div className="h-3 flex-1 rounded bg-muted animate-pulse" />
                <div className="h-3 w-16 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
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

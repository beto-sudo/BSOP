'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * `<PrintLayout>` — wrapper for printable surfaces (contracts, finiquitos,
 * marbete, kardex, reports). Standardizes:
 *
 * - `@page` size (default `letter`; override via `size` prop).
 * - Print-only header/footer slots that show only when printing.
 * - Screen suppression when `screen={false}`: the layout is hidden in the
 *   normal app view and only renders during `window.print()`.
 *
 * Anatomy:
 *
 *   PrintLayout (article)
 *   ├── PrintLayoutHeader    (only print, top of every printed page via @page margins)
 *   ├── content              (children)
 *   └── PrintLayoutFooter    (only print, bottom of every page)
 *
 * Usage:
 *
 *   <PrintLayout
 *     size="letter"
 *     header={<img src="/brand/dilesa/header.png" />}
 *     footer={<small>DILESA · Contrato individual</small>}
 *   >
 *     <h1>Contrato</h1>
 *     ...
 *   </PrintLayout>
 *
 * Triggering print: import `useTriggerPrint()` and call from a `<Button>`,
 * or use `window.print()` directly.
 */

export type PrintLayoutSize = 'letter' | 'a4' | 'label-58mm' | 'label-80mm';

export type PrintLayoutProps = {
  /** Page size. Default `'letter'` (8.5×11"). */
  size?: PrintLayoutSize;
  /** Print-only header (visible on every page when printing). */
  header?: React.ReactNode;
  /** Print-only footer. Combine with page-numbers helper if needed. */
  footer?: React.ReactNode;
  /** When `false`, hides the layout in the screen view (`screen:hidden`).
   * Useful when the printable is a separate render path from the live UI. */
  screen?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function PrintLayout({
  size = 'letter',
  header,
  footer,
  screen = true,
  className,
  children,
}: PrintLayoutProps) {
  return (
    <article
      data-print-layout
      data-print-size={size}
      className={cn(
        // On screen: behaves like a normal block. On print: applied via the
        // global `@page` rule injected with the size attribute.
        'mx-auto max-w-[8.5in] bg-white text-black',
        screen ? 'print:max-w-none print:p-0' : 'hidden print:block print:max-w-none print:p-0',
        className
      )}
    >
      {header ? <PrintLayoutHeader>{header}</PrintLayoutHeader> : null}
      <div className="print:px-0">{children}</div>
      {footer ? <PrintLayoutFooter>{footer}</PrintLayoutFooter> : null}
    </article>
  );
}

export function PrintLayoutHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="hidden print:block print:mb-4 print:text-xs print:text-black">
      {children}
    </header>
  );
}

export function PrintLayoutFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="hidden print:block print:mt-6 print:text-[10px] print:text-black">
      {children}
    </footer>
  );
}

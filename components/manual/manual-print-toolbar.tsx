'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useTriggerPrint } from '@/components/print';

/**
 * Toolbar de la vista imprimible del manual (`/dilesa/manual/imprimir`).
 * Client island mínimo: el contenido del documento es 100% server-rendered;
 * aquí solo vive el trigger de impresión (ADR-021 P5) y el regreso a la
 * portada. `print:hidden` — no sale en el PDF.
 */
export function ManualPrintToolbar() {
  const triggerPrint = useTriggerPrint();
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5 print:hidden">
      <Link
        href="/dilesa/manual"
        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        target="_self"
      >
        <ArrowLeft />
        Volver al manual
      </Link>
      <div className="flex items-center gap-3">
        <p className="hidden text-xs text-muted-foreground sm:block">
          En el diálogo elige <strong>“Guardar como PDF”</strong> como destino.
        </p>
        <Button size="sm" onClick={triggerPrint}>
          <Printer />
          Imprimir / Guardar PDF
        </Button>
      </div>
    </div>
  );
}

'use client';
/**
 * Header reusable para las páginas de captura de fase.
 * Muestra back-link a la venta + título de la fase + chip de posición.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function CapturarFaseHeader({
  ventaId,
  clienteNombre,
  identificacionInventario,
  faseposicion,
  faseNombre,
  descripcion,
}: {
  ventaId: string;
  clienteNombre: string | null;
  identificacionInventario: string | null;
  faseposicion: number;
  faseNombre: string;
  descripcion?: string;
}) {
  return (
    <header className="space-y-2">
      <Link
        href={`/dilesa/ventas/${ventaId}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" />
        Volver a {clienteNombre || 'la venta'}
        {identificacionInventario ? ` (${identificacionInventario})` : ''}
      </Link>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Fase {faseposicion} — {faseNombre}
        </h1>
        <Badge tone="neutral">Pipeline DILESA</Badge>
      </div>
      {descripcion ? <p className="text-sm text-[var(--text)]/60">{descripcion}</p> : null}
    </header>
  );
}

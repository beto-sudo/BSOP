'use client';

import Link from 'next/link';
import { ArrowRight, Coins } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';

/**
 * @module Construcción · Costeo (DILESA) — MUDADO
 * @responsive responsive
 *
 * El Costeo vive ahora en el detalle de cada proyecto: Proyectos › [id] ›
 * Gasto (iniciativa `dilesa-flujo-gasto` · Sprint 2, decisión D1 — una sola
 * superficie de control presupuestal, anclada en el proyecto). Esta ruta
 * queda como aviso de mudanza para bookmarks/links viejos; el tab ya no
 * existe en el hub Construcción.
 *
 * Gate: conserva el sub-slug histórico `dilesa.construccion.costeo` (quien
 * podía ver Costeo ve este aviso; sus permisos fueron clonados al sub-slug
 * nuevo `dilesa.proyectos.gasto` en la migración 20260609230203).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.costeo">
      <div className="mx-auto max-w-lg p-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Coins className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-[var(--text)]">El Costeo se mudó</h1>
        <p className="mt-2 text-sm text-[var(--text)]/60">
          El control presupuestal ahora vive dentro de cada proyecto, en la pestaña{' '}
          <strong>Gasto</strong> — junto con el comprometido, ejercido y pagado de sus partidas.
        </p>
        <Link
          href="/dilesa/proyectos"
          className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Ir a Proyectos <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </RequireAccess>
  );
}

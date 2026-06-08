'use client';

import Link from 'next/link';

import { RequireAccess } from '@/components/require-access';

/**
 * @module RUV (DILESA)
 *
 * Registro Único de Vivienda (INFONAVIT). Iniciativa `dilesa-ruv`.
 *
 * Sprint 1 (este PR) entrega el acceso (slug `dilesa.ruv` + RBAC) y el schema
 * (`dilesa.ruv_frentes`, `ruv_documentos_catalogo`, `ruv_frente_documentos`,
 * `construccion.frente_id`, vista `v_ruv_frente_avance`). La UI real —listado
 * de ofertas (frentes) + checklist de documentos + KPIs de avance— llega en el
 * Sprint 3. El detalle por vivienda (CUV + hitos del trámite) ya vive en
 * `dilesa.construccion`. Ver docs/planning/dilesa-ruv.md.
 *
 * Gate: `dilesa.ruv` (Dirección + Gerente de Proyectos + Asistente de Proyectos
 * + admin). El módulo no usa `useSearchParams`, así que no requiere Suspense
 * boundary (Next.js 16).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ruv">
      <div className="space-y-6">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
            DILESA · Inmobiliario
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text)]">
            RUV — Registro Único de Vivienda
          </h1>
        </header>
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-8">
          <h2 className="text-base font-semibold text-[var(--text)]">Módulo en construcción</h2>
          <p className="mt-2 text-sm text-[var(--text)]/55">
            El acceso y el esquema ya están listos (Sprint 1). El listado de ofertas (frentes RUV),
            el checklist de documentos del paquete y los indicadores de avance del trámite llegan en
            el Sprint 3.
          </p>
          <p className="mt-4 text-xs text-[var(--text)]/45">
            El detalle por vivienda (CUV e hitos DTU / seguro de calidad / extracción / paquete RUV)
            ya vive en el módulo de Construcción.
          </p>
          <div className="mt-5">
            <Link href="/dilesa" className="text-sm text-[var(--accent)] hover:underline">
              ← Volver al panel DILESA
            </Link>
          </div>
        </div>
      </div>
    </RequireAccess>
  );
}

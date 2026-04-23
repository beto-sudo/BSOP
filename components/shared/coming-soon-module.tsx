'use client';

/**
 * Placeholder para módulos Dilesa cuya UI aún no se ha implementado, pero
 * cuya ruta ya vive en la navegación principal.
 *
 * Se reemplaza con el módulo real conforme avancen los branches
 * feat/dilesa-ui-prototipos, feat/dilesa-ui-anteproyectos y
 * feat/dilesa-ui-proyectos.
 */

import { RequireAccess } from '@/components/require-access';
import Link from 'next/link';

type ComingSoonModuleProps = {
  title: string;
  description: string;
  branchName: string;
};

export function ComingSoonModule({ title, description, branchName }: ComingSoonModuleProps) {
  return (
    <RequireAccess empresa="dilesa">
      <div className="space-y-6">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
            DILESA · Inmobiliario
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text)]">{title}</h1>
        </header>
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-8">
          <h2 className="text-base font-semibold text-[var(--text)]">Módulo en construcción</h2>
          <p className="mt-2 text-sm text-[var(--text)]/55">{description}</p>
          <p className="mt-4 text-xs text-[var(--text)]/45">
            Se libera en el branch{' '}
            <code className="rounded bg-[var(--border)]/40 px-1 py-0.5 font-mono">
              {branchName}
            </code>
            . Mientras tanto, el trabajo se sigue haciendo en Coda.
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

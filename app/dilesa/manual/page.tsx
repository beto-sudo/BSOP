import { listManualDocs } from '@/lib/manual/load';
import { RequireAccess } from '@/components/require-access';
import { HelpButton } from '@/components/manual/help-drawer';

/**
 * @module Manual de usuario (DILESA)
 * @responsive responsive
 *
 * Portada del Manual de usuario de DILESA (iniciativa `manual-usuario`).
 * Índice de las pantallas documentadas con su versión y última actualización;
 * cada entrada abre la ayuda en un drawer (reusa `<HelpButton>`).
 *
 * Server component: lee el contenido markdown del repo con `fs`
 * (`listManualDocs`). Los `.md` viajan al deploy vía `outputFileTracingIncludes`
 * (`next.config.ts`). Gateado por el módulo `dilesa.manual` (visible para todo
 * miembro de DILESA; el contenido por pantalla hereda su propio gate).
 *
 * v1 = índice + versión por módulo. Buscador + descarga PDF llegan en Sprint 2.
 */
export const dynamic = 'force-dynamic';

function formatActualizado(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function Page() {
  const docs = await listManualDocs('dilesa');

  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.manual">
      <div className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Manual</h1>
          <p className="mt-1 text-sm text-[var(--text)]/60">
            Guía de uso de cada pantalla de DILESA. La versión y la fecha indican la última
            actualización del contenido.
          </p>
        </header>

        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay contenido publicado. Se irá agregando módulo por módulo.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
            {docs.map((doc) => {
              const slug = doc.slug.join('/');
              return (
                <li
                  key={slug}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--card)]/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--text)]">
                      {doc.frontmatter.titulo}
                    </p>
                    <p className="text-xs text-[var(--text)]/50">
                      v{doc.frontmatter.version} · Actualizado{' '}
                      {formatActualizado(doc.frontmatter.actualizado)}
                    </p>
                  </div>
                  <HelpButton slug={slug} label="Ver ayuda" />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </RequireAccess>
  );
}

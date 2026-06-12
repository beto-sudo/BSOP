import Link from 'next/link';
import { FileDown } from 'lucide-react';
import { listManualDocs } from '@/lib/manual/load';
import { groupManualDocs } from '@/lib/manual/groups';
import { filterManualDocs } from '@/lib/manual/access';
import { getManualReaderContext } from '@/lib/manual/server';
import { checkDireccionEmpresa } from '@/lib/auth/direccion-gate';
import { RequireAccess } from '@/components/require-access';
import { HelpButton } from '@/components/manual/help-drawer';
import { ManualSearch } from '@/components/manual/manual-search';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * @module Manual de usuario (DILESA)
 * @responsive responsive
 *
 * Portada del Manual de usuario de DILESA (iniciativa `manual-usuario`).
 * Buscador full-text + índice agrupado por módulo (misma taxonomía que el
 * sidebar) con versión por pantalla; cada entrada abre la ayuda en un drawer.
 *
 * RBAC (R3): el índice muestra SOLO los docs de módulos a los que el usuario
 * tiene acceso (`filterManualDocs`, misma semántica que el sidebar) — quien
 * no opera Tesorería o RH no ve cómo funcionan. El buscador filtra igual
 * (server-side, `/api/manual/search`).
 *
 * "Descargar PDF" (completo o por módulo) es **solo Dirección/admin**
 * (`checkDireccionEmpresa`): el manual empaquetado es el blueprint operativo
 * del negocio y no debe salir en un clic. La vista imprimible
 * `/dilesa/manual/imprimir` aplica el mismo gate server-side.
 *
 * Server component: lee el contenido markdown del repo con `fs`
 * (`listManualDocs`). Los `.md` viajan al deploy vía `outputFileTracingIncludes`
 * (`next.config.ts`). Gateado por el módulo `dilesa.manual`.
 */
export const dynamic = 'force-dynamic';

function formatActualizado(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function Page() {
  const ctx = await getManualReaderContext();
  // Sin sesión el middleware ya redirige a /login; esto es solo type-narrowing.
  const docs = ctx ? filterManualDocs(ctx.perms, await listManualDocs('dilesa')) : [];
  const grupos = groupManualDocs(docs);
  const ultimaActualizacion = docs.reduce(
    (max, d) => (d.frontmatter.actualizado > max ? d.frontmatter.actualizado : max),
    ''
  );

  // Gate del export PDF: Dirección de DILESA o admin global.
  let puedeExportar = false;
  if (ctx) {
    const { data: empresa } = await ctx.supabase
      .schema('core')
      .from('empresas')
      .select('id')
      .eq('slug', 'dilesa')
      .maybeSingle();
    if (empresa) {
      const gate = await checkDireccionEmpresa(ctx.supabase, empresa.id);
      puedeExportar = gate.ok && gate.autorizado;
    }
  }

  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.manual">
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Manual</h1>
            <p className="mt-1 text-sm text-[var(--text)]/60">
              Guía de uso de las pantallas a las que tienes acceso.
              {docs.length > 0 && (
                <>
                  {' '}
                  {docs.length === 1 ? '1 pantalla' : `${docs.length} pantallas`} · Última
                  actualización {formatActualizado(ultimaActualizacion)}.
                </>
              )}
            </p>
          </div>
          {puedeExportar && (
            <Link
              href="/dilesa/manual/imprimir"
              target="_blank"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <FileDown />
              Descargar PDF completo
            </Link>
          )}
        </header>

        <ManualSearch />

        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay ayuda publicada para tus módulos. Se irá agregando módulo por módulo.
          </p>
        ) : (
          grupos.map((grupo) => (
            <section key={grupo.key} className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold tracking-wide text-[var(--text)]/70 uppercase">
                  {grupo.label}
                  <span className="ml-2 font-normal normal-case">
                    {grupo.docs.length === 1 ? '1 pantalla' : `${grupo.docs.length} pantallas`}
                  </span>
                </h2>
                {puedeExportar && (
                  <Link
                    href={`/dilesa/manual/imprimir?modulo=${grupo.key}`}
                    target="_blank"
                    className={cn(buttonVariants({ variant: 'ghost', size: 'xs' }), 'shrink-0')}
                    title={`Descargar PDF de ${grupo.label}`}
                  >
                    <FileDown />
                    PDF
                  </Link>
                )}
              </div>
              <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
                {grupo.docs.map((doc) => {
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
            </section>
          ))
        )}
      </div>
    </RequireAccess>
  );
}

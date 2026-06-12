import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listManualDocs } from '@/lib/manual/load';
import {
  groupManualDocs,
  isRegisteredManualGroup,
  manualGroupKey,
  manualGroupLabel,
} from '@/lib/manual/groups';
import { filterManualDocs } from '@/lib/manual/access';
import { getManualReaderContext } from '@/lib/manual/server';
import { checkDireccionEmpresa } from '@/lib/auth/direccion-gate';
import { getEffectiveUser } from '@/lib/auth/effective-user';
import { RequireAccess } from '@/components/require-access';
import { AccessDenied } from '@/components/access-denied/access-denied';
import { ManualMarkdown } from '@/components/manual/manual-markdown';
import { ManualPrintToolbar } from '@/components/manual/manual-print-toolbar';
import { PrintLayout } from '@/components/print';

/**
 * @module Manual de usuario (DILESA) — vista imprimible
 * @responsive desktop
 *
 * Export PDF on-demand del manual (Sprint 2 de `manual-usuario`, decisión D8):
 * el PDF se genera con el **print del browser** sobre ESTA vista, que
 * renderiza el mismo markdown con el mismo `<ManualMarkdown>` de la ayuda
 * contextual — una sola fuente de verdad incluye el renderer (vs mantener un
 * mapper react-pdf paralelo que driftearía). Patrón ADR-021: `<PrintLayout
 * size="letter">`, page breaks por doc, toolbar `print:hidden`.
 *
 * **Solo Dirección/admin** (`checkDireccionEmpresa`, server-side): el manual
 * empaquetado es el blueprint operativo del negocio — la consulta es in-app
 * por pantalla; el documento completo no sale en un clic. Cada PDF lleva
 * marca de confidencialidad con quién lo generó y cuándo (audit trail).
 * Defensa adicional: aun para Dirección, el contenido pasa por
 * `filterManualDocs` (módulos legibles).
 *
 * `?modulo=<grupo>` exporta solo ese módulo; sin query, el manual completo.
 * El título del documento (metadata) es el nombre de archivo que el browser
 * sugiere al guardar el PDF.
 *
 * Las CSS vars de texto/borde se fijan localmente a "modo documento" (tinta
 * sobre papel) para que el PDF salga legible aunque la app esté en dark mode.
 */
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ modulo?: string }>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { modulo } = await searchParams;
  const title =
    modulo && isRegisteredManualGroup(modulo)
      ? `Manual DILESA — ${manualGroupLabel(modulo)}`
      : 'Manual de usuario — DILESA';
  return { title };
}

function formatActualizado(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { modulo } = await searchParams;
  if (modulo !== undefined && !isRegisteredManualGroup(modulo)) notFound();

  const ctx = await getManualReaderContext();
  if (!ctx) notFound(); // sin sesión el middleware ya redirigió a /login

  // Gate Dirección/admin del export (server-side, no solo esconder el botón).
  const { data: empresa } = await ctx.supabase
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .maybeSingle();
  const gate = empresa ? await checkDireccionEmpresa(ctx.supabase, empresa.id) : null;
  if (!gate?.ok || !gate.autorizado) {
    return (
      <AccessDenied
        title="Export restringido"
        description="La descarga del manual en PDF está limitada a Dirección. Puedes consultar toda tu ayuda en el manual in-app."
        required="DILESA · rol Dirección"
      />
    );
  }

  const visibles = filterManualDocs(ctx.perms, await listManualDocs('dilesa'));
  const docs = modulo ? visibles.filter((d) => manualGroupKey(d.slug) === modulo) : visibles;
  if (docs.length === 0) notFound();

  const grupos = groupManualDocs(docs);
  const subtitulo = modulo ? manualGroupLabel(modulo) : 'Manual completo';
  const ultimaActualizacion = docs.reduce(
    (max, d) => (d.frontmatter.actualizado > max ? d.frontmatter.actualizado : max),
    ''
  );
  const generado = new Date().toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Matamoros',
  });
  // Marca de confidencialidad: quién generó el documento (audit trail).
  const usuario = await getEffectiveUser(ctx.supabase);
  const generadoPor = usuario?.firstName
    ? `${usuario.firstName} (${usuario.email})`
    : (usuario?.email ?? 'usuario autenticado');
  const confidencial = `Documento confidencial de DILESA — uso interno. Generado por ${generadoPor} el ${generado}.`;

  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.manual">
      <ManualPrintToolbar />
      <div
        className="bg-[var(--background)] px-4 py-6 print:p-0"
        // "Modo documento": los hijos (ManualMarkdown) resuelven sus CSS vars
        // a tinta-sobre-papel, independiente del theme de la app.
        style={{ '--text': '#18181b', '--border': '#d4d4d8' } as React.CSSProperties}
      >
        <PrintLayout
          size="letter"
          className="rounded-lg p-10 shadow-sm print:rounded-none print:shadow-none"
          footer={<p className="text-center">{confidencial}</p>}
        >
          {/* Portada del documento */}
          <header className="flex min-h-[3in] flex-col justify-center text-center">
            <p className="text-sm tracking-widest text-zinc-500 uppercase">BSOP · DILESA</p>
            <h1 className="mt-3 text-3xl font-semibold text-zinc-900">Manual de usuario</h1>
            <p className="mt-2 text-lg text-zinc-600">{subtitulo}</p>
            <p className="mt-6 text-sm text-zinc-500">
              {docs.length === 1
                ? '1 pantalla documentada'
                : `${docs.length} pantallas documentadas`}
              {' · '}Última actualización {formatActualizado(ultimaActualizacion)}
            </p>
            <p className="text-sm text-zinc-500">Generado el {generado}</p>
            <p className="mx-auto mt-8 max-w-md text-xs text-zinc-400">{confidencial}</p>
          </header>

          {/* Índice */}
          {docs.length > 1 && (
            <nav className="break-before-page">
              <h2 className="mb-4 text-xl font-semibold text-zinc-900">Contenido</h2>
              {grupos.map((grupo) => (
                <div key={grupo.key} className="mb-4 break-inside-avoid">
                  <h3 className="mb-1 text-sm font-semibold tracking-wide text-zinc-700 uppercase">
                    {grupo.label}
                  </h3>
                  <ul className="ml-5 list-disc text-sm text-zinc-700">
                    {grupo.docs.map((doc) => (
                      <li key={doc.slug.join('/')}>{doc.frontmatter.titulo}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}

          {/* Contenido: cada pantalla arranca en página nueva */}
          {grupos.map((grupo) =>
            grupo.docs.map((doc) => (
              <section key={doc.slug.join('/')} className="break-before-page">
                <header className="mb-4 border-b border-zinc-300 pb-3">
                  <p className="text-xs tracking-wide text-zinc-500 uppercase">{grupo.label}</p>
                  <h2 className="mt-0.5 text-2xl font-semibold text-zinc-900">
                    {doc.frontmatter.titulo}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    v{doc.frontmatter.version} · Actualizado{' '}
                    {formatActualizado(doc.frontmatter.actualizado)}
                  </p>
                </header>
                <ManualMarkdown body={doc.body} />
              </section>
            ))
          )}
        </PrintLayout>
      </div>
    </RequireAccess>
  );
}

'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HelpCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page/detail-drawer';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { resolveHelpSlug } from '@/lib/manual/help-routes';

/**
 * Ayuda contextual del Manual de usuario (iniciativa `manual-usuario`).
 *
 * `<HelpButton slug="dilesa/ventas/lista" />` renderiza un botón "?" que abre
 * un drawer lateral con la ayuda de ESA pantalla. El contenido se carga
 * on-demand desde `/api/manual/<slug>` (markdown versionado en el repo) y se
 * renderiza con react-markdown + GFM.
 *
 * Reusa `<DetailDrawer>` (scroll + print + anatomía ya resueltos, ADR-018/026).
 * Hereda el gate de la pantalla donde se monta: el botón solo existe en
 * páginas ya gateadas por RBAC.
 */

type ManualDocResponse = {
  frontmatter: { titulo: string; version: string; actualizado: string; modulo?: string };
  body: string;
};

type LoadState = 'loading' | 'ready' | 'error';

/** Formatea `2026-06-07` → `7 jun 2026` (display-only, sin hora). */
function formatActualizado(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 text-lg font-semibold text-[var(--text)] first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-base font-semibold text-[var(--text)] first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-sm font-semibold text-[var(--text)]">{children}</h3>
  ),
  p: ({ children }) => <p className="my-2 leading-relaxed text-[var(--text)]/90">{children}</p>,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed text-[var(--text)]/90">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-blue-600 underline underline-offset-2 dark:text-blue-400"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--text)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-[var(--border)] pl-3 text-[var(--text)]/70">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[var(--border)] px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--border)] px-2 py-1 align-top">{children}</td>
  ),
  hr: () => <hr className="my-4 border-[var(--border)]" />,
};

function HelpDrawer({
  slug,
  open,
  onOpenChange,
}: {
  slug: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [doc, setDoc] = useState<ManualDocResponse | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    // Fetch solo al abrir (lazy). El setState vive en los callbacks async —
    // nunca síncrono en el cuerpo del effect (evita cascading renders).
    // Sin slug (pantalla sin ayuda) no hay nada que cargar.
    if (!open || !slug) return;
    let active = true;
    fetch(`/api/manual/${slug}`)
      .then((r) => (r.ok ? (r.json() as Promise<ManualDocResponse>) : Promise.reject(r.status)))
      .then((d) => {
        if (!active) return;
        setDoc(d);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [open, slug]);

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={doc?.frontmatter.titulo ?? 'Ayuda'}
      meta={
        doc ? (
          <>
            <Badge tone="neutral">v{doc.frontmatter.version}</Badge>
            <span className="text-xs text-muted-foreground">
              Actualizado {formatActualizado(doc.frontmatter.actualizado)}
            </span>
          </>
        ) : null
      }
    >
      <DetailDrawerContent>
        {!slug || state === 'error' ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay ayuda para esta pantalla. Si tienes una duda, avísanos y la agregamos.
          </p>
        ) : state === 'loading' ? (
          <p className="text-sm text-muted-foreground">Cargando ayuda…</p>
        ) : (
          <div className="text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {doc!.body}
            </ReactMarkdown>
          </div>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

/**
 * Botón que abre la ayuda contextual de una pantalla.
 *
 * - Sin `label`: ícono "?" compacto (para headers de módulo).
 * - Con `label`: link de texto "Ver ayuda" (para la portada del manual).
 *
 * @param slug Ruta del doc bajo `content/manual/`, sin extensión y separada
 *   por `/` (e.g. `dilesa/ventas/lista`).
 */
export function HelpButton({
  slug,
  label,
  className,
}: {
  slug: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {label ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400',
            className
          )}
        >
          <HelpCircle className="h-4 w-4" />
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ayuda de esta pantalla"
          title="Ayuda"
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text)]/50 transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]',
            className
          )}
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      )}
      {/* Siempre montado (controlado por `open`) para que el Sheet anime
          entrada/salida; el fetch del contenido es lazy (solo al abrir). */}
      <HelpDrawer slug={slug} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Botón "?" global del header (entre la campanita y el menú de usuario).
 *
 * Es contextual: deriva la ayuda de la pantalla ACTUAL con `usePathname()`
 * (vía `resolveHelpSlug`, que reusa `ROUTE_TO_MODULE`). En pantallas sin doc
 * el drawer muestra "todavía no hay ayuda". Estilo alineado a los íconos del
 * header (tema/idioma/campanita).
 */
export function HeaderHelpButton() {
  const pathname = usePathname();
  const slug = resolveHelpSlug(pathname);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ayuda de esta pantalla"
        title="Ayuda"
        className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)]/70 transition hover:border-[var(--accent)] hover:text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 dark:text-white/70 dark:hover:text-white"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <HelpDrawer slug={slug} open={open} onOpenChange={setOpen} />
    </>
  );
}

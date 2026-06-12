'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, HelpCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page/detail-drawer';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { resolveHelpSlug } from '@/lib/manual/help-routes';
import { ManualMarkdown } from './manual-markdown';

/** Empresas con portada de manual publicada (hoy solo DILESA; el rollout a
 * otras empresas agrega su slug aquí — ver content/manual/README.md). */
const EMPRESAS_CON_MANUAL = new Set(['dilesa']);

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

/**
 * Drawer de la ayuda contextual. Exportado (además de `<HelpButton>`) para
 * superficies que abren la ayuda programáticamente — p.ej. los resultados del
 * buscador de la portada (`<ManualSearch>`).
 */
export function HelpDrawer({
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
  const pathname = usePathname();
  // Puente a la portada (índice + buscador): la empresa sale del doc abierto
  // o de la URL actual. En la portada misma el link sobra.
  const empresa = slug?.split('/')[0] ?? pathname.split('/')[1] ?? '';
  const portadaHref = `/${empresa}/manual`;
  const muestraPortada = EMPRESAS_CON_MANUAL.has(empresa) && pathname !== portadaHref;

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
          <ManualMarkdown body={doc!.body} />
        )}
        {muestraPortada && (
          <div className="mt-6 border-t border-[var(--border)] pt-3">
            <Link
              href={portadaHref}
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              <BookOpen className="h-4 w-4" />
              Ver manual completo
            </Link>
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

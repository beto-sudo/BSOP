'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { HelpDrawer } from './help-drawer';
import type { ManualSearchResult } from '@/lib/manual/search';

/**
 * Buscador full-text de la portada del manual (Sprint 2 de `manual-usuario`).
 *
 * Input con debounce → `/api/manual/search?q=` (busca en título + contenido,
 * insensible a acentos) → resultados con snippet del match; cada resultado
 * abre la ayuda completa en el mismo `<HelpDrawer>` de la ayuda contextual.
 */

const DEBOUNCE_MS = 250;

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; results: ManualSearchResult[] }
  | { kind: 'error' };

export function ManualSearch() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  // El drawer es controlado: `open` aparte de `openSlug` para que la animación
  // de cierre no desmonte el contenido de golpe.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // El reset a 'idle' con query vacío vive en el onChange del input —
    // nunca setState síncrono en el cuerpo del effect (cascading renders).
    const q = query.trim();
    if (!q) return;
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ kind: 'loading' });
      fetch(`/api/manual/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) =>
          r.ok ? (r.json() as Promise<{ results: ManualSearchResult[] }>) : Promise.reject(r.status)
        )
        .then((d) => setState({ kind: 'ready', results: d.results }))
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setState({ kind: 'error' });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            if (!value.trim()) {
              abortRef.current?.abort();
              setState({ kind: 'idle' });
            }
          }}
          placeholder="Buscar en el manual… (ej. avalúo, estimación, requisición)"
          aria-label="Buscar en el manual"
          className="pl-8"
        />
      </div>

      {state.kind === 'loading' && <p className="text-sm text-muted-foreground">Buscando…</p>}
      {state.kind === 'error' && (
        <p className="text-sm text-muted-foreground">
          No se pudo buscar. Intenta de nuevo en un momento.
        </p>
      )}
      {state.kind === 'ready' &&
        (state.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin resultados para “{query.trim()}”. Prueba con otra palabra o navega el índice de
            abajo.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
            {state.results.map((r) => (
              <li key={r.slug}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenSlug(r.slug);
                    setDrawerOpen(true);
                  }}
                  className="block w-full px-4 py-3 text-left hover:bg-[var(--card)]/50"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-[var(--text)]">{r.titulo}</span>
                    <Badge tone="neutral">{r.grupoLabel}</Badge>
                  </span>
                  {r.snippet && (
                    <span className="mt-1 line-clamp-2 block text-xs text-[var(--text)]/60">
                      {r.snippet.before}
                      <mark className="rounded-sm bg-amber-200/70 px-0.5 text-[var(--text)] dark:bg-amber-500/30">
                        {r.snippet.match}
                      </mark>
                      {r.snippet.after}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ))}

      <HelpDrawer slug={openSlug} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

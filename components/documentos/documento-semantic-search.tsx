'use client';

/**
 * DocumentoSemanticSearch — modal para búsqueda semántica sobre el contenido
 * extraído por IA de los documentos. Llama a /api/documentos/semantic-search
 * que genera el embedding del query con OpenAI y usa pgvector para rankear.
 *
 * El resultado es una lista ordenada de IDs. El module padre los guarda en
 * `semanticResultIds`, filtra la tabla a ese subset y mantiene el ranking como
 * el sort default (los más similares primero).
 */

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const EXAMPLES = [
  'contratos de compraventa de terreno en Piedras Negras',
  'escrituras con superficie mayor a una hectárea',
  'poderes otorgados al consejo',
  'documentos donde interviene Marco Antonio Perales',
];

export function DocumentoSemanticSearch({
  open,
  onClose,
  empresaIds,
  onResults,
}: {
  open: boolean;
  onClose: () => void;
  empresaIds: string[];
  onResults: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const q = query.trim();
    if (q.length < 3) {
      setError('Escribe al menos unos segundos de contexto (mín. 3 caracteres).');
      return;
    }
    if (empresaIds.length === 0) {
      setError('No hay empresas en contexto.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/documentos/semantic-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q, empresa_ids: empresaIds, top_k: 20 }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? `Error ${res.status}`);
        return;
      }
      const ids: string[] = (body.results ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) {
        setError('Sin resultados. Prueba reformulando la consulta.');
        return;
      }
      onResults(ids);
      setQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !loading) onClose();
      }}
    >
      <DialogContent className="max-w-xl rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--text)]">
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
            Búsqueda IA
          </DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            Describe lo que buscas en lenguaje natural. La IA encontrará documentos relacionados por
            significado, no solo por palabras exactas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej: escrituras de compraventa en Coahuila superficie mayor a 5 hectáreas"
            maxLength={400}
            rows={4}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                void handleSubmit();
              }
            }}
          />
          <div className="flex items-center justify-between text-[10px] text-[var(--text-subtle)]">
            <span>⌘/Ctrl + Enter para buscar</span>
            <span>{query.length}/400</span>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Ejemplos
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setQuery(ex)}
                  disabled={loading}
                  className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--text)]/70 hover:bg-[var(--panel)]/60 disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || query.trim().length < 3}
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Buscar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

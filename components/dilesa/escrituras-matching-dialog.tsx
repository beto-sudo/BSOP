'use client';

/**
 * EscriturasMatchingDialog — sugerencias de ligado escritura → predio
 * (iniciativa `dilesa-portafolio-predios` · S8).
 *
 * Corre el matching (heurística + IA) al abrir y presenta cada propuesta
 * con su confianza y razón. NADA se liga solo: el operador confirma una
 * por una ("Ligar") u omite. Cada liga usa `ligarDocumentoActivo`
 * (rol escritura) — la misma tubería que el ligado manual.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ligarDocumentoActivo, sugerirEscrituras } from '@/app/dilesa/portafolio/actions';
import type { SugerenciaEscritura } from '@/lib/dilesa/matching-escrituras';
import { Sparkles } from 'lucide-react';

const CONFIANZA_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  alta: 'success',
  media: 'warning',
  baja: 'neutral',
};

type Estado = 'pendiente' | 'ligando' | 'ligada' | 'omitida';

export function EscriturasMatchingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [sugerencias, setSugerencias] = useState<SugerenciaEscritura[]>([]);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [sinMatch, setSinMatch] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset al abrir con el patrón "adjust state during render" (la regla
  // react-hooks prohíbe setState síncrono dentro del effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setLoading(true);
      setError(null);
      setSugerencias([]);
      setEstados({});
    }
  }

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    sugerirEscrituras().then((r) => {
      if (!vivo) return;
      if (r.ok) {
        setSugerencias(r.sugerencias);
        setSinMatch(r.sinMatch);
      } else {
        setError(r.error);
      }
      setLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, [open]);

  const keyDe = (s: SugerenciaEscritura) => `${s.documentoId}:${s.activoId}`;

  async function ligar(s: SugerenciaEscritura) {
    setEstados((e) => ({ ...e, [keyDe(s)]: 'ligando' }));
    const r = await ligarDocumentoActivo(s.activoId, s.documentoId, 'escritura');
    if (!r.ok) {
      setError(r.error);
      setEstados((e) => ({ ...e, [keyDe(s)]: 'pendiente' }));
      return;
    }
    setEstados((e) => ({ ...e, [keyDe(s)]: 'ligada' }));
  }

  const pendientesN = sugerencias.filter(
    (s) => (estados[keyDe(s)] ?? 'pendiente') === 'pendiente'
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Ligar escrituras a predios
          </DialogTitle>
          <DialogDescription>
            Propuestas del matching (número de escritura registrado + análisis IA del texto de las
            escrituras). Nada se liga solo — confirma cada una.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-2">
            <p className="text-sm text-[var(--text)]/60">
              Analizando escrituras sin ligar contra el catálogo de predios…
            </p>
            <div className="h-24 animate-pulse rounded-md bg-[var(--border)]/40" />
          </div>
        ) : error ? (
          <p className="text-sm text-[var(--danger)]">{error}</p>
        ) : sugerencias.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            No hay propuestas nuevas.{' '}
            {sinMatch > 0
              ? `Quedan ${sinMatch} escrituras sin match — se ligan a mano desde el expediente del predio.`
              : 'Todas las escrituras del archivo legal ya están ligadas.'}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text)]/50">
              {pendientesN} propuestas pendientes
              {sinMatch > 0 ? ` · ${sinMatch} escrituras sin match (ligar a mano)` : ''}
            </p>
            {sugerencias.map((s) => {
              const st = estados[keyDe(s)] ?? 'pendiente';
              return (
                <div
                  key={keyDe(s)}
                  className={`rounded-md border border-[var(--border)] p-3 ${
                    st === 'ligada' ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-medium text-[var(--text)]">{s.documentoTitulo}</span>
                      {s.fechaEmision ? (
                        <span className="text-[var(--text)]/50"> · {s.fechaEmision}</span>
                      ) : null}
                      <span className="text-[var(--text)]/40"> → </span>
                      <Link
                        href={`/dilesa/portafolio/activo/${s.activoId}`}
                        target="_blank"
                        className="text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {s.activoNombre}
                      </Link>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={CONFIANZA_TONE[s.confianza]}>{s.confianza}</Badge>
                      {st === 'ligada' ? (
                        <Badge tone="success">Ligada ✓</Badge>
                      ) : st === 'omitida' ? (
                        <Badge tone="neutral">Omitida</Badge>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void ligar(s)}
                            disabled={st === 'ligando'}
                          >
                            {st === 'ligando' ? 'Ligando…' : 'Ligar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEstados((e) => ({ ...e, [keyDe(s)]: 'omitida' }))}
                          >
                            Omitir
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text)]/60">{s.razon}</p>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

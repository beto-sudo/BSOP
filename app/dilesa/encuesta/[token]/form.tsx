'use client';

/**
 * Form de la Encuesta de Conformidad — client component mobile-first.
 *
 * 4 preguntas (set aprobado por Beto, 2026-06-10):
 *   1. NPS 0-10 (¿recomendarías DILESA?)
 *   2. Calidad de la vivienda (1-5 estrellas)
 *   3. Atención durante el proceso (1-5 estrellas)
 *   4. ¿Qué podemos mejorar? (texto libre, opcional)
 */

import { CheckCircle2, Loader2, Send, Star } from 'lucide-react';
import { useCallback, useState } from 'react';

interface Props {
  token: string;
}

export function EncuestaForm({ token }: Props) {
  const [nps, setNps] = useState<number | null>(null);
  const [califVivienda, setCalifVivienda] = useState<number | null>(null);
  const [califProceso, setCalifProceso] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (nps == null || califVivienda == null || califProceso == null) {
        setError('Responde las 3 calificaciones para enviar (el comentario es opcional).');
        return;
      }
      setSubmitting(true);
      const res = await fetch(`/api/dilesa/encuesta/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nps,
          calif_vivienda: califVivienda,
          calif_proceso: califProceso,
          comentario: comentario.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setSubmitting(false);
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}. Intenta de nuevo.`);
        return;
      }
      setExito(true);
    },
    [califProceso, califVivienda, comentario, nps, token]
  );

  if (exito) {
    return (
      <section className="mb-4 rounded-lg border border-emerald-400/40 bg-emerald-50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-semibold text-emerald-900">¡Gracias por tu tiempo!</h2>
        </div>
        <p className="mt-2 text-sm text-emerald-900">
          Recibimos tus respuestas. Si dejaste algún comentario, nuestro equipo le dará seguimiento.
          Disfruta tu nueva casa.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <Pregunta numero={1}>
          ¿Qué tan probable es que recomiendes DILESA a un familiar o amigo?
        </Pregunta>
        <div className="mt-3 grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setNps(i)}
              className={`h-10 rounded-md border text-sm font-semibold transition-colors ${
                nps === i
                  ? 'border-[#7D812E] bg-[#7D812E] text-white'
                  : 'border-[#7D812E]/30 bg-white text-[#1F1F1F] hover:bg-[#7D812E]/10'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-[#4F4C4D]">
          <span>Nada probable</span>
          <span>Muy probable</span>
        </div>
      </Card>
      <Card>
        <Pregunta numero={2}>¿Cómo calificas la calidad de tu vivienda?</Pregunta>
        <Estrellas valor={califVivienda} onChange={setCalifVivienda} />
      </Card>
      <Card>
        <Pregunta numero={3}>¿Cómo calificas la atención durante tu proceso de compra?</Pregunta>
        <Estrellas valor={califProceso} onChange={setCalifProceso} />
      </Card>
      <Card>
        <Pregunta numero={4} opcional>
          ¿Qué podemos mejorar?
        </Pregunta>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={4}
          placeholder="Cuéntanos lo bueno y lo que podemos hacer mejor…"
          className="mt-3 w-full rounded-md border border-[#7D812E]/30 bg-white px-3 py-2 text-sm"
        />
      </Card>

      {error ? (
        <div className="rounded-md border border-red-400/40 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#7D812E] px-4 py-3 text-base font-semibold text-white hover:bg-[#646725] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> Enviando…
          </>
        ) : (
          <>
            <Send className="h-5 w-5" /> Enviar respuestas
          </>
        )}
      </button>
    </form>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#7D812E]/20 bg-white p-5 shadow-sm">
      {children}
    </section>
  );
}

function Pregunta({
  numero,
  opcional,
  children,
}: {
  numero: number;
  opcional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p className="text-sm font-medium text-[#1F1F1F]">
      <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#7D812E]/15 text-[11px] font-bold text-[#7D812E]">
        {numero}
      </span>
      {children}
      {opcional ? (
        <span className="ml-1 text-xs font-normal text-[#4F4C4D]">(opcional)</span>
      ) : null}
    </p>
  );
}

function Estrellas({ valor, onChange }: { valor: number | null; onChange: (v: number) => void }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} estrellas`}
          className="rounded-md p-1 transition-transform hover:scale-110"
        >
          <Star
            className={`h-9 w-9 ${
              valor != null && n <= valor
                ? 'fill-[#E2B53E] text-[#E2B53E]'
                : 'fill-none text-[#4F4C4D]/40'
            }`}
          />
        </button>
      ))}
      {valor != null ? (
        <span className="ml-1 text-sm font-medium text-[#4F4C4D]">{valor}/5</span>
      ) : null}
    </div>
  );
}

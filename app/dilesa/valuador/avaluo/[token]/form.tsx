'use client';

/**
 * Form de captura del avalúo — client component que el server page
 * monta cuando el token es válido y Fase 5 NO está cerrada.
 *
 * Campos:
 *   - Monto del avalúo *
 *   - Fecha del avalúo * (default hoy)
 *   - Comentarios (opcional)
 *   - PDF * (drag-drop, mismo patrón visual que Fases 2/3/5 del módulo)
 */

import { CheckCircle2, Loader2, Save, Upload, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';

interface Props {
  token: string;
}

export function AvaluoUploadForm({ token }: Props) {
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [comentarios, setComentarios] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!archivo) {
        setError('Adjunta el PDF del dictamen.');
        return;
      }
      const m = Number(monto);
      if (!Number.isFinite(m) || m <= 0) {
        setError('Captura un monto válido mayor a cero.');
        return;
      }
      setSubmitting(true);
      const fd = new FormData();
      fd.set('monto', String(m));
      fd.set('fecha', fecha);
      fd.set('comentarios', comentarios.trim());
      fd.set('archivo', archivo);
      const res = await fetch(`/api/dilesa/valuador/avaluo/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setSubmitting(false);
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}. Intenta de nuevo.`);
        return;
      }
      setExito(true);
    },
    [archivo, comentarios, fecha, monto, token]
  );

  if (exito) {
    return (
      <section className="mb-4 rounded-lg border border-emerald-400/40 bg-emerald-50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-semibold text-emerald-900">Avalúo cargado</h2>
        </div>
        <p className="mt-2 text-sm text-emerald-900">
          Gracias. DILESA ya recibió el dictamen del avalúo. Gerencia de Ventas verá la captura en
          su sistema y te contactará si requiere algo más.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-lg border border-[#7D812E]/20 bg-white p-5 shadow-sm">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#7D812E]">
        Captura del avalúo
      </h2>

      <form onSubmit={onSubmit} className="mt-3 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Monto del avalúo *">
            <input
              type="number"
              min="0"
              step="1"
              required
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="h-9 w-full rounded-md border border-[#7D812E]/30 bg-white px-3 text-sm tabular-nums"
              placeholder="0"
            />
          </Field>
          <Field label="Fecha del avalúo *">
            <input
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-9 w-full rounded-md border border-[#7D812E]/30 bg-white px-3 text-sm"
            />
          </Field>
        </div>

        <Field label="Comentarios (opcional)">
          <textarea
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-[#7D812E]/30 bg-white px-3 py-2 text-sm"
            placeholder="Observaciones del dictamen…"
          />
        </Field>

        <Field label="Dictamen del avalúo (PDF) *">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (!dragOver) setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (!f) return;
              if (
                !(
                  f.type === 'application/pdf' ||
                  f.type.startsWith('image/') ||
                  f.name.toLowerCase().endsWith('.pdf')
                )
              ) {
                return;
              }
              setArchivo(f);
            }}
            className={`flex items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 transition-colors ${
              dragOver
                ? 'border-[#7D812E] bg-[#7D812E]/5 ring-2 ring-[#7D812E]/30'
                : 'border-[#7D812E]/30'
            }`}
          >
            <div className="flex flex-1 items-center gap-2 text-sm">
              {archivo ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-[#4F4C4D]/40" />
              )}
              <span className="font-medium">
                {archivo ? archivo.name : 'Arrastra el PDF aquí o usa el botón'}
              </span>
              {archivo ? (
                <span className="ml-1 truncate text-xs text-[#4F4C4D]">
                  {(archivo.size / 1024).toFixed(0)} KB
                </span>
              ) : null}
            </div>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[#7D812E]/30 bg-white px-3 py-1.5 text-xs font-medium text-[#4F4C4D] hover:bg-[#FAF7EE]">
              <Upload className="h-3.5 w-3.5" />
              {archivo ? 'Cambiar' : 'Subir PDF'}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </Field>

        {error ? (
          <div className="rounded-md border border-red-400/40 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-[#7D812E] px-4 py-2 text-sm font-medium text-white hover:bg-[#646725] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Subiendo…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Entregar avalúo
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[#4F4C4D]">
        {label}
      </span>
      {children}
    </label>
  );
}

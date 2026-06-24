'use client';

/**
 * Captura Fase 16 — Recabar conformidad (dilesa-ventas-expediente S5).
 *
 * La fase normalmente se cierra SOLA: al cerrar F15 se programa la encuesta
 * (entrega + 2 días), el cron la envía/recuerda, y la respuesta del cliente
 * cierra la fase. Esta página es el tablero del ciclo + el respaldo de
 * Atención a Clientes:
 *   - Ver el estado del ciclo (programada / enviada N / atención a clientes)
 *     y las respuestas si ya las hay.
 *   - Reenviar el correo o copiar la liga (para WhatsApp).
 *   - Captura manual (telefónica) de las 4 respuestas → cierra la fase.
 *   - Marcar "sin respuesta" tras agotar contacto → cierra la fase.
 *
 * Acceso: `dilesa.ventas.fase16_conformidad` (renombrado de
 * fase16_comision_pagada — migración 20260610225834).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy, Loader2, Mail, Save, Star } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
};

type Encuesta = {
  id: string;
  estado: string;
  programada_para: string;
  intentos: number;
  ultimo_envio_at: string | null;
  canal: string | null;
  nps: number | null;
  calif_vivienda: number | null;
  calif_proceso: number | null;
  comentario: string | null;
  respondida_at: string | null;
};

const ESTADO_LABEL: Record<string, string> = {
  programada: 'Programada (el cron la enviará en su fecha)',
  enviada: 'Enviada al cliente',
  respondida: 'Respondida por el cliente',
  atencion_clientes: 'En Atención a Clientes (sin respuesta por correo)',
  manual: 'Capturada manualmente',
  sin_respuesta: 'Cerrada sin respuesta',
};

export default function CapturarFase16Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase16_conformidad" write>
      <CapturarFase16Body />
    </RequireAccess>
  );
}

function CapturarFase16Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase15Cerrada, setFase15Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);
  const [encuesta, setEncuesta] = useState<Encuesta | null>(null);

  // Captura manual
  const [nps, setNps] = useState<number | null>(null);
  const [califVivienda, setCalifVivienda] = useState<number | null>(null);
  const [califProceso, setCalifProceso] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!ventaId) return;
    let activo = true;

    (async () => {
      setLoading(true);
      setError(null);

      const { data: vRow, error: vErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .select('id, persona_id, unidad_id')
        .eq('id', ventaId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (vErr || !vRow) {
        setError(
          vErr
            ? getSupabaseErrorMessage(vErr, 'No se pudo cargar la venta.')
            : 'Venta no encontrada.'
        );
        setLoading(false);
        return;
      }
      const v = vRow as unknown as VentaCtx;
      setVenta(v);

      const [fRes, eRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', v.id)
          .is('deleted_at', null),
        sb.schema('dilesa').from('venta_encuestas').select('*').eq('venta_id', v.id).maybeSingle(),
      ]);
      if (!activo) return;

      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase15Cerrada(posiciones.includes(15));
      setYaCerrada(posiciones.includes(16));
      setEncuesta((eRes.data as Encuesta | null) ?? null);

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  /** Reenviar el correo de la encuesta ahora (sin esperar al cron). */
  const reenviarCorreo = useCallback(async () => {
    setEnviando(true);
    const res = await fetch(`/api/dilesa/ventas/${ventaId}/encuesta/enviar`, { method: 'POST' });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setEnviando(false);
    if (!res.ok || !json.ok) {
      toast.add({
        title: 'No se pudo enviar',
        description: json.error ?? `Error ${res.status}`,
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Correo enviado',
      description: 'La liga llegó al cliente.',
      type: 'success',
    });
    router.refresh();
  }, [router, toast, ventaId]);

  /** Copiar la liga (para mandarla por WhatsApp desde el teléfono). */
  const copiarLiga = useCallback(async () => {
    const res = await fetch(`/api/dilesa/ventas/${ventaId}/encuesta/enviar?solo_liga=1`, {
      method: 'POST',
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.url) {
      toast.add({
        title: 'No se pudo generar la liga',
        description: json.error ?? `Error ${res.status}`,
        type: 'error',
      });
      return;
    }
    await navigator.clipboard.writeText(json.url);
    toast.add({
      title: 'Liga copiada',
      description: 'Pégala en WhatsApp para mandarla al cliente.',
      type: 'success',
    });
  }, [toast, ventaId]);

  /** Captura manual (telefónica) → guarda encuesta + cierra fase. */
  const capturarManual = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      if (nps == null || califVivienda == null || califProceso == null) {
        toast.add({
          title: 'Faltan calificaciones',
          description: 'Captura NPS y las 2 calificaciones (el comentario es opcional).',
          type: 'error',
        });
        return;
      }
      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const respuestas = {
        estado: 'manual',
        canal: 'manual',
        nps,
        calif_vivienda: califVivienda,
        calif_proceso: califProceso,
        comentario: comentario.trim() || null,
        respondida_at: new Date().toISOString(),
      };
      const { error: encErr } = encuesta
        ? await sb.schema('dilesa').from('venta_encuestas').update(respuestas).eq('id', encuesta.id)
        : await sb
            .schema('dilesa')
            .from('venta_encuestas')
            .insert({
              empresa_id: DILESA_EMPRESA_ID,
              venta_id: venta.id,
              programada_para: new Date().toISOString().slice(0, 10),
              ...respuestas,
            });
      if (encErr) {
        setSubmitting(false);
        toast.add({
          title: 'No se pudo guardar la encuesta',
          description: getSupabaseErrorMessage(encErr, 'Error desconocido.'),
          type: 'error',
        });
        return;
      }

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 16,
        docs: [],
        camposVenta: {},
        notas: 'Conformidad capturada por Atención a Clientes (telefónica).',
        registradoPor: userId,
      });
      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Encuesta guardada pero no se cerró la fase',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 16 cerrada',
        description: 'Conformidad registrada.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [califProceso, califVivienda, comentario, encuesta, nps, router, sb, toast, venta]
  );

  /** Cerrar sin respuesta (tras agotar contacto). */
  const marcarSinRespuesta = useCallback(async () => {
    if (!venta) return;
    setSubmitting(true);
    const { data: userRes } = await sb.auth.getUser();
    const userId = userRes?.user?.id ?? null;

    if (encuesta) {
      await sb
        .schema('dilesa')
        .from('venta_encuestas')
        .update({ estado: 'sin_respuesta' })
        .eq('id', encuesta.id);
    } else {
      await sb
        .schema('dilesa')
        .from('venta_encuestas')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          venta_id: venta.id,
          programada_para: new Date().toISOString().slice(0, 10),
          estado: 'sin_respuesta',
        });
    }
    const result = await marcarFase(sb, {
      ventaId: venta.id,
      faseposicion: 16,
      docs: [],
      camposVenta: {},
      notas: 'Cerrada sin respuesta del cliente (intentos agotados).',
      registradoPor: userId,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.add({
        title: 'Error al cerrar la fase',
        description: result.error ?? 'Error desconocido.',
        type: 'error',
      });
      return;
    }
    toast.add({ title: 'Fase 16 cerrada', description: 'Marcada sin respuesta.', type: 'success' });
    router.push(`/dilesa/ventas/${venta.id}`);
  }, [encuesta, router, sb, toast, venta]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <CapturarFaseHeader faseposicion={16} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  const respondida =
    encuesta != null && (encuesta.estado === 'respondida' || encuesta.estado === 'manual');

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={16}
        descripcion="Encuesta posventa: se envía sola tras la entrega; aquí se monitorea el ciclo y se captura por teléfono si hace falta."
      />

      {!fase15Cerrada && !yaCerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 15 (Entregar)"
          body="Al cerrar la entrega, la encuesta se programa automáticamente (entrega + 2 días)."
          extra={
            <Link
              href={`/dilesa/ventas/${venta.id}`}
              className="mt-3 inline-block text-sm font-medium text-[var(--accent)] underline"
            >
              Volver al detalle
            </Link>
          }
        />
      ) : (
        <>
          <Section title="Estado del ciclo">
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-[var(--text)]/55">Estado:</span>{' '}
                <span className="font-medium">
                  {encuesta ? (ESTADO_LABEL[encuesta.estado] ?? encuesta.estado) : 'Sin programar'}
                </span>
              </p>
              {encuesta ? (
                <>
                  <p className="text-[11px] text-[var(--text)]/55">
                    Programada para {encuesta.programada_para} · {encuesta.intentos} intento(s) de
                    envío
                    {encuesta.ultimo_envio_at
                      ? ` · último: ${encuesta.ultimo_envio_at.slice(0, 10)}`
                      : ''}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-[var(--text)]/55">
                  La encuesta se programa sola al cerrar la Fase 15. Si necesitas mandarla ya, usa
                  los botones de abajo.
                </p>
              )}
            </div>
            {!respondida && !yaCerrada ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={reenviarCorreo}
                  disabled={enviando}
                >
                  {enviando ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Mail className="mr-1.5 size-3.5" />
                  )}
                  Enviar correo ahora
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={copiarLiga}>
                  <Copy className="mr-1.5 size-3.5" />
                  Copiar liga (WhatsApp)
                </Button>
              </div>
            ) : null}
          </Section>

          {respondida ? (
            <Section title="Respuestas del cliente">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Metrica label="¿Nos recomendarías? (NPS)" valor={`${encuesta?.nps ?? '—'}/10`} />
                <Metrica
                  label="Calidad de la vivienda"
                  valor={`${encuesta?.calif_vivienda ?? '—'}/5`}
                  estrellas={encuesta?.calif_vivienda ?? null}
                />
                <Metrica
                  label="Atención en el proceso"
                  valor={`${encuesta?.calif_proceso ?? '—'}/5`}
                  estrellas={encuesta?.calif_proceso ?? null}
                />
              </div>
              {encuesta?.comentario ? (
                <blockquote className="mt-3 rounded-md border-l-2 border-[var(--accent)] bg-[var(--bg)]/40 px-3 py-2 text-sm italic text-[var(--text)]/80">
                  “{encuesta.comentario}”
                </blockquote>
              ) : null}
              <p className="mt-2 text-[11px] text-[var(--text)]/50">
                Respondida el {encuesta?.respondida_at?.slice(0, 10)} vía {encuesta?.canal}.
              </p>
            </Section>
          ) : null}

          {yaCerrada ? (
            <Banner
              tone="success"
              title="Fase 16 ya está cerrada"
              body="La conformidad del cliente quedó registrada. La siguiente fase es Cerrar operación."
            />
          ) : !respondida ? (
            <>
              <form onSubmit={capturarManual}>
                <Section title="Captura manual (telefónica)">
                  <p className="mb-3 text-xs text-[var(--text)]/55">
                    Para cuando Atención a Clientes contacta al cliente por teléfono. Guardar cierra
                    la fase.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <CampoLabel>1 · ¿Qué tan probable es que nos recomiende? (0-10)</CampoLabel>
                      <div className="mt-2 grid grid-cols-11 gap-1">
                        {Array.from({ length: 11 }, (_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setNps(i)}
                            className={`h-8 rounded-md border text-xs font-semibold ${
                              nps === i
                                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                : 'border-[var(--border)] hover:bg-[var(--bg)]/40'
                            }`}
                          >
                            {i}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <CampoLabel>2 · Calidad de la vivienda</CampoLabel>
                        <EstrellasInput valor={califVivienda} onChange={setCalifVivienda} />
                      </div>
                      <div>
                        <CampoLabel>3 · Atención en el proceso</CampoLabel>
                        <EstrellasInput valor={califProceso} onChange={setCalifProceso} />
                      </div>
                    </div>
                    <div>
                      <CampoLabel>4 · Comentarios (opcional)</CampoLabel>
                      <textarea
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                        placeholder="Lo que el cliente comparta…"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-3">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 size-4" /> Guardar y cerrar fase
                        </>
                      )}
                    </Button>
                  </div>
                </Section>
              </form>

              <Section title="Sin respuesta">
                <p className="mb-3 text-xs text-[var(--text)]/55">
                  Si el cliente no respondió por ningún canal tras agotar los intentos, cierra la
                  fase sin respuestas — queda registrado en la bitácora.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={marcarSinRespuesta}
                  disabled={submitting}
                >
                  <CheckCircle2 className="mr-2 size-4" /> Marcar sin respuesta y cerrar
                </Button>
              </Section>
            </>
          ) : !yaCerrada ? (
            <Banner
              tone="success"
              title="El cliente ya respondió"
              body="La fase se cierra automáticamente al recibir la respuesta. Si no se cerró, recarga la página."
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CampoLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
      {children}
    </span>
  );
}

function Metrica({
  label,
  valor,
  estrellas,
}: {
  label: string;
  valor: string;
  estrellas?: number | null;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/50">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="text-lg font-semibold tabular-nums">{valor}</span>
        {estrellas != null ? (
          <span className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`h-3.5 w-3.5 ${
                  n <= estrellas ? 'fill-amber-400 text-amber-400' : 'text-[var(--text)]/20'
                }`}
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Banner({
  tone,
  title,
  body,
  extra,
}: {
  tone: 'success' | 'warning';
  title: string;
  body: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const styles =
    tone === 'success'
      ? 'border-emerald-400/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
      : 'border-amber-400/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100';
  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 text-sm">{body}</div>
      {extra}
    </div>
  );
}

function EstrellasInput({
  valor,
  onChange,
}: {
  valor: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} estrellas`}
          className="rounded p-0.5"
        >
          <Star
            className={`h-7 w-7 ${
              valor != null && n <= valor
                ? 'fill-amber-400 text-amber-400'
                : 'fill-none text-[var(--text)]/30'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

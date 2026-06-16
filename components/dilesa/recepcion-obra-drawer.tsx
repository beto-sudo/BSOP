'use client';

/**
 * RecepcionObraDrawer — recorrido de RECEPCIÓN DE OBRA al contratista
 * (Atención a Clientes / EVAP), desde el detalle de construcción DILESA.
 *
 * Flujo con candados (S1d):
 *   1. La recepción se PROGRAMA antes (estado 'programada') — este drawer solo
 *      se abre cuando ya está programada.
 *   2. Ciori recorre el checklist (Cumple / Con observación / N/A + nota).
 *   3. "Guardar avance" persiste sin cerrar (queda 'con_observaciones' si hay
 *      observaciones, 'programada' si va en verde).
 *   4. Con todo en verde: se imprime el acta llena (vista print), se firma y se
 *      sube el escaneado (rol 'acta_recepcion').
 *   5. "Marcar recibida" — habilitado solo con todo verde + acta subida. Llama
 *      `dilesa.fn_recepcion_cerrar`, que revalida (previas completas + sin
 *      observaciones + acta) y marca la tarea recepcion_final -> obra terminada.
 *
 * El gate de rol vive en la RPC + trigger; la UI espeja los candados para guiar.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Printer, Save } from 'lucide-react';

import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { WizardFileSlot } from '@/components/wizard/wizard-file-slot';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  RECEPCION_CHECKLIST,
  RECEPCION_ITEM_ESTADO_LABEL,
  type RecepcionChecklistRespuesta,
  type RecepcionItemEstado,
} from '@/lib/dilesa/recepcion-checklist';

type EstadoRecepcion = 'programada' | 'con_observaciones' | 'recibida' | 'rechazada';
type RespuestaUI = { estado: RecepcionItemEstado; nota: string };

export type RecepcionObraDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  construccionId: string;
  codigo: string;
  onDone: () => void;
};

const ITEM_ESTADOS: RecepcionItemEstado[] = ['cumple', 'observacion', 'na'];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildInitial(): Record<string, RespuestaUI> {
  const map: Record<string, RespuestaUI> = {};
  for (const sec of RECEPCION_CHECKLIST) {
    for (const item of sec.items) map[item.clave] = { estado: 'cumple', nota: '' };
  }
  return map;
}

export function RecepcionObraDrawer({
  open,
  onOpenChange,
  construccionId,
  codigo,
  onDone,
}: RecepcionObraDrawerProps) {
  const toast = useToast();
  const [recepcionId, setRecepcionId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoRecepcion>('programada');
  const [fechaProgramada, setFechaProgramada] = useState<string | null>(null);
  const [notas, setNotas] = useState('');
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaUI>>(buildInitial);
  const [seccionNA, setSeccionNA] = useState<Record<string, boolean>>({});
  const [actaSubida, setActaSubida] = useState(false);
  const [actaFile, setActaFile] = useState<File | null>(null);
  const [cargada, setCargada] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .schema('dilesa')
        .from('recepcion_obra')
        .select('id, estado, fecha_recepcion, fecha_programada, checklist, notas')
        .eq('construccion_id', construccionId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      const base = buildInitial();
      const naSec: Record<string, boolean> = {};
      if (data) {
        const prev = (data.checklist ?? []) as RecepcionChecklistRespuesta[];
        for (const r of prev)
          if (base[r.clave]) base[r.clave] = { estado: r.estado, nota: r.nota ?? '' };
        for (const sec of RECEPCION_CHECKLIST) {
          if (sec.opcional && sec.items.every((i) => base[i.clave]?.estado === 'na')) {
            naSec[sec.clave] = true;
          }
        }
        setRecepcionId(data.id as string);
        setEstado((data.estado as EstadoRecepcion) ?? 'programada');
        setFechaProgramada((data.fecha_programada as string | null) ?? null);
        setNotas((data.notas as string) ?? '');
        // ¿Ya hay acta firmada subida?
        const { count } = await sb
          .schema('erp')
          .from('adjuntos')
          .select('id', { count: 'exact', head: true })
          .eq('entidad_tipo', 'recepcion_obra')
          .eq('entidad_id', data.id)
          .eq('rol', 'acta_recepcion');
        if (activo) setActaSubida((count ?? 0) > 0);
      }
      setRespuestas(base);
      setSeccionNA(naSec);
      setActaFile(null);
      setCargada(true);
    })();
    return () => {
      activo = false;
    };
  }, [open, construccionId]);

  const resumen = useMemo(() => {
    let cumple = 0;
    let obs = 0;
    let na = 0;
    for (const sec of RECEPCION_CHECKLIST) {
      for (const item of sec.items) {
        const r = respuestas[item.clave];
        if (!r) continue;
        if (r.estado === 'cumple') cumple += 1;
        else if (r.estado === 'observacion') obs += 1;
        else na += 1;
      }
    }
    return { cumple, obs, na };
  }, [respuestas]);

  const todoVerde = resumen.obs === 0;

  function setItem(clave: string, patch: Partial<RespuestaUI>) {
    setRespuestas((prev) => ({ ...prev, [clave]: { ...prev[clave], ...patch } }));
  }

  function toggleSeccionNA(secClave: string, next: boolean) {
    setSeccionNA((prev) => ({ ...prev, [secClave]: next }));
    const sec = RECEPCION_CHECKLIST.find((s) => s.clave === secClave);
    if (!sec) return;
    setRespuestas((prev) => {
      const copy = { ...prev };
      for (const item of sec.items) {
        copy[item.clave] = { estado: next ? 'na' : 'cumple', nota: copy[item.clave]?.nota ?? '' };
      }
      return copy;
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next) setCargada(false);
    onOpenChange(next);
  }

  function buildChecklist(): RecepcionChecklistRespuesta[] {
    return RECEPCION_CHECKLIST.flatMap((s) =>
      s.items.map((i) => {
        const r = respuestas[i.clave] ?? { estado: 'cumple', nota: '' };
        return {
          clave: i.clave,
          estado: r.estado,
          ...(r.nota.trim() ? { nota: r.nota.trim() } : {}),
        };
      })
    );
  }

  function validarObservaciones(): boolean {
    const sinNota = RECEPCION_CHECKLIST.flatMap((s) => s.items).find((i) => {
      const r = respuestas[i.clave];
      return r?.estado === 'observacion' && !r.nota.trim();
    });
    if (sinNota) {
      toast.add({
        title: 'Falta describir una observación',
        description: `Anota la ubicación/detalle del daño en "${sinNota.etiqueta}".`,
        type: 'error',
      });
      return false;
    }
    return true;
  }

  /** Guarda el recorrido sin cerrar (queda en proceso). */
  async function guardarAvance() {
    if (!validarObservaciones()) return;
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.schema('dilesa').rpc('fn_recepcion_cerrar', {
      p_construccion_id: construccionId,
      p_checklist: buildChecklist(),
      p_notas: notas.trim() || undefined,
      p_fecha: hoyISO(),
      p_estado: todoVerde ? 'programada' : 'con_observaciones',
    });
    setSubmitting(false);
    if (error) {
      toast.add({
        title: 'No se pudo guardar el avance',
        description: getSupabaseErrorMessage(error, 'Error al guardar.'),
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Avance guardado',
      description: todoVerde
        ? 'Checklist en verde. Imprime el acta, fírmala y súbela para recibir.'
        : 'Quedaron observaciones por corregir con el contratista.',
      type: 'success',
    });
    onDone();
  }

  /** Sube el acta firmada (escaneada) ligada a la recepción. */
  async function subirActa(file: File | null) {
    setActaFile(file);
    if (!file || !recepcionId) return;
    const sb = createSupabaseBrowserClient();
    const path = buildAdjuntoPath({
      empresa: 'dilesa',
      entidad: 'recepcion_obra',
      entidadId: recepcionId,
      filename: file.name,
    });
    const { error: upErr } = await sb.storage.from('adjuntos').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (upErr) {
      toast.add({
        title: 'No se pudo subir el acta',
        description: getSupabaseErrorMessage(upErr, 'Reintenta.'),
        type: 'error',
      });
      return;
    }
    const { error: adjErr } = await sb
      .schema('erp')
      .from('adjuntos')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        entidad_tipo: 'recepcion_obra',
        entidad_id: recepcionId,
        rol: 'acta_recepcion',
        nombre: file.name,
        url: path,
        tipo_mime: file.type || null,
      });
    if (adjErr) {
      toast.add({
        title: 'Acta subida pero no registrada',
        description: getSupabaseErrorMessage(adjErr, 'Reintenta.'),
        type: 'error',
      });
      return;
    }
    setActaSubida(true);
    toast.add({ title: 'Acta firmada adjuntada', type: 'success' });
  }

  /** Cierre final: marca recibida (la RPC revalida los candados). */
  async function marcarRecibida() {
    if (!validarObservaciones()) return;
    if (!todoVerde) {
      toast.add({
        title: 'Hay observaciones pendientes',
        description: 'No puedes recibir con observaciones abiertas.',
        type: 'error',
      });
      return;
    }
    if (!actaSubida) {
      toast.add({
        title: 'Falta el acta firmada',
        description: 'Imprime el acta, recábala firmada y súbela antes de recibir.',
        type: 'error',
      });
      return;
    }
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.schema('dilesa').rpc('fn_recepcion_cerrar', {
      p_construccion_id: construccionId,
      p_checklist: buildChecklist(),
      p_notas: notas.trim() || undefined,
      p_fecha: hoyISO(),
      p_estado: 'recibida',
    });
    setSubmitting(false);
    if (error) {
      toast.add({
        title: 'No se pudo recibir la obra',
        description: getSupabaseErrorMessage(error, 'Error en el cierre.'),
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Obra recibida',
      description: 'La vivienda quedó marcada como terminada.',
      type: 'success',
    });
    handleOpenChange(false);
    onDone();
  }

  const yaRecibida = estado === 'recibida';

  return (
    <DetailDrawer
      open={open}
      onOpenChange={handleOpenChange}
      size="lg"
      title="Recepción de obra"
      description={codigo}
    >
      <DetailDrawerContent>
        {!cargada ? (
          <p className="py-8 text-center text-sm text-[var(--text)]/50">Cargando checklist…</p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-xs">
              <span className="text-[var(--text)]/70">
                {fechaProgramada ? `Programada para ${fechaProgramada}` : 'Recepción en proceso'}
              </span>
              <span>
                <span className="font-medium text-emerald-600">{resumen.cumple} cumplen</span> ·{' '}
                <span className="font-medium text-amber-600">{resumen.obs} obs.</span> ·{' '}
                <span className="text-[var(--text)]/45">{resumen.na} N/A</span>
              </span>
            </div>

            {yaRecibida ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-400/40 bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Esta obra ya fue recibida. Puedes consultar el checklist y el acta.</p>
              </div>
            ) : null}

            {RECEPCION_CHECKLIST.map((sec) => {
              const na = seccionNA[sec.clave] === true;
              return (
                <section key={sec.clave} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-1">
                    <h3 className="text-sm font-semibold text-[var(--text)]">{sec.titulo}</h3>
                    {sec.opcional ? (
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text)]/60">
                        <input
                          type="checkbox"
                          checked={na}
                          disabled={yaRecibida}
                          onChange={(e) => toggleSeccionNA(sec.clave, e.target.checked)}
                        />
                        No aplica (1 planta)
                      </label>
                    ) : null}
                  </div>

                  {na ? (
                    <p className="text-xs italic text-[var(--text)]/40">
                      Sección marcada como no aplica.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {sec.items.map((item) => {
                        const r = respuestas[item.clave] ?? { estado: 'cumple', nota: '' };
                        return (
                          <li
                            key={item.clave}
                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs text-[var(--text)]">{item.etiqueta}</span>
                              <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
                                {ITEM_ESTADOS.map((est) => (
                                  <button
                                    key={est}
                                    type="button"
                                    disabled={yaRecibida}
                                    onClick={() => setItem(item.clave, { estado: est })}
                                    className={`px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 ${
                                      r.estado === est
                                        ? est === 'cumple'
                                          ? 'bg-emerald-500 text-white'
                                          : est === 'observacion'
                                            ? 'bg-amber-500 text-white'
                                            : 'bg-[var(--text)]/40 text-white'
                                        : 'bg-[var(--panel)] text-[var(--text)]/60 hover:bg-[var(--bg)]/40'
                                    }`}
                                  >
                                    {RECEPCION_ITEM_ESTADO_LABEL[est]}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {r.estado === 'observacion' ? (
                              <Input
                                value={r.nota}
                                disabled={yaRecibida}
                                onChange={(e) => setItem(item.clave, { nota: e.target.value })}
                                placeholder="Ubicación / detalle del daño…"
                                className="mt-2 rounded-lg border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text)]"
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-[var(--text)]">
                Observaciones no contempladas en el checklist
              </span>
              <Textarea
                value={notas}
                disabled={yaRecibida}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Opcional…"
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            {/* Acta: imprimible en cualquier momento (para llevarla al recorrido o
                recabar firmas); la recepción solo se cierra con el acta subida + verde. */}
            {!yaRecibida ? (
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text)]">
                    Acta de recepción firmada
                  </span>
                  <a
                    href={`/dilesa/construccion/${construccionId}/acta-recepcion`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] underline"
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir acta
                  </a>
                </div>
                <p className="text-[11px] text-[var(--text)]/50">
                  Imprime el acta (sale con lo capturado), recábala firmada por Supervisor de Obra,
                  Contratista y Atención a Clientes, y súbela aquí. Es obligatoria para recibir.
                </p>
                <WizardFileSlot
                  role="acta_recepcion"
                  label={
                    actaSubida ? 'Acta firmada adjuntada — reemplazar' : 'Sube el acta firmada'
                  }
                  file={actaFile}
                  onChange={(f) => void subirActa(f)}
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                />
              </div>
            ) : null}

            {!yaRecibida ? (
              <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="text-sm text-muted-foreground hover:text-[var(--text)]"
                >
                  Cerrar
                </button>
                <Button
                  variant="outline"
                  onClick={() => void guardarAvance()}
                  disabled={submitting}
                >
                  <Save className="mr-2 h-4 w-4" /> Guardar avance
                </Button>
                <Button
                  onClick={() => void marcarRecibida()}
                  disabled={submitting || !todoVerde || !actaSubida}
                  title={
                    !todoVerde
                      ? 'Hay observaciones abiertas'
                      : !actaSubida
                        ? 'Falta subir el acta firmada'
                        : undefined
                  }
                >
                  <ClipboardCheck className="mr-2 h-4 w-4" /> Recibir obra
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

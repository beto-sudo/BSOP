'use client';

/**
 * RecepcionObraDrawer — captura de la RECEPCIÓN DE OBRA al contratista
 * (Atención a Clientes / EVAP), desde el detalle de construcción DILESA.
 *
 * Digitaliza el formato en papel "CHECK LIST PRE-ENTREGA VIVIENDA": Ciori
 * recorre la vivienda marcando cada punto (Cumple / Con observación / No aplica)
 * con su nota de ubicación del daño. Al cerrar como "Recibida", llama
 * `dilesa.fn_recepcion_cerrar`, que UPSERTea la recepción y marca (idempotente)
 * la tarea `hito_recepcion=recepcion_final` como terminada -> obra terminada.
 *
 * El gate "solo Atención a Clientes (+ Dirección/admin) recibe" vive en la RPC
 * y en el trigger `tg_recepcion_gate`; la UI solo muestra el botón a quien tiene
 * el sub-slug `dilesa.construccion.recepcion` write.
 *
 * Iniciativa dilesa-atencion-clientes (Sprint 1, S1b + S1c).
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck } from 'lucide-react';

import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  RECEPCION_CHECKLIST,
  RECEPCION_ITEM_ESTADO_LABEL,
  type RecepcionChecklistRespuesta,
  type RecepcionItemEstado,
} from '@/lib/dilesa/recepcion-checklist';

type EstadoRecepcion = 'recibida' | 'con_observaciones' | 'rechazada';

type RespuestaUI = { estado: RecepcionItemEstado; nota: string };

export type RecepcionObraDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  construccionId: string;
  /** Código de la obra para el encabezado. */
  codigo: string;
  /** Llamado tras cerrar con éxito — el detalle re-fetchea. */
  onDone: () => void;
};

const ESTADO_RECEPCION_OPTS: { value: EstadoRecepcion; label: string; hint: string }[] = [
  { value: 'recibida', label: 'Recibida', hint: 'Todo cumple — da la obra por terminada' },
  {
    value: 'con_observaciones',
    label: 'Con observaciones',
    hint: 'Hay detalles que el contratista debe corregir (no cierra la obra)',
  },
  { value: 'rechazada', label: 'Rechazada', hint: 'No se recibe (no cierra la obra)' },
];

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
  const [fecha, setFecha] = useState(hoyISO());
  const [estado, setEstado] = useState<EstadoRecepcion>('recibida');
  const [notas, setNotas] = useState('');
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaUI>>(buildInitial);
  /** Secciones opcionales (Planta Alta) marcadas "no aplica" en bloque. */
  const [seccionNA, setSeccionNA] = useState<Record<string, boolean>>({});
  const [cargada, setCargada] = useState(false);
  const [yaRecibida, setYaRecibida] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Carga la recepción existente (si la hay) para editar/re-revisar.
  useEffect(() => {
    if (!open) return;
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .schema('dilesa')
        .from('recepcion_obra')
        .select('estado, fecha_recepcion, checklist, notas')
        .eq('construccion_id', construccionId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (data) {
        const base = buildInitial();
        const naSec: Record<string, boolean> = {};
        const prev = (data.checklist ?? []) as RecepcionChecklistRespuesta[];
        for (const r of prev) {
          if (base[r.clave]) base[r.clave] = { estado: r.estado, nota: r.nota ?? '' };
        }
        // Reconstruye el flag de sección N/A si todos sus ítems vienen 'na'.
        for (const sec of RECEPCION_CHECKLIST) {
          if (sec.opcional && sec.items.every((i) => base[i.clave]?.estado === 'na')) {
            naSec[sec.clave] = true;
          }
        }
        setRespuestas(base);
        setSeccionNA(naSec);
        setEstado((data.estado as EstadoRecepcion) ?? 'recibida');
        setFecha((data.fecha_recepcion as string) ?? hoyISO());
        setNotas((data.notas as string) ?? '');
        setYaRecibida(data.estado === 'recibida');
      } else {
        setRespuestas(buildInitial());
        setSeccionNA({});
        setEstado('recibida');
        setFecha(hoyISO());
        setNotas('');
        setYaRecibida(false);
      }
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

  async function handleSubmit() {
    // Validación: si hay estado=observacion, exigir nota (es lo que se le dice al contratista).
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
      return;
    }
    if (estado === 'recibida' && resumen.obs > 0) {
      toast.add({
        title: 'Hay observaciones pendientes',
        description:
          'No puedes marcar "Recibida" con observaciones abiertas. Usa "Con observaciones" hasta que el contratista corrija.',
        type: 'error',
      });
      return;
    }

    const checklist: RecepcionChecklistRespuesta[] = RECEPCION_CHECKLIST.flatMap((s) =>
      s.items.map((i) => {
        const r = respuestas[i.clave] ?? { estado: 'cumple', nota: '' };
        return {
          clave: i.clave,
          estado: r.estado,
          ...(r.nota.trim() ? { nota: r.nota.trim() } : {}),
        };
      })
    );

    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.schema('dilesa').rpc('fn_recepcion_cerrar', {
      p_construccion_id: construccionId,
      p_checklist: checklist,
      p_notas: notas.trim() || undefined,
      p_fecha: fecha,
      p_estado: estado,
    });
    setSubmitting(false);

    if (error) {
      toast.add({
        title: 'No se pudo guardar la recepción',
        description: getSupabaseErrorMessage(error, 'Error en el cierre.'),
        type: 'error',
      });
      return;
    }
    toast.add({
      title:
        estado === 'recibida'
          ? 'Obra recibida'
          : estado === 'con_observaciones'
            ? 'Recepción guardada con observaciones'
            : 'Recepción registrada como rechazada',
      description: estado === 'recibida' ? 'La vivienda quedó marcada como terminada.' : undefined,
      type: 'success',
    });
    handleOpenChange(false);
    onDone();
  }

  return (
    <DetailDrawer
      open={open}
      onOpenChange={handleOpenChange}
      size="lg"
      title="Recibir obra al contratista"
      description={codigo}
    >
      <DetailDrawerContent>
        {!cargada ? (
          <p className="py-8 text-center text-sm text-[var(--text)]/50">Cargando checklist…</p>
        ) : (
          <div className="space-y-6">
            {yaRecibida ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-400/40 bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Esta obra ya fue recibida. Puedes consultar o corregir el checklist; volver a
                  guardar como «Recibida» mantiene la obra terminada.
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-[var(--text)]">
                Fecha de revisión
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="mt-1 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </label>
              <div className="flex items-end">
                <p className="text-xs text-[var(--text)]/60">
                  <span className="font-medium text-emerald-600">{resumen.cumple} cumplen</span> ·{' '}
                  <span className="font-medium text-amber-600">{resumen.obs} obs.</span> ·{' '}
                  <span className="text-[var(--text)]/45">{resumen.na} N/A</span>
                </p>
              </div>
            </div>

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
                                    onClick={() => setItem(item.clave, { estado: est })}
                                    className={`px-2 py-1 text-[11px] font-medium transition-colors ${
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
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Opcional…"
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-[var(--text)]">
                Resultado de la recepción
              </span>
              <div className="grid gap-2">
                {ESTADO_RECEPCION_OPTS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs ${
                      estado === opt.value
                        ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="estado_recepcion"
                      checked={estado === opt.value}
                      onChange={() => setEstado(opt.value)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-[var(--text)]">{opt.label}</span>
                      <span className="block text-[var(--text)]/55">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="text-sm text-muted-foreground hover:text-[var(--text)]"
              >
                Cancelar
              </button>
              <Button onClick={() => void handleSubmit()} disabled={submitting}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                {submitting
                  ? 'Guardando…'
                  : estado === 'recibida'
                    ? 'Recibir obra'
                    : 'Guardar recepción'}
              </Button>
            </div>
          </div>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

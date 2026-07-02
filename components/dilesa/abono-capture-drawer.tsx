'use client';

/**
 * AbonoCaptureDrawer — captura de un abono CxC desde el detalle de venta
 * DILESA. Reemplaza el form de Coda "Depositos Clientes".
 *
 * Llama `erp.cxc_pago_registrar`, que inserta el abono y lo auto-aplica
 * FIFO a los cargos abiertos de la venta (ver iniciativa `cxc`, ADR-037).
 * La fuente (cliente/institución) NO filtra esa aplicación FIFO, pero SÍ
 * pesa en la cuadratura (lib/dilesa/cuadratura.ts): los abonos
 * fuente='cliente' suman al Monto Disponible como depósito directo, y el
 * crédito de institución ya entra por los campos de crédito de la venta —
 * capturar la disposición del crédito como 'cliente' la cuenta doble (bug
 * operativo 2026-06-12). Por eso la fuente se pre-selecciona según el
 * siguiente cargo abierto y hay aviso inline si la etiqueta no cuadra.
 *
 * Recibo de caja XML (2026-06-12, decisión de Beto): el CFDI que emite
 * CONTPAQi por cada pago se sube aquí y es la FUENTE de los datos — fecha,
 * monto, forma de pago y referencia se extraen del XML (no se capturan a
 * mano) y el receptor se verifica contra el cliente de la venta (RFC, con
 * fallback a nombre). Desde 2026-07-01 (decisión de Beto) el XML y el
 * comprobante del depósito son OBLIGATORIOS: ningún abono queda en blanco —
 * sin comprobante no hay nada que copiar al expediente al detonar (caso
 * Salas), y la fecha del abono gobierna la fecha de detonación/comisiones. Mismatch de receptor exige confirmación explícita
 * (con coacreditados el recibo puede venir a nombre del cónyuge). El folio
 * fiscal va a `cxc_pagos.uuid_sat` (unique parcial: un recibo = un abono).
 *
 * Si el abono es de institución y la venta ya está detonada (o se detona
 * con este abono), el comprobante se copia solo al expediente de la venta
 * (trigger sobre `comprobante_adjunto_id`, migración 20260612173513).
 *
 * Gate "sin plan de pagos" (2026-06-17, incidente Arizpe Luna): si la venta
 * no tiene cargos (`erp.cxc_cargos` vacío), el FIFO del RPC no encuentra qué
 * cubrir y el abono queda 100% flotando (saldo a favor) sin avanzar la fase —
 * y se puede repetir, duplicando depósitos en silencio. El drawer bloquea el
 * submit y ofrece generar el plan ahí mismo (`dilesa.fn_generar_plan_pagos`).
 * Además, si tras registrar el abono quedó sin aplicarse (plan ya saldado),
 * avisa fuerte en vez de un "registrado" plano.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus } from 'lucide-react';
import { z } from 'zod';

import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { Form, FormActions, FormField, FormRow, useZodForm } from '@/components/forms';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { WizardFileSlot } from '@/components/wizard/wizard-file-slot';
import {
  mapFormaPagoSat,
  parseReciboCfdi,
  verificarReciboVsCliente,
  type ReciboPagoParsed,
  type VerificacionRecibo,
} from '@/lib/dilesa/cxc/cfdi-recibo';
import {
  abonoCubreMayormenteInstitucion,
  abonoQuedariaSinAplicar,
  sugerirFuenteAbono,
  type CargoAbiertoFuente,
} from '@/lib/dilesa/cxc/fuente-abono';
import { CfdiParseError } from '@/lib/cxp/cfdi-parser';
import type { Json } from '@/types/supabase';

const FUENTE_OPTIONS = [
  { value: 'cliente', label: 'Cliente' },
  { value: 'institucion', label: 'Institución' },
];

const FORMA_PAGO_OPTIONS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
];

const AbonoSchema = z.object({
  fecha: z.string().min(1, 'Indica la fecha del abono'),
  monto: z
    .string()
    .min(1, 'Indica el monto')
    .refine((v) => Number(v) > 0, 'El monto debe ser mayor a 0'),
  fuente: z.enum(['cliente', 'institucion']),
  forma_pago: z.string().default(''),
  referencia: z.string().default(''),
  notas: z.string().default(''),
});

type AbonoValues = z.infer<typeof AbonoSchema>;

const defaults: AbonoValues = {
  fecha: '',
  monto: '',
  fuente: 'cliente',
  forma_pago: '',
  referencia: '',
  notas: '',
};

export type AbonoCaptureDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ventaId: string;
  empresaId: string;
  personaId: string;
  clienteNombre: string;
  /** RFC del cliente (erp.personas.rfc) — verificación fuerte del recibo. */
  clienteRfc?: string | null;
  /** Llamado tras registrar con éxito — el detalle re-fetchea. */
  onDone: () => void;
};

export function AbonoCaptureDrawer({
  open,
  onOpenChange,
  ventaId,
  empresaId,
  personaId,
  clienteNombre,
  clienteRfc,
  onDone,
}: AbonoCaptureDrawerProps) {
  const toast = useToast();
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [recibo, setRecibo] = useState<File | null>(null);
  const [reciboXml, setReciboXml] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ReciboPagoParsed | null>(null);
  const [verif, setVerif] = useState<VerificacionRecibo | null>(null);
  const [confirmaOtroReceptor, setConfirmaOtroReceptor] = useState(false);
  const [editManual, setEditManual] = useState(false);
  const [empresaRfc, setEmpresaRfc] = useState<string | null>(null);
  // RFC del cliente: la prop manda si el caller la pasa (detalle de venta);
  // si viene `undefined` (p.ej. Cobranza · Pagos), se resuelve aquí desde
  // erp.personas — sin él, la verificación del recibo caería al nombre.
  const [rfcResuelto, setRfcResuelto] = useState<string | null>(null);
  // Cargos de la venta (todos, no solo los abiertos) en el orden FIFO del RPC.
  // Sirven para: (a) sugerir la fuente del abono y el aviso de etiqueta, (b)
  // detectar que la venta NO tiene plan de pagos (lista vacía → `sinPlan`).
  // `null` = aún cargando (no decidir el gate hasta saberlo).
  const [cargosVenta, setCargosVenta] = useState<CargoAbiertoFuente[] | null>(null);
  // Bump tras generar el plan inline → re-fetch de cargos sin reabrir el drawer.
  const [cargosRefreshKey, setCargosRefreshKey] = useState(0);
  const [generandoPlan, setGenerandoPlan] = useState(false);
  const form = useZodForm({ schema: AbonoSchema, defaultValues: defaults });

  // RFC de la empresa (emisor esperado del recibo) — 1 fetch por apertura.
  useEffect(() => {
    if (!open || empresaRfc !== null) return;
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .schema('core')
        .from('empresas')
        .select('rfc')
        .eq('id', empresaId)
        .maybeSingle();
      if (activo) setEmpresaRfc((data?.rfc as string | null) ?? '');
    })();
    return () => {
      activo = false;
    };
  }, [open, empresaId, empresaRfc]);

  useEffect(() => {
    if (!open || clienteRfc !== undefined) return;
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .schema('erp')
        .from('personas')
        .select('rfc')
        .eq('id', personaId)
        .maybeSingle();
      if (activo) setRfcResuelto((data?.rfc as string | null) ?? null);
    })();
    return () => {
      activo = false;
    };
  }, [open, personaId, clienteRfc]);

  const rfcCliente = clienteRfc !== undefined ? clienteRfc : rfcResuelto;

  // Cargos en cada apertura (los saldos cambian con cada abono; `reset()`
  // limpia al cerrar) y tras generar el plan inline (`cargosRefreshKey`). Si
  // lo siguiente por cubrir espera pago de institución, el abono casi seguro
  // es la disposición del crédito → pre-selecciona la fuente.
  useEffect(() => {
    if (!open) return;
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .schema('erp')
        .from('cxc_cargos')
        .select('saldo, fuente_esperada')
        .eq('origen_tipo', 'venta_dilesa')
        .eq('origen_id', ventaId)
        .neq('estado', 'cancelado')
        .is('deleted_at', null)
        .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
        .order('numero', { ascending: true });
      if (!activo) return;
      const cargos = ((data ?? []) as { saldo: number; fuente_esperada: string }[]).map((c) => ({
        saldo: Number(c.saldo),
        fuente_esperada: c.fuente_esperada,
      }));
      setCargosVenta(cargos);
      if (!form.formState.dirtyFields.fuente && sugerirFuenteAbono(cargos) === 'institucion') {
        form.setValue('fuente', 'institucion');
      }
    })();
    return () => {
      activo = false;
    };
  }, [open, ventaId, form, cargosRefreshKey]);

  // Venta sin plan de pagos: cero cargos. Hasta que `cargosVenta` resuelve
  // (`null`) no decidimos, para no parpadear el bloqueo mientras carga.
  const sinPlan = cargosVenta !== null && cargosVenta.length === 0;

  const fuenteSel = form.watch('fuente');
  const montoStr = form.watch('monto');
  const avisoFuenteCliente = useMemo(() => {
    if (fuenteSel !== 'cliente' || !cargosVenta?.length) return false;
    return abonoCubreMayormenteInstitucion(cargosVenta, Number(montoStr));
  }, [fuenteSel, montoStr, cargosVenta]);

  const handleGenerarPlanInline = async () => {
    setGenerandoPlan(true);
    try {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb
        .schema('dilesa')
        .rpc('fn_generar_plan_pagos', { p_venta_id: ventaId });
      if (error) {
        toast.add({
          title: 'No se pudo generar el plan',
          description: getSupabaseErrorMessage(error, 'Error en el RPC.'),
          type: 'error',
        });
        return;
      }
      toast.add({ title: 'Plan de pagos generado', type: 'success' });
      setCargosRefreshKey((k) => k + 1);
    } finally {
      setGenerandoPlan(false);
    }
  };

  const reset = () => {
    form.reset(defaults);
    setCargosVenta(null);
    setComprobante(null);
    setRecibo(null);
    setReciboXml(null);
    setParsed(null);
    setVerif(null);
    setConfirmaOtroReceptor(false);
    setEditManual(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  /** Campos de datos bloqueados mientras el XML es la fuente. */
  const lockCampos = parsed != null && !editManual;

  const handleXmlChange = async (file: File | null) => {
    if (!file) {
      // Quitar el XML desbloquea la captura manual (valores se conservan).
      setReciboXml(null);
      setParsed(null);
      setVerif(null);
      setConfirmaOtroReceptor(false);
      setEditManual(false);
      return;
    }
    let r: ReciboPagoParsed;
    try {
      r = parseReciboCfdi(await file.text());
    } catch (e) {
      toast.add({
        title: 'XML no válido como recibo de pago',
        description: e instanceof CfdiParseError ? e.message : 'No se pudo leer el archivo.',
        type: 'error',
      });
      return;
    }
    const v = verificarReciboVsCliente(
      r,
      { rfc: rfcCliente ?? null, nombre: clienteNombre },
      empresaRfc || null
    );
    setReciboXml(file);
    setParsed(r);
    setVerif(v);
    setConfirmaOtroReceptor(false);
    setEditManual(false);

    // El XML es la fuente de los datos del abono.
    form.setValue('fecha', r.fecha, { shouldValidate: true });
    form.setValue('monto', String(r.monto), { shouldValidate: true });
    const forma = mapFormaPagoSat(r.formaPagoSat);
    if (forma) form.setValue('forma_pago', forma);
    const ref = [r.serie, r.folio].filter(Boolean).join('-') || r.uuid.slice(0, 8);
    form.setValue('referencia', ref);
  };

  const handleSubmit = async (values: AbonoValues) => {
    if (sinPlan) {
      toast.add({
        title: 'Genera el plan de pagos primero',
        description:
          'Esta venta no tiene cargos: el abono quedaría flotando sin aplicarse y sin avanzar la fase.',
        type: 'error',
      });
      return;
    }
    // XML + comprobante obligatorios (2026-07-01): la fecha del abono gobierna
    // la detonación/comisiones y el comprobante viaja al expediente — ninguno
    // puede quedar en blanco.
    if (!reciboXml || !parsed) {
      toast.add({
        title: 'Falta el XML del recibo de caja',
        description:
          'Sube el CFDI del recibo de caja (XML) — es la fuente de fecha, monto y referencia del abono.',
        type: 'error',
      });
      return;
    }
    if (!comprobante) {
      toast.add({
        title: 'Falta el comprobante del depósito',
        description:
          'Sube el comprobante de la transferencia/depósito. En abonos de institución se copia solo al expediente de la venta.',
        type: 'error',
      });
      return;
    }
    if (parsed && verif && !verif.receptorCoincide && !confirmaOtroReceptor) {
      toast.add({
        title: 'El recibo es de otro receptor',
        description:
          'Confirma con la casilla que el recibo corresponde a esta venta, o sube el recibo correcto.',
        type: 'error',
      });
      return;
    }

    const sb = createSupabaseBrowserClient();
    const notasFinal = [
      values.notas || '',
      parsed && verif && !verif.receptorCoincide
        ? `[Recibo a nombre de ${parsed.receptorNombre ?? parsed.receptorRfc} (${parsed.receptorRfc}) — receptor distinto confirmado por quien captura]`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const { data: pagoId, error } = await sb.schema('erp').rpc('cxc_pago_registrar', {
      p_empresa_id: empresaId,
      p_persona_id: personaId,
      p_origen_id: ventaId,
      p_monto: Number(values.monto),
      p_fecha: values.fecha,
      p_fuente: values.fuente,
      p_forma_pago: values.forma_pago || undefined,
      p_referencia: values.referencia || undefined,
      p_uuid_sat: parsed?.uuid ?? undefined,
      p_notas: notasFinal || undefined,
    });

    if (error) {
      const esDuplicado =
        error.code === '23505' || /cxc_pagos_empresa_uuid_sat_uk/.test(error.message ?? '');
      toast.add({
        title: esDuplicado ? 'Este recibo ya está registrado' : 'No se pudo registrar el abono',
        description: esDuplicado
          ? `El folio fiscal ${parsed?.uuid ?? ''} ya existe en otro abono — un recibo de caja solo puede registrarse una vez.`
          : getSupabaseErrorMessage(error, 'Error en el RPC.'),
        type: 'error',
      });
      return;
    }

    // Sube los adjuntos ligados al abono recién creado (deferred upload,
    // ADR-022): el abono ya existe, así que tenemos su id como entidadId.
    // Roles espejo del módulo Coda "Depositos Clientes": el comprobante del
    // depósito lo trae ventas; el recibo de caja / factura lo emite CxC.
    if (typeof pagoId === 'string') {
      const subirAdjunto = async (
        file: File,
        rol: string,
        etiqueta: string,
        metadata?: Json
      ): Promise<string | null> => {
        const path = buildAdjuntoPath({
          empresa: 'dilesa',
          entidad: 'cxc_pagos',
          entidadId: pagoId,
          filename: file.name,
        });
        const { error: upErr } = await sb.storage.from('adjuntos').upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
        if (upErr) {
          toast.add({
            title: `Abono registrado, pero ${etiqueta} no se subió`,
            description: getSupabaseErrorMessage(upErr, 'Reintenta adjuntarlo desde el abono.'),
            type: 'error',
          });
          return null;
        }
        const { data: adjRow } = await sb
          .schema('erp')
          .from('adjuntos')
          .insert({
            empresa_id: empresaId,
            entidad_tipo: 'cxc_pago',
            entidad_id: pagoId,
            rol,
            nombre: file.name,
            url: path,
            tipo_mime: file.type || null,
            ...(metadata !== undefined ? { metadata } : {}),
          })
          .select('id')
          .single();
        return (adjRow?.id as string | undefined) ?? null;
      };

      if (comprobante) {
        const comprobanteId = await subirAdjunto(
          comprobante,
          'comprobante_deposito',
          'el comprobante'
        );
        // Liga el comprobante al pago: si la venta está detonada y el abono
        // es de institución, el trigger lo copia al expediente (imagen_detonacion).
        if (comprobanteId) {
          await sb
            .schema('erp')
            .from('cxc_pagos')
            .update({ comprobante_adjunto_id: comprobanteId })
            .eq('id', pagoId);
        }
      }
      if (recibo) await subirAdjunto(recibo, 'recibo_caja', 'el recibo de caja');
      if (reciboXml && parsed) {
        await subirAdjunto(reciboXml, 'recibo_caja_xml', 'el XML del recibo', {
          cfdi: {
            uuid: parsed.uuid,
            tipo: parsed.tipoComprobante,
            fecha: parsed.fecha,
            monto: parsed.monto,
            serie: parsed.serie,
            folio: parsed.folio,
            receptor_rfc: parsed.receptorRfc,
            receptor_nombre: parsed.receptorNombre,
            emisor_rfc: parsed.emisorRfc,
          },
          ...(verif
            ? {
                verificacion: {
                  receptor_coincide: verif.receptorCoincide,
                  verificado_por: verif.verificadoPor,
                  warnings: verif.warnings,
                  ...(verif.receptorCoincide
                    ? {}
                    : { confirmado_por_operador: confirmaOtroReceptor }),
                },
              }
            : {}),
        });
      }
    }

    // Aviso fuerte si el abono quedó 100% sin aplicar (saldo a favor = monto):
    // con el gate `sinPlan` activo esto solo ocurre con el plan ya saldado,
    // pero el operador debe enterarse en vez de ver un "registrado" plano.
    if (abonoQuedariaSinAplicar(cargosVenta ?? [], Number(values.monto))) {
      toast.add({
        title: 'Abono registrado, pero quedó sin aplicar',
        description:
          'No hay cargos abiertos que cubrir: el monto quedó como saldo a favor. Revisa el plan de pagos de la venta.',
        type: 'warning',
      });
    } else {
      toast.add({ title: 'Abono registrado', type: 'success' });
    }
    reset();
    onOpenChange(false);
    onDone();
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={handleOpenChange}
      size="sm"
      title="Registrar abono"
      description={clienteNombre}
    >
      <DetailDrawerContent>
        <Form form={form} onSubmit={handleSubmit} className="space-y-5">
          {sinPlan ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <p className="font-medium">Esta venta no tiene plan de pagos.</p>
                <p>
                  Sin cargos abiertos, el abono quedaría flotando sin aplicarse (saldo a favor) y no
                  avanzaría la fase. Genera el plan de pagos antes de registrar abonos.
                </p>
                <button
                  type="button"
                  onClick={() => void handleGenerarPlanInline()}
                  disabled={generandoPlan}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-100 px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-60 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
                >
                  {generandoPlan ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {generandoPlan ? 'Generando…' : 'Generar plan de pagos'}
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <span className="mb-1.5 block text-xs font-medium text-[var(--text)]">
              Recibo de caja (CFDI) *
            </span>
            <WizardFileSlot
              role="recibo_caja_xml"
              label="XML del recibo (obligatorio) — llena los datos solo"
              file={reciboXml}
              onChange={(f) => void handleXmlChange(f)}
              accept=".xml,text/xml,application/xml"
            />
            {parsed && verif ? (
              <div
                className={`mt-2 rounded-lg border p-3 text-xs ${
                  verif.receptorCoincide
                    ? 'border-emerald-400/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
                    : 'border-amber-400/50 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
                }`}
              >
                <div className="flex items-start gap-2">
                  {verif.receptorCoincide ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div className="space-y-1">
                    <p className="font-medium">
                      {verif.receptorCoincide
                        ? `Receptor verificado por ${verif.verificadoPor === 'rfc' ? 'RFC' : 'nombre'}`
                        : 'El receptor del recibo NO coincide con el cliente'}
                    </p>
                    <p>
                      {parsed.receptorNombre ?? '(sin nombre)'} · {parsed.receptorRfc} · Folio
                      fiscal …{parsed.uuid.slice(-8)}
                    </p>
                    {verif.warnings.map((w) => (
                      <p key={w} className="opacity-80">
                        {w}
                      </p>
                    ))}
                    {!verif.receptorCoincide ? (
                      <label className="mt-1 flex cursor-pointer items-start gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={confirmaOtroReceptor}
                          onChange={(e) => setConfirmaOtroReceptor(e.target.checked)}
                          className="mt-0.5"
                        />
                        El recibo corresponde a esta venta (coacreditado u otro receptor) —
                        registrar de todos modos
                      </label>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <FormRow cols={2}>
            <FormField name="fecha" label="Fecha" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="date"
                  disabled={lockCampos}
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>

            <FormField name="monto" label="Monto" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  disabled={lockCampos}
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          {lockCampos ? (
            <button
              type="button"
              onClick={() => setEditManual(true)}
              className="-mt-3 inline-flex items-center gap-1 text-xs text-[var(--text)]/60 underline hover:text-[var(--text)]"
            >
              <Pencil className="h-3 w-3" /> Editar datos manualmente (el XML deja de mandar)
            </button>
          ) : null}

          <FormRow cols={2}>
            <FormField
              name="fuente"
              label="Fuente"
              description="Cliente o institución (Infonavit/Fovissste/banco)"
            >
              {(field) => (
                <Combobox
                  id={field.id}
                  value={field.value}
                  onChange={field.onChange}
                  options={FUENTE_OPTIONS}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>

            <FormField name="forma_pago" label="Forma de pago">
              {(field) => (
                <Combobox
                  id={field.id}
                  value={field.value}
                  onChange={field.onChange}
                  options={FORMA_PAGO_OPTIONS}
                  placeholder="Sin especificar"
                  allowClear
                  disabled={lockCampos}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          {avisoFuenteCliente ? (
            <div className="-mt-3 flex items-start gap-2 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Este monto cubriría sobre todo el cargo que espera pago de{' '}
                <strong>institución</strong> (la disposición del crédito). Si lo pagó
                Infonavit/Fovissste/banco, cambia la fuente a «Institución» — etiquetado como
                «Cliente» se cuenta doble en la cuadratura (depósito + crédito).
              </p>
            </div>
          ) : null}

          <FormField name="referencia" label="Referencia">
            {(field) => (
              <Input
                {...field}
                id={field.id}
                placeholder="Folio, número de operación..."
                disabled={lockCampos}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>

          <FormField name="notas" label="Notas">
            {(field) => (
              <Textarea
                {...field}
                id={field.id}
                rows={2}
                placeholder="Opcional..."
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-[var(--text)]">
              Comprobante *
            </span>
            <WizardFileSlot
              role="comprobante_deposito"
              label="Comprobante del depósito (obligatorio)"
              file={comprobante}
              onChange={setComprobante}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-[var(--text)]">
              Recibo de caja / factura (PDF)
            </span>
            <WizardFileSlot
              role="recibo_caja"
              label="Versión imprimible (opcional)"
              file={recibo}
              onChange={setRecibo}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            />
          </div>

          <FormActions
            cancelLabel="Cancelar"
            submitLabel="Registrar abono"
            submittingLabel="Registrando..."
            submitIcon={<Plus className="h-4 w-4" />}
            submitDisabled={sinPlan}
            onCancel={() => handleOpenChange(false)}
            stretch
          />
        </Form>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

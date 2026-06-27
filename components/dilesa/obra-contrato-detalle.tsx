'use client';

/**
 * ObraContratoDetalle — secciones de un contrato de obra NO-vivienda en el
 * detalle de contrato (`/dilesa/construccion/contratos/[id]`).
 *
 * Iniciativa dilesa-contratos-estimaciones · Sprint 2 (antes
 * dilesa-contratos-obra · Sprint 4). Para los contratos cuyo `tipo` ≠
 * vivienda, el objeto no son lotes sino conceptos/frentes:
 *
 *   1. **Estado de cuenta** (`deriveEstadoCuenta`): contratado | devengado
 *      (Σ estimaciones autorizadas, D4) | por devengar | pendiente de
 *      autorizar | facturado | pagado | retenciones | anticipo.
 *   2. **Estimaciones con ciclo**: nacen en `borrador`; Dirección las
 *      autoriza (RPC `obra_estimacion_autorizar` — a partir de ahí cuentan
 *      como ejercido en `v_partida_control`); `pagada` la marca el pago CxP.
 *   3. **Factura del contrato** (D5): factura TOTAL por adelantado (RPC
 *      `cxp_factura_total_contrato`) cuyos avances se pagan con pagos
 *      parciales, O facturas por estimación. En el modo por-estimación la
 *      factura nace EN ESPERA del XML al autorizar (igual que los destajos de
 *      vivienda, iniciativa dilesa-obra-estimaciones-cxp · S1): aparece en la
 *      bandeja de CxP y administración sube el XML del contratista. Modos
 *      mutuamente excluyentes.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Banknote,
  CheckCircle2,
  Loader2,
  Plus,
  Receipt,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useEffectiveUser, usePermissions } from '@/components/providers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { CancelarConMotivoDialog } from '@/components/shared/cancelar-con-motivo-dialog';
import {
  deriveEstadoCuenta,
  excedeTopeContrato,
  findFacturaTotal,
  type FacturaCuenta,
  type ObraEstimacionEstado,
} from '@/lib/dilesa/contratos-estado-cuenta';

export type ObraEstimacion = {
  id: string;
  orden: number;
  etiqueta: string;
  fecha: string | null;
  factura_ref: string | null;
  monto_total: number;
  retencion: number;
  es_anticipo: boolean;
  es_finiquito: boolean;
  nota_pago: string | null;
  /** Ciclo D2/D4: borrador → autorizada (Dirección) → pagada. */
  estado: ObraEstimacionEstado;
  autorizada_at: string | null;
  /** Cancelada (p2p-cancelaciones): visible con badge, excluida del devengo. */
  cancelada_at: string | null;
  motivo_cancelacion: string | null;
  /** S2: motivo del override del tope vs contrato (obra extra). NULL = dentro del valor. */
  tope_override_motivo: string | null;
  /** S3: anticipo amortizado en este avance (congelado al autorizar). */
  amortizacion_aplicada: number;
};

type FacturaContrato = FacturaCuenta & { id: string; fecha_emision: string | null };

/** Pago CxP ligado a una estimación (S3: cxp_pagos.obra_estimacion_id). */
type PagoEstimacion = { id: string; estado: string };

/** Badge del pago CxP ligado (ciclo programado → aprobado → pagado). */
const ESTADO_PAGO: Record<string, { label: string; cls: string }> = {
  programado: { label: 'pago programado', cls: 'bg-amber-500/15 text-amber-600' },
  aprobado: { label: 'pago aprobado', cls: 'bg-amber-500/15 text-amber-600' },
  pagado: { label: 'pagado', cls: 'bg-emerald-500/15 text-emerald-600' },
};

/** Estado CxP de la factura de egreso ligada → etiqueta + estilo del badge. */
const ESTADO_CXP: Record<string, { label: string; cls: string }> = {
  borrador: { label: 'borrador', cls: 'bg-[var(--text)]/10 text-[var(--text)]/60' },
  por_pagar: { label: 'por pagar', cls: 'bg-amber-500/15 text-amber-600' },
  parcial: { label: 'parcial', cls: 'bg-amber-500/15 text-amber-600' },
  pagada: { label: 'pagada', cls: 'bg-emerald-500/15 text-emerald-600' },
  cancelada: { label: 'cancelada', cls: 'bg-[var(--text)]/10 text-[var(--text)]/40' },
};

/** Badge del ciclo de la estimación (D2/D4). */
const ESTADO_ESTIMACION: Record<ObraEstimacionEstado, { label: string; cls: string }> = {
  borrador: { label: 'borrador', cls: 'bg-[var(--text)]/10 text-[var(--text)]/60' },
  autorizada: { label: 'autorizada', cls: 'bg-[var(--accent)]/10 text-[var(--accent)]' },
  pagada: { label: 'pagada', cls: 'bg-emerald-500/15 text-emerald-600' },
  cancelada: { label: 'cancelada', cls: 'bg-destructive/10 text-destructive' },
};

export function ObraContratoDetalle({
  contratoId,
  valorTotal,
  anticipoPct,
  retencionPct,
}: {
  contratoId: string;
  valorTotal: number;
  anticipoPct: number;
  retencionPct: number;
}) {
  const { permissions } = usePermissions();
  const { data: effectiveUser } = useEffectiveUser();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const puedeCrear =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.contratos')?.write === true;
  // Autorizar estimaciones = Dirección (D2). Mismo criterio que la RPC
  // (erp.fn_es_direccion): admin global O rol "Dirección" en DILESA.
  const esDireccion =
    !!effectiveUser?.isAdmin ||
    (effectiveUser?.direccionEmpresaIds ?? []).includes(DILESA_EMPRESA_ID);

  const [estimaciones, setEstimaciones] = useState<ObraEstimacion[]>([]);
  /** Facturas del contrato (total + por estimación), via contrato_id (S1). */
  const [facturas, setFacturas] = useState<FacturaContrato[]>([]);
  /** Pago CxP activo por estimación (S3). */
  const [pagosByEst, setPagosByEst] = useState<Map<string, PagoEstimacion>>(new Map());
  const [emitiendo, setEmitiendo] = useState<string | null>(null);
  const [autorizando, setAutorizando] = useState<string | null>(null);
  const [programando, setProgramando] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form inline
  const [open, setOpen] = useState(false);
  const [etiqueta, setEtiqueta] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [factura, setFactura] = useState('');
  const [monto, setMonto] = useState('');
  const [esAnticipo, setEsAnticipo] = useState(false);
  const [esFiniquito, setEsFiniquito] = useState(false);
  const [nota, setNota] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Columnas del ciclo (estado/autorizada_at/retencion) — S1 aún no está
    // en types/supabase.ts (se regeneran al aplicar la migración a prod).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: e } = await (sb.schema('dilesa') as any)
      .from('obra_estimaciones')
      .select(
        'id, orden, etiqueta, fecha, factura_ref, monto_total, retencion, es_anticipo, es_finiquito, nota_pago, estado, autorizada_at, cancelada_at, motivo_cancelacion, tope_override_motivo, amortizacion_aplicada'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('contrato_id', contratoId)
      .is('deleted_at', null)
      .order('orden', { ascending: true });
    if (e) {
      setError(getSupabaseErrorMessage(e, 'No se pudieron cargar las estimaciones.'));
      setEstimaciones([]);
      setFacturas([]);
      setLoading(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: ObraEstimacion[] = ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      orden: Number(r.orden ?? 0),
      etiqueta: (r.etiqueta as string) ?? '',
      fecha: (r.fecha as string | null) ?? null,
      factura_ref: (r.factura_ref as string | null) ?? null,
      monto_total: Number(r.monto_total ?? 0),
      retencion: Number(r.retencion ?? 0),
      es_anticipo: Boolean(r.es_anticipo),
      es_finiquito: Boolean(r.es_finiquito),
      nota_pago: (r.nota_pago as string | null) ?? null,
      estado: (r.estado as ObraEstimacionEstado) ?? 'borrador',
      autorizada_at: (r.autorizada_at as string | null) ?? null,
      cancelada_at: (r.cancelada_at as string | null) ?? null,
      motivo_cancelacion: (r.motivo_cancelacion as string | null) ?? null,
      tope_override_motivo: (r.tope_override_motivo as string | null) ?? null,
      amortizacion_aplicada: Number(r.amortizacion_aplicada ?? 0),
    }));
    setEstimaciones(rows);

    // Facturas del contrato (D5): la TOTAL (sin estimación de origen) y las
    // por-estimación (heredan contrato_id desde S1). `contrato_id` aún no
    // está en types — mismo eslint-disable de arriba.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: facs, error: fe } = await (sb.schema('erp') as any)
      .from('facturas')
      .select(
        'id, total, monto_pagado, estado_cxp, cancelada_at, obra_estimacion_id, fecha_emision'
      )
      .eq('contrato_id', contratoId);
    if (fe) {
      setError(getSupabaseErrorMessage(fe, 'No se pudieron cargar las facturas del contrato.'));
      setFacturas([]);
      setLoading(false);
      return;
    }
    setFacturas(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((facs ?? []) as any[]).map((f) => ({
        id: f.id as string,
        total: Number(f.total ?? 0),
        monto_pagado: Number(f.monto_pagado ?? 0),
        estado_cxp: (f.estado_cxp as string) ?? 'por_pagar',
        cancelada_at: (f.cancelada_at as string | null) ?? null,
        obra_estimacion_id: (f.obra_estimacion_id as string | null) ?? null,
        fecha_emision: (f.fecha_emision as string | null) ?? null,
      }))
    );

    // Pagos CxP ligados a las estimaciones (S3) — solo activos.
    const pagoMap = new Map<string, PagoEstimacion>();
    if (rows.length) {
      // `obra_estimacion_id` (S1) aún no en types — mismo cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pagos, error: pe } = await (sb.schema('erp') as any)
        .from('cxp_pagos')
        .select('id, estado, obra_estimacion_id')
        .in(
          'obra_estimacion_id',
          rows.map((r) => r.id)
        )
        .is('deleted_at', null);
      if (pe) {
        setError(getSupabaseErrorMessage(pe, 'No se pudieron cargar los pagos ligados.'));
        setLoading(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (pagos ?? []) as any[]) {
        const eid = p.obra_estimacion_id as string | null;
        const estado = (p.estado as string) ?? 'programado';
        if (eid && estado !== 'cancelado' && estado !== 'rechazado') {
          pagoMap.set(eid, { id: p.id as string, estado });
        }
      }
    }
    setPagosByEst(pagoMap);
    setLoading(false);
  }, [sb, contratoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cuenta = useMemo(
    () => deriveEstadoCuenta(valorTotal, estimaciones, facturas),
    [valorTotal, estimaciones, facturas]
  );
  const facturaTotal = useMemo(() => findFacturaTotal(facturas), [facturas]);
  /** factura por estimación activa, por id de estimación. */
  const facturaByEst = useMemo(() => {
    const m = new Map<string, FacturaContrato>();
    for (const f of facturas) {
      if (f.obra_estimacion_id && f.cancelada_at == null && f.estado_cxp !== 'cancelada') {
        m.set(f.obra_estimacion_id, f);
      }
    }
    return m;
  }, [facturas]);

  /** Estimación que se está cancelando (monta el diálogo de motivo on-demand). */
  const [cancelando, setCancelando] = useState<ObraEstimacion | null>(null);

  // Cancelar una estimación con motivo (RPC valida gating + que no tenga factura/pago CxP).
  const cancelarEstimacion = useCallback(
    async (estId: string, motivo: string) => {
      const { error: e } = await sb
        .schema('dilesa')
        .rpc('obra_estimacion_cancelar', { p_estimacion_id: estId, p_motivo: motivo });
      if (e) {
        toast.add({
          title: 'No se pudo cancelar',
          description: getSupabaseErrorMessage(e, 'Error al cancelar la estimación.'),
          type: 'error',
        });
        throw e; // mantiene el diálogo abierto
      }
      toast.add({ title: 'Estimación cancelada', type: 'success' });
      await cargar();
    },
    [sb, toast, cargar]
  );

  // Programar pago (S3): neto tras retención, aplicado a la factura propia
  // o a la factura TOTAL del contrato. El pago sigue el ciclo CxP normal.
  const programarPago = useCallback(
    async (est: ObraEstimacion) => {
      if (programando) return;
      setProgramando(est.id);
      // RPC S3 aún no en types — mismo cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any).rpc('cxp_pago_desde_estimacion', {
        p_estimacion_id: est.id,
      });
      if (e) {
        toast.add({
          title: 'No se pudo programar el pago',
          description: getSupabaseErrorMessage(e, 'Error al programar el pago de la estimación.'),
          type: 'error',
        });
      } else {
        toast.add({
          title: 'Pago programado',
          description: `Neto de «${est.etiqueta}» en CxP — sigue aprobar y pagar allá.`,
          type: 'success',
        });
        await cargar();
      }
      setProgramando(null);
    },
    [sb, toast, cargar, programando]
  );

  /** Estimación que se autoriza por encima del contrato (monta el diálogo de override). */
  const [overrideTarget, setOverrideTarget] = useState<ObraEstimacion | null>(null);

  // Autorizar (D2): solo Dirección; la RPC re-valida server-side (incl. el tope
  // vs contrato del S2). `overrideMotivo` se pasa cuando Dirección autoriza obra
  // extra por encima del valor del contrato. Devuelve si autorizó (el diálogo de
  // override lo usa para mantenerse abierto ante un error).
  const autorizar = useCallback(
    async (est: ObraEstimacion, overrideMotivo?: string): Promise<boolean> => {
      if (autorizando) return false;
      setAutorizando(est.id);
      try {
        // RPC S2 aún no en types — mismo patrón de cast que las queries.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: e } = await (sb.schema('dilesa') as any).rpc('obra_estimacion_autorizar', {
          p_estimacion_id: est.id,
          p_override_motivo: overrideMotivo ?? null,
        });
        if (e) {
          toast.add({
            title: 'No se pudo autorizar',
            description: getSupabaseErrorMessage(e, 'Error al autorizar la estimación.'),
            type: 'error',
          });
          return false;
        }
        toast.add({
          title: overrideMotivo ? 'Autorizada con override' : 'Estimación autorizada',
          description: overrideMotivo
            ? `«${est.etiqueta}» se autorizó como obra extra por encima del contrato.`
            : `«${est.etiqueta}» ya cuenta como devengo del contrato.`,
          type: 'success',
        });
        await cargar();
        return true;
      } finally {
        setAutorizando(null);
      }
    },
    [sb, toast, cargar, autorizando]
  );

  // Click "Autorizar": si lleva el devengado por encima del valor del contrato,
  // pide override de Dirección (motivo); si no, autoriza directo. El server
  // re-valida el tope de todos modos.
  const onAutorizarClick = useCallback(
    (est: ObraEstimacion) => {
      if (excedeTopeContrato(cuenta.devengado, est.monto_total, valorTotal)) {
        setOverrideTarget(est);
      } else {
        void autorizar(est);
      }
    },
    [cuenta.devengado, valorTotal, autorizar]
  );

  const montoNum = Number(monto) || 0;
  const canSubmit = etiqueta.trim().length > 0 && montoNum !== 0;

  function resetForm() {
    setEtiqueta('');
    setFecha(new Date().toISOString().slice(0, 10));
    setFactura('');
    setMonto('');
    setEsAnticipo(false);
    setEsFiniquito(false);
    setNota('');
  }

  async function onSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const orden = estimaciones.reduce((m, e) => Math.max(m, e.orden), 0) + 1;
    const { error: e } = await sb
      .schema('dilesa')
      .from('obra_estimaciones')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        contrato_id: contratoId,
        etiqueta: etiqueta.trim(),
        orden,
        fecha: fecha || null,
        factura_ref: factura.trim() || null,
        monto_total: montoNum,
        es_anticipo: esAnticipo,
        es_finiquito: esFiniquito,
        nota_pago: nota.trim() || null,
      });
    if (e) {
      toast.add({
        title: 'Error al registrar',
        description: getSupabaseErrorMessage(e, 'No se pudo registrar la estimación.'),
        type: 'error',
      });
      setSubmitting(false);
      return;
    }
    toast.add({
      title: 'Estimación registrada (borrador)',
      description: 'Dirección debe autorizarla para que cuente como devengo.',
      type: 'success',
    });
    resetForm();
    setOpen(false);
    setSubmitting(false);
    void cargar();
  }

  // Puente CxP (S1 dilesa-obra-estimaciones-cxp): manda la estimación AUTORIZADA
  // a CxP EN ESPERA del XML (no «por pagar»). Al autorizar ya nace el placeholder
  // automáticamente; este botón cubre las autorizadas sin factura (históricas).
  async function emitir(estId: string) {
    if (emitiendo) return;
    setEmitiendo(estId);
    // RPC S1 aún no en types — mismo patrón de cast que las queries.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (sb.schema('erp') as any).rpc(
      'cxp_factura_desde_estimacion_obra_espera',
      { p_estimacion_id: estId }
    );
    if (e) {
      toast.add({
        title: 'No se pudo enviar a CxP',
        description: getSupabaseErrorMessage(e, 'Error al crear la factura en espera.'),
        type: 'error',
      });
    } else {
      toast.add({
        title: 'Enviada a CxP (en espera del XML)',
        description:
          'Aparece en la bandeja de CxP — sube el XML del contratista allá para pasarla a por pagar.',
        type: 'success',
      });
      await cargar();
    }
    setEmitiendo(null);
  }

  return (
    <>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
            Estado de cuenta
          </h2>
          <span className="text-xs text-[var(--text)]/50">
            anticipo {anticipoPct ?? 0}% · retención {retencionPct ?? 0}%
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Contratado" value={formatCurrency(cuenta.contratado)} />
          <Stat
            label={`Devengado (${cuenta.avancePct.toFixed(0)}%)`}
            value={formatCurrency(cuenta.devengado)}
            hint="Σ estimaciones autorizadas"
          />
          <Stat label="Por devengar" value={formatCurrency(cuenta.porDevengar)} accent />
          <Stat
            label="Pendiente de autorizar"
            value={
              cuenta.pendienteAutorizar === 0 ? '—' : formatCurrency(cuenta.pendienteAutorizar)
            }
            warn={cuenta.pendienteAutorizar !== 0}
            hint={cuenta.pendienteAutorizar === 0 ? undefined : 'borradores sin devengar'}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Facturado" value={formatCurrency(cuenta.facturado)} small />
          <Stat label="Pagado" value={formatCurrency(cuenta.pagado)} small />
          <Stat
            label="Retenciones"
            value={cuenta.retenciones === 0 ? '—' : formatCurrency(cuenta.retenciones)}
            small
          />
          <Stat
            label="Anticipo por amortizar"
            value={
              cuenta.anticipoEntregado === 0
                ? '—'
                : `${formatCurrency(cuenta.anticipoPorAmortizar)} de ${formatCurrency(cuenta.anticipoEntregado)}`
            }
            small
          />
        </div>
      </section>

      <FacturaDelContrato
        contratoId={contratoId}
        valorTotal={valorTotal}
        facturaTotal={facturaTotal}
        hayFacturasPorEstimacion={facturaByEst.size > 0}
        puedeCrear={puedeCrear}
        onChanged={cargar}
      />

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
            Estimaciones
          </h2>
          <span className="text-xs text-[var(--text)]/50">
            {estimaciones.length} · la estimación autorizada es el devengo del contrato
          </span>
        </div>

        {puedeCrear ? (
          open ? (
            <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Estimación / etiqueta *">
                  <Input
                    value={etiqueta}
                    onChange={(e) => setEtiqueta(e.target.value)}
                    placeholder="Anticipo, 1, 2A, Finiquito…"
                  />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </Field>
                <Field label="# Factura">
                  <Input
                    value={factura}
                    onChange={(e) => setFactura(e.target.value)}
                    placeholder="A-915"
                  />
                </Field>
                <Field label="Monto (c/IVA) *">
                  <Input
                    type="number"
                    step="0.01"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Nota de pago">
                  <Input
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="pagada, pag 13 oct…"
                  />
                </Field>
                <div className="flex items-end gap-4 pb-1.5 text-sm text-[var(--text)]/80">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={esAnticipo}
                      onChange={(e) => setEsAnticipo(e.target.checked)}
                    />
                    Anticipo
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={esFiniquito}
                      onChange={(e) => setEsFiniquito(e.target.checked)}
                    />
                    Finiquito
                  </label>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-[var(--text)]/50">
                Captura el avance <strong>bruto</strong>. Nace en <strong>borrador</strong>;
                Dirección la autoriza para que cuente como devengo. Al autorizar, el sistema{' '}
                <strong>amortiza el anticipo automáticamente</strong> (anticipo % del avance) y la
                factura/pago salen netos — ya no hace falta capturar la amortización a mano.
              </p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Registrar
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Registrar estimación
            </button>
          )
        ) : null}

        {/* Tabla de estimaciones */}
        {loading ? (
          <p className="text-sm text-[var(--text)]/60">Cargando…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : estimaciones.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text)]/60">
            <Receipt className="h-4 w-4" /> Sin estimaciones todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                  <th className="py-1.5 pr-3">#</th>
                  <th className="py-1.5 pr-3">Estimación</th>
                  <th className="py-1.5 pr-3">Estado</th>
                  <th className="py-1.5 pr-3">Fecha</th>
                  <th className="py-1.5 pr-3">Factura</th>
                  <th className="py-1.5 pr-3 text-right">Monto</th>
                  <th className="py-1.5 pr-3">Nota</th>
                  <th className="py-1.5 pr-3">CxP</th>
                  <th className="py-1.5 pr-3">Pago</th>
                  <th className="py-1.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {estimaciones.map((e) => (
                  <tr
                    key={e.id}
                    className={`border-b border-[var(--border)]/40 ${e.estado === 'cancelada' ? 'opacity-55' : ''}`}
                  >
                    <td className="py-1.5 pr-3 tabular-nums text-[var(--text)]/50">{e.orden}</td>
                    <td className="py-1.5 pr-3">
                      <span className={e.estado === 'cancelada' ? 'line-through' : ''}>
                        {e.etiqueta}
                      </span>
                      {e.es_anticipo ? (
                        <span className="ml-1.5 rounded bg-[var(--accent)]/10 px-1 text-[10px] text-[var(--accent)]">
                          anticipo
                        </span>
                      ) : null}
                      {e.es_finiquito ? (
                        <span className="ml-1.5 rounded bg-[var(--accent)]/10 px-1 text-[10px] text-[var(--accent)]">
                          finiquito
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        title={
                          e.estado === 'cancelada'
                            ? (e.motivo_cancelacion ?? undefined)
                            : e.autorizada_at
                              ? `Autorizada ${e.autorizada_at.slice(0, 10)}`
                              : undefined
                        }
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${ESTADO_ESTIMACION[e.estado].cls}`}
                      >
                        {ESTADO_ESTIMACION[e.estado].label}
                      </span>
                      {e.tope_override_motivo ? (
                        <span
                          title={`Obra extra (override del tope): ${e.tope_override_motivo}`}
                          className="ml-1 inline-block rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-medium text-amber-600"
                        >
                          obra extra
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 text-[var(--text)]/70">{e.fecha ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-[var(--text)]/70">{e.factura_ref ?? '—'}</td>
                    <td
                      className={`py-1.5 pr-3 text-right tabular-nums ${e.monto_total < 0 ? 'text-destructive' : 'text-[var(--text)]'}`}
                    >
                      {formatCurrency(e.monto_total)}
                      {e.amortizacion_aplicada > 0 ? (
                        <div
                          className="text-[10px] text-amber-600"
                          title="Amortización del anticipo descontada del neto a CxP"
                        >
                          − amort {formatCurrency(e.amortizacion_aplicada)}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 text-[var(--text)]/60">{e.nota_pago ?? '—'}</td>
                    <td className="py-1.5 pr-3">
                      <CeldaCxP
                        est={e}
                        factura={facturaByEst.get(e.id) ?? null}
                        hayFacturaTotal={facturaTotal != null}
                        puedeCrear={puedeCrear}
                        emitiendo={emitiendo === e.id}
                        onEmitir={() => void emitir(e.id)}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <CeldaPago
                        est={e}
                        pago={pagosByEst.get(e.id) ?? null}
                        tieneFactura={facturaByEst.has(e.id) || facturaTotal != null}
                        puedeCrear={puedeCrear}
                        programando={programando === e.id}
                        onProgramar={() => void programarPago(e)}
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        {e.estado === 'borrador' && esDireccion ? (
                          <button
                            type="button"
                            onClick={() => onAutorizarClick(e)}
                            disabled={autorizando === e.id}
                            title="Autorizar (Dirección): la estimación pasa a contar como devengo"
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/40 px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
                          >
                            {autorizando === e.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3 w-3" />
                            )}
                            Autorizar
                          </button>
                        ) : null}
                        {e.estado !== 'cancelada' && e.estado !== 'pagada' && puedeCrear ? (
                          <button
                            type="button"
                            onClick={() => setCancelando(e)}
                            title="Cancelar estimación"
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text)]/60 hover:border-destructive hover:text-destructive"
                          >
                            <Ban className="h-3 w-3" />
                            Cancelar
                          </button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cancelando ? (
          <CancelarConMotivoDialog
            key={cancelando.id}
            title="Cancelar estimación"
            description={`Se cancelará «${cancelando.etiqueta}». Quedará visible como cancelada y dejará de contar en el devengo. No se puede deshacer.`}
            confirmLabel="Cancelar estimación"
            placeholder="Ej. error de captura, monto equivocado…"
            onClose={() => setCancelando(null)}
            onConfirm={(motivo) => cancelarEstimacion(cancelando.id, motivo)}
          />
        ) : null}

        {overrideTarget ? (
          <CancelarConMotivoDialog
            key={`override-${overrideTarget.id}`}
            title="Autorizar como obra extra"
            description={`Autorizar «${overrideTarget.etiqueta}» (${formatCurrency(overrideTarget.monto_total)}) lleva el devengado por encima del valor del contrato (${formatCurrency(valorTotal)}). Indica el motivo del override de Dirección (obra extra). Queda registrado y auditado.`}
            confirmLabel="Autorizar con override"
            submittingLabel="Autorizando…"
            confirmVariant="default"
            placeholder="Ej. obra extra autorizada por…, volumen adicional…"
            onClose={() => setOverrideTarget(null)}
            onConfirm={async (motivo) => {
              const ok = await autorizar(overrideTarget, motivo);
              if (!ok) throw new Error('falló la autorización'); // mantiene el diálogo abierto
            }}
          />
        ) : null}
      </section>
    </>
  );
}

/**
 * Celda CxP por estimación: estado de su factura ligada, o el botón "Enviar a
 * CxP" (solo estimaciones autorizadas con monto > 0 y sin factura total del
 * contrato — en ese modo los avances se pagan contra la factura total, S3). Al
 * autorizar ya nace el placeholder en espera; el botón cubre las autorizadas
 * sin factura (históricas) y las manda a CxP en espera del XML (S1).
 */
function CeldaCxP({
  est,
  factura,
  hayFacturaTotal,
  puedeCrear,
  emitiendo,
  onEmitir,
}: {
  est: ObraEstimacion;
  factura: { estado_cxp: string } | null;
  hayFacturaTotal: boolean;
  puedeCrear: boolean;
  emitiendo: boolean;
  onEmitir: () => void;
}) {
  if (est.estado === 'cancelada') return <span className="text-[var(--text)]/30">—</span>;
  if (factura) {
    const meta = ESTADO_CXP[factura.estado_cxp] ?? {
      label: factura.estado_cxp,
      cls: 'bg-[var(--text)]/10 text-[var(--text)]/60',
    };
    return (
      <Link
        href="/dilesa/cxp"
        title="Ver en Cuentas por Pagar"
        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}
      >
        {meta.label}
      </Link>
    );
  }
  if (hayFacturaTotal) {
    return (
      <span
        title="El contrato tiene factura total: los avances se pagan aplicando pagos a esa factura"
        className="text-[10px] text-[var(--text)]/40"
      >
        → fact. total
      </span>
    );
  }
  if (est.estado === 'borrador') {
    return (
      <span title="Autoriza la estimación para enviarla a CxP" className="text-[var(--text)]/30">
        —
      </span>
    );
  }
  if (est.monto_total > 0 && puedeCrear) {
    return (
      <button
        type="button"
        onClick={onEmitir}
        disabled={emitiendo}
        title="Enviar a CxP en espera del XML del contratista"
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text)]/70 hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
      >
        {emitiendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        Enviar a CxP
      </button>
    );
  }
  return <span className="text-[var(--text)]/30">—</span>;
}

/**
 * Celda Pago por estimación (S3): el pago CxP ligado (programado → aprobado →
 * pagado, link a CxP·Pagos) o el botón "Programar pago" — solo estimaciones
 * AUTORIZADAS con neto > 0 y con factura destino (propia o total del
 * contrato). La RPC re-valida todo server-side.
 */
function CeldaPago({
  est,
  pago,
  tieneFactura,
  puedeCrear,
  programando,
  onProgramar,
}: {
  est: ObraEstimacion;
  pago: PagoEstimacion | null;
  tieneFactura: boolean;
  puedeCrear: boolean;
  programando: boolean;
  onProgramar: () => void;
}) {
  if (pago) {
    const meta = ESTADO_PAGO[pago.estado] ?? {
      label: pago.estado,
      cls: 'bg-[var(--text)]/10 text-[var(--text)]/60',
    };
    return (
      <Link
        href={`/dilesa/cxp/pagos?focus=${pago.id}`}
        title="Ver en CxP · Pagos"
        className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}
      >
        {meta.label}
      </Link>
    );
  }
  // Neto a pagar: monto − retención − amortización del anticipo (S3). Espejo del
  // cálculo server-side en cxp_pago_desde_estimacion.
  const neto = (est.monto_total ?? 0) - (est.retencion ?? 0) - (est.amortizacion_aplicada ?? 0);
  if (est.estado === 'autorizada' && neto > 0 && tieneFactura && puedeCrear) {
    return (
      <button
        type="button"
        onClick={onProgramar}
        disabled={programando}
        title={`Programar pago en CxP por el neto (${formatCurrency(neto)})`}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text)]/70 hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
      >
        {programando ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Banknote className="h-3 w-3" />
        )}
        Programar pago
      </button>
    );
  }
  return <span className="text-[var(--text)]/30">—</span>;
}

/**
 * Factura del contrato (D5). Si existe la factura TOTAL activa la muestra
 * (total / pagado / saldo / estado CxP); si no, y el contrato no opera
 * factura-por-estimación, ofrece capturarla (RPC cxp_factura_total_contrato).
 */
function FacturaDelContrato({
  contratoId,
  valorTotal,
  facturaTotal,
  hayFacturasPorEstimacion,
  puedeCrear,
  onChanged,
}: {
  contratoId: string;
  valorTotal: number;
  facturaTotal: (FacturaCuenta & { id: string; fecha_emision: string | null }) | null;
  hayFacturasPorEstimacion: boolean;
  puedeCrear: boolean;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState('');
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().slice(0, 10));
  const [facturaRef, setFacturaRef] = useState('');
  const [condicionesDias, setCondicionesDias] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalNum = Number(total) || 0;

  async function capturar() {
    if (submitting || totalNum <= 0) return;
    setSubmitting(true);
    // RPC S2 aún no en types (se regeneran al aplicar la migración a prod).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.schema('erp') as any).rpc('cxp_factura_total_contrato', {
      p_contrato_id: contratoId,
      p_total: totalNum,
      p_fecha_emision: fechaEmision || null,
      p_condiciones_pago_dias: condicionesDias.trim() === '' ? null : Number(condicionesDias),
      p_factura_ref: facturaRef.trim() || null,
    });
    if (error) {
      toast.add({
        title: 'No se pudo capturar la factura',
        description: getSupabaseErrorMessage(error, 'Error al crear la factura total.'),
        type: 'error',
      });
    } else {
      toast.add({
        title: 'Factura total capturada',
        description: 'Entró a CxP «por pagar» — los avances se pagan aplicando pagos parciales.',
        type: 'success',
      });
      setOpen(false);
      setTotal('');
      setFacturaRef('');
      await onChanged();
    }
    setSubmitting(false);
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          Factura del contrato
        </h2>
        <span className="text-xs text-[var(--text)]/50">
          {facturaTotal
            ? 'factura total: los avances se pagan contra ella'
            : hayFacturasPorEstimacion
              ? 'modo factura-por-estimación'
              : 'sin factura total'}
        </span>
      </div>

      {facturaTotal ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 text-sm text-[var(--text)]">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-medium">{formatCurrency(facturaTotal.total)}</span>
            <span className="text-[var(--text)]/50">
              {facturaTotal.fecha_emision ? `· ${facturaTotal.fecha_emision}` : ''}
            </span>
          </div>
          <div className="text-sm text-[var(--text)]/70">
            Pagado{' '}
            <span className="font-medium text-[var(--text)]">
              {formatCurrency(facturaTotal.monto_pagado)}
            </span>
          </div>
          <div className="text-sm text-[var(--text)]/70">
            Saldo{' '}
            <span className="font-medium text-[var(--text)]">
              {formatCurrency(facturaTotal.total - facturaTotal.monto_pagado)}
            </span>
          </div>
          {(() => {
            const meta = ESTADO_CXP[facturaTotal.estado_cxp] ?? {
              label: facturaTotal.estado_cxp,
              cls: 'bg-[var(--text)]/10 text-[var(--text)]/60',
            };
            return (
              <Link
                href="/dilesa/cxp"
                title="Ver en Cuentas por Pagar"
                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}
              >
                {meta.label}
              </Link>
            );
          })()}
        </div>
      ) : hayFacturasPorEstimacion ? (
        <p className="text-sm text-[var(--text)]/60">
          Este contrato opera <strong>factura-por-estimación</strong>: cada estimación autorizada se
          emite a CxP con su propia factura.
        </p>
      ) : puedeCrear ? (
        open ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/30 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field label="Total (c/IVA) *">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder={String(valorTotal)}
                />
              </Field>
              <Field label="Fecha de emisión">
                <Input
                  type="date"
                  value={fechaEmision}
                  onChange={(e) => setFechaEmision(e.target.value)}
                />
              </Field>
              <Field label="# Factura">
                <Input
                  value={facturaRef}
                  onChange={(e) => setFacturaRef(e.target.value)}
                  placeholder="A-915"
                />
              </Field>
              <Field label="Condiciones (días)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={condicionesDias}
                  onChange={(e) => setCondicionesDias(e.target.value)}
                  placeholder="30"
                />
              </Field>
            </div>
            <p className="mt-2 text-[11px] text-[var(--text)]/50">
              La factura total entra a CxP por el monto completo; los avances (estimaciones
              autorizadas) se pagan aplicando pagos parciales a esta factura. Tope: el valor del
              contrato ({formatCurrency(valorTotal)}).
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button onClick={capturar} disabled={submitting || totalNum <= 0}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Receipt className="size-4" />
                )}
                Capturar factura total
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm font-medium text-[var(--text)]/80 hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            <Receipt className="h-3.5 w-3.5" />
            Capturar factura total del contrato
          </button>
        )
      ) : (
        <p className="text-sm text-[var(--text)]/60">Sin factura total capturada.</p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
  warn,
  small,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  warn?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`rounded-md border bg-[var(--bg)]/30 px-3 py-2 ${
        warn ? 'border-amber-500/40' : 'border-[var(--border)]'
      }`}
      title={hint}
    >
      <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/50">{label}</div>
      <div
        className={`mt-0.5 font-semibold tabular-nums ${small ? 'text-sm' : 'text-base'} ${
          warn ? 'text-amber-600' : accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </div>
      {children}
    </div>
  );
}

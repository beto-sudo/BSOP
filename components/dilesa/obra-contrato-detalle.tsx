'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que las páginas de detalle DILESA (cf.
 * app/dilesa/construccion/contratos/[id]/page.tsx): la carga inicial corre
 * en un effect que setea loading/data.
 */

/**
 * ObraContratoDetalle — secciones de un contrato de obra NO-vivienda en el
 * detalle de contrato (`/dilesa/construccion/contratos/[id]`).
 *
 * Iniciativa dilesa-contratos-obra · Sprint 4. Para los contratos cuyo
 * `tipo` ≠ vivienda (urbanización/cabecera/tarea_menor), el objeto no son
 * lotes sino conceptos/frentes — así que en vez de la sección "Lotes" se
 * muestran las **estimaciones de monto** (`dilesa.obra_estimaciones`) con el
 * saldo (`valor_total − Σ estimaciones`, ADR-038) y un form inline para
 * registrar una estimación nueva.
 *
 * **Puente a CxP (ADR-039 Fase 2):** cada estimación con monto > 0 se puede
 * "Emitir a CxP" → crea una factura de egreso (`erp.cxp_factura_desde_estimacion`)
 * que entra al flujo de Cuentas por Pagar. La columna CxP muestra el estado de
 * la factura ligada (por pagar / parcial / pagada) con link al módulo CxP.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Receipt, Send } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export type ObraEstimacion = {
  id: string;
  orden: number;
  etiqueta: string;
  fecha: string | null;
  factura_ref: string | null;
  monto_total: number;
  es_anticipo: boolean;
  es_finiquito: boolean;
  nota_pago: string | null;
};

/** Estado CxP de la factura de egreso ligada → etiqueta + estilo del badge. */
const ESTADO_CXP: Record<string, { label: string; cls: string }> = {
  borrador: { label: 'borrador', cls: 'bg-[var(--text)]/10 text-[var(--text)]/60' },
  por_pagar: { label: 'por pagar', cls: 'bg-amber-500/15 text-amber-600' },
  parcial: { label: 'parcial', cls: 'bg-amber-500/15 text-amber-600' },
  pagada: { label: 'pagada', cls: 'bg-emerald-500/15 text-emerald-600' },
  cancelada: { label: 'cancelada', cls: 'bg-[var(--text)]/10 text-[var(--text)]/40' },
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
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const puedeCrear =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.contratos')?.write === true;

  const [estimaciones, setEstimaciones] = useState<ObraEstimacion[]>([]);
  /** estimacion_id → factura de egreso ligada (puente CxP, ADR-039). */
  const [facturaByEst, setFacturaByEst] = useState<Map<string, { id: string; estado: string }>>(
    new Map()
  );
  const [emitiendo, setEmitiendo] = useState<string | null>(null);
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
    const { data, error: e } = await sb
      .schema('dilesa')
      .from('obra_estimaciones')
      .select(
        'id, orden, etiqueta, fecha, factura_ref, monto_total, es_anticipo, es_finiquito, nota_pago'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('contrato_id', contratoId)
      .is('deleted_at', null)
      .order('orden', { ascending: true });
    if (e) {
      setError(getSupabaseErrorMessage(e, 'No se pudieron cargar las estimaciones.'));
      setEstimaciones([]);
      setFacturaByEst(new Map());
      setLoading(false);
      return;
    }
    const rows: ObraEstimacion[] = (data ?? []).map((r) => ({
      id: r.id as string,
      orden: Number(r.orden ?? 0),
      etiqueta: (r.etiqueta as string) ?? '',
      fecha: (r.fecha as string | null) ?? null,
      factura_ref: (r.factura_ref as string | null) ?? null,
      monto_total: Number(r.monto_total ?? 0),
      es_anticipo: Boolean(r.es_anticipo),
      es_finiquito: Boolean(r.es_finiquito),
      nota_pago: (r.nota_pago as string | null) ?? null,
    }));
    setEstimaciones(rows);

    // Facturas de egreso ligadas a estas estimaciones (puente CxP, ADR-039).
    const facMap = new Map<string, { id: string; estado: string }>();
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: facs } = await sb
        .schema('erp')
        .from('facturas')
        .select('id, obra_estimacion_id, estado_cxp')
        .in('obra_estimacion_id', ids)
        .is('cancelada_at', null);
      for (const f of facs ?? []) {
        const eid = f.obra_estimacion_id as string | null;
        if (eid)
          facMap.set(eid, { id: f.id as string, estado: (f.estado_cxp as string) ?? 'por_pagar' });
      }
    }
    setFacturaByEst(facMap);
    setLoading(false);
  }, [sb, contratoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const pagado = useMemo(
    () => estimaciones.reduce((s, e) => s + (e.monto_total ?? 0), 0),
    [estimaciones]
  );
  const saldo = valorTotal - pagado;
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
    toast.add({ title: 'Estimación registrada', description: etiqueta.trim(), type: 'success' });
    resetForm();
    setOpen(false);
    setSubmitting(false);
    void cargar();
  }

  // Puente CxP (ADR-039): emite la estimación como factura de egreso por pagar.
  async function emitir(estId: string) {
    if (emitiendo) return;
    setEmitiendo(estId);
    const { error: e } = await sb
      .schema('erp')
      .rpc('cxp_factura_desde_estimacion', { p_estimacion_id: estId });
    if (e) {
      toast.add({
        title: 'No se pudo emitir a CxP',
        description: getSupabaseErrorMessage(e, 'Error al crear la factura de egreso.'),
        type: 'error',
      });
    } else {
      toast.add({
        title: 'Emitida a CxP',
        description:
          'Factura de egreso «por pagar» creada — programa el pago en Cuentas por Pagar.',
        type: 'success',
      });
      await cargar();
    }
    setEmitiendo(null);
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          Estimaciones
        </h2>
        <span className="text-xs text-[var(--text)]/50">
          {estimaciones.length} · anticipo {anticipoPct ?? 0}% · retención {retencionPct ?? 0}%
        </span>
      </div>

      {/* Saldo / rollup */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Stat label="Contratado" value={formatCurrency(valorTotal)} />
        <Stat label="Pagado (Σ estimaciones)" value={formatCurrency(pagado)} />
        <Stat label="Saldo por pagar" value={formatCurrency(saldo)} accent />
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
              Las amortizaciones del anticipo se capturan como monto negativo (ej. −68,500). El
              saldo = contratado − Σ estimaciones.
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
                <th className="py-1.5 pr-3">Fecha</th>
                <th className="py-1.5 pr-3">Factura</th>
                <th className="py-1.5 pr-3 text-right">Monto</th>
                <th className="py-1.5 pr-3">Nota</th>
                <th className="py-1.5 pr-3">CxP</th>
              </tr>
            </thead>
            <tbody>
              {estimaciones.map((e) => (
                <tr key={e.id} className="border-b border-[var(--border)]/40">
                  <td className="py-1.5 pr-3 tabular-nums text-[var(--text)]/50">{e.orden}</td>
                  <td className="py-1.5 pr-3">
                    {e.etiqueta}
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
                  <td className="py-1.5 pr-3 text-[var(--text)]/70">{e.fecha ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-[var(--text)]/70">{e.factura_ref ?? '—'}</td>
                  <td
                    className={`py-1.5 pr-3 text-right tabular-nums ${e.monto_total < 0 ? 'text-destructive' : 'text-[var(--text)]'}`}
                  >
                    {formatCurrency(e.monto_total)}
                  </td>
                  <td className="py-1.5 pr-3 text-[var(--text)]/60">{e.nota_pago ?? '—'}</td>
                  <td className="py-1.5 pr-3">
                    {(() => {
                      const fac = facturaByEst.get(e.id);
                      if (fac) {
                        const meta = ESTADO_CXP[fac.estado] ?? {
                          label: fac.estado,
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
                      if (e.monto_total > 0 && puedeCrear) {
                        return (
                          <button
                            type="button"
                            onClick={() => void emitir(e.id)}
                            disabled={emitiendo === e.id}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text)]/70 hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
                          >
                            {emitiendo === e.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            Emitir
                          </button>
                        );
                      }
                      return <span className="text-[var(--text)]/30">—</span>;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/50">{label}</div>
      <div
        className={`mt-0.5 text-base font-semibold tabular-nums ${accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}
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

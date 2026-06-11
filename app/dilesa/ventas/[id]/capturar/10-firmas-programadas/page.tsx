'use client';

/**
 * Captura Fase 10 — Firmas Programadas (Sprint 7h).
 *
 * Gerencia Ventas (o Dirección) programa la fecha + hora de firma ya
 * acordada con el notario (el notario viene de Fase 7). Se listan y
 * totalizan los depósitos del cliente (CxC `erp.cxc_pagos`) como
 * referencia de cobertura.
 *
 * PR2 — Crédito directo: si crédito institución + depósitos < precio, DILESA
 * puede financiar el saldo. Se configura el monto + plan de pagos + interés
 * moratorio (TIIE 28d + spread) y se genera el Pagaré PDF para imprimir,
 * firmar y subir.
 *
 * Captura:
 *   - `fecha_firma_programada` + `hora_firma_programada`
 *   - Crédito directo (si aplica): monto, plan de pagos (jsonb), tasas, aval.
 *   - Doc opcional: pagaré firmado (rol `pagare_credito_directo`).
 *
 * Enforcement: Fase 9 (Validación Patronal) cerrada. Si hay saldo, el crédito
 * directo debe estar configurado para cerrar la fase.
 * Acceso: `dilesa.ventas.fase10_firmas_programadas`.
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, Loader2, Plus, Save, Trash2, Upload, XCircle } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';
import { desglosarPagare } from '@/lib/dilesa/pagare-interes';

type PlanPagoJson = { num?: number; fecha?: string; monto?: number };

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  precio_asignacion: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  notario_id: string | null;
  fecha_firma_programada: string | null;
  hora_firma_programada: string | null;
  monto_credito_directo: number | null;
  cd_plan_pagos: PlanPagoJson[] | null;
  cd_tiie28_pct: number | null;
  cd_spread_moratorio_pct: number | null;
  cd_interes_ordinario_pct: number | null;
  cd_fecha_suscripcion: string | null;
  cd_aval_nombre: string | null;
  cd_aval_domicilio: string | null;
};

type Deposito = {
  id: string;
  fecha: string | null;
  monto_total: number | null;
  forma_pago: string | null;
  referencia: string | null;
};

type PlanRow = { fecha: string; monto: string };

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));
const hoy = () => new Date().toISOString().slice(0, 10);

export default function CapturarFase10Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase10_firmas_programadas" write>
      <CapturarFase10Body />
    </RequireAccess>
  );
}

function CapturarFase10Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [clienteNombre, setClienteNombre] = useState<string>('');
  const [identificacionInv, setIdentificacionInv] = useState<string | null>(null);
  const [notarioNombre, setNotarioNombre] = useState<string | null>(null);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [fase9Cerrada, setFase9Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [fechaFirma, setFechaFirma] = useState<string>('');
  const [horaFirma, setHoraFirma] = useState<string>('');

  // ── Crédito directo ──
  const [montoCD, setMontoCD] = useState<string>('');
  const [planPagos, setPlanPagos] = useState<PlanRow[]>([]);
  const [fechaSuscripcion, setFechaSuscripcion] = useState<string>(hoy());
  const [tiie, setTiie] = useState<string>('');
  const [spread, setSpread] = useState<string>('4');
  const [ordinario, setOrdinario] = useState<string>('0');
  const [avalNombre, setAvalNombre] = useState<string>('');
  const [avalDomicilio, setAvalDomicilio] = useState<string>('');
  const [cdGuardado, setCdGuardado] = useState<boolean>(false);
  const [savingCD, setSavingCD] = useState<boolean>(false);
  const [pagareArchivo, setPagareArchivo] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Cargar contexto ──────────────────────────────────────────────
  useEffect(() => {
    if (!ventaId) return;
    let activo = true;

    (async () => {
      setLoading(true);
      setError(null);

      const { data: vRow, error: vErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .select(
          'id, persona_id, unidad_id, precio_asignacion, monto_credito_titular, monto_credito_cotitular, notario_id, fecha_firma_programada, hora_firma_programada, monto_credito_directo, cd_plan_pagos, cd_tiie28_pct, cd_spread_moratorio_pct, cd_interes_ordinario_pct, cd_fecha_suscripcion, cd_aval_nombre, cd_aval_domicilio'
        )
        .eq('id', ventaId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (vErr) {
        setError(getSupabaseErrorMessage(vErr, 'No se pudo cargar la venta.'));
        setLoading(false);
        return;
      }
      if (!vRow) {
        setError('Venta no encontrada.');
        setLoading(false);
        return;
      }
      const v = vRow as unknown as VentaCtx;
      setVenta(v);
      if (v.fecha_firma_programada) setFechaFirma(v.fecha_firma_programada);
      if (v.hora_firma_programada) setHoraFirma(v.hora_firma_programada.slice(0, 5));

      const [pRes, uRes, fRes, nRes, dRes] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno')
          .eq('id', v.persona_id)
          .maybeSingle(),
        v.unidad_id
          ? sb
              .schema('dilesa')
              .from('unidades')
              .select('identificador, producto_id')
              .eq('id', v.unidad_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', v.id)
          .is('deleted_at', null),
        v.notario_id
          ? sb
              .schema('erp')
              .from('personas')
              .select('nombre, apellido_paterno, apellido_materno')
              .eq('id', v.notario_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        sb
          .schema('erp')
          .from('cxc_pagos')
          .select('id, fecha, monto_total, forma_pago, referencia')
          .eq('origen_tipo', 'venta_dilesa')
          .eq('origen_id', v.id)
          .is('deleted_at', null)
          .order('fecha', { ascending: true }),
      ]);
      if (!activo) return;

      if (pRes.data) {
        setClienteNombre(
          [pRes.data.nombre, pRes.data.apellido_paterno, pRes.data.apellido_materno]
            .filter(Boolean)
            .join(' ') || '(sin nombre)'
        );
      }
      if (uRes.data) {
        const prodSufijo = uRes.data.producto_id
          ? (
              await sb
                .schema('dilesa')
                .from('productos')
                .select('nombre')
                .eq('id', uRes.data.producto_id)
                .maybeSingle()
            ).data?.nombre
              ?.split('-')
              .pop()
          : '';
        setIdentificacionInv(
          prodSufijo ? `${uRes.data.identificador}-${prodSufijo}` : uRes.data.identificador
        );
      }
      if (nRes.data) {
        setNotarioNombre(
          [nRes.data.nombre, nRes.data.apellido_paterno, nRes.data.apellido_materno]
            .filter(Boolean)
            .join(' ')
            .trim() || null
        );
      }
      const deps = (dRes.data ?? []) as unknown as Deposito[];
      setDepositos(deps);
      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase9Cerrada(posiciones.includes(9));
      setYaCerrada(posiciones.includes(10));

      // Prefill crédito directo: desde lo persistido, o desde el saldo si aún
      // no se configura.
      const totalDep = deps.reduce((s, d) => s + Number(d.monto_total ?? 0), 0);
      const credInst =
        Number(v.monto_credito_titular ?? 0) + Number(v.monto_credito_cotitular ?? 0);
      const saldoLocal = Number(v.precio_asignacion ?? 0) - credInst - totalDep;

      if (v.monto_credito_directo != null) {
        setMontoCD(String(v.monto_credito_directo));
        const plan = Array.isArray(v.cd_plan_pagos) ? v.cd_plan_pagos : [];
        setPlanPagos(
          plan.length > 0
            ? plan.map((p) => ({ fecha: p?.fecha ?? '', monto: String(p?.monto ?? '') }))
            : [{ fecha: '', monto: String(v.monto_credito_directo) }]
        );
        setCdGuardado(true);
      } else if (saldoLocal > 0.0049) {
        setMontoCD(saldoLocal.toFixed(2));
        setPlanPagos([{ fecha: '', monto: saldoLocal.toFixed(2) }]);
        setCdGuardado(false);
      }
      if (v.cd_tiie28_pct != null) setTiie(String(v.cd_tiie28_pct));
      if (v.cd_spread_moratorio_pct != null) setSpread(String(v.cd_spread_moratorio_pct));
      if (v.cd_interes_ordinario_pct != null) setOrdinario(String(v.cd_interes_ordinario_pct));
      if (v.cd_fecha_suscripcion) setFechaSuscripcion(v.cd_fecha_suscripcion);
      if (v.cd_aval_nombre) setAvalNombre(v.cd_aval_nombre);
      if (v.cd_aval_domicilio) setAvalDomicilio(v.cd_aval_domicilio);

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  // ── Cobertura ────────────────────────────────────────────────────
  const totalDepositos = useMemo(
    () => depositos.reduce((s, d) => s + Number(d.monto_total ?? 0), 0),
    [depositos]
  );
  const creditoInstitucion =
    Number(venta?.monto_credito_titular ?? 0) + Number(venta?.monto_credito_cotitular ?? 0);
  const precio = Number(venta?.precio_asignacion ?? 0);
  const cobertura = creditoInstitucion + totalDepositos;
  const saldo = precio - cobertura;
  const aplicaCD = saldo > 0.0049;

  const sumaPlan = useMemo(
    () => planPagos.reduce((s, r) => s + (Number(r.monto) || 0), 0),
    [planPagos]
  );
  const montoCDNum = Number(montoCD) || 0;
  const planCuadra = Math.abs(sumaPlan - montoCDNum) < 0.01 && montoCDNum > 0;

  // Desglose de interés ordinario (mismo motor que el PDF del pagaré).
  const ordinarioPct = Number(ordinario) || 0;
  const desglose = useMemo(() => {
    if (ordinarioPct <= 0) return null;
    const filas = planPagos.filter((r) => r.fecha && Number(r.monto) > 0);
    if (filas.length === 0) return null;
    return desglosarPagare(
      filas.map((r) => ({ fecha: r.fecha, monto: Number(r.monto) })),
      ordinarioPct,
      fechaSuscripcion || null
    );
  }, [planPagos, ordinarioPct, fechaSuscripcion]);

  // Cualquier edición del crédito directo invalida el "guardado" (hay que
  // re-guardar antes de generar el pagaré con datos frescos).
  const touchCD = useCallback(() => setCdGuardado(false), []);

  const setPlanRow = useCallback(
    (i: number, patch: Partial<PlanRow>) => {
      setPlanPagos((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
      touchCD();
    },
    [touchCD]
  );
  const addPlanRow = useCallback(() => {
    setPlanPagos((rows) => [...rows, { fecha: '', monto: '' }]);
    touchCD();
  }, [touchCD]);
  const removePlanRow = useCallback(
    (i: number) => {
      setPlanPagos((rows) => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));
      touchCD();
    },
    [touchCD]
  );

  const guardarCreditoDirecto = useCallback(async () => {
    if (!venta) return;
    if (montoCDNum <= 0) {
      toast.add({
        title: 'Monto inválido',
        description: 'Captura el monto del crédito directo.',
        type: 'error',
      });
      return;
    }
    if (planPagos.some((r) => !r.fecha || !(Number(r.monto) > 0))) {
      toast.add({
        title: 'Plan de pagos incompleto',
        description: 'Cada pago necesita fecha y monto mayor a cero.',
        type: 'error',
      });
      return;
    }
    if (!planCuadra) {
      toast.add({
        title: 'El plan no cuadra',
        description: `La suma de los pagos (${money(sumaPlan)}) debe igualar el monto del crédito (${money(montoCDNum)}).`,
        type: 'error',
      });
      return;
    }
    setSavingCD(true);
    const planJson = planPagos.map((r, i) => ({
      num: i + 1,
      fecha: r.fecha,
      monto: Math.round((Number(r.monto) || 0) * 100) / 100,
    }));
    const { error: upErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({
        monto_credito_directo: Math.round(montoCDNum * 100) / 100,
        cd_plan_pagos: planJson,
        cd_tiie28_pct: tiie === '' ? null : Number(tiie),
        cd_spread_moratorio_pct: spread === '' ? null : Number(spread),
        cd_interes_ordinario_pct: ordinario === '' ? null : Number(ordinario),
        cd_fecha_suscripcion: fechaSuscripcion || null,
        cd_aval_nombre: avalNombre.trim() || null,
        cd_aval_domicilio: avalDomicilio.trim() || null,
      })
      .eq('id', venta.id);
    setSavingCD(false);
    if (upErr) {
      toast.add({
        title: 'No se pudo guardar el crédito directo',
        description: getSupabaseErrorMessage(upErr, 'Error desconocido.'),
        type: 'error',
      });
      return;
    }
    setCdGuardado(true);
    toast.add({
      title: 'Crédito directo guardado',
      description: 'Ya puedes generar el pagaré.',
      type: 'success',
    });
  }, [
    avalDomicilio,
    avalNombre,
    fechaSuscripcion,
    montoCDNum,
    ordinario,
    planCuadra,
    planPagos,
    sb,
    spread,
    sumaPlan,
    tiie,
    toast,
    venta,
  ]);

  // ── Submit (cerrar fase) ─────────────────────────────────────────
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      if (!fechaFirma) {
        toast.add({
          title: 'Falta la fecha de firma',
          description: 'Captura la fecha acordada con el notario.',
          type: 'error',
        });
        return;
      }
      if (!horaFirma) {
        toast.add({
          title: 'Falta la hora de firma',
          description: 'Captura la hora acordada con el notario.',
          type: 'error',
        });
        return;
      }
      if (aplicaCD && !cdGuardado) {
        toast.add({
          title: 'Falta configurar el crédito directo',
          description:
            'Hay un saldo por cubrir. Configura y guarda el crédito directo antes de cerrar la fase.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseNombre: 'Firmas Programadas',
        faseposicion: 10,
        docs: pagareArchivo ? [{ rol: 'pagare_credito_directo', archivo: pagareArchivo }] : [],
        camposVenta: {
          fecha_firma_programada: fechaFirma,
          hora_firma_programada: horaFirma,
        },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 10',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 10 cerrada',
        description: 'Firma programada. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [aplicaCD, cdGuardado, fechaFirma, horaFirma, pagareArchivo, router, sb, toast, venta]
  );

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
        <CapturarFaseHeader
          ventaId={ventaId}
          clienteNombre={null}
          identificacionInventario={null}
          faseposicion={10}
          faseNombre="Firmas Programadas"
        />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        ventaId={venta.id}
        clienteNombre={clienteNombre}
        identificacionInventario={identificacionInv}
        faseposicion={10}
        faseNombre="Firmas Programadas"
        descripcion="Programa la fecha y hora de firma acordada con el notario. Genera la Póliza de Garantía y, si hay saldo, el crédito directo con su pagaré."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 10 ya está cerrada"
          body="Esta venta ya tiene la firma programada. La siguiente fase es Escriturada."
        />
      ) : fase9Cerrada === false ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 9 (Validación Patronal)"
          body={
            <>
              Antes de programar la firma, la venta debe tener su Validación Patronal. Vuelve al
              detalle y captura la Fase 9 primero.
            </>
          }
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
        <form onSubmit={onSubmit} className="space-y-6">
          {notarioNombre ? (
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-4 py-2 text-xs text-[var(--text)]/70">
              <span className="font-medium text-[var(--text)]/80">Notario asignado:</span>{' '}
              {notarioNombre}
            </div>
          ) : (
            <div className="rounded-md border border-amber-400/40 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              Esta venta no tiene notario asignado (Fase 7). Programa la firma de todos modos, pero
              revisa la asignación del notario.
            </div>
          )}

          <Section title="Datos de la firma">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fecha de firma *">
                <Input
                  type="date"
                  value={fechaFirma}
                  onChange={(e) => setFechaFirma(e.target.value)}
                  required
                />
              </Field>
              <Field label="Hora de firma *">
                <Input
                  type="time"
                  value={horaFirma}
                  onChange={(e) => setHoraFirma(e.target.value)}
                  required
                />
              </Field>
            </div>
          </Section>

          <Section title="Documento para el notario">
            <p className="text-sm text-[var(--text)]/70">
              La <span className="font-medium">Póliza de Garantía</span> se genera como PDF para
              llevarla al expediente del notario.
            </p>
            <a
              href={`/api/dilesa/ventas/${venta.id}/pdf/poliza-garantia`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
            >
              <Download className="h-3.5 w-3.5" />
              Póliza de Garantía
            </a>
          </Section>

          <Section title="Depósitos del cliente (referencia de cobertura)">
            {depositos.length === 0 ? (
              <p className="text-sm text-[var(--text)]/60">
                No hay depósitos registrados para esta venta.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs text-[var(--text)]/60">
                      <th className="px-3 py-1.5 font-medium">Fecha</th>
                      <th className="px-3 py-1.5 font-medium">Forma de pago</th>
                      <th className="px-3 py-1.5 font-medium">Referencia</th>
                      <th className="px-3 py-1.5 text-right font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositos.map((d) => (
                      <tr key={d.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-1.5">{d.fecha ?? '—'}</td>
                        <td className="px-3 py-1.5">{d.forma_pago ?? '—'}</td>
                        <td className="px-3 py-1.5 text-[var(--text)]/70">{d.referencia ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right font-medium">
                          {money(d.monto_total)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[var(--bg)]/40">
                      <td className="px-3 py-1.5 font-semibold" colSpan={3}>
                        Total depósitos
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {money(totalDepositos)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 space-y-1 rounded-md border border-[var(--border)] bg-[var(--bg)]/20 p-3 text-sm">
              <CoberturaRow label="Precio de asignación" value={money(precio)} />
              <CoberturaRow
                label="Crédito institución (titular + co-titular)"
                value={money(creditoInstitucion)}
              />
              <CoberturaRow label="Depósitos del cliente" value={money(totalDepositos)} />
              <div className="my-1 border-t border-[var(--border)]" />
              <CoberturaRow label="Cobertura total" value={money(cobertura)} />
              <CoberturaRow
                label={aplicaCD ? 'Saldo pendiente' : 'Saldo'}
                value={money(saldo)}
                strong
                tone={aplicaCD ? 'warn' : 'ok'}
              />
            </div>
          </Section>

          {aplicaCD ? (
            <Section title="Crédito directo (DILESA financia el saldo)">
              <p className="mb-3 text-xs text-[var(--text)]/60">
                Configura el monto y el plan de pagos, guarda, genera el pagaré, imprímelo y súbelo
                firmado.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Monto del crédito directo *">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={montoCD}
                    onChange={(e) => {
                      setMontoCD(e.target.value);
                      touchCD();
                    }}
                  />
                  <Hint>Saldo a cubrir: {money(saldo)}</Hint>
                </Field>
                <Field label="Fecha de suscripción del pagaré">
                  <Input
                    type="date"
                    value={fechaSuscripcion}
                    onChange={(e) => {
                      setFechaSuscripcion(e.target.value);
                      touchCD();
                    }}
                  />
                </Field>
              </div>

              {/* Plan de pagos */}
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                    Plan de pagos *
                  </span>
                  <button
                    type="button"
                    onClick={addPlanRow}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/80 hover:bg-[var(--bg)]/40"
                  >
                    <Plus className="h-3 w-3" /> Agregar pago
                  </button>
                </div>
                <div className="space-y-2">
                  {planPagos.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-xs text-[var(--text)]/50">{i + 1}.</span>
                      <Input
                        type="date"
                        value={r.fecha}
                        onChange={(e) => setPlanRow(i, { fecha: e.target.value })}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Monto"
                        value={r.monto}
                        onChange={(e) => setPlanRow(i, { monto: e.target.value })}
                        className="w-36"
                      />
                      <button
                        type="button"
                        onClick={() => removePlanRow(i)}
                        disabled={planPagos.length <= 1}
                        className="rounded-md p-1.5 text-[var(--text)]/50 hover:bg-[var(--bg)]/40 hover:text-red-500 disabled:opacity-30"
                        title="Quitar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <p
                  className={`mt-2 text-[11px] ${
                    planCuadra
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  Suma del plan (capital): {money(sumaPlan)} / {money(montoCDNum)}{' '}
                  {planCuadra
                    ? '✓ cuadra'
                    : '— debe igualar el monto del crédito; el interés ordinario se calcula aparte'}
                </p>

                {desglose ? (
                  <div className="mt-3 overflow-hidden rounded-md border border-[var(--border)]">
                    <div className="border-b border-[var(--border)] bg-[var(--bg)]/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text)]/60">
                      Desglose con interés ordinario ({ordinarioPct}% anual, saldos insolutos, año
                      de 360 días) — así saldrá en el pagaré
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[var(--text)]/50">
                          <th className="px-3 py-1 text-left font-medium">No.</th>
                          <th className="px-3 py-1 text-left font-medium">Vencimiento</th>
                          <th className="px-3 py-1 text-right font-medium">Capital</th>
                          <th className="px-3 py-1 text-right font-medium">Interés</th>
                          <th className="px-3 py-1 text-right font-medium">Pago total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {desglose.parcialidades.map((p) => (
                          <tr key={p.num} className="border-t border-[var(--border)]/60">
                            <td className="px-3 py-1">{p.num}</td>
                            <td className="px-3 py-1">
                              {p.fecha}
                              <span className="ml-1 text-[var(--text)]/40">({p.dias} días)</span>
                            </td>
                            <td className="px-3 py-1 text-right">{money(p.capital)}</td>
                            <td className="px-3 py-1 text-right">{money(p.interes)}</td>
                            <td className="px-3 py-1 text-right font-medium">{money(p.pago)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-[var(--border)] bg-[var(--bg)]/40 font-semibold">
                          <td className="px-3 py-1.5" colSpan={2}>
                            Total
                          </td>
                          <td className="px-3 py-1.5 text-right">{money(desglose.totalCapital)}</td>
                          <td className="px-3 py-1.5 text-right">{money(desglose.totalInteres)}</td>
                          <td className="px-3 py-1.5 text-right">{money(desglose.totalPagar)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              {/* Intereses */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="TIIE 28d (%)">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tiie}
                    onChange={(e) => {
                      setTiie(e.target.value);
                      touchCD();
                    }}
                  />
                  <Hint>Tasa vigente a la suscripción</Hint>
                </Field>
                <Field label="Spread moratorio (%)">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={spread}
                    onChange={(e) => {
                      setSpread(e.target.value);
                      touchCD();
                    }}
                  />
                  <Hint>Mínimo 4, editable a más</Hint>
                </Field>
                <Field label="Interés ordinario (%)">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ordinario}
                    onChange={(e) => {
                      setOrdinario(e.target.value);
                      touchCD();
                    }}
                  />
                  <Hint>Default 0</Hint>
                </Field>
              </div>
              {tiie !== '' ? (
                <p className="mt-1 text-[11px] text-[var(--text)]/60">
                  Moratorio total ≈ {(Number(tiie) + (Number(spread) || 0)).toFixed(2)}% anual (TIIE
                  + spread).
                </p>
              ) : null}

              {/* Aval */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Aval — nombre (opcional)">
                  <Input
                    value={avalNombre}
                    onChange={(e) => {
                      setAvalNombre(e.target.value);
                      touchCD();
                    }}
                  />
                </Field>
                <Field label="Aval — domicilio (opcional)">
                  <Input
                    value={avalDomicilio}
                    onChange={(e) => {
                      setAvalDomicilio(e.target.value);
                      touchCD();
                    }}
                  />
                </Field>
              </div>

              {/* Acciones CD */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={guardarCreditoDirecto}
                  disabled={savingCD}
                >
                  {savingCD ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 size-4" /> Guardar crédito directo
                    </>
                  )}
                </Button>
                {cdGuardado ? (
                  <a
                    href={`/api/dilesa/ventas/${venta.id}/pdf/pagare-credito-directo`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
                  >
                    <Download className="h-3.5 w-3.5" /> Generar pagaré
                  </a>
                ) : (
                  <span className="text-[11px] text-[var(--text)]/50">
                    Guarda el crédito directo para habilitar el pagaré.
                  </span>
                )}
              </div>

              {/* Subir pagaré firmado */}
              <div className="mt-4">
                <FileSlot
                  label="Pagaré firmado (opcional — súbelo cuando lo tengas)"
                  archivo={pagareArchivo}
                  onChange={setPagareArchivo}
                />
              </div>
            </Section>
          ) : (
            <Section title="Crédito directo">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                La operación queda cubierta con el crédito y los depósitos — no se requiere crédito
                directo.
              </p>
            </Section>
          )}

          <div className="flex items-center justify-end gap-3">
            <Link
              href={`/dilesa/ventas/${venta.id}`}
              className="text-sm text-muted-foreground hover:text-[var(--text)]"
            >
              Cancelar
            </Link>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Save className="mr-2 size-4" /> Guardar fase
                </>
              )}
            </Button>
          </div>
        </form>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[var(--text)]/50">{children}</p>;
}

function CoberturaRow({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'warn' | 'ok';
}) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-700 dark:text-amber-300'
      : tone === 'ok'
        ? 'text-emerald-600 dark:text-emerald-400'
        : '';
  return (
    <div className="flex items-center justify-between">
      <span className={`${strong ? 'font-semibold' : 'text-[var(--text)]/70'} ${toneClass}`}>
        {label}
      </span>
      <span className={`${strong ? 'font-semibold' : 'font-medium'} ${toneClass}`}>{value}</span>
    </div>
  );
}

function FileSlot({
  label,
  archivo,
  onChange,
}: {
  label: string;
  archivo: File | null;
  onChange: (f: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const completo = !!archivo;
  return (
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
        onChange(f);
      }}
      className={`flex items-center justify-between gap-3 rounded-lg border bg-[var(--card)] px-4 py-3 transition-colors ${
        dragOver
          ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/40'
          : 'border-[var(--border)]'
      }`}
    >
      <div className="flex flex-1 items-center gap-2 text-sm">
        {completo ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-[var(--text)]/35" />
        )}
        <span className="font-medium">{label}</span>
        {archivo ? (
          <span className="ml-1 truncate text-xs text-[var(--text)]/60">
            {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB
          </span>
        ) : null}
      </div>
      <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]">
        <Upload className="h-3.5 w-3.5" />
        {archivo ? 'Cambiar' : 'Subir PDF'}
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
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
  const stylesB =
    tone === 'success'
      ? 'border-emerald-400/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
      : 'border-amber-400/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100';
  return (
    <div className={`rounded-lg border p-4 ${stylesB}`}>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 text-sm">{body}</div>
      {extra}
    </div>
  );
}

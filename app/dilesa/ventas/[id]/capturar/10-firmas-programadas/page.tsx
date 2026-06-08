'use client';

/**
 * Captura Fase 10 — Firmas Programadas (Sprint 7h, PR1).
 *
 * Gerencia Ventas (o Dirección) programa la fecha + hora de firma ya
 * acordada con el notario (el notario viene de Fase 7). Se listan y
 * totalizan los depósitos del cliente (CxC `erp.cxc_pagos`) como
 * referencia de cobertura de la operación.
 *
 * Captura:
 *   - `fecha_firma_programada` + `hora_firma_programada`
 *   - Sin docs requeridos (la Póliza de Garantía se genera como PDF desde
 *     la hoja del cliente; no se sube aquí).
 *
 * Cobertura: crédito institución (titular+cotitular) + depósitos vs
 * precio de asignación. Si queda saldo, en PR2 se habilitará el crédito
 * directo con pagaré.
 *
 * Enforcement: Fase 9 (Validación Patronal) debe estar cerrada.
 * Acceso: `dilesa.ventas.fase10_firmas_programadas`.
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Loader2, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';

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
};

type Deposito = {
  id: string;
  fecha: string | null;
  monto_total: number | null;
  forma_pago: string | null;
  referencia: string | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

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
          'id, persona_id, unidad_id, precio_asignacion, monto_credito_titular, monto_credito_cotitular, notario_id, fecha_firma_programada, hora_firma_programada'
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
      setDepositos((dRes.data ?? []) as unknown as Deposito[]);
      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase9Cerrada(posiciones.includes(9));
      setYaCerrada(posiciones.includes(10));

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

  // ── Submit ───────────────────────────────────────────────────────
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

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseNombre: 'Firmas Programadas',
        faseposicion: 10,
        docs: [],
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
    [fechaFirma, horaFirma, router, sb, toast, venta]
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
        descripcion="Programa la fecha y hora de firma acordada con el notario. Genera la Póliza de Garantía desde la hoja del cliente."
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
              La <span className="font-medium">Póliza de Garantía</span> se genera como PDF desde la
              hoja del cliente (botón en la sección de documentos) para llevarla al expediente del
              notario.
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

            {/* Resumen de cobertura */}
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
                label={saldo > 0.0049 ? 'Saldo pendiente' : 'Saldo'}
                value={money(saldo)}
                strong
                tone={saldo > 0.0049 ? 'warn' : 'ok'}
              />
            </div>

            {saldo > 0.0049 ? (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                Queda un saldo por cubrir. La opción de <strong>crédito directo</strong> (pagaré por
                el saldo) se habilitará en una actualización próxima de esta fase.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                La operación queda cubierta con el crédito y los depósitos.
              </p>
            )}
          </Section>

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

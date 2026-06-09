'use client';

/**
 * Captura Fase 13 — Facturada (Sprint 7k).
 *
 * Contabilidad registra la facturación: sube PDFs (factura, nota de crédito,
 * aviso PLD) y captura los montos de cuadratura. Los depósitos de la
 * operación se muestran como referencia (CxC `erp.cxc_pagos`).
 *
 * Captura:
 *   - Docs: factura (rol `factura`, requerido), nota de crédito (`nota_credito`),
 *     aviso PLD (`aviso_pld`) — los 2 últimos opcionales.
 *   - Montos: valor_escrituracion (requerido), valor_real_venta_dilesa,
 *     valor_facturado, monto_nota_credito.
 *
 * Enforcement: Fase 12 (Detonada) debe estar cerrada.
 * Acceso: `dilesa.ventas.fase13_facturada` (Contabilidad + Gerencia Ventas +
 * Dirección).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Save, Upload, XCircle } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase, type DocCaptura } from '@/lib/dilesa/captura/marcar-fase';

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  valor_escrituracion: number | null;
  valor_real_venta_dilesa: number | null;
  valor_facturado: number | null;
  monto_nota_credito: number | null;
};

type Deposito = {
  id: string;
  fecha: string | null;
  monto_total: number | null;
  fuente: string | null;
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

export default function CapturarFase13Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase13_facturada" write>
      <CapturarFase13Body />
    </RequireAccess>
  );
}

function CapturarFase13Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [clienteNombre, setClienteNombre] = useState<string>('');
  const [identificacionInv, setIdentificacionInv] = useState<string | null>(null);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [fase12Cerrada, setFase12Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [notaCreditoFile, setNotaCreditoFile] = useState<File | null>(null);
  const [avisoPldFile, setAvisoPldFile] = useState<File | null>(null);
  const [valorEscrituracion, setValorEscrituracion] = useState<string>('');
  const [valorRealVenta, setValorRealVenta] = useState<string>('');
  const [valorFacturado, setValorFacturado] = useState<string>('');
  const [montoNotaCredito, setMontoNotaCredito] = useState<string>('');

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
          'id, persona_id, unidad_id, valor_escrituracion, valor_real_venta_dilesa, valor_facturado, monto_nota_credito'
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
      if (v.valor_escrituracion != null) setValorEscrituracion(String(v.valor_escrituracion));
      if (v.valor_real_venta_dilesa != null) setValorRealVenta(String(v.valor_real_venta_dilesa));
      if (v.valor_facturado != null) setValorFacturado(String(v.valor_facturado));
      if (v.monto_nota_credito != null) setMontoNotaCredito(String(v.monto_nota_credito));

      const [pRes, uRes, fRes, dRes] = await Promise.all([
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
        sb
          .schema('erp')
          .from('cxc_pagos')
          .select('id, fecha, monto_total, fuente, forma_pago, referencia')
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
      setDepositos((dRes.data ?? []) as unknown as Deposito[]);
      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase12Cerrada(posiciones.includes(12));
      setYaCerrada(posiciones.includes(13));

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  const totalDepositos = useMemo(
    () => depositos.reduce((s, d) => s + Number(d.monto_total ?? 0), 0),
    [depositos]
  );

  // ── Submit ───────────────────────────────────────────────────────
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      if (!facturaFile) {
        toast.add({
          title: 'Falta el PDF de la factura',
          description: 'Sube el PDF de la factura emitida.',
          type: 'error',
        });
        return;
      }
      if (!avisoPldFile) {
        toast.add({
          title: 'Falta el PDF del Aviso PLD',
          description: 'El Aviso PLD es obligatorio para facturar.',
          type: 'error',
        });
        return;
      }
      const vEscr = Number(valorEscrituracion);
      if (!Number.isFinite(vEscr) || vEscr <= 0) {
        toast.add({
          title: 'Valor de escrituración inválido',
          description: 'Captura el valor de escrituración (mayor a cero).',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const docs: DocCaptura[] = [{ rol: 'factura', archivo: facturaFile }];
      if (notaCreditoFile) docs.push({ rol: 'nota_credito', archivo: notaCreditoFile });
      if (avisoPldFile) docs.push({ rol: 'aviso_pld', archivo: avisoPldFile });

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseNombre: 'Facturada',
        faseposicion: 13,
        docs,
        camposVenta: {
          valor_escrituracion: vEscr,
          valor_real_venta_dilesa: valorRealVenta === '' ? null : Number(valorRealVenta),
          valor_facturado: valorFacturado === '' ? null : Number(valorFacturado),
          monto_nota_credito: montoNotaCredito === '' ? null : Number(montoNotaCredito),
        },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 13',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 13 cerrada',
        description: 'Facturación registrada. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [
      avisoPldFile,
      facturaFile,
      montoNotaCredito,
      notaCreditoFile,
      router,
      sb,
      toast,
      valorEscrituracion,
      valorFacturado,
      valorRealVenta,
      venta,
    ]
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
          faseposicion={13}
          faseNombre="Facturada"
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
        faseposicion={13}
        faseNombre="Facturada"
        descripcion="Sube la factura (y nota de crédito / aviso PLD si aplican) y captura los montos de cuadratura."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 13 ya está cerrada"
          body="Esta venta ya está facturada. La siguiente fase es Preparada para Entrega."
        />
      ) : fase12Cerrada === false ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 12 (Detonada)"
          body={
            <>
              Antes de facturar, la venta debe estar detonada (depósito recibido). Vuelve al detalle
              y captura la Fase 12 primero.
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
          <Section title="Documentos">
            <div className="space-y-2">
              <FileSlot label="PDF Factura *" archivo={facturaFile} onChange={setFacturaFile} />
              <FileSlot
                label="PDF Nota de Crédito (si aplica)"
                archivo={notaCreditoFile}
                onChange={setNotaCreditoFile}
              />
              <FileSlot label="PDF Aviso PLD *" archivo={avisoPldFile} onChange={setAvisoPldFile} />
            </div>
          </Section>

          <Section title="Montos">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Valor de escrituración *">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorEscrituracion}
                  onChange={(e) => setValorEscrituracion(e.target.value)}
                  required
                />
                <Hint>{money(Number(valorEscrituracion) || 0)}</Hint>
              </Field>
              <Field label="Valor real venta Dilesa">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorRealVenta}
                  onChange={(e) => setValorRealVenta(e.target.value)}
                />
                <Hint>{valorRealVenta === '' ? '—' : money(Number(valorRealVenta) || 0)}</Hint>
              </Field>
              <Field label="Valor facturado">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorFacturado}
                  onChange={(e) => setValorFacturado(e.target.value)}
                />
                <Hint>{valorFacturado === '' ? '—' : money(Number(valorFacturado) || 0)}</Hint>
              </Field>
              <Field label="Monto nota de crédito">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoNotaCredito}
                  onChange={(e) => setMontoNotaCredito(e.target.value)}
                />
                <Hint>{montoNotaCredito === '' ? '—' : money(Number(montoNotaCredito) || 0)}</Hint>
              </Field>
            </div>
          </Section>

          <Section title="Depósitos de la operación (referencia)">
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
                      <th className="px-3 py-1.5 font-medium">Tipo</th>
                      <th className="px-3 py-1.5 font-medium">Forma</th>
                      <th className="px-3 py-1.5 text-right font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositos.map((d) => (
                      <tr key={d.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-1.5">{d.fecha ?? '—'}</td>
                        <td className="px-3 py-1.5 capitalize text-[var(--text)]/70">
                          {d.fuente ?? '—'}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text)]/70">{d.forma_pago ?? '—'}</td>
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

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[var(--text)]/50">{children}</p>;
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
        {archivo ? 'Cambiar' : 'Subir'}
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

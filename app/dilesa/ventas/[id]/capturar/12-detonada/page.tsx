'use client';

/**
 * Captura Fase 12 — Detonada (Sprint 7j) — RESPALDO MANUAL.
 *
 * "Detonar" el crédito = la institución libera el recurso y DILESA recibe el
 * depósito. Desde el 2026-06-11 el camino normal es AUTOMÁTICO: Contabilidad
 * registra el abono de la institución en Cobranza y el trigger
 * `dilesa.fn_detonar_venta_desde_cxc` (migración 20260611174917) cierra esta
 * fase solo — un registro, un lugar, y el dinero queda en CxC (diseño de
 * Beto). Esta pantalla queda como fallback (mismo patrón que F8 manual vs
 * magic link del notario).
 *
 * Captura (fallback):
 *   - `fecha_detonacion` → fecha del depósito (default hoy)
 *   - `monto_detonado` → monto recibido (opcional, cuadratura)
 *   - Doc requerido: rol `imagen_detonacion` (comprobante del depósito).
 *
 * OJO: cerrar por aquí NO registra el abono en Cobranza — si se usa el
 * fallback, el depósito se registra aparte en CxC (el trigger en ese caso
 * solo completa monto/fecha si quedaron vacíos).
 *
 * Enforcement: Fase 11 (Escriturada) debe estar cerrada.
 * Acceso: `dilesa.ventas.fase12_detonada` (Contabilidad + Gerencia Ventas +
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
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  fecha_detonacion: string | null;
  monto_detonado: number | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

export default function CapturarFase12Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase12_detonada" write>
      <CapturarFase12Body />
    </RequireAccess>
  );
}

function CapturarFase12Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [clienteNombre, setClienteNombre] = useState<string>('');
  const [identificacionInv, setIdentificacionInv] = useState<string | null>(null);
  const [fase11Cerrada, setFase11Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [fechaDetonacion, setFechaDetonacion] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [montoDetonado, setMontoDetonado] = useState<string>('');
  const [archivo, setArchivo] = useState<File | null>(null);

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
        .select('id, persona_id, unidad_id, fecha_detonacion, monto_detonado')
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
      if (v.fecha_detonacion) setFechaDetonacion(v.fecha_detonacion);
      if (v.monto_detonado != null) setMontoDetonado(String(v.monto_detonado));

      const [pRes, uRes, fRes] = await Promise.all([
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
      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase11Cerrada(posiciones.includes(11));
      setYaCerrada(posiciones.includes(12));

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  // ── Submit ───────────────────────────────────────────────────────
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      if (!archivo) {
        toast.add({
          title: 'Falta el comprobante del depósito',
          description: 'Sube el comprobante de transferencia/depósito de la detonación.',
          type: 'error',
        });
        return;
      }
      if (!fechaDetonacion) {
        toast.add({
          title: 'Falta la fecha de detonación',
          description: 'Captura la fecha en que se recibió el depósito.',
          type: 'error',
        });
        return;
      }
      const monto = montoDetonado === '' ? null : Number(montoDetonado);
      if (monto != null && (!Number.isFinite(monto) || monto < 0)) {
        toast.add({
          title: 'Monto detonado inválido',
          description: 'Captura un monto válido o déjalo vacío.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseNombre: 'Detonada',
        faseposicion: 12,
        docs: [{ rol: 'imagen_detonacion', archivo }],
        camposVenta: {
          fecha_detonacion: fechaDetonacion,
          monto_detonado: monto,
        },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 12',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 12 cerrada',
        description: 'Detonación registrada. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [archivo, fechaDetonacion, montoDetonado, router, sb, toast, venta]
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
          faseposicion={12}
          faseNombre="Detonada"
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
        faseposicion={12}
        faseNombre="Detonada"
        descripcion="Registra la detonación del crédito (el depósito recibido) y sube el comprobante."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 12 ya está cerrada"
          body="Esta venta ya está detonada. La siguiente fase es Facturada."
        />
      ) : fase11Cerrada === false ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 11 (Escriturada)"
          body={
            <>
              Antes de registrar la detonación, la venta debe estar escriturada. Vuelve al detalle y
              captura la Fase 11 primero.
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
          <Section title="Comprobante del depósito">
            <FileSlot
              label="Comprobante de transferencia/depósito *"
              archivo={archivo}
              onChange={setArchivo}
            />
          </Section>

          <Section title="Datos de la detonación">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fecha de detonación *">
                <Input
                  type="date"
                  value={fechaDetonacion}
                  onChange={(e) => setFechaDetonacion(e.target.value)}
                  required
                />
              </Field>
              <Field label="Monto detonado (opcional)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoDetonado}
                  onChange={(e) => setMontoDetonado(e.target.value)}
                />
                <Hint>
                  {montoDetonado === ''
                    ? 'Monto del depósito recibido'
                    : money(Number(montoDetonado) || 0)}
                </Hint>
              </Field>
            </div>
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

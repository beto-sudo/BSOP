'use client';

/**
 * Captura Fase 3 — Formalizar promesa (Sprint 7c piloto).
 *
 * Cierra la fase de Formalización: el cliente firmó el contrato de
 * promesa de compraventa que el vendedor descargó/imprimió de
 * `/api/dilesa/ventas/[id]/pdf/promesa-compraventa` (Sprint 7b).
 *
 * Captura:
 *   - Doc requerido: `contrato_promesa` (PDF firmado por ambas partes).
 *   - Campos: precio_asignacion (autollenado), descuento_total (opcional),
 *     fecha del contrato.
 *
 * Enforcement: requiere que Fase 2 (Asignada) esté cerrada. Si no, la
 * page muestra el bloqueo y enlaza a Fase 2.
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';
import {
  DocsFaseSection,
  useDocsFaseColaborativos,
  type SlotColaborativo,
} from '@/components/dilesa/captura/docs-fase-colaborativos';

const SLOTS_FASE: SlotColaborativo[] = [
  {
    rol: 'contrato_promesa',
    label: 'Contrato de promesa firmado por ambas partes',
    requerido: true,
  },
];

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  precio_asignacion: number | null;
  descuento_total: number | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

export default function CapturarFase3Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase03_formalizada" write>
      <CapturarFase3Body />
    </RequireAccess>
  );
}

function CapturarFase3Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase2Cerrada, setFase2Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [descuentoTotal, setDescuentoTotal] = useState<string>('');
  const [fechaContrato, setFechaContrato] = useState<string>(new Date().toISOString().slice(0, 10));
  const docsFase = useDocsFaseColaborativos(ventaId, SLOTS_FASE);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Cargar contexto de la venta ────────────────────────────────────
  useEffect(() => {
    if (!ventaId) return;
    let activo = true;

    (async () => {
      setLoading(true);
      setError(null);

      const { data: vRow, error: vErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .select('id, persona_id, unidad_id, precio_asignacion, descuento_total')
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
      if (v.descuento_total != null) setDescuentoTotal(String(v.descuento_total));

      // Enforcement: Fase 2 cerrada + Fase 3 no cerrada.
      const { data: fRows } = await sb
        .schema('dilesa')
        .from('venta_fases')
        .select('posicion')
        .eq('venta_id', v.id)
        .is('deleted_at', null);
      if (!activo) return;

      const posiciones = (fRows ?? []).map((f) => f.posicion as number);
      setFase2Cerrada(posiciones.includes(2));
      setYaCerrada(posiciones.includes(3));

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  // ── Submit ─────────────────────────────────────────────────────────
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      if (docsFase.faltantes.length > 0) {
        toast.add({
          title: 'Falta el contrato firmado',
          description: 'Sube el PDF del contrato de promesa firmado por ambas partes.',
          type: 'error',
        });
        return;
      }
      // El precio de asignación NO se modifica aquí — viene del cálculo de
      // Fase 1 (fn_calcular_precio_venta) y se persiste al crear la venta.
      // Si por algún motivo está vacío en la venta, no podemos cerrar Fase 3
      // (algo se rompió en Fase 1; el operador debe ir al detalle y avisar).
      const precio = Number(venta.precio_asignacion ?? 0);
      if (!Number.isFinite(precio) || precio <= 0) {
        toast.add({
          title: 'Precio de asignación faltante',
          description:
            'Esta venta no tiene precio de asignación capturado en Fase 1. Regresa a Fase 1 antes de continuar.',
          type: 'error',
        });
        return;
      }
      const descuento = descuentoTotal ? Number(descuentoTotal) : 0;
      if (!Number.isFinite(descuento) || descuento < 0) {
        toast.add({
          title: 'Descuento inválido',
          description: 'Si no aplica, déjalo en blanco o en 0.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      // El descuento va por la RPC auditada (no por marcarFase): registra el
      // cambio en core.audit_log. Modo total-only (sin desglose) — el reparto
      // en buckets lo hace Dirección en la pestaña Cuadratura.
      const { error: descErr } = await sb.schema('dilesa').rpc('fn_actualizar_descuentos_venta', {
        p_venta_id: venta.id,
        p_descuento_total: descuento,
        p_motivo: 'Captura en Formalizada (Fase 3)',
      });
      if (descErr) {
        setSubmitting(false);
        toast.add({
          title: 'No se pudo guardar el descuento',
          description: getSupabaseErrorMessage(descErr, 'Error desconocido.'),
          type: 'error',
        });
        return;
      }

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 3,
        docs: [], // el documento ya vive en el expediente (subida incremental)
        camposVenta: {
          precio_asignacion: precio,
          // descuento_total se persiste por la RPC auditada (arriba), no aquí.
          // fecha del contrato — se guarda en venta_fases.fecha vía el override más abajo
        },
        notas:
          fechaContrato !== new Date().toISOString().slice(0, 10)
            ? `Fecha del contrato: ${fechaContrato}`
            : null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 3',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 3 cerrada',
        description: 'Fase 4 (Solicitar avalúo) está disponible.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [docsFase.faltantes, descuentoTotal, fechaContrato, router, sb, toast, venta]
  );

  // ── Render ─────────────────────────────────────────────────────────
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
        <CapturarFaseHeader faseposicion={3} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={3}
        descripcion="Cliente firmó el contrato de promesa de compraventa. Sube el PDF firmado y captura precio + fecha."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 3 ya está cerrada"
          body="Esta venta ya pasó por Formalizar promesa. Si necesitas corregir algo, contacta al comité para reabrir la fase."
        />
      ) : !fase2Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 2 (Asignar unidad)"
          body={
            <>
              Antes de capturar Formalizada, asegúrate de tener la asignación del comité. Vuelve al
              detalle de la venta y captura la Fase 2 primero.
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
          <DocsFaseSection state={docsFase} />

          <Section title="Campos requeridos">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Precio de asignación">
                <div className="flex h-9 items-center rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 text-sm font-medium tabular-nums text-[var(--text)]">
                  {money(venta.precio_asignacion)}
                </div>
                <Hint>Se acarrea de la solicitud (Fase 1) — no editable aquí.</Hint>
              </Field>
              <Field label="Descuento total">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={descuentoTotal}
                  onChange={(e) => setDescuentoTotal(e.target.value)}
                  placeholder="0"
                />
                <Hint>Si no aplica, déjalo en blanco.</Hint>
              </Field>
              <Field label="Fecha del contrato *">
                <Input
                  type="date"
                  value={fechaContrato}
                  onChange={(e) => setFechaContrato(e.target.value)}
                  required
                />
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

/**
 * Slot de documento estandarizado — mismo patrón visual que Fase 2
 * (check + label + botón "Subir PDF"/"Cambiar" + drag-drop sobre la
 * tarjeta completa). Mantener consistente para que el operador navegue
 * las fases sin re-aprender la UI.
 */
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

'use client';

/**
 * Captura Fase 9 — Validación Patronal (Sprint 7g).
 *
 * Fase de un solo documento: Gerencia Ventas (o Dirección) sube el PDF de
 * la Validación Patronal que el patrón le entrega al empleado/cliente. El
 * documento se solicita y obtiene fuera del sistema (el cliente lo pide a su
 * patrón); aquí solo se archiva y se cierra la fase.
 *
 * Captura:
 *   - `fecha_validacion_patronal` → fecha del documento (default hoy)
 *   - Doc requerido: rol `validacion_patronal` (PDF de la validación).
 *     Coincide con `FASE_ROLES[9]` en el detalle.
 *
 * Enforcement: Fase 8 (Dictaminar) debe estar cerrada.
 *
 * Acceso: `dilesa.ventas.fase09_validacion_patronal` (Gerencia Ventas +
 * Dirección por default — backfill de la migración).
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
    rol: 'validacion_patronal',
    label: 'Validación Patronal (PDF entregado por el patrón)',
    requerido: true,
  },
];

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  fecha_validacion_patronal: string | null;
};

export default function CapturarFase9Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase09_validacion_patronal" write>
      <CapturarFase9Body />
    </RequireAccess>
  );
}

function CapturarFase9Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase8Cerrada, setFase8Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [fechaValidacion, setFechaValidacion] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const docsFase = useDocsFaseColaborativos(ventaId, SLOTS_FASE);

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
        .select('id, persona_id, unidad_id, fecha_validacion_patronal')
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
      if (v.fecha_validacion_patronal) setFechaValidacion(v.fecha_validacion_patronal);

      const { data: fRows } = await sb
        .schema('dilesa')
        .from('venta_fases')
        .select('posicion')
        .eq('venta_id', v.id)
        .is('deleted_at', null);
      if (!activo) return;

      const posiciones = (fRows ?? []).map((f) => f.posicion as number);
      setFase8Cerrada(posiciones.includes(8));
      setYaCerrada(posiciones.includes(9));

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
      if (docsFase.faltantes.length > 0) {
        toast.add({
          title: 'Falta el documento de validación patronal',
          description: 'Sube el PDF de la Validación Patronal que el patrón entregó al empleado.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 9,
        docs: [], // el documento ya vive en el expediente (subida incremental)
        camposVenta: {
          fecha_validacion_patronal: fechaValidacion,
        },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 9',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 9 cerrada',
        description:
          'Validación Patronal registrada. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [docsFase.faltantes, fechaValidacion, router, sb, toast, venta]
  );

  // ── Render ───────────────────────────────────────────────────────
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
        <CapturarFaseHeader faseposicion={9} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={9}
        descripcion="Sube el PDF de la Validación Patronal que el patrón le entrega al empleado."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 9 ya está cerrada"
          body="Esta venta ya pasó por Validación Patronal. La siguiente fase es Programar firmas."
        />
      ) : !fase8Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 8 (Dictaminar)"
          body={
            <>
              Antes de subir la Validación Patronal, la venta debe estar dictaminada. Vuelve al
              detalle y captura la Fase 8 primero.
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
          <DocsFaseSection state={docsFase} titulo="Documento de la validación patronal" />

          <p className="text-[11px] text-[var(--text)]/50">
            El cliente solicita este documento a su patrón. DILESA solo lo archiva al recibirlo.
          </p>

          <Section title="Datos de la validación">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fecha de la validación *">
                <Input
                  type="date"
                  value={fechaValidacion}
                  onChange={(e) => setFechaValidacion(e.target.value)}
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

/**
 * Slot estandarizado — mismo patrón que Fase 2/3/5 (check + label + botón
 * "Subir PDF"/"Cambiar" + drag-drop sobre toda la tarjeta).
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

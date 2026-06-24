'use client';

/**
 * Captura Fase 4 — Solicitar avalúo (Sprint 7d).
 *
 * Cierra la fase de Solicitar avalúo: Gerencia Ventas (o Dirección)
 * asigna una casa valuadora del catálogo (`erp.personas` con
 * `tipo='valuador'`) y dispara el email de solicitud al valuador.
 *
 * Captura:
 *   - `valuador_id` → FK a `erp.personas`
 *   - `fecha_solicitud_avaluo` → fecha del cierre (default hoy)
 *   - Sin doc requerido (el avalúo llega en Fase 5).
 *
 * Enforcement: Fase 3 (Formalizada) debe estar cerrada.
 *
 * Acceso: `dilesa.ventas.fase04_solicitud_avaluo` (Gerencia Ventas +
 * Dirección por default — backfill de la migración).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, Save } from 'lucide-react';
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
  empresa_id: string;
  persona_id: string;
  unidad_id: string | null;
  valuador_id: string | null;
};

type Valuador = {
  id: string;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
};

export default function CapturarFase4Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase04_solicitud_avaluo" write>
      <CapturarFase4Body />
    </RequireAccess>
  );
}

function CapturarFase4Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase3Cerrada, setFase3Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [valuadores, setValuadores] = useState<Valuador[]>([]);
  const [valuadorId, setValuadorId] = useState<string>('');
  const [fechaSolicitud, setFechaSolicitud] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

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
        .select('id, empresa_id, persona_id, unidad_id, valuador_id')
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
      if (v.valuador_id) setValuadorId(v.valuador_id);

      // Fases cerradas y catálogo de valuadores en paralelo.
      const [fRes, valRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', v.id)
          .is('deleted_at', null),
        sb
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno, apellido_materno, email')
          .eq('empresa_id', v.empresa_id)
          .eq('tipo', 'valuador')
          .eq('activo', true)
          .is('deleted_at', null)
          .order('nombre', { ascending: true }),
      ]);
      if (!activo) return;

      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase3Cerrada(posiciones.includes(3));
      setYaCerrada(posiciones.includes(4));

      setValuadores((valRes.data ?? []) as Valuador[]);

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
      if (!valuadorId) {
        toast.add({
          title: 'Falta el valuador',
          description: 'Selecciona una casa valuadora del catálogo.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 4,
        docs: [],
        camposVenta: {
          valuador_id: valuadorId,
          fecha_solicitud_avaluo: fechaSolicitud,
          // Limpiar el timestamp por si fue re-asignado el valuador y
          // queremos forzar un nuevo email del endpoint.
          notif_solicitud_avaluo_at: null,
        },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 4',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }

      toast.add({
        title: 'Fase 4 cerrada',
        description: 'Enviando solicitud por correo al valuador…',
        type: 'success',
      });

      // Disparar email al valuador (fire-and-forget — si falla, el operador
      // puede re-disparar manualmente abriendo de nuevo Fase 4 o desde el
      // detalle).
      void fetch(`/api/dilesa/ventas/${venta.id}/notify-solicitud-avaluo`, {
        method: 'POST',
      }).catch((err) => {
        console.warn('[fase4] notify-solicitud-avaluo failed:', err);
      });

      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [valuadorId, fechaSolicitud, router, sb, toast, venta]
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
        <CapturarFaseHeader faseposicion={4} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  const valuadorSeleccionado = valuadores.find((v) => v.id === valuadorId) ?? null;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={4}
        descripcion="Asigna una casa valuadora y dispara el email con los datos del inmueble y del cliente."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 4 ya está cerrada"
          body="Esta venta ya pasó por Solicitar avalúo. La siguiente fase es Cerrar avalúo."
        />
      ) : !fase3Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 3 (Formalizar promesa)"
          body={
            <>
              Antes de solicitar el avalúo, asegúrate de que el contrato de promesa esté firmado y
              capturado. Vuelve al detalle y captura la Fase 3 primero.
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
      ) : valuadores.length === 0 ? (
        <Banner
          tone="warning"
          title="No hay casas valuadoras en el catálogo"
          body="Habla con Beto/Dirección para que carguen al menos un valuador en el sistema antes de continuar."
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <Section title="Casa valuadora">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Valuador *">
                <select
                  value={valuadorId}
                  onChange={(e) => setValuadorId(e.target.value)}
                  required
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                >
                  <option value="">— selecciona —</option>
                  {valuadores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {nombreValuador(v)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha de solicitud *">
                <Input
                  type="date"
                  value={fechaSolicitud}
                  onChange={(e) => setFechaSolicitud(e.target.value)}
                  required
                />
              </Field>
            </div>
            {valuadorSeleccionado ? (
              <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 p-3 text-xs text-[var(--text)]/70">
                <div>
                  <span className="font-medium text-[var(--text)]">
                    {nombreValuador(valuadorSeleccionado)}
                  </span>
                </div>
                {valuadorSeleccionado.email ? (
                  <div className="mt-0.5 inline-flex items-center gap-1.5">
                    <Mail className="h-3 w-3" /> {valuadorSeleccionado.email}
                  </div>
                ) : (
                  <div className="mt-0.5 text-amber-700 dark:text-amber-200">
                    Este valuador no tiene email registrado — el envío fallará.
                  </div>
                )}
              </div>
            ) : null}
          </Section>

          <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/30 p-3 text-xs text-[var(--text)]/70">
            Al guardar, mandamos un email automático al valuador con los datos del inmueble
            (proyecto, manzana, lote, prototipo, m², características) y del cliente (nombre, CURP,
            teléfono). La gerencia de ventas queda en copia para coordinar la visita.
          </div>

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
                  <Save className="mr-2 size-4" /> Enviar solicitud
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function nombreValuador(v: Valuador): string {
  const apellidos = [v.apellido_paterno, v.apellido_materno].filter(Boolean).join(' ').trim();
  return apellidos ? `${v.nombre} ${apellidos}` : v.nombre;
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

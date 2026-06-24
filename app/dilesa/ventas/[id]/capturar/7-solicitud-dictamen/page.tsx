'use client';

/**
 * Captura Fase 7 — Dictamen Solicitado (Sprint 7f).
 *
 * Cierra la fase de Solicitud de Dictamen: Gerencia Ventas (o Dirección)
 * asigna una notaría del catálogo de proveedores (`erp.proveedores` con
 * `categoria='notaria'`, vía lib/dilesa/notarios) y dispara el email de
 * solicitud con magic link. El contacto se edita en el módulo Proveedores.
 *
 * Captura:
 *   - `notario_id` → FK a `erp.proveedores`
 *   - `fecha_solicitud_dictamen` → fecha del cierre (default hoy)
 *   - Sin doc requerido (el dictamen llega en Fase 8)
 *
 * Enforcement: Fase 6 (Inscrita) debe estar cerrada.
 *
 * Acceso: `dilesa.ventas.fase07_solicitud_dictamen` (Gerencia Ventas +
 * Dirección por default — backfill de la migración).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Mail, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';
import { listNotarias, type Notaria } from '@/lib/dilesa/notarios';

type VentaCtx = {
  id: string;
  empresa_id: string;
  persona_id: string;
  unidad_id: string | null;
  notario_id: string | null;
};

export default function CapturarFase7Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase07_solicitud_dictamen" write>
      <CapturarFase7Body />
    </RequireAccess>
  );
}

function CapturarFase7Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase6Cerrada, setFase6Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [notarios, setNotarios] = useState<Notaria[]>([]);
  const [notarioId, setNotarioId] = useState<string>('');
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
        .select('id, empresa_id, persona_id, unidad_id, notario_id')
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
      if (v.notario_id) setNotarioId(v.notario_id);

      const [fRes, notarias] = await Promise.all([
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', v.id)
          .is('deleted_at', null),
        listNotarias(sb, v.empresa_id),
      ]);
      if (!activo) return;

      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase6Cerrada(posiciones.includes(6));
      setYaCerrada(posiciones.includes(7));

      setNotarios(notarias);

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      if (!notarioId) {
        toast.add({
          title: 'Falta el notario',
          description: 'Selecciona una notaría del catálogo.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 7,
        docs: [],
        camposVenta: {
          notario_id: notarioId,
          fecha_solicitud_dictamen: fechaSolicitud,
          // Forzar re-envío si re-asignan notario
          notif_solicitud_dictamen_at: null,
        },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 7',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }

      const notarioSel = notarios.find((n) => n.proveedorId === notarioId);
      const tieneEmail = !!notarioSel?.email;

      toast.add({
        title: 'Fase 7 cerrada',
        description: tieneEmail
          ? 'Enviando solicitud por correo al notario…'
          : 'Notario sin email — entrega la solicitud por otro medio.',
        type: 'success',
      });

      if (tieneEmail) {
        void fetch(`/api/dilesa/ventas/${venta.id}/notify-solicitud-dictamen`, {
          method: 'POST',
        }).catch((err) => {
          console.warn('[fase7] notify-solicitud-dictamen failed:', err);
        });
      }

      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [notarioId, fechaSolicitud, router, sb, toast, venta, notarios]
  );

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
        <CapturarFaseHeader faseposicion={7} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  const notarioSeleccionado = notarios.find((n) => n.proveedorId === notarioId) ?? null;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={7}
        descripcion="Asigna una notaría y dispara el email con los datos del cliente, inmueble y crédito."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 7 ya está cerrada"
          body="Esta venta ya pasó por Dictamen Solicitado. La siguiente fase es Dictaminada."
        />
      ) : !fase6Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 6 (Inscrita)"
          body={
            <>
              Antes de solicitar dictamen, captura primero las Constancias de Crédito. Vuelve al
              detalle y completa la Fase 6.
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
      ) : notarios.length === 0 ? (
        <Banner
          tone="warning"
          title="No hay notarios en el catálogo"
          body="Habla con Beto/Dirección para que carguen al menos una notaría en el sistema antes de continuar."
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <Section title="Notaría">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Notario *">
                <select
                  value={notarioId}
                  onChange={(e) => setNotarioId(e.target.value)}
                  required
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                >
                  <option value="">— selecciona —</option>
                  {notarios.map((n) => (
                    <option key={n.proveedorId} value={n.proveedorId}>
                      {nombreNotario(n)}
                      {!n.email ? ' (falta email)' : ''}
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
            {notarioSeleccionado ? (
              <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 p-3 text-xs text-[var(--text)]/70">
                <div>
                  <span className="font-medium text-[var(--text)]">
                    {nombreNotario(notarioSeleccionado)}
                  </span>
                </div>
                {notarioSeleccionado.email ? (
                  <div className="mt-0.5 inline-flex items-center gap-1.5">
                    <Mail className="h-3 w-3" /> {notarioSeleccionado.email}
                  </div>
                ) : (
                  <div className="mt-0.5 inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-200">
                    <AlertTriangle className="h-3 w-3" />
                    Este notario no tiene email registrado — la solicitud no se enviará por correo.
                    Entrégala en papel/teléfono y captura manualmente el dictamen cuando llegue.
                  </div>
                )}
              </div>
            ) : null}
          </Section>

          <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/30 p-3 text-xs text-[var(--text)]/70">
            Al guardar, mandamos un email automático al notario con los datos del inmueble, cliente
            y operación (crédito + precio). El notario podrá subir la Carta de Instrucción
            directamente desde el email — sin necesidad de cuenta.
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

function nombreNotario(n: Notaria): string {
  return n.numeroNotaria ? `Notaría ${n.numeroNotaria} — ${n.nombre}` : n.nombre;
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

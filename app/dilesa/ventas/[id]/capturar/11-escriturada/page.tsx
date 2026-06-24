'use client';

/**
 * Captura Fase 11 — Escriturada (Sprint 7i).
 *
 * Tras la firma en notaría, las escrituras llegan a Dirección (Beto, o quien
 * de Dirección esté) para firmar. Se registra:
 *   - `fecha_escritura` → fecha de la escritura
 *   - `numero_escritura` → número de instrumento público del NOTARIO
 *     (no el folio interno — la revisión PLD de F13 lo cruza contra el
 *     aviso). Corrige post-cierre sin tocar venta_fases.
 *   - `numero_cheque_notaria` → número del cheque enviado a la notaría
 *   - `monto_cheque_notaria` → monto del cheque (parte de la cuadratura)
 *
 * Sin documentos requeridos.
 *
 * Enforcement: Fase 10 (Firmas Programadas) debe estar cerrada.
 * Acceso: `dilesa.ventas.fase11_escriturada` (Gerencia Ventas + Dirección).
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

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  numero_escritura: string | null;
  fecha_escritura: string | null;
  numero_cheque_notaria: string | null;
  monto_cheque_notaria: number | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

export default function CapturarFase11Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase11_escriturada" write>
      <CapturarFase11Body />
    </RequireAccess>
  );
}

function CapturarFase11Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase10Cerrada, setFase10Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [numeroEscritura, setNumeroEscritura] = useState<string>('');
  // En blanco a propósito: la fecha de escritura debe seleccionarse a mano
  // (no asumir "hoy") para que sea la fecha real del instrumento.
  const [fechaEscritura, setFechaEscritura] = useState<string>('');
  const [numeroCheque, setNumeroCheque] = useState<string>('');
  const [montoCheque, setMontoCheque] = useState<string>('');

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
          'id, persona_id, unidad_id, numero_escritura, fecha_escritura, numero_cheque_notaria, monto_cheque_notaria'
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
      if (v.numero_escritura) setNumeroEscritura(v.numero_escritura);
      if (v.fecha_escritura) setFechaEscritura(v.fecha_escritura);
      if (v.numero_cheque_notaria) setNumeroCheque(v.numero_cheque_notaria);
      if (v.monto_cheque_notaria != null) setMontoCheque(String(v.monto_cheque_notaria));

      const { data: fRows } = await sb
        .schema('dilesa')
        .from('venta_fases')
        .select('posicion')
        .eq('venta_id', v.id)
        .is('deleted_at', null);
      if (!activo) return;

      const posiciones = (fRows ?? []).map((f) => f.posicion as number);
      setFase10Cerrada(posiciones.includes(10));
      setYaCerrada(posiciones.includes(11));

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
      if (!fechaEscritura) {
        toast.add({
          title: 'Falta la fecha de escritura',
          description: 'Captura la fecha de la escritura.',
          type: 'error',
        });
        return;
      }
      if (!numeroEscritura.trim()) {
        toast.add({
          title: 'Falta el número de escritura',
          description: 'Captura el número de instrumento público del notario.',
          type: 'error',
        });
        return;
      }
      if (!numeroCheque.trim()) {
        toast.add({
          title: 'Falta el número de cheque',
          description: 'Captura el número del cheque enviado a la notaría.',
          type: 'error',
        });
        return;
      }
      const monto = Number(montoCheque);
      if (!Number.isFinite(monto) || monto <= 0) {
        toast.add({
          title: 'Monto del cheque inválido',
          description: 'Captura el monto del cheque (mayor a cero).',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 11,
        docs: [],
        camposVenta: {
          numero_escritura: numeroEscritura.trim(),
          fecha_escritura: fechaEscritura,
          numero_cheque_notaria: numeroCheque.trim(),
          monto_cheque_notaria: monto,
        },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 11',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 11 cerrada',
        description: 'Escrituración registrada. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });

      // Correo de escrituración al cliente (+ vendedor + escrituras@) —
      // fire-and-forget, patrón Fase 4: si falla, el botón "Correo de
      // escrituración" del expediente permite reintentar.
      void fetch(`/api/dilesa/ventas/${venta.id}/notify-escrituracion`, {
        method: 'POST',
      }).catch((err) => {
        console.warn('[fase11] notify-escrituracion failed:', err);
      });

      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [fechaEscritura, montoCheque, numeroCheque, numeroEscritura, router, sb, toast, venta]
  );

  // ── Corrección post-cierre (no toca venta_fases — patrón F8) ─────
  // Las ventas migradas traen folio interno en numero_escritura; la
  // revisión PLD de F13 exige el instrumento real del notario.
  const onActualizarEscritura = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      if (!fechaEscritura) {
        toast.add({
          title: 'Falta la fecha de escritura',
          type: 'error',
        });
        return;
      }
      if (!numeroEscritura.trim()) {
        toast.add({
          title: 'Falta el número de escritura',
          type: 'error',
        });
        return;
      }
      setSubmitting(true);
      const { error: upErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .update({
          fecha_escritura: fechaEscritura,
          numero_escritura: numeroEscritura.trim(),
        })
        .eq('id', venta.id);
      setSubmitting(false);
      if (upErr) {
        toast.add({
          title: 'No se pudieron actualizar los datos',
          description: getSupabaseErrorMessage(upErr, 'Reintenta.'),
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Datos de escritura actualizados',
        description: 'Si la Fase 13 ya tenía revisión, re-ejecútala para que tome el dato nuevo.',
        type: 'success',
      });
    },
    [venta, fechaEscritura, numeroEscritura, sb, toast]
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
        <CapturarFaseHeader faseposicion={11} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={11}
        descripcion="Registra la escrituración: fecha de escritura y el cheque enviado a la notaría (número y monto)."
      />

      {yaCerrada ? (
        <div className="space-y-6">
          <Banner
            tone="success"
            title="Fase 11 ya está cerrada"
            body="Esta venta ya está escriturada. La siguiente fase es Detonada. Si el número o la fecha de la escritura quedaron mal capturados (ej. folio interno en lugar del instrumento del notario), corrígelos aquí — la revisión PLD de la Fase 13 los cruza contra el aviso."
          />
          <form onSubmit={onActualizarEscritura} className="space-y-6">
            <Section title="Corregir datos de la escritura">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Fecha de escritura *">
                  <Input
                    type="date"
                    value={fechaEscritura}
                    onChange={(e) => setFechaEscritura(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Número de instrumento público (escritura) *">
                  <Input
                    value={numeroEscritura}
                    onChange={(e) => setNumeroEscritura(e.target.value)}
                    required
                    placeholder="Número que asigna el notario, ej. 206"
                  />
                  <Hint>
                    El número de la escritura del NOTARIO (instrumento público) — no el folio
                    interno.
                  </Hint>
                </Field>
              </div>
            </Section>
            <div className="flex items-center justify-end gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
                  </>
                ) : (
                  'Actualizar datos de escritura'
                )}
              </Button>
            </div>
          </form>
        </div>
      ) : fase10Cerrada === false ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 10 (Firmas Programadas)"
          body={
            <>
              Antes de registrar la escrituración, programa la firma (Fase 10). Vuelve al detalle y
              captura la Fase 10 primero.
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
          <Section title="Datos de la escritura">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fecha de escritura *">
                <Input
                  type="date"
                  value={fechaEscritura}
                  onChange={(e) => setFechaEscritura(e.target.value)}
                  required
                />
              </Field>
              <Field label="Número de instrumento público (escritura) *">
                <Input
                  value={numeroEscritura}
                  onChange={(e) => setNumeroEscritura(e.target.value)}
                  required
                  placeholder="Número que asigna el notario, ej. 206"
                />
                <Hint>
                  El número de la escritura del NOTARIO (instrumento público) — no el folio interno.
                  La revisión PLD de la Fase 13 lo cruza contra el aviso.
                </Hint>
              </Field>
            </div>
          </Section>

          <Section title="Cheque a la notaría">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Número de cheque *">
                <Input
                  value={numeroCheque}
                  onChange={(e) => setNumeroCheque(e.target.value)}
                  required
                  placeholder="Número del cheque"
                />
              </Field>
              <Field label="Monto del cheque *">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoCheque}
                  onChange={(e) => setMontoCheque(e.target.value)}
                  required
                />
                <Hint>{money(Number(montoCheque) || 0)} — entra a la cuadratura</Hint>
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

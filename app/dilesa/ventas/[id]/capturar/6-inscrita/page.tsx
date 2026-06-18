'use client';

/**
 * Captura Fase 6 — Inscrita (Sprint 7e).
 *
 * Cierra la fase de Inscripción del crédito: el banco entregó la(s)
 * Constancia(s) de Crédito con el monto APROBADO. Gerencia Ventas (o
 * Dirección) captura los PDFs y confirma los montos finales — el
 * aprobado típicamente difiere del solicitado en Fase 1 por unos
 * pesos (redondeo del banco).
 *
 * Captura:
 *   - PDF Constancia Crédito Titular (rol `constancia_credito_titular`)
 *     · Obligatorio si tipo_credito != 'Recursos propios' y monto > 0
 *   - PDF Constancia Crédito Co-Titular (rol `constancia_credito_cotitular`)
 *     · Obligatorio si monto_credito_cotitular > 0
 *   - Monto Crédito Titular (editable, acarrea de Fase 1)
 *   - Monto Crédito Co-Titular (editable, acarrea de Fase 1)
 *   - Fecha de inscripción (default hoy)
 *
 * Si tipo_credito = 'Recursos propios': no requiere docs ni montos,
 * solo botón "Marcar inscrita".
 *
 * Enforcement: Fase 5 (Avalúo Cerrado) debe estar cerrada.
 *
 * Acceso: `dilesa.ventas.fase06_inscrita` (Gerencia Ventas + Dirección).
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
import { marcarFase, type DocCaptura } from '@/lib/dilesa/captura/marcar-fase';
import {
  DocsFaseSection,
  useDocsFaseColaborativos,
  type SlotColaborativo,
} from '@/components/dilesa/captura/docs-fase-colaborativos';

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  tipo_credito: string | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  credito_titular_ref: string | null;
  credito_cotitular_ref: string | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

function esRecursosPropios(tipoCredito: string | null): boolean {
  if (!tipoCredito) return false;
  return /recursos\s+propios/i.test(tipoCredito);
}

export default function CapturarFase6Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase06_inscrita" write>
      <CapturarFase6Body />
    </RequireAccess>
  );
}

function CapturarFase6Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase5Cerrada, setFase5Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  // Editables — defaults de los actuales de la venta (acarreo Fase 1).
  const [montoTitular, setMontoTitular] = useState<string>('');
  const [montoCotitular, setMontoCotitular] = useState<string>('');
  // Número de crédito + institución (lo trae la constancia del banco).
  const [creditoTitularRef, setCreditoTitularRef] = useState<string>('');
  const [creditoCotitularRef, setCreditoCotitularRef] = useState<string>('');
  const [fechaInscripcion, setFechaInscripcion] = useState<string>(
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
        .select(
          'id, persona_id, unidad_id, tipo_credito, monto_credito_titular, monto_credito_cotitular, credito_titular_ref, credito_cotitular_ref'
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
      if (v.monto_credito_titular != null) {
        setMontoTitular(String(v.monto_credito_titular));
      }
      if (v.monto_credito_cotitular != null) {
        setMontoCotitular(String(v.monto_credito_cotitular));
      }
      if (v.credito_titular_ref) setCreditoTitularRef(v.credito_titular_ref);
      if (v.credito_cotitular_ref) setCreditoCotitularRef(v.credito_cotitular_ref);

      const { data: fRows } = await sb
        .schema('dilesa')
        .from('venta_fases')
        .select('posicion')
        .eq('venta_id', v.id)
        .is('deleted_at', null);
      if (!activo) return;

      const posiciones = (fRows ?? []).map((f) => f.posicion as number);
      setFase5Cerrada(posiciones.includes(5));
      setYaCerrada(posiciones.includes(6));

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  // ── Derivar obligatoriedades según tipo_credito + montos ─────────
  const sinCredito = venta ? esRecursosPropios(venta.tipo_credito) : false;
  const montoTitNum = Number(montoTitular) || 0;
  const montoCoNum = Number(montoCotitular) || 0;
  const requiereTitular = !sinCredito && montoTitNum > 0;
  const requiereCotitular = montoCoNum > 0;

  // Slots dinámicos: la obligatoriedad sigue a los montos capturados; el
  // documento subido persiste aunque el monto cambie (queda en expediente).
  const slotsConstancias = useMemo<SlotColaborativo[]>(
    () => [
      {
        rol: 'constancia_credito_titular',
        label: 'Constancia Crédito Titular',
        requerido: requiereTitular,
      },
      {
        rol: 'constancia_credito_cotitular',
        label: 'Constancia Crédito Co-Titular',
        requerido: requiereCotitular,
      },
    ],
    [requiereTitular, requiereCotitular]
  );
  const docsFase = useDocsFaseColaborativos(ventaId, slotsConstancias);

  // ── Submit ───────────────────────────────────────────────────────
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;

      // Validaciones
      if (docsFase.faltantes.length > 0) {
        toast.add({
          title: 'Faltan constancias en el expediente',
          description: `Sube: ${docsFase.faltantes.map((r) => docsFase.labelDe(r)).join(', ')}.`,
          type: 'error',
        });
        return;
      }
      if (!sinCredito && montoTitNum <= 0) {
        toast.add({
          title: 'Monto Titular inválido',
          description: 'Para crédito, el monto del titular debe ser mayor a cero.',
          type: 'error',
        });
        return;
      }
      if (montoCoNum < 0) {
        toast.add({
          title: 'Monto Co-Titular inválido',
          description: 'Si no hay co-titular, déjalo en 0.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      // Las constancias ya viven en el expediente (subida incremental).
      const docs: DocCaptura[] = [];

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseNombre: 'Inscrita',
        faseposicion: 6,
        docs,
        camposVenta: {
          monto_credito_titular: montoTitNum,
          monto_credito_cotitular: montoCoNum,
          credito_titular_ref: creditoTitularRef.trim() || null,
          credito_cotitular_ref: creditoCotitularRef.trim() || null,
        },
        notas:
          fechaInscripcion !== new Date().toISOString().slice(0, 10)
            ? `Fecha de inscripción: ${fechaInscripcion}`
            : null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 6',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 6 cerrada',
        description: 'Inscripción capturada. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [
      docsFase,
      fechaInscripcion,
      montoTitNum,
      montoCoNum,
      creditoTitularRef,
      creditoCotitularRef,
      sinCredito,
      router,
      sb,
      toast,
      venta,
    ]
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
        <CapturarFaseHeader faseposicion={6} faseNombre="Inscrita" />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={6}
        faseNombre="Inscrita"
        descripcion="Banco entregó la(s) Constancia(s) de Crédito. Sube los PDFs y confirma los montos aprobados."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 6 ya está cerrada"
          body="Esta venta ya pasó por Inscrita. La siguiente fase es Solicitud de Dictaminación."
        />
      ) : !fase5Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 5 (Avalúo Cerrado)"
          body={
            <>
              Antes de inscribir el crédito, captura primero el avalúo entregado por la casa
              valuadora. Vuelve al detalle y completa la Fase 5.
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
          {sinCredito ? (
            <Banner
              tone="warning"
              title="Recursos propios — sin constancias bancarias"
              body="Esta venta es con recursos propios, no requiere Constancia de Crédito. Al guardar solo se marcará la fase como cerrada."
            />
          ) : (
            <DocsFaseSection state={docsFase} titulo="Constancias de crédito" />
          )}

          <Section title="Montos aprobados por el banco">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={`Monto Crédito Titular${sinCredito ? '' : ' *'}`}>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={montoTitular}
                  onChange={(e) => setMontoTitular(e.target.value)}
                  disabled={sinCredito}
                />
                <Hint>{money(montoTitNum)} — acarreado de Fase 1, editable</Hint>
              </Field>
              <Field label="Monto Crédito Co-Titular">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={montoCotitular}
                  onChange={(e) => setMontoCotitular(e.target.value)}
                  placeholder="0"
                  disabled={sinCredito}
                />
                <Hint>{money(montoCoNum)} — 0 si no hay co-titular</Hint>
              </Field>
              <Field label="Número de Crédito Titular e Institución">
                <Input
                  value={creditoTitularRef}
                  onChange={(e) => setCreditoTitularRef(e.target.value)}
                  placeholder="Ej. Infonavit 1234567890"
                  disabled={sinCredito}
                />
                <Hint>Número del crédito + institución (lo trae la constancia del banco)</Hint>
              </Field>
              <Field label="Número de Crédito Co-Titular e Institución">
                <Input
                  value={creditoCotitularRef}
                  onChange={(e) => setCreditoCotitularRef(e.target.value)}
                  placeholder="Si no hay co-titular, déjalo en blanco"
                  disabled={sinCredito}
                />
                <Hint>Solo si hay co-acreditado</Hint>
              </Field>
              <Field label="Fecha de inscripción *">
                <Input
                  type="date"
                  value={fechaInscripcion}
                  onChange={(e) => setFechaInscripcion(e.target.value)}
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
 * FileSlot estandarizado — mismo patrón que Fases 2, 3, 5 (check + label
 * + botón "Subir PDF"/"Cambiar" + drag-drop sobre toda la tarjeta).
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

'use client';

/**
 * Fase 12 — Detonar crédito. GUÍA a Cobranza + cierre manual SOLO Dirección.
 *
 * "Detonar" el crédito = la institución libera el recurso y DILESA recibe el
 * depósito. El camino ÚNICO normal (2026-06-11) es: Contabilidad registra el
 * abono de la institución en el estado de cuenta de la venta y el trigger
 * `dilesa.fn_detonar_venta_desde_cxc` cierra esta fase solo — un registro,
 * un lugar, el dinero en CxC y el comprobante copiado al expediente.
 *
 * Esta pantalla ya NO captura para el equipo (2026-06-12, caso Ahumada
 * Castillo: el cierre manual con imagen hacía creer que el depósito quedaba
 * registrado, y el estado de cuenta quedaba en ceros). Para no-Dirección es
 * una guía con botón directo a "Registrar abono". El form manual queda como
 * cierre de emergencia exclusivo de Dirección/admin, con advertencia de que
 * NO registra el dinero en Cobranza.
 *
 * Enforcement: Fase 11 (Escriturar) debe estar cerrada.
 * Acceso: `dilesa.ventas.fase12_detonada` (Contabilidad + Gerencia Ventas +
 * Dirección); el form de emergencia además exige Dirección
 * (`EffectiveUser.direccionEmpresaIds` o admin global).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, Loader2, Save, ShieldAlert } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { useEffectiveUser } from '@/components/providers';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
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
  { rol: 'imagen_detonacion', label: 'Comprobante de transferencia/depósito', requerido: true },
];

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

  // Cierre manual = SOLO Dirección (admin global o rol Dirección en DILESA).
  // El resto del equipo ve la guía hacia el estado de cuenta.
  const { data: effectiveUser, loading: userLoading } = useEffectiveUser();
  const esDireccion =
    !!effectiveUser?.isAdmin ||
    (effectiveUser?.direccionEmpresaIds ?? []).includes(DILESA_EMPRESA_ID);

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase11Cerrada, setFase11Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [fechaDetonacion, setFechaDetonacion] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [montoDetonado, setMontoDetonado] = useState<string>('');
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

      const { data: fRows } = await sb
        .schema('dilesa')
        .from('venta_fases')
        .select('posicion')
        .eq('venta_id', v.id)
        .is('deleted_at', null);
      if (!activo) return;

      const posiciones = (fRows ?? []).map((f) => f.posicion as number);
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
      if (docsFase.faltantes.length > 0) {
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
        faseposicion: 12,
        docs: [], // el comprobante ya vive en el expediente (subida incremental)
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
    [docsFase.faltantes, fechaDetonacion, montoDetonado, router, sb, toast, venta]
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
        <CapturarFaseHeader faseposicion={12} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={12}
        descripcion="Registra la detonación del crédito (el depósito recibido) y sube el comprobante."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 12 ya está cerrada"
          body="Esta venta ya está detonada. La siguiente fase es Facturar."
        />
      ) : fase11Cerrada === false ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 11 (Escriturar)"
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
      ) : userLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : !esDireccion ? (
        <GuiaCobranza ventaId={venta.id} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="rounded-lg border border-amber-400/50 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Cierre manual de emergencia (solo Dirección)</p>
                <p>
                  Esta pantalla NO registra el depósito en Cobranza: el estado de cuenta de la venta
                  quedará sin el abono. El camino normal es registrar el abono de la institución en
                  el estado de cuenta — la fase se cierra sola y el comprobante se copia al
                  expediente. Si cierras por aquí, registra el abono en Cobranza después.
                </p>
                <Link
                  href={`/dilesa/ventas/${venta.id}?abono=1`}
                  className="inline-block font-medium underline"
                >
                  Mejor registrar el abono ahora →
                </Link>
              </div>
            </div>
          </div>

          <DocsFaseSection state={docsFase} titulo="Comprobante del depósito" />

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

function GuiaCobranza({ ventaId }: { ventaId: string }) {
  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <div className="flex items-start gap-3">
        <Banknote className="h-6 w-6 shrink-0 text-[var(--accent)]" />
        <div className="space-y-2 text-sm">
          <p className="font-medium text-[var(--text)]">
            La detonación se registra en Cobranza, no aquí.
          </p>
          <p className="text-[var(--text)]/70">
            Registra el abono de la institución en el estado de cuenta de la venta — con su
            comprobante y el XML del recibo de caja. Al registrarlo, esta fase se cierra sola y el
            comprobante se copia al expediente. Con coacreditados (p. ej. Infonavit Unamos),
            registra un abono por cada depósito, cada uno con su comprobante.
          </p>
        </div>
      </div>
      <Link
        href={`/dilesa/ventas/${ventaId}?abono=1`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--text)] px-4 py-2 text-sm font-medium text-[var(--card)] hover:opacity-90"
      >
        <Banknote className="h-4 w-4" /> Registrar abono en el estado de cuenta
      </Link>
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

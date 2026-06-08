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
  tipo_credito: string | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
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
  const [clienteNombre, setClienteNombre] = useState<string>('');
  const [identificacionInv, setIdentificacionInv] = useState<string | null>(null);
  const [fase5Cerrada, setFase5Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  // Editables — defaults de los actuales de la venta (acarreo Fase 1).
  const [montoTitular, setMontoTitular] = useState<string>('');
  const [montoCotitular, setMontoCotitular] = useState<string>('');
  const [fechaInscripcion, setFechaInscripcion] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [archivoTitular, setArchivoTitular] = useState<File | null>(null);
  const [archivoCotitular, setArchivoCotitular] = useState<File | null>(null);

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
          'id, persona_id, unidad_id, tipo_credito, monto_credito_titular, monto_credito_cotitular'
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

  // ── Submit ───────────────────────────────────────────────────────
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;

      // Validaciones
      if (requiereTitular && !archivoTitular) {
        toast.add({
          title: 'Falta la Constancia del Titular',
          description: 'Sube el PDF de la constancia del crédito titular.',
          type: 'error',
        });
        return;
      }
      if (requiereCotitular && !archivoCotitular) {
        toast.add({
          title: 'Falta la Constancia del Co-Titular',
          description: 'Hay monto de crédito co-titular > 0; sube su constancia.',
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

      const docs: DocCaptura[] = [];
      if (archivoTitular) docs.push({ rol: 'constancia_credito_titular', archivo: archivoTitular });
      if (archivoCotitular)
        docs.push({ rol: 'constancia_credito_cotitular', archivo: archivoCotitular });

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseNombre: 'Inscrita',
        faseposicion: 6,
        docs,
        camposVenta: {
          monto_credito_titular: montoTitNum,
          monto_credito_cotitular: montoCoNum,
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
      archivoTitular,
      archivoCotitular,
      fechaInscripcion,
      montoTitNum,
      montoCoNum,
      requiereTitular,
      requiereCotitular,
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
          faseposicion={6}
          faseNombre="Inscrita"
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
            <Section title="Constancias de crédito">
              <FileSlot
                label={`Constancia Crédito Titular${requiereTitular ? ' *' : ''}`}
                archivo={archivoTitular}
                onChange={setArchivoTitular}
              />
              {requiereCotitular || archivoCotitular ? (
                <div className="mt-3">
                  <FileSlot
                    label={`Constancia Crédito Co-Titular${requiereCotitular ? ' *' : ''}`}
                    archivo={archivoCotitular}
                    onChange={setArchivoCotitular}
                  />
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--text)]/50">
                  Co-titular sin monto. Si aplica, captura el monto abajo y subirá su slot.
                </p>
              )}
            </Section>
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
        {archivo ? 'Cambiar' : 'Subir PDF'}
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

'use client';

/**
 * Captura Fase 5 — Avalúo Cerrado (Sprint 7d).
 *
 * Cierra la fase de Avalúo Cerrado: Gerencia Ventas (o Dirección)
 * registra el monto dictaminado y sube el PDF del avalúo comercial
 * entregado por el valuador.
 *
 * Captura:
 *   - `monto_avaluo` → monto dictaminado por la casa valuadora
 *   - `fecha_avaluo_cerrado` → fecha del cierre (default hoy)
 *   - Docs requeridos (rol en `erp.adjuntos`, coinciden con `FASE_ROLES[5]`):
 *       · `avaluo_comercial` — PDF firmado por el valuador (siempre).
 *       · `orden_pago_seguro_calidad` — PDF de la orden de pago del seguro de
 *         calidad (RUV). Solo Infonavit/Cofinavit (`requiereSeguroCalidad`).
 *       · `solicitud_pago_seguro_calidad` — imagen de la solicitud de pago del
 *         seguro (trae la referencia de la vivienda). Solo Infonavit/Cofinavit.
 *
 * Captura colaborativa (Sprint 4b de `dilesa-ventas-captura-colaborativa`):
 * el documento persiste AL SUBIRSE con quién/cuándo; el cierre valida contra
 * el expediente (marcarFase con docs: []).
 *
 * Enforcement: Fase 4 (Solicitud de Avalúo) debe estar cerrada.
 *
 * Acceso: `dilesa.ventas.fase05_avaluo_cerrado` (Gerencia Ventas +
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
import {
  IndicadorAutoguardado,
  useAutoguardadoCampos,
} from '@/components/dilesa/captura/autoguardado-campos';
import { requiereSeguroCalidad } from '@/lib/dilesa/captura/fase-roles';

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  monto_avaluo: number | null;
  fecha_avaluo_cerrado: string | null;
  valuador_id: string | null;
  tipo_credito: string | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

export default function CapturarFase5Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase05_avaluo_cerrado" write>
      <CapturarFase5Body />
    </RequireAccess>
  );
}

function CapturarFase5Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [valuadorNombre, setValuadorNombre] = useState<string | null>(null);
  const [fase4Cerrada, setFase4Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  // Slots por tipo de crédito: el avalúo va siempre; los 2 del seguro de
  // calidad (RUV) solo se exigen en Infonavit/Cofinavit. La longitud del array
  // cambia con `tipo_credito`, así que el hook recalcula `faltantes` al cargar
  // la venta (su `slotsKey` se llavea por los roles presentes).
  const slotsF5 = useMemo<SlotColaborativo[]>(() => {
    const slots: SlotColaborativo[] = [
      {
        rol: 'avaluo_comercial',
        label: 'Avalúo Comercial firmado por el valuador',
        requerido: true,
      },
    ];
    if (requiereSeguroCalidad(venta?.tipo_credito ?? null)) {
      slots.push(
        {
          rol: 'orden_pago_seguro_calidad',
          label: 'Orden de pago del seguro de calidad (PDF)',
          requerido: true,
        },
        {
          rol: 'solicitud_pago_seguro_calidad',
          label: 'Solicitud de pago del seguro de calidad (referencia de la vivienda)',
          requerido: true,
        }
      );
    }
    return slots;
  }, [venta?.tipo_credito]);
  const docsFase = useDocsFaseColaborativos(ventaId, slotsF5);
  const [montoAvaluo, setMontoAvaluo] = useState<string>('');
  const [fechaAvaluo, setFechaAvaluo] = useState<string>(new Date().toISOString().slice(0, 10));
  // Autoguardado (ADR-051): firma de lo último persistido (arranca = lo cargado).
  const [guardado, setGuardado] = useState<{ monto: string; fecha: string }>({
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
  });

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
          'id, persona_id, unidad_id, monto_avaluo, fecha_avaluo_cerrado, valuador_id, tipo_credito'
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
      const montoCargado = v.monto_avaluo != null ? String(v.monto_avaluo) : '';
      // En corrección (fase ya cerrada) mostramos la fecha real del cierre, no hoy.
      const fechaCargada = v.fecha_avaluo_cerrado
        ? v.fecha_avaluo_cerrado.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      if (v.monto_avaluo != null) setMontoAvaluo(montoCargado);
      if (v.fecha_avaluo_cerrado) setFechaAvaluo(fechaCargada);
      setGuardado({ monto: montoCargado, fecha: fechaCargada });

      const [fRes, valRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', v.id)
          .is('deleted_at', null),
        v.valuador_id
          ? sb
              .schema('erp')
              .from('personas')
              .select('nombre, apellido_paterno, apellido_materno')
              .eq('id', v.valuador_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!activo) return;

      if (valRes.data) {
        const apellidos = [valRes.data.apellido_paterno, valRes.data.apellido_materno]
          .filter(Boolean)
          .join(' ')
          .trim();
        setValuadorNombre(
          apellidos ? `${valRes.data.nombre} ${apellidos}` : (valRes.data.nombre as string)
        );
      }
      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase4Cerrada(posiciones.includes(4));
      setYaCerrada(posiciones.includes(5));

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  // ── Autoguardado (ADR-051) ──────────────────────────────────────
  // Monto + fecha del avalúo persisten al cambiarlos (UPDATE directo, igual que el
  // cierre vía marcarFase). Solo PRE-cierre: en corrección (fase ya cerrada) la
  // escritura va por la RPC auditada `fn_corregir_avaluo_venta` con su propio botón.
  const auto = useAutoguardadoCampos({
    clave: JSON.stringify({ monto: montoAvaluo, fecha: fechaAvaluo }),
    claveGuardada: JSON.stringify(guardado),
    habilitado: !!venta && !yaCerrada,
    guardar: async () => {
      if (!venta) return { ok: false };
      const { error: upErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .update({
          monto_avaluo: montoAvaluo.trim() ? Number(montoAvaluo) : null,
          fecha_avaluo_cerrado: fechaAvaluo || null,
        })
        .eq('id', venta.id);
      if (upErr) return { ok: false, error: getSupabaseErrorMessage(upErr, 'No se pudo guardar.') };
      setGuardado({ monto: montoAvaluo, fecha: fechaAvaluo });
      return { ok: true };
    },
  });

  // ── Submit ───────────────────────────────────────────────────────
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;

      const monto = Number(montoAvaluo);
      if (!Number.isFinite(monto) || monto <= 0) {
        toast.add({
          title: 'Monto del avalúo inválido',
          description: 'Captura el monto dictaminado por el valuador (mayor a cero).',
          type: 'error',
        });
        return;
      }

      // ── Modo corrección: la fase ya está cerrada. Solo se ajusta el dato
      //    financiero (monto/fecha) vía RPC auditada; el PDF corregido ya se
      //    versionó al subirse. NO se re-marca la fase — el pipeline no cambia.
      if (yaCerrada) {
        setSubmitting(true);
        const { error: rpcErr } = await sb.schema('dilesa').rpc('fn_corregir_avaluo_venta', {
          p_venta_id: venta.id,
          p_monto_avaluo: monto,
          p_fecha_avaluo_cerrado: fechaAvaluo,
          p_motivo: 'Corrección de avalúo (Fase 5 ya cerrada)',
        });
        setSubmitting(false);
        if (rpcErr) {
          toast.add({
            title: 'No se pudo corregir el avalúo',
            description: getSupabaseErrorMessage(rpcErr, 'Error desconocido.'),
            type: 'error',
          });
          return;
        }
        toast.add({
          title: 'Avalúo corregido',
          description: 'Monto y fecha actualizados. El pipeline no se modificó.',
          type: 'success',
        });
        router.push(`/dilesa/ventas/${venta.id}`);
        return;
      }

      // ── Modo cierre (primera vez): valida el expediente + marcarFase.
      if (docsFase.faltantes.length > 0) {
        const faltan = docsFase.faltantes.map((rol) => docsFase.labelDe(rol)).join(', ');
        toast.add({
          title: docsFase.faltantes.length === 1 ? 'Falta un documento' : 'Faltan documentos',
          description: `Sube en el expediente: ${faltan}. Quedan guardados al subirlos.`,
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 5,
        docs: [], // el avalúo ya vive en el expediente (subida incremental)
        camposVenta: {
          monto_avaluo: monto,
          fecha_avaluo_cerrado: fechaAvaluo,
        },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 5',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 5 cerrada',
        description: 'Avalúo registrado. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [docsFase, fechaAvaluo, montoAvaluo, router, sb, toast, venta, yaCerrada]
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
        <CapturarFaseHeader faseposicion={5} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={5}
        descripcion="Registra el monto dictaminado por la casa valuadora y sube el PDF del avalúo."
      />

      {!yaCerrada && !fase4Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 4 (Avalúo Solicitado)"
          body={
            <>
              Antes de capturar el avalúo, asegúrate de haber enviado la solicitud al valuador.
              Vuelve al detalle y captura la Fase 4 primero.
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
          {yaCerrada ? (
            <Banner
              tone="info"
              title="Fase 5 cerrada — modo corrección"
              body="Si el avalúo cambió, sube el archivo corregido (se guarda al instante y conserva el anterior) y/o ajusta el monto y la fecha. Esto solo corrige el expediente: no mueve el pipeline ni regresa la venta."
            />
          ) : null}

          {valuadorNombre ? (
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-4 py-2 text-xs text-[var(--text)]/70">
              <span className="font-medium text-[var(--text)]/80">Casa valuadora:</span>{' '}
              {valuadorNombre}
            </div>
          ) : null}

          <DocsFaseSection state={docsFase} titulo="Documentos" />

          <Section
            title="Datos del avalúo"
            accion={
              yaCerrada ? null : <IndicadorAutoguardado estado={auto.estado} error={auto.error} />
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Monto del avalúo *">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={montoAvaluo}
                  onChange={(e) => setMontoAvaluo(e.target.value)}
                  required
                />
                <Hint>{money(Number(montoAvaluo) || 0)}</Hint>
              </Field>
              <Field label="Fecha del avalúo *">
                <Input
                  type="date"
                  value={fechaAvaluo}
                  onChange={(e) => setFechaAvaluo(e.target.value)}
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
                  <Save className="mr-2 size-4" />{' '}
                  {yaCerrada ? 'Guardar corrección' : 'Guardar fase'}
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Section({
  title,
  accion,
  children,
}: {
  title: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          {title}
        </h2>
        {accion}
      </div>
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
  tone: 'success' | 'warning' | 'info';
  title: string;
  body: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const styles =
    tone === 'success'
      ? 'border-emerald-400/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
      : tone === 'info'
        ? 'border-sky-400/40 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-100'
        : 'border-amber-400/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100';
  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 text-sm">{body}</div>
      {extra}
    </div>
  );
}

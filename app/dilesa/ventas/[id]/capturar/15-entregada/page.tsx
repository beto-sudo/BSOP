'use client';

/**
 * Captura Fase 15 — Entregada (dilesa-ventas-expediente / ADR-052).
 *
 * Modelo evento-vs-fase: la entrega física al cliente es un EVENTO con fecha
 * real, NO un avance de fase. Se imprime el Checklist para Entrega de Vivienda
 * (PDF prellenado), se recorre la casa con el cliente palomeando SÍ/NO, firman
 * el CLIENTE y Atención a Clientes, se escanea, se sube y se registra la fecha
 * real. Eso NO cierra la fase: la venta pasa a "Entregada" (15) sola, vía el
 * motor de DB `fn_avanzar_post_factura`, en cuanto la operación esté FACTURADA
 * (13). Si la entrega se registró antes de facturar, el salto ocurre al facturar.
 *
 * Gates (eventos, no filas de fase): el pago debe haber entrado (Detonada, 12) y
 * la pre-entrega debe estar registrada (fecha_pre_entrega). El candado duro del
 * avance es la factura (13).
 *
 * Acceso: `dilesa.ventas.fase15_entregada` (escritura: Vendedor + Dirección;
 * lectura: Gerencia Ventas — pre-sembrado en core.modulos).
 */

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Printer, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { registrarEventoEntrega } from '@/lib/dilesa/captura/registrar-evento-entrega';
import {
  DocsFaseSection,
  useDocsFaseColaborativos,
  type SlotColaborativo,
} from '@/components/dilesa/captura/docs-fase-colaborativos';

const SLOTS_FASE: SlotColaborativo[] = [
  {
    rol: 'checklist_entrega',
    label: 'Checklist de entrega firmado por el cliente',
    requerido: true,
  },
];

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  fecha_pre_entrega: string | null;
  fecha_entrega: string | null;
  fase_posicion: number | null;
};

/** Fecha de hoy en formato YYYY-MM-DD en la zona local del navegador. */
function hoyLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function CapturarFase15Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase15_entregada" write>
      <CapturarFase15Body />
    </RequireAccess>
  );
}

function CapturarFase15Body() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [posiciones, setPosiciones] = useState<number[] | null>(null);
  const [fecha, setFecha] = useState<string>(hoyLocal());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const docsFase = useDocsFaseColaborativos(ventaId, SLOTS_FASE);

  const cargar = useCallback(async () => {
    const { data: vRow, error: vErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .select('id, persona_id, unidad_id, fecha_pre_entrega, fecha_entrega, fase_posicion')
      .eq('id', ventaId)
      .is('deleted_at', null)
      .maybeSingle();
    if (vErr) {
      setError(getSupabaseErrorMessage(vErr, 'No se pudo cargar la venta.'));
      return;
    }
    if (!vRow) {
      setError('Venta no encontrada.');
      return;
    }
    const v = vRow as unknown as VentaCtx;
    setVenta(v);
    if (v.fecha_entrega) setFecha(v.fecha_entrega);

    const { data: fRows } = await sb
      .schema('dilesa')
      .from('venta_fases')
      .select('posicion')
      .eq('venta_id', ventaId)
      .is('deleted_at', null);
    setPosiciones((fRows ?? []).map((f) => f.posicion as number));
  }, [sb, ventaId]);

  useEffect(() => {
    if (!ventaId) return;
    let activo = true;
    (async () => {
      setLoading(true);
      setError(null);
      await cargar();
      if (activo) setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, [ventaId, cargar]);

  const fase12Cerrada = posiciones?.includes(12) ?? false;
  const fase13Cerrada = posiciones?.includes(13) ?? false;
  const preEntregaRegistrada = !!venta?.fecha_pre_entrega;
  const checklistListo = docsFase.faltantes.length === 0;
  const yaRegistrada = !!venta?.fecha_entrega;

  const onRegistrar = useCallback(async () => {
    if (!venta) return;
    if (!checklistListo) {
      toast.add({
        title: 'Falta el checklist firmado por el cliente',
        description:
          'Imprime el checklist de entrega, recórrelo con el cliente, recaba firmas y sube el escaneado.',
        type: 'error',
      });
      return;
    }
    if (!fecha || fecha > hoyLocal()) {
      toast.add({
        title: 'Fecha inválida',
        description: 'La fecha de la entrega no puede quedar en el futuro.',
        type: 'error',
      });
      return;
    }
    setSubmitting(true);
    const result = await registrarEventoEntrega(sb, {
      ventaId: venta.id,
      tipo: 'entrega',
      fecha,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.add({
        title: 'No se pudo registrar la entrega',
        description: result.error ?? 'Error desconocido.',
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Entrega registrada',
      description: fase13Cerrada
        ? 'La operación ya está facturada: la venta pasa a Entregada y se programa la encuesta.'
        : 'Quedó registrada. La fase avanzará a Entregada al facturar.',
      type: 'success',
    });
    await cargar();
  }, [venta, checklistListo, fecha, sb, toast, fase13Cerrada, cargar]);

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
        <CapturarFaseHeader faseposicion={15} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={15}
        descripcion="Entrega física al cliente: checklist impreso, recorrido, firmas y fecha real. La fase avanza sola al facturar."
      />

      {yaRegistrada ? (
        <Banner
          tone="success"
          title="Entrega registrada ✓"
          body={
            <>
              Registrada el <strong>{venta.fecha_entrega}</strong>. El checklist firmado está en el
              expediente.{' '}
              {fase13Cerrada
                ? 'La operación está facturada: la venta ya figura como Entregada.'
                : 'La venta pasará a Entregada en cuanto se facture (la factura es el candado).'}
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
      ) : !fase12Cerrada ? (
        <Banner
          tone="warning"
          title="Falta el pago (Fase 12 — Detonada)"
          body="No se puede entregar la vivienda sin haber recibido el pago. Cobranza lo registra cuando entra el depósito de la institución; al detonarse el crédito (Fase 12) la entrega se desbloquea."
          extra={
            <Link
              href={`/dilesa/ventas/${venta.id}`}
              className="mt-3 inline-block text-sm font-medium text-[var(--accent)] underline"
            >
              Volver al detalle
            </Link>
          }
        />
      ) : !preEntregaRegistrada ? (
        <Banner
          tone="warning"
          title="Falta registrar la pre-entrega"
          body="Antes de entregar al cliente, Calidad y Entrega debe registrar la revisión de pre-entrega (Fase 14). Regístrala primero."
          extra={
            <Link
              href={`/dilesa/ventas/${venta.id}/capturar/14-preparada-entrega`}
              className="mt-3 inline-block text-sm font-medium text-[var(--accent)] underline"
            >
              Ir a registrar la pre-entrega
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <Banner
            tone="info"
            title="Registrar la entrega no avanza la fase"
            body="Sube el checklist firmado por el cliente y registra la fecha real de la entrega. La vivienda pasará a «Entregada» sola cuando la operación esté facturada (la factura es el candado; la entrega puede ir por delante)."
          />

          <Section title="1 · Imprimir el checklist de entrega">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/api/dilesa/ventas/${venta.id}/pdf/checklist-entrega-cliente`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)]/85 hover:bg-[var(--bg)]/40"
              >
                <Printer className="h-4 w-4" />
                Checklist de Entrega (PDF prellenado)
              </a>
              <Hint>
                Sale con los datos de la vivienda y del cliente. Se recorre la casa con el cliente
                palomeando SÍ/NO; firman el cliente y Atención a Clientes.
              </Hint>
            </div>
          </Section>

          <DocsFaseSection
            state={docsFase}
            titulo="2 · Subir el checklist firmado por el cliente"
          />

          <Section title="3 · Registrar la entrega">
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-sm">
                <span className="mb-1 block text-[var(--text)]/70">Fecha de la entrega</span>
                <input
                  type="date"
                  value={fecha}
                  max={hoyLocal()}
                  onChange={(e) => setFecha(e.target.value)}
                  className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />
              </label>
              <Button type="button" onClick={onRegistrar} disabled={submitting || !checklistListo}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 size-4" /> Registrar entrega
                  </>
                )}
              </Button>
            </div>
            <Hint>
              La fecha puede ser anterior a hoy (se respeta la fecha real de la entrega).
              Registrarla no avanza la fase: eso ocurre al facturar.
            </Hint>
          </Section>

          <div className="flex items-center justify-end gap-3">
            <Link
              href={`/dilesa/ventas/${venta.id}`}
              className="text-sm text-muted-foreground hover:text-[var(--text)]"
            >
              Volver al detalle
            </Link>
          </div>
        </div>
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

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] text-[var(--text)]/50">{children}</p>;
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
      : tone === 'warning'
        ? 'border-amber-400/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
        : 'border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--text)]/90';
  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 text-sm">{body}</div>
      {extra}
    </div>
  );
}

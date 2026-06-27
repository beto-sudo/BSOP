'use client';

/**
 * Captura Fase 14 — Preparada para Entrega (dilesa-ventas).
 *
 * Modelo evento-vs-fase (ADR-052): la revisión de pre-entrega es un EVENTO con
 * fecha real, NO un avance de fase. Calidad / Atención a Clientes imprime el
 * Checklist Pre-Entrega (PDF prellenado), recorre la casa palomeando, firma,
 * escanea, sube el PDF y registra la fecha real de la revisión. Eso NO mueve la
 * fase: la venta pasa a "Preparada para Entrega" (14) sola, vía el motor de DB
 * `fn_avanzar_post_factura`, en cuanto la operación esté FACTURADA (13). Si la
 * pre-entrega se registró antes de facturar, el salto ocurre al facturar.
 *
 * La pre-entrega puede ADELANTARSE desde la Escritura (fase 11). El candado duro
 * es la factura (13): sin ella la venta no avanza, aunque ya haya pre-entrega.
 *
 * Acceso: `dilesa.ventas.fase14_preparada_entrega` (Atención a Clientes / Obra /
 * Dirección — escritura).
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
  { rol: 'checklist_pre_entrega', label: 'Checklist de pre-entrega firmado', requerido: true },
];

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  fecha_pre_entrega: string | null;
  fase_posicion: number | null;
};

/** Fecha de hoy en formato YYYY-MM-DD en la zona local del navegador. */
function hoyLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function CapturarFase14Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase14_preparada_entrega" write>
      <CapturarFase14Body />
    </RequireAccess>
  );
}

function CapturarFase14Body() {
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
      .select('id, persona_id, unidad_id, fecha_pre_entrega, fase_posicion')
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
    if (v.fecha_pre_entrega) setFecha(v.fecha_pre_entrega);

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

  const fase11Cerrada = posiciones?.includes(11) ?? false;
  const fase13Cerrada = posiciones?.includes(13) ?? false;
  const checklistListo = docsFase.faltantes.length === 0;
  const yaRegistrada = !!venta?.fecha_pre_entrega;

  const onRegistrar = useCallback(async () => {
    if (!venta) return;
    if (!checklistListo) {
      toast.add({
        title: 'Falta el checklist de pre-entrega',
        description: 'Sube el checklist firmado antes de registrar la pre-entrega.',
        type: 'error',
      });
      return;
    }
    if (!fecha || fecha > hoyLocal()) {
      toast.add({
        title: 'Fecha inválida',
        description: 'La fecha de la pre-entrega no puede quedar en el futuro.',
        type: 'error',
      });
      return;
    }
    setSubmitting(true);
    const result = await registrarEventoEntrega(sb, {
      ventaId: venta.id,
      tipo: 'pre_entrega',
      fecha,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.add({
        title: 'No se pudo registrar la pre-entrega',
        description: result.error ?? 'Error desconocido.',
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Pre-entrega registrada',
      description: fase13Cerrada
        ? 'La operación ya está facturada: la venta pasa a Preparada para Entrega.'
        : 'Quedó registrada. La fase avanzará a Preparada para Entrega al facturar.',
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
        <CapturarFaseHeader faseposicion={14} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={14}
        descripcion="Calidad y Entrega revisa la vivienda con el checklist y registra la fecha de la pre-entrega. La fase avanza sola al facturar."
      />

      {yaRegistrada ? (
        <Banner
          tone="success"
          title="Pre-entrega registrada ✓"
          body={
            <>
              Registrada el <strong>{venta.fecha_pre_entrega}</strong>. El checklist está en el
              expediente.{' '}
              {fase13Cerrada
                ? 'La operación está facturada: la venta ya figura como Preparada para Entrega.'
                : 'La venta pasará a Preparada para Entrega en cuanto se facture (la factura es el candado).'}
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
      ) : !fase11Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 11 (Escriturada)"
          body="La pre-entrega puede adelantarse desde que se registra la escritura, pero esa fase aún no está cerrada. Captura la Fase 11 primero."
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
        <div className="space-y-6">
          <Banner
            tone="info"
            title="Registrar la pre-entrega no avanza la fase"
            body="Sube el checklist firmado y registra la fecha real de la revisión. La vivienda pasará a «Preparada para Entrega» sola cuando la operación esté facturada (la factura es el candado; la pre-entrega puede ir por delante)."
          />

          <Section title="1 · Imprimir el checklist">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/api/dilesa/ventas/${venta.id}/pdf/checklist-entrega`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)]/85 hover:bg-[var(--bg)]/40"
              >
                <Printer className="h-4 w-4" />
                Checklist Pre-Entrega (PDF prellenado)
              </a>
              <Hint>
                Sale con los datos de la vivienda y del cliente. Se palomea y firma en papel durante
                el recorrido.
              </Hint>
            </div>
          </Section>

          <DocsFaseSection state={docsFase} titulo="2 · Subir el checklist firmado" />

          <Section title="3 · Registrar la pre-entrega">
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-sm">
                <span className="mb-1 block text-[var(--text)]/70">Fecha de la pre-entrega</span>
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
                    <Save className="mr-2 size-4" /> Registrar pre-entrega
                  </>
                )}
              </Button>
            </div>
            <Hint>
              La fecha puede ser anterior a hoy (se respeta la fecha real del recorrido).
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

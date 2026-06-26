'use client';

/**
 * Captura Fase 14 — Preparada para Entrega (dilesa-ventas).
 *
 * Calidad / Atención a Clientes imprime el Checklist Pre-Entrega (PDF
 * prellenado con vivienda + cliente), recorre la casa palomeando en papel,
 * firma, escanea y sube el PDF firmado. SUBIR el checklist es la única acción
 * de esta pantalla: queda en el expediente al instante.
 *
 * El AVANCE de fase es automático (2026-06-26, Beto): subir el checklist NO
 * mueve la fase. La vivienda pasa a "Preparada para Entrega" (14) sola, vía el
 * trigger `dilesa.fn_auto_preparada_entrega`, cuando coinciden:
 *   (a) el pago entró — Detonada (fase 12 cerrada), y
 *   (b) el checklist está cargado.
 * Así el checklist puede ADELANTARSE desde la Escritura (fase 11). La
 * facturación (13) ya NO es prerrequisito de la entrega: puede ir por detrás
 * (la regla previa la exigía y bloqueaba viviendas pagadas, #1048 → relajado).
 * Lo que nunca se brinca es el pago — habilitar la acción ≠ estar en la fase.
 *
 * Acceso: `dilesa.ventas.fase14_preparada_entrega` (Atención a Clientes / Obra /
 * Dirección — escritura).
 */

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Skeleton } from '@/components/ui/skeleton';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
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
};

export default function CapturarFase14Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase14_preparada_entrega" write>
      <CapturarFase14Body />
    </RequireAccess>
  );
}

function CapturarFase14Body() {
  const params = useParams<{ id: string }>();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [posiciones, setPosiciones] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const docsFase = useDocsFaseColaborativos(ventaId, SLOTS_FASE);

  const cargarPosiciones = useCallback(async () => {
    const { data: fRows } = await sb
      .schema('dilesa')
      .from('venta_fases')
      .select('posicion')
      .eq('venta_id', ventaId)
      .is('deleted_at', null);
    setPosiciones((fRows ?? []).map((f) => f.posicion as number));
  }, [sb, ventaId]);

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
        .select('id, persona_id, unidad_id')
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
      setVenta(vRow as unknown as VentaCtx);
      await cargarPosiciones();
      if (!activo) return;
      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb, cargarPosiciones]);

  const fase11Cerrada = posiciones?.includes(11) ?? false;
  const fase12Cerrada = posiciones?.includes(12) ?? false;
  const yaCerrada = posiciones?.includes(14) ?? false;
  const checklistListo = docsFase.faltantes.length === 0;

  // "Preparada" = la fase 14 ya está cerrada, O las dos condiciones del
  // auto-cierre coinciden ya (checklist cargado + pago detonado): el trigger en
  // DB la cierra en el mismo INSERT del checklist, así que mostrarlo derivado
  // evita re-consultar. Al volver al detalle, el provider confirma el estado real.
  const preparada = yaCerrada || (checklistListo && fase12Cerrada);

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
        descripcion="Calidad y Entrega revisa la vivienda con el checklist impreso y sube el escaneado firmado. La fase avanza sola al facturar."
      />

      {preparada ? (
        <Banner
          tone="success"
          title="Preparada para Entrega ✓"
          body="La vivienda ya quedó preparada y el checklist está en el expediente. La siguiente fase es Entregada."
        />
      ) : !fase11Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 11 (Escriturada)"
          body="La preparación de entrega puede adelantarse desde que se registra la escritura, pero esa fase aún no está cerrada. Captura la Fase 11 primero."
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
            title={fase12Cerrada ? 'El pago ya entró (Detonada)' : 'Puedes adelantar el checklist'}
            body={
              fase12Cerrada
                ? 'Sube el checklist firmado y la vivienda quedará Preparada para Entrega automáticamente. La facturación puede ir por detrás, no bloquea la entrega.'
                : 'Aún no entra el pago (Fase 12 — Detonada). Subir el checklist NO avanza la fase: la vivienda pasará a Preparada para Entrega sola en cuanto se detone el pago. La entrega nunca ocurre antes del pago.'
            }
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

          <p className="text-[11px] text-[var(--text)]/50">
            Subirlo lo archiva en el expediente de la operación. El paso a «Preparada para Entrega»
            es automático: ocurre cuando la operación está facturada y el checklist cargado.
          </p>

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

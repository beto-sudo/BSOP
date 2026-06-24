'use client';

/**
 * Captura Fase 15 — Entregada (dilesa-ventas-expediente S5).
 *
 * La entrega física de la vivienda al cliente: se imprime el Checklist para
 * Entrega de Vivienda (PDF prellenado), se recorre la casa con el cliente
 * palomeando SÍ/NO, firman el CLIENTE y Atención a Clientes, se escanea y se
 * sube el PDF firmado. Subirlo cierra la fase.
 *
 * Gate: Fase 14 (Preparada para Entrega) debe estar cerrada.
 *
 * Captura:
 *   - Doc requerido: rol `checklist_entrega` (checklist firmado por cliente).
 *     Coincide con `FASE_ROLES[15]` en el detalle.
 *   - Notas opcionales → `venta_fases.notas`.
 *
 * Acceso: `dilesa.ventas.fase15_entregada` (escritura: Vendedor + Dirección;
 * lectura: Gerencia Ventas — pre-sembrado en core.modulos).
 */

import { useParams, useRouter } from 'next/navigation';
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
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';
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
};

export default function CapturarFase15Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase15_entregada" write>
      <CapturarFase15Body />
    </RequireAccess>
  );
}

function CapturarFase15Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase14Cerrada, setFase14Cerrada] = useState<boolean | null>(null);
  // F12 (Detonada) = el pago recibido. No se entrega sin pago.
  const [fase12Cerrada, setFase12Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const docsFase = useDocsFaseColaborativos(ventaId, SLOTS_FASE);
  const [notas, setNotas] = useState<string>('');

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
      const v = vRow as unknown as VentaCtx;
      setVenta(v);

      const { data: fRows } = await sb
        .schema('dilesa')
        .from('venta_fases')
        .select('posicion')
        .eq('venta_id', v.id)
        .is('deleted_at', null);
      if (!activo) return;

      const posiciones = (fRows ?? []).map((f) => f.posicion as number);
      setFase14Cerrada(posiciones.includes(14));
      setFase12Cerrada(posiciones.includes(12));
      setYaCerrada(posiciones.includes(15));

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
          title: 'Falta el checklist firmado por el cliente',
          description:
            'Imprime el checklist de entrega, recorre la vivienda con el cliente, recaba firmas y sube el escaneado.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 15,
        docs: [], // el documento ya vive en el expediente (subida incremental)
        camposVenta: {},
        notas: notas.trim() || null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 15',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 15 cerrada',
        description: 'Vivienda entregada al cliente. El checklist firmado quedó en el expediente.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [docsFase.faltantes, notas, router, sb, toast, venta]
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
        descripcion="Entrega física al cliente: checklist impreso, recorrido, firmas y escaneado."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 15 ya está cerrada"
          body="Esta vivienda ya fue entregada al cliente. La siguiente fase es Conformidad del Cliente."
        />
      ) : !fase14Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 14 (Preparada para Entrega)"
          body={
            <>
              Antes de entregar al cliente, Calidad y Entrega debe dejar la vivienda preparada
              (checklist pre-entrega). Vuelve al detalle y captura la Fase 14 primero.
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
          body={
            <>
              No se puede entregar la vivienda sin haber recibido el pago. El pago lo registra
              Cobranza cuando entra el depósito de la institución; al detonarse el crédito (Fase 12)
              la entrega se desbloquea sola.
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

          <p className="text-[11px] text-[var(--text)]/50">
            Subirlo cierra la fase y lo archiva en el expediente de la operación.
          </p>

          <Section title="Notas (opcional)">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Acuerdos de entrega, pendientes menores, etc."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
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

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] text-[var(--text)]/50">{children}</p>;
}

/** Mismo slot estandarizado de las fases 2/3/5/9/14 (check + botón + drag-drop). */
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

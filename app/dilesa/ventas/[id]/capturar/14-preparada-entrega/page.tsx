'use client';

/**
 * Captura Fase 14 — Preparada para Entrega (dilesa-ventas-expediente S5).
 *
 * El equipo de Calidad y Entrega revisa la vivienda con el Checklist
 * Pre-Entrega: lo imprime desde aquí (PDF prellenado con vivienda + cliente),
 * recorre la casa palomeando en papel, firma, escanea y sube el PDF firmado.
 * Subirlo cierra la fase.
 *
 * Gate especial (Beto, 2026-06-10): la preparación puede hacerse desde que se
 * registra la escritura (Fase 11) — NO espera Detonada (12) ni Facturada (13).
 *
 * Captura:
 *   - Doc requerido: rol `checklist_pre_entrega` (checklist firmado).
 *     Coincide con `FASE_ROLES['Preparada para Entrega']` en el detalle.
 *   - Notas opcionales → `venta_fases.notas`.
 *
 * Acceso: `dilesa.ventas.fase14_preparada_entrega` (escritura: Obra +
 * Dirección; lectura: Gerencia Ventas — pre-sembrado en core.modulos).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Printer, Save, Upload, XCircle } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';

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
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [clienteNombre, setClienteNombre] = useState<string>('');
  const [identificacionInv, setIdentificacionInv] = useState<string | null>(null);
  const [fase11Cerrada, setFase11Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [archivo, setArchivo] = useState<File | null>(null);
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
      setFase11Cerrada(posiciones.includes(11));
      setYaCerrada(posiciones.includes(14));

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
      if (!archivo) {
        toast.add({
          title: 'Falta el checklist firmado',
          description:
            'Imprime el checklist, realiza la revisión de la vivienda, fírmalo y sube el escaneado.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseNombre: 'Preparada para Entrega',
        faseposicion: 14,
        docs: [{ rol: 'checklist_pre_entrega', archivo }],
        camposVenta: {},
        notas: notas.trim() || null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 14',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 14 cerrada',
        description: 'Vivienda preparada para entrega. El checklist quedó en el expediente.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [archivo, notas, router, sb, toast, venta]
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
          faseposicion={14}
          faseNombre="Preparada para Entrega"
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
        faseposicion={14}
        faseNombre="Preparada para Entrega"
        descripcion="Calidad y Entrega revisa la vivienda con el checklist impreso y sube el escaneado firmado."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 14 ya está cerrada"
          body="Esta vivienda ya quedó preparada para entrega. La siguiente fase es Entregada."
        />
      ) : !fase11Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 11 (Escriturada)"
          body={
            <>
              La preparación de entrega puede hacerse desde que se registra la escritura — sin
              esperar Detonada ni Facturada. Vuelve al detalle y captura la Fase 11 primero.
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

          <Section title="2 · Subir el checklist firmado">
            <FileSlot
              label="Checklist Pre-Entrega firmado (escaneado) *"
              archivo={archivo}
              onChange={setArchivo}
            />
            <Hint>Subirlo cierra la fase y lo archiva en el expediente de la operación.</Hint>
          </Section>

          <Section title="Notas (opcional)">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Daños menores pendientes, acuerdos con obra, etc."
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

/** Mismo slot estandarizado de las fases 2/3/5/9 (check + botón + drag-drop). */
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

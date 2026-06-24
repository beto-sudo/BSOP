'use client';

/**
 * Captura Fase 10 — Programar firmas.
 *
 * Gerencia Ventas (o Dirección) programa la fecha + hora de firma ya acordada
 * con el notario (que viene de Fase 7) y genera la Póliza de Garantía.
 *
 * ADR-048: el **crédito directo (pagaré) ya NO se captura aquí** — se define en
 * la dictaminación (fase 8), con el saldo REAL del Anexo B. Si la venta tiene
 * crédito directo, aquí solo se sube el **pagaré firmado** que se recaba en la
 * firma (rol `pagare`, el mismo que reconoce la fase Escriturar y
 * `rolesOpcionales`).
 *
 * Tasas / cobertura / plan de pagos: viven en la fase 8.
 *
 * Enforcement: Fase 9 (Validación Patronal) cerrada.
 * Acceso: `dilesa.ventas.fase10_firmas_programadas`.
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Download, Loader2, Lock, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { useEffectiveUser } from '@/components/providers';
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
import { getNotaria } from '@/lib/dilesa/notarios';

const SLOTS_FASE: SlotColaborativo[] = [
  {
    rol: 'pagare',
    label: 'Pagaré firmado (súbelo cuando lo tengas)',
    requerido: false,
  },
];

type VentaCtx = {
  id: string;
  empresa_id: string;
  notario_id: string | null;
  fecha_firma_programada: string | null;
  hora_firma_programada: string | null;
  poliza_garantia_expedida_at: string | null;
  // Definido en la fase 8 (ADR-048). Aquí solo decide si se pide el pagaré firmado.
  monto_credito_directo: number | null;
};

const MESES_LARGO = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
// Formatea un date 'YYYY-MM-DD' a "15 de junio de 2026" sin recorrerlo por TZ.
const fechaFirmaLarga = (iso: string | null): string | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES_LARGO[m - 1] ?? ''} de ${y}`;
};

export default function CapturarFase10Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase10_firmas_programadas" write>
      <CapturarFase10Body />
    </RequireAccess>
  );
}

function CapturarFase10Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const { data: me } = useEffectiveUser();
  const ventaId = params.id;
  const docsFase = useDocsFaseColaborativos(ventaId, SLOTS_FASE);

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [notarioNombre, setNotarioNombre] = useState<string | null>(null);
  const [fase9Cerrada, setFase9Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [fechaFirma, setFechaFirma] = useState<string>('');
  const [horaFirma, setHoraFirma] = useState<string>('');
  // Auto-guardado de la fecha/hora de firma (sin cerrar la fase): persiste al
  // capturar para encender la Póliza de Garantía con esa fecha. El candado se
  // activa al expedir la póliza o cerrar la fase (solo Dirección reprograma).
  const [savingFirma, setSavingFirma] = useState(false);
  const [firmaGuardada, setFirmaGuardada] = useState(false);
  const [polizaImpresaLocal, setPolizaImpresaLocal] = useState(false);

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
          'id, empresa_id, notario_id, fecha_firma_programada, hora_firma_programada, poliza_garantia_expedida_at, monto_credito_directo'
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
      if (v.fecha_firma_programada) setFechaFirma(v.fecha_firma_programada);
      if (v.hora_firma_programada) setHoraFirma(v.hora_firma_programada.slice(0, 5));

      const [fRes, nRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', v.id)
          .is('deleted_at', null),
        // Notaría desde el catálogo de proveedores (categoria='notaria').
        v.notario_id ? getNotaria(sb, v.notario_id) : Promise.resolve(null),
      ]);
      if (!activo) return;

      if (nRes) {
        setNotarioNombre(
          nRes.numeroNotaria ? `Notaría ${nRes.numeroNotaria} — ${nRes.nombre}` : nRes.nombre
        );
      }
      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase9Cerrada(posiciones.includes(9));
      setYaCerrada(posiciones.includes(10));

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  // ── Candado de la fecha de firma ─────────────────────────────────
  // Dirección/Admin (espejo de erp.fn_es_direccion) puede reprogramar aun
  // congelada; los demás roles la editan solo antes de expedir/cerrar.
  const esDireccion =
    !!me?.isAdmin || (venta != null && (me?.direccionEmpresaIds ?? []).includes(venta.empresa_id));
  const polizaExpedida = venta?.poliza_garantia_expedida_at != null || polizaImpresaLocal;
  const firmaCongelada = polizaExpedida || yaCerrada;
  const fechaBloqueada = firmaCongelada && !esDireccion;
  const tieneFechaPersistida = !!venta?.fecha_firma_programada;
  const tieneCreditoDirecto = venta?.monto_credito_directo != null;

  // Persiste fecha/hora de firma sin cerrar la fase. Enciende la póliza con esa
  // fecha. Si el trigger la rechaza (congelada + rol no Dirección), avisa.
  const persistFirma = useCallback(
    async (fecha: string, hora: string): Promise<boolean> => {
      if (!venta) return false;
      setSavingFirma(true);
      setFirmaGuardada(false);
      const { error: upErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .update({
          fecha_firma_programada: fecha || null,
          hora_firma_programada: hora || null,
        })
        .eq('id', venta.id);
      setSavingFirma(false);
      if (upErr) {
        toast.add({
          title: 'No se pudo guardar la fecha de firma',
          description: getSupabaseErrorMessage(upErr, 'Error desconocido.'),
          type: 'error',
        });
        return false;
      }
      setVenta((v) =>
        v ? { ...v, fecha_firma_programada: fecha || null, hora_firma_programada: hora || null } : v
      );
      setFirmaGuardada(true);
      return true;
    },
    [sb, venta, toast]
  );

  // Auto-guardado (debounced) al capturar la fecha/hora — solo si la fecha no
  // está bloqueada y realmente cambió respecto a lo persistido.
  useEffect(() => {
    if (!venta || fechaBloqueada || !fechaFirma) return;
    const persistedFecha = venta.fecha_firma_programada ?? '';
    const persistedHora = (venta.hora_firma_programada ?? '').slice(0, 5);
    if (fechaFirma === persistedFecha && horaFirma === persistedHora) return;
    const t = setTimeout(() => {
      void persistFirma(fechaFirma, horaFirma);
    }, 600);
    return () => clearTimeout(t);
  }, [fechaFirma, horaFirma, venta, fechaBloqueada, persistFirma]);

  // ── Submit (cerrar fase) ─────────────────────────────────────────
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      if (!fechaFirma) {
        toast.add({
          title: 'Falta la fecha de firma',
          description: 'Captura la fecha acordada con el notario.',
          type: 'error',
        });
        return;
      }
      if (!horaFirma) {
        toast.add({
          title: 'Falta la hora de firma',
          description: 'Captura la hora acordada con el notario.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 10,
        docs: [], // el pagaré (si se subió) ya vive en el expediente
        // Si la fecha está bloqueada (póliza ya expedida y no eres Dirección)
        // ya quedó persistida por el auto-guardado: no la reenviamos para no
        // disparar el trigger de lock durante el cierre de la fase.
        camposVenta: fechaBloqueada
          ? {}
          : {
              fecha_firma_programada: fechaFirma,
              hora_firma_programada: horaFirma,
            },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 10',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 10 cerrada',
        description: 'Firma programada. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [fechaBloqueada, fechaFirma, horaFirma, router, sb, toast, venta]
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
        <CapturarFaseHeader faseposicion={10} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  const fechaFirmaLabel = fechaFirmaLarga(venta.fecha_firma_programada);

  // Botón de la Póliza — solo activo con fecha persistida (el route la rechaza
  // sin ella). Al abrirlo marcamos "impresa" localmente para reflejar el lock
  // sin esperar el refetch del sello.
  const polizaButton = tieneFechaPersistida ? (
    <a
      href={`/api/dilesa/ventas/${venta.id}/pdf/poliza-garantia`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => setPolizaImpresaLocal(true)}
      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
    >
      <Download className="h-3.5 w-3.5" />
      Póliza de Garantía
    </a>
  ) : (
    <p className="mt-2 text-[11px] text-[var(--text)]/50">
      Captura la fecha de firma para generar la póliza con esa fecha.
    </p>
  );

  const firmaSaveIndicator = savingFirma ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text)]/50">
      <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
    </span>
  ) : firmaGuardada ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
      <Check className="h-3 w-3" /> Fecha guardada
    </span>
  ) : null;

  // Sección del pagaré firmado (solo si la fase 8 definió un crédito directo).
  const pagareSection = tieneCreditoDirecto ? (
    <Section title="Pagaré firmado">
      <p className="mb-3 text-xs text-[var(--text)]/60">
        El crédito directo se definió en la dictaminación (fase 8). Imprime el pagaré desde ahí,
        recábalo firmado en la firma y súbelo aquí.
      </p>
      <DocsFaseSection state={docsFase} titulo="Pagaré firmado" />
    </Section>
  ) : null;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={10}
        descripcion="Programa la fecha y hora de firma acordada con el notario y genera la Póliza de Garantía."
      />

      {yaCerrada ? (
        <div className="space-y-6">
          <Banner
            tone="success"
            title="Fase 10 ya está cerrada"
            body={
              fechaFirmaLabel
                ? `Firma programada para el ${fechaFirmaLabel}. La siguiente fase es Escriturar.`
                : 'Esta venta ya tiene la firma programada. La siguiente fase es Escriturar.'
            }
          />

          <Section title="Documento para el notario">
            <p className="text-sm text-[var(--text)]/70">
              La <span className="font-medium">Póliza de Garantía</span> sale con la fecha de la
              firma. Vuelve a generarla cuando la necesites — saldrá con la misma fecha.
            </p>
            {polizaButton}
          </Section>

          {pagareSection}

          {esDireccion ? (
            <Section title="Reprogramar firma (Dirección)">
              <p className="mb-3 flex items-center gap-1.5 text-xs text-[var(--text)]/60">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                La fecha está bloqueada porque la fase ya cerró. Como Dirección puedes
                reprogramarla; la póliza saldrá con la nueva fecha.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Fecha de firma">
                  <Input
                    type="date"
                    value={fechaFirma}
                    onChange={(e) => setFechaFirma(e.target.value)}
                  />
                </Field>
                <Field label="Hora de firma">
                  <Input
                    type="time"
                    value={horaFirma}
                    onChange={(e) => setHoraFirma(e.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-2 min-h-[1rem]">{firmaSaveIndicator}</div>
            </Section>
          ) : null}
        </div>
      ) : fase9Cerrada === false ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 9 (Validación Patronal)"
          body={
            <>
              Antes de programar la firma, la venta debe tener su Validación Patronal. Vuelve al
              detalle y captura la Fase 9 primero.
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
          {notarioNombre ? (
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-4 py-2 text-xs text-[var(--text)]/70">
              <span className="font-medium text-[var(--text)]/80">Notario asignado:</span>{' '}
              {notarioNombre}
            </div>
          ) : (
            <div className="rounded-md border border-amber-400/40 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              Esta venta no tiene notario asignado (Fase 7). Programa la firma de todos modos, pero
              revisa la asignación del notario.
            </div>
          )}

          <Section title="Datos de la firma">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fecha de firma *">
                <Input
                  type="date"
                  value={fechaFirma}
                  onChange={(e) => setFechaFirma(e.target.value)}
                  readOnly={fechaBloqueada}
                  disabled={fechaBloqueada}
                  required
                />
              </Field>
              <Field label="Hora de firma *">
                <Input
                  type="time"
                  value={horaFirma}
                  onChange={(e) => setHoraFirma(e.target.value)}
                  readOnly={fechaBloqueada}
                  disabled={fechaBloqueada}
                  required
                />
              </Field>
            </div>
            <div className="mt-2 min-h-[1rem]">
              {fechaBloqueada ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text)]/50">
                  <Lock className="h-3 w-3 shrink-0" /> La firma ya se expidió o la fase se cerró.
                  Solo Dirección puede reprogramarla.
                </span>
              ) : (
                firmaSaveIndicator
              )}
            </div>
          </Section>

          <Section title="Documento para el notario">
            <p className="text-sm text-[var(--text)]/70">
              La <span className="font-medium">Póliza de Garantía</span> se genera como PDF para
              llevarla al expediente del notario, con la fecha de la firma como fecha del documento.
            </p>
            {tieneFechaPersistida && !firmaCongelada ? (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                Al generarla se fija esa fecha (la reimpresión saldrá igual). Después solo Dirección
                puede reprogramarla.
              </p>
            ) : null}
            {polizaButton}
          </Section>

          {pagareSection}

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

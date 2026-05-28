'use client';

/**
 * Captura Fase 2 — Asignada.
 *
 * Cierra la fase de Asignación: el líder del hold subió todos los
 * documentos firmados del expediente, y Dirección (o el rol autorizador
 * configurado, ej. Nelcy) revisa que esté todo en regla y autoriza la
 * asignación. La venta pasa a `fase_actual='Asignada'` / `fase_posicion=2`.
 *
 * Acceso: gate por `dilesa.ventas.autorizar` (RBAC nuevo, ver migración
 * 20260528191807). Solo Dirección + el rol de Nelcy lo tienen.
 *
 * Requisitos para autorizar:
 *  - La venta debe estar en `fase_posicion=1` (Solicitud).
 *  - Debe ser **líder de la cola** (posición=1 en `v_unidad_hold_queue`).
 *  - Los 3 adjuntos requeridos deben estar cargados:
 *      `aviso_privacidad`, `ficu`, `expediente_digital`.
 *
 * Sin campos nuevos en `dilesa.ventas` — el KYC se capturó en Fase 1.
 */

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, Upload, XCircle } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { marcarFase, type DocCaptura } from '@/lib/dilesa/captura/marcar-fase';

const ROLES_REQUERIDOS = ['aviso_privacidad', 'ficu', 'expediente_digital'] as const;
type RolRequerido = (typeof ROLES_REQUERIDOS)[number];

const ROL_LABEL: Record<RolRequerido, string> = {
  aviso_privacidad: 'Aviso de privacidad firmado',
  ficu: 'FICU firmado',
  expediente_digital: 'Expediente digital (paquete KYC)',
};

type VentaCtx = {
  id: string;
  unidad_id: string | null;
  fase_posicion: number | null;
  estado: string;
};

export default function CapturarFase2Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.autorizar">
      <CapturarFase2Body />
    </RequireAccess>
  );
}

function CapturarFase2Body() {
  const params = useParams<{ id: string }>();
  const ventaId = params.id;
  const toast = useToast();

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [esLider, setEsLider] = useState<boolean | null>(null);
  const [adjuntosCargados, setAdjuntosCargados] = useState<Set<string>>(new Set());
  const [archivos, setArchivos] = useState<Partial<Record<RolRequerido, File>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    const { data: v, error: vErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .select('id, unidad_id, fase_posicion, estado')
      .eq('id', ventaId)
      .maybeSingle();
    if (vErr || !v) {
      setError(getSupabaseErrorMessage(vErr, 'Venta no encontrada.'));
      setLoading(false);
      return;
    }
    setVenta(v as unknown as VentaCtx);

    // Verificar líder de cola
    if (v.unidad_id) {
      const { data: cola } = await sb
        .schema('dilesa')
        .from('v_unidad_hold_queue')
        .select('venta_id, posicion')
        .eq('unidad_id', v.unidad_id);
      const lider = ((cola ?? []) as Array<{ venta_id: string; posicion: number }>).find(
        (c) => c.posicion === 1
      );
      setEsLider(lider?.venta_id === ventaId);
    } else {
      setEsLider(false);
    }

    // Adjuntos cargados
    const { data: adj } = await sb
      .schema('erp')
      .from('adjuntos')
      .select('rol')
      .eq('entidad_tipo', 'ventas')
      .eq('entidad_id', ventaId);
    const set = new Set<string>(((adj ?? []) as Array<{ rol: string }>).map((a) => a.rol));
    setAdjuntosCargados(set);

    setLoading(false);
  }, [ventaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const todosCompletos = ROLES_REQUERIDOS.every((r) => adjuntosCargados.has(r) || archivos[r]);
  const puedeAutorizar =
    !!venta &&
    venta.estado === 'activa' &&
    venta.fase_posicion === 1 &&
    esLider === true &&
    todosCompletos &&
    !submitting;

  async function onAutorizar() {
    if (!puedeAutorizar || !venta) return;
    setSubmitting(true);
    try {
      const sb = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      const docs: DocCaptura[] = (Object.entries(archivos) as Array<[RolRequerido, File]>)
        .filter(([, f]) => !!f)
        .map(([rol, archivo]) => ({ rol, archivo }));
      const res = await marcarFase(sb, {
        ventaId,
        faseNombre: 'Asignada',
        faseposicion: 2,
        docs,
        camposVenta: {
          fase_actual: 'Asignada',
          fase_posicion: 2,
        },
        notas: null,
        registradoPor: user?.id ?? null,
      });
      if (!res.ok) throw new Error(res.error ?? 'No se pudo autorizar.');
      toast.add({
        title: 'Asignación autorizada',
        description: 'La venta pasó a Fase 2.',
        type: 'success',
      });
      // Recargar para reflejar estado nuevo
      cargar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.add({ title: 'Error al autorizar', description: msg, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error || !venta) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Link
          href={`/dilesa/ventas/${ventaId}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al detalle
        </Link>
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error ?? 'Venta no encontrada.'}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link
        href={`/dilesa/ventas/${ventaId}`}
        className="inline-flex items-center gap-1 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al detalle
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
          Autorizar asignación
        </h1>
        <p className="mt-1 text-sm text-[var(--text)]/60">
          Fase 2 — revisar expediente completo y autorizar la asignación de la unidad.
        </p>
      </header>

      {/* Bloqueo: ya está en Fase ≥ 2 */}
      {venta.fase_posicion !== 1 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Esta venta ya está en Fase {venta.fase_posicion}. La autorización solo aplica a ventas en
          Fase 1 (Solicitud).
        </div>
      ) : null}

      {/* Bloqueo: no es líder de la cola */}
      {venta.fase_posicion === 1 && esLider === false ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Esta solicitud no es líder de la fila para su unidad. Solo el líder puede ser autorizado.
        </div>
      ) : null}

      {/* Lista de docs requeridos */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[var(--text)]/50">
          Expediente requerido
        </h2>
        <div className="space-y-3">
          {ROLES_REQUERIDOS.map((rol) => {
            const cargado = adjuntosCargados.has(rol);
            const fileSeleccionado = archivos[rol];
            return (
              <div
                key={rol}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3"
              >
                <div className="flex items-center gap-2 text-sm">
                  {cargado || fileSeleccionado ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-[var(--text)]/35" />
                  )}
                  <span className="font-medium">{ROL_LABEL[rol]}</span>
                  {cargado ? (
                    <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                      Ya cargado
                    </span>
                  ) : null}
                </div>
                {!cargado ? (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]">
                    <Upload className="h-3.5 w-3.5" />
                    {fileSeleccionado ? 'Cambiar' : 'Subir PDF'}
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setArchivos((prev) => ({ ...prev, [rol]: f ?? undefined }));
                      }}
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end pt-2">
        <Button onClick={onAutorizar} disabled={!puedeAutorizar}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Autorizando…
            </>
          ) : (
            'Autorizar asignación'
          )}
        </Button>
      </div>
    </div>
  );
}

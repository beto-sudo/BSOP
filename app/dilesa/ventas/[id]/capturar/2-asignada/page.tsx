'use client';

/**
 * Captura Fase 2 — Asignar unidad.
 *
 * Cierra la fase de Asignación: el líder del hold subió todos los
 * documentos firmados del expediente, y Dirección (o el rol autorizador
 * configurado, ej. Nelcy) revisa que esté todo en regla y autoriza la
 * asignación. La venta pasa a `fase_actual='Asignar unidad'` / `fase_posicion=2`.
 *
 * Acceso: gate por `dilesa.ventas.autorizar` (RBAC nuevo, ver migración
 * 20260528191807). Solo Dirección + el rol de Nelcy lo tienen.
 *
 * Requisitos para autorizar:
 *  - La venta debe estar en `fase_posicion=1` (Solicitud).
 *  - Debe ser **líder de la cola** (posición=1 en `v_unidad_hold_queue`).
 *    Las ventas históricas de Coda no participan en la cola (D4): son
 *    autorizables mientras la fila de su unidad esté vacía — ver
 *    `lib/dilesa/hold-lider.ts`.
 *  - Los 3 adjuntos requeridos deben estar cargados:
 *      `aviso_privacidad`, `ficu`, `expediente_digital`.
 *
 * Sin campos nuevos en `dilesa.ventas` — el KYC se capturó en Fase 1.
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Upload, XCircle } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { marcarFase, type DocCaptura } from '@/lib/dilesa/captura/marcar-fase';
import { esLiderDeCola, type ColaHoldRow } from '@/lib/dilesa/hold-lider';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';

const ROLES_REQUERIDOS = [
  'solicitud_asignacion',
  'aviso_privacidad',
  'ficu',
  'expediente_digital',
] as const;
type RolRequerido = (typeof ROLES_REQUERIDOS)[number];

const ROL_LABEL: Record<RolRequerido, string> = {
  solicitud_asignacion: 'Solicitud de asignación firmada por cliente',
  aviso_privacidad: 'Aviso de privacidad firmado',
  ficu: 'FICU firmado',
  expediente_digital: 'Expediente digital (paquete KYC)',
};

type VentaCtx = {
  id: string;
  empresa_id: string;
  persona_id: string;
  unidad_id: string | null;
  fase_posicion: number | null;
  estado: string;
  enganche_requerido: number | null;
  coda_row_id: string | null;
};

type ReciboEnganche = {
  id: string;
  fecha: string | null;
  monto: number;
  forma_pago: string | null;
  referencia: string | null;
  notas: string | null;
};

type AdjuntoCargado = {
  id: string;
  rol: string;
  nombre: string;
  url: string;
  tipo_mime: string | null;
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
  const router = useRouter();
  const ventaId = params.id;
  const toast = useToast();

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [esLider, setEsLider] = useState<boolean | null>(null);
  const [adjuntosCargados, setAdjuntosCargados] = useState<Map<string, AdjuntoCargado>>(new Map());
  const [archivos, setArchivos] = useState<Partial<Record<RolRequerido, File>>>({});
  /** Rol cuya zona está siendo hovered con un drag activo (para resaltar). */
  const [dragOverRol, setDragOverRol] = useState<RolRequerido | null>(null);
  const [recibos, setRecibos] = useState<ReciboEnganche[]>([]);
  const [totalEnganchePagado, setTotalEnganchePagado] = useState<number>(0);
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
      .select(
        'id, empresa_id, persona_id, unidad_id, fase_posicion, estado, enganche_requerido, coda_row_id'
      )
      .eq('id', ventaId)
      .maybeSingle();
    if (vErr || !v) {
      setError(getSupabaseErrorMessage(vErr, 'Venta no encontrada.'));
      setLoading(false);
      return;
    }
    setVenta(v as unknown as VentaCtx);

    // Verificar líder de cola. Las históricas de Coda no entran a la fila
    // (D4) — autorizables si nadie en BSOP tiene el hold de la unidad.
    if (v.unidad_id) {
      const { data: cola } = await sb
        .schema('dilesa')
        .from('v_unidad_hold_queue')
        .select('venta_id, posicion')
        .eq('unidad_id', v.unidad_id);
      setEsLider(esLiderDeCola((cola ?? []) as ColaHoldRow[], ventaId, !!v.coda_row_id));
    } else {
      setEsLider(false);
    }

    // Adjuntos cargados — incluimos url + nombre para hacer la card
    // clickeable y abrir el doc. Si hay >1 adjunto por rol, se queda el
    // más reciente por created_at DESC (primero en el array, gracias al
    // .order). Eso es lo que el autorizador típicamente quiere ver.
    const { data: adj } = await sb
      .schema('erp')
      .from('adjuntos')
      .select('id, rol, nombre, url, tipo_mime, created_at')
      .eq('entidad_tipo', 'ventas')
      .eq('entidad_id', ventaId)
      .order('created_at', { ascending: false });
    const map = new Map<string, AdjuntoCargado>();
    for (const a of (adj ?? []) as Array<AdjuntoCargado & { created_at: string }>) {
      if (!map.has(a.rol)) {
        map.set(a.rol, {
          id: a.id,
          rol: a.rol,
          nombre: a.nombre,
          url: a.url,
          tipo_mime: a.tipo_mime,
        });
      }
    }
    setAdjuntosCargados(map);

    // Recibos del enganche — la asignación requiere ver que el cliente
    // ya pagó el enganche. Leemos dilesa.venta_pagos con tipo='enganche'
    // (o variantes legacy de Coda) para que el autorizador vea el monto
    // pagado vs el requerido antes de aprobar.
    const { data: pagosRows } = await sb
      .schema('dilesa')
      .from('venta_pagos')
      .select('id, fecha, monto, tipo, notas')
      .eq('venta_id', ventaId)
      .is('deleted_at', null)
      .order('fecha', { ascending: true });
    const recibosEnganche = (
      (pagosRows ?? []) as Array<{
        id: string;
        fecha: string | null;
        monto: number;
        tipo: string | null;
        notas: string | null;
      }>
    )
      .filter((p) => (p.tipo ?? '').toLowerCase().includes('enganche'))
      .map((p) => ({
        id: p.id,
        fecha: p.fecha,
        monto: Number(p.monto) || 0,
        forma_pago: null as string | null,
        referencia: null as string | null,
        notas: p.notas,
      }));
    setRecibos(recibosEnganche);
    setTotalEnganchePagado(recibosEnganche.reduce((acc, r) => acc + r.monto, 0));

    setLoading(false);
  }, [ventaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const todosCompletos = ROLES_REQUERIDOS.every((r) => adjuntosCargados.has(r) || archivos[r]);
  // Bool tri-state: true=cubre, false=no cubre, null=no se sabe (loading).
  // Se usa para el banner de alerta — el botón NO se gatea por este valor
  // (decisión Beto: queda a criterio de Dirección/Nelcy).
  const engancheCubierto: boolean | null = !venta
    ? null
    : (() => {
        const req = Number(venta.enganche_requerido ?? 0);
        return req > 0 ? totalEnganchePagado >= req : totalEnganchePagado > 0;
      })();
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
        faseposicion: 2,
        docs,
        camposVenta: {
          fase_actual: 'Asignar unidad',
          fase_posicion: 2,
        },
        notas: null,
        registradoPor: user?.id ?? null,
      });
      if (!res.ok) throw new Error(res.error ?? 'No se pudo autorizar.');
      toast.add({
        title: 'Asignación autorizada',
        description: 'La venta pasó a Fase 2. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      // Llevar a la ficha completa de la venta — ahí está el pipeline,
      // los adjuntos y el botón de captura de la siguiente fase. Si nos
      // quedáramos aquí, el banner "ya está en Fase 2" tapaba el flujo.
      router.push(`/dilesa/ventas/${ventaId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.add({ title: 'Error al autorizar', description: msg, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error || !venta) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <CapturarFaseHeader faseposicion={2} />
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error ?? 'Venta no encontrada.'}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      {/* Header compartido: monta la cabecera del expediente (cliente con
          CURP/INE, vivienda, comercial y mini-cuadratura) — el contexto que
          el autorizador necesita para revisar antes de asignar. */}
      <CapturarFaseHeader
        faseposicion={2}
        descripcion="Revisa el expediente completo y los datos de la operación, y autoriza la asignación de la unidad."
      />

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
            const cargado = adjuntosCargados.get(rol);
            const fileSeleccionado = archivos[rol];
            const completo = !!cargado || !!fileSeleccionado;
            const href = cargado ? getAdjuntoProxyUrl(cargado.url) : null;
            const isDragOver = dragOverRol === rol;
            return (
              <div
                key={rol}
                onDragOver={(e) => {
                  // preventDefault es obligatorio para que `drop` se dispare;
                  // sin esto el browser intenta navegar al archivo y nada
                  // llega al handler. dataTransfer.dropEffect le da al usuario
                  // el cursor "copy" estándar.
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  if (dragOverRol !== rol) setDragOverRol(rol);
                }}
                onDragLeave={(e) => {
                  // Solo limpiar si el drag salió DEL contenedor — los hijos
                  // disparan leave/enter también y harían parpadear el ring.
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    return;
                  }
                  setDragOverRol((current) => (current === rol ? null : current));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverRol(null);
                  const f = e.dataTransfer.files?.[0];
                  if (!f) return;
                  // Mismo filtro que el `accept` del input: PDF o imágenes.
                  if (
                    !(
                      f.type === 'application/pdf' ||
                      f.type.startsWith('image/') ||
                      f.name.toLowerCase().endsWith('.pdf')
                    )
                  ) {
                    return;
                  }
                  setArchivos((prev) => ({ ...prev, [rol]: f }));
                }}
                className={`flex items-center justify-between gap-3 rounded-lg border bg-[var(--card)] px-4 py-3 transition-colors ${
                  isDragOver
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/40'
                    : 'border-[var(--border)]'
                }`}
              >
                {/* Lado izquierdo: clickeable cuando hay adjunto cargado */}
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center gap-2 text-sm hover:text-[var(--accent)]"
                    title={cargado?.nombre ?? 'Ver documento'}
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="font-medium">{ROL_LABEL[rol]}</span>
                    <span className="ml-1 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      Ver documento <ExternalLink className="h-3 w-3" />
                    </span>
                  </a>
                ) : (
                  <div className="flex flex-1 items-center gap-2 text-sm">
                    {completo ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-[var(--text)]/35" />
                    )}
                    <span className="font-medium">{ROL_LABEL[rol]}</span>
                    {fileSeleccionado ? (
                      <span className="ml-1 truncate text-xs text-[var(--text)]/60">
                        {fileSeleccionado.name}
                      </span>
                    ) : null}
                  </div>
                )}

                {/* Lado derecho: botón Subir / Cambiar / Reemplazar */}
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]">
                  <Upload className="h-3.5 w-3.5" />
                  {cargado ? 'Reemplazar' : fileSeleccionado ? 'Cambiar' : 'Subir PDF'}
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
              </div>
            );
          })}
        </div>
      </section>

      {/* Recibos del enganche — referencia para autorizar */}
      <RecibosEngancheSection
        recibos={recibos}
        totalPagado={totalEnganchePagado}
        engancheRequerido={venta.enganche_requerido}
      />

      {/* Alerta prominente si el enganche no está cubierto. NO bloquea el
          botón — Beto: "que quede a criterio de quien asigna (Nelcy o
          Dirección) pero sí marcar una alerta de que no tiene enganche". */}
      {engancheCubierto === false ? (
        <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            ⚠️ Esta venta no tiene el enganche pagado completo
          </p>
          <p className="mt-1 text-sm text-amber-900/85 dark:text-amber-100/85">
            Normalmente la asignación requiere el enganche cubierto. Puedes autorizar de todos modos
            si es una excepción aprobada (promoción, descuento, asignación sin enganche por decisión
            de Dirección). La autorización queda registrada con tu usuario.
          </p>
        </div>
      ) : null}

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

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function RecibosEngancheSection({
  recibos,
  totalPagado,
  engancheRequerido,
}: {
  recibos: ReciboEnganche[];
  totalPagado: number;
  engancheRequerido: number | null;
}) {
  const requerido = Number(engancheRequerido ?? 0);
  const cubre = requerido > 0 ? totalPagado >= requerido : totalPagado > 0;
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[var(--text)]/50">
        Recibos del enganche
      </h2>
      <p className="mb-3 text-xs text-[var(--text)]/60">
        La asignación requiere que el cliente haya pagado el enganche. Verifica que los recibos
        registrados cubran el monto requerido antes de autorizar.
      </p>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-3 grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-[var(--text)]/50">Enganche requerido</div>
            <div className="mt-0.5 text-sm font-medium">{moneyFmt.format(requerido)}</div>
          </div>
          <div>
            <div className="text-[var(--text)]/50">Pagado</div>
            <div className="mt-0.5 text-sm font-medium">{moneyFmt.format(totalPagado)}</div>
          </div>
          <div>
            <div className="text-[var(--text)]/50">Estado</div>
            <div
              className={`mt-0.5 inline-flex items-center gap-1 text-xs ${
                cubre
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {cubre ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Cubre el enganche
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5" /> Pendiente de cubrir
                </>
              )}
            </div>
          </div>
        </div>
        {recibos.length === 0 ? (
          <p className="text-xs text-[var(--text)]/40">
            Aún no hay recibos de enganche registrados para esta venta.
          </p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {recibos.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between border-t border-[var(--border)] pt-1.5"
              >
                <span className="text-[var(--text)]/70">
                  {r.fecha ?? '—'}
                  {r.notas ? ` · ${r.notas}` : ''}
                </span>
                <span className="font-mono font-medium">{moneyFmt.format(r.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

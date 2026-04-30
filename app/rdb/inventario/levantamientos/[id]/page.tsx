'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de /rdb/inventario/levantamientos.
 */

/**
 * Detalle de un levantamiento físico.
 *
 * La UI cambia según `estado`:
 *   borrador   → ficha + acciones de iniciar/editar
 *   capturando → progreso + continuar/cerrar captura
 *   capturado  → KPIs + líneas fuera de tolerancia + firma (placeholder B3)
 *   aplicado   → firmas + reporte + link a movimientos generados
 *   cancelado  → motivo + sólo lectura
 *
 * NO renderiza <InventarioTabs> — flujo focalizado.
 */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  FileText,
  Info,
  Loader2,
  Pencil,
  Play,
  PlayCircle,
  Printer,
  Save,
  XCircle,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { usePermissions } from '@/components/providers';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { SignatureDialog } from '@/components/ui/signature-dialog';
import { useToast } from '@/components/ui/toast';
import {
  LevantamientoStatusBadge,
  type LevantamientoEstado,
} from '@/components/inventario/levantamiento-status-badge';
import { LevantamientoProgressGauge } from '@/components/inventario/levantamiento-progress-gauge';
import { KpiCard } from '@/components/ui/kpi-card';
import { TolerancePanel, type ToleranciaConfig } from '@/components/inventario/tolerance-panel';
import {
  formatCurrency,
  formatDateShort,
  formatDateTime,
  formatNumber,
} from '@/lib/inventario/format';
import {
  actualizarNotaDiferencia,
  cerrarCaptura,
  firmarPaso,
  getLineasParaCapturar,
  getLineasParaRevisar,
  guardarConteo,
  iniciarCaptura,
} from '../actions';
import type { LineaParaCapturar, LineaParaRevisar } from '../types';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

type LevantamientoFull = {
  id: string;
  empresa_id: string;
  folio: string | null;
  estado: string;
  tipo: string;
  fecha_programada: string;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  fecha_aplicado: string | null;
  fecha_cancelado: string | null;
  contador_id: string | null;
  almacen_id: string;
  notas: string | null;
  motivo_cancelacion: string | null;
  tolerancia_pct_override: number | null;
  tolerancia_monto_override: number | null;
  almacenes: { nombre: string } | null;
};

type FirmaRow = {
  id: string;
  paso: number;
  rol: string;
  firmante_nombre: string;
  firmado_at: string;
  comentario: string | null;
};

/**
 * @module Levantamiento detail (RDB)
 * @responsive mobile-first
 */
export default function LevantamientoDetailPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.inventario">
      <DetailInner />
    </RequireAccess>
  );
}

function DetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const toast = useToast();
  const { permissions } = usePermissions();
  const isAdmin = permissions.isAdmin;

  const [lev, setLev] = useState<LevantamientoFull | null>(null);
  const [tolerancia, setTolerancia] = useState<ToleranciaConfig | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // estado-specific data
  const [capturarLineas, setCapturarLineas] = useState<LineaParaCapturar[] | null>(null);
  const [revisarLineas, setRevisarLineas] = useState<LineaParaRevisar[] | null>(null);
  const [firmas, setFirmas] = useState<FirmaRow[] | null>(null);

  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const [
      { data: levRow, error: levErr },
      {
        data: { user },
      },
      tolRes,
    ] = await Promise.all([
      supabase
        .schema('erp')
        .from('inventario_levantamientos')
        .select(
          `id, empresa_id, folio, estado, tipo, fecha_programada, fecha_inicio, fecha_cierre,
           fecha_aplicado, fecha_cancelado, contador_id, almacen_id, notas, motivo_cancelacion,
           tolerancia_pct_override, tolerancia_monto_override, almacenes(nombre)`
        )
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase.auth.getUser(),
      supabase.schema('erp').rpc('fn_get_empresa_tolerancia', { p_empresa_id: RDB_EMPRESA_ID }),
    ]);

    if (levErr) {
      setError(levErr.message);
      setLoading(false);
      return;
    }
    if (!levRow) {
      setError('Levantamiento no encontrado.');
      setLoading(false);
      return;
    }

    const levantamiento = levRow as unknown as LevantamientoFull;
    setLev(levantamiento);
    setUserId(user?.id ?? null);

    if (!tolRes.error && tolRes.data?.[0]) {
      const tol = tolRes.data[0];
      setTolerancia({
        tolerancia_pct: Number(tol.tolerancia_pct),
        tolerancia_monto: Number(tol.tolerancia_monto),
        firmas_requeridas: Number(tol.firmas_requeridas),
      });
    }

    // Datos por estado
    if (levantamiento.estado === 'capturando') {
      const r = await getLineasParaCapturar(id);
      if (r.ok) setCapturarLineas(r.data);
    } else if (
      levantamiento.estado === 'capturado' ||
      levantamiento.estado === 'aplicado' ||
      levantamiento.estado === 'cancelado'
    ) {
      const r = await getLineasParaRevisar(id);
      if (r.ok) setRevisarLineas(r.data);
    }

    // Firmas: necesarias en `capturado` para saber qué paso falta y en
    // `aplicado` para mostrar la lista final.
    if (levantamiento.estado === 'capturado' || levantamiento.estado === 'aplicado') {
      const fRes = await supabase
        .schema('erp')
        .from('inventario_levantamiento_firmas')
        .select('id, paso, rol, firmante_nombre, firmado_at, comentario')
        .eq('levantamiento_id', id)
        .order('paso', { ascending: true });
      if (!fRes.error) setFirmas((fRes.data ?? []) as FirmaRow[]);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleIniciar = async () => {
    if (!lev) return;
    setWorking(true);
    const res = await iniciarCaptura(lev.id);
    setWorking(false);
    if (!res.ok) {
      toast.add({ title: 'No se pudo iniciar la captura', description: res.error, type: 'error' });
      return;
    }
    toast.add({
      title: 'Captura iniciada',
      description: `${res.data.lineasSembradas} producto${res.data.lineasSembradas === 1 ? '' : 's'} sembrado${res.data.lineasSembradas === 1 ? '' : 's'}.`,
      type: 'success',
    });
    router.push(`/rdb/inventario/levantamientos/${lev.id}/capturar`);
  };

  const handleCerrar = async (forcePendientesACero: boolean) => {
    if (!lev) return;
    setWorking(true);

    // Si quedan pendientes y el usuario eligió forzar 0, primero los marcamos.
    if (forcePendientesACero && capturarLineas) {
      const pendientes = capturarLineas.filter((l) => l.contado_at == null);
      // En serie: evita writes concurrentes contra el RPC y deja el orden auditable.
      for (const p of pendientes) {
        const r = await guardarConteo(lev.id, p.producto_id, 0);
        if (!r.ok) {
          setWorking(false);
          toast.add({
            title: 'Error marcando pendientes en 0',
            description: r.error,
            type: 'error',
          });
          return;
        }
      }
    }

    const res = await cerrarCaptura(lev.id);
    setWorking(false);
    if (!res.ok) {
      toast.add({ title: 'No se pudo cerrar la captura', description: res.error, type: 'error' });
      return;
    }
    toast.add({ title: 'Captura cerrada — pendiente de firma', type: 'success' });
    void load();
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !lev) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Levantamiento no encontrado.'}
        </div>
      </div>
    );
  }

  const esContador = userId != null && lev.contador_id === userId;
  const estado = lev.estado as LevantamientoEstado;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Levantamiento {lev.folio ?? '—'}
            </h1>
            <LevantamientoStatusBadge estado={lev.estado} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {lev.almacenes?.nombre ?? 'Sin almacén'} · Programado{' '}
            {formatDateShort(lev.fecha_programada)}
          </p>
        </div>
      </header>

      <MetadataCard lev={lev} />

      {/* Bloques de acciones según estado */}
      {estado === 'borrador' && (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Acciones
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href={`/rdb/inventario/levantamientos/nuevo?id=${lev.id}`}>
              <Button variant="outline" disabled={working}>
                <Pencil className="size-4" />
                Editar
              </Button>
            </Link>
            <Button onClick={handleIniciar} disabled={working}>
              {working ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlayCircle className="size-4" />
              )}
              Iniciar captura
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Al iniciar la captura, el sistema siembra una línea por producto inventariable activo y
            queda registrado el contador.
          </p>
        </section>
      )}

      {estado === 'capturando' && (
        <CapturandoSection
          lev={lev}
          esContador={esContador}
          working={working}
          lineas={capturarLineas}
          onCerrar={handleCerrar}
        />
      )}

      {estado === 'capturado' && (
        <CapturadoSection
          lev={lev}
          esContador={esContador}
          isAdmin={isAdmin}
          tolerancia={tolerancia}
          lineas={revisarLineas}
          firmas={firmas}
          onLineasChange={setRevisarLineas}
          onFirmaSuccess={(aplicado) => {
            if (aplicado) {
              router.push(`/rdb/inventario/levantamientos/${lev.id}/reporte`);
            } else {
              void load();
            }
          }}
          onError={(msg) =>
            toast.add({ title: 'No se pudo firmar', description: msg, type: 'error' })
          }
          onFirmaToast={(title, description) => toast.add({ title, description, type: 'success' })}
        />
      )}

      {estado === 'aplicado' && (
        <AplicadoSection lev={lev} firmas={firmas} lineas={revisarLineas} />
      )}

      {estado === 'cancelado' && <CanceladoSection lev={lev} />}

      {/* Tolerancia siempre visible (excepto en cancelado) si tenemos config. */}
      {tolerancia && estado !== 'cancelado' && (
        <TolerancePanel
          config={tolerancia}
          overridePct={lev.tolerancia_pct_override}
          overrideMonto={lev.tolerancia_monto_override}
          lineasFueraDeTolerancia={revisarLineas?.filter((l) => l.fuera_de_tolerancia).length ?? 0}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/rdb/inventario/levantamientos"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Volver a levantamientos
    </Link>
  );
}

function MetadataCard({ lev }: { lev: LevantamientoFull }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <Field label="Folio" value={lev.folio ?? '—'} mono />
        <Field label="Almacén" value={lev.almacenes?.nombre ?? '—'} />
        <Field label="Tipo" value={lev.tipo} />
        <Field label="Programado" value={formatDateShort(lev.fecha_programada)} />
        <Field label="Inicio" value={formatDateTime(lev.fecha_inicio)} />
        <Field
          label={
            lev.estado === 'cancelado'
              ? 'Cancelado'
              : lev.estado === 'aplicado'
                ? 'Aplicado'
                : 'Cierre'
          }
          value={formatDateTime(
            lev.fecha_cancelado ?? lev.fecha_aplicado ?? lev.fecha_cierre ?? null
          )}
        />
      </dl>
      {lev.notas && (
        <div className="mt-4 border-t pt-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Notas</div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{lev.notas}</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={mono ? 'mt-0.5 font-medium tabular-nums' : 'mt-0.5 font-medium'}>{value}</dd>
    </div>
  );
}

// ─── Estado: capturando ────────────────────────────────────────────────────────

function CapturandoSection({
  lev,
  esContador,
  working,
  lineas,
  onCerrar,
}: {
  lev: LevantamientoFull;
  esContador: boolean;
  working: boolean;
  lineas: LineaParaCapturar[] | null;
  onCerrar: (forcePendientesACero: boolean) => void;
}) {
  const total = lineas?.length ?? 0;
  const contadas = lineas?.filter((l) => l.contado_at != null).length ?? 0;
  const completo = total > 0 && contadas === total;
  const tienePendientes = total > 0 && contadas < total;

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Captura en proceso
      </h2>

      <div className="mt-4 flex flex-wrap items-center gap-6">
        <LevantamientoProgressGauge contadas={contadas} totales={total} size={128} />
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-semibold tabular-nums">
            {contadas} / {total}{' '}
            <span className="text-base font-medium text-muted-foreground">productos contados</span>
          </div>
          {lineas == null ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <Loader2 className="mr-1 inline size-3 animate-spin" /> Cargando líneas…
            </p>
          ) : tienePendientes ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {total - contadas} producto{total - contadas === 1 ? '' : 's'} pendiente
              {total - contadas === 1 ? '' : 's'} de capturar.
            </p>
          ) : (
            <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="mr-1 inline size-3.5" /> Todos los productos están contados.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {esContador ? (
          <Link href={`/rdb/inventario/levantamientos/${lev.id}/capturar`}>
            <Button>
              <Play className="size-4" />
              Continuar capturando
            </Button>
          </Link>
        ) : (
          <Button disabled title="Solo el contador asignado puede continuar la captura.">
            <Play className="size-4" />
            Continuar capturando
          </Button>
        )}

        {completo ? (
          <Button variant="outline" onClick={() => onCerrar(false)} disabled={working}>
            {working ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Cerrar captura
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" disabled={total === 0 || working}>
                  <CheckCircle2 className="size-4" />
                  Cerrar captura
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cerrar con productos pendientes</AlertDialogTitle>
                <AlertDialogDescription>
                  Quedan {total - contadas} producto{total - contadas === 1 ? '' : 's'} sin contar.
                  Si cierras ahora, se marcarán como <strong>cantidad contada = 0</strong> y
                  generarán diferencia contra el sistema. Esta acción es reversible solo cancelando
                  el levantamiento.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Volver</AlertDialogCancel>
                <AlertDialogAction onClick={() => onCerrar(true)} disabled={working}>
                  Marcar pendientes en 0 y cerrar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </section>
  );
}

// ─── Estado: capturado ────────────────────────────────────────────────────────

function CapturadoSection({
  lev,
  esContador,
  isAdmin,
  tolerancia,
  lineas,
  firmas,
  onLineasChange,
  onFirmaSuccess,
  onError,
  onFirmaToast,
}: {
  lev: LevantamientoFull;
  esContador: boolean;
  isAdmin: boolean;
  tolerancia: ToleranciaConfig | null;
  lineas: LineaParaRevisar[] | null;
  firmas: FirmaRow[] | null;
  onLineasChange: (next: LineaParaRevisar[]) => void;
  onFirmaSuccess: (aplicado: boolean) => void;
  onError: (msg: string) => void;
  onFirmaToast: (title: string, description?: string) => void;
}) {
  const kpis = useMemo(() => {
    const all = lineas ?? [];
    const conDiff = all.filter((l) => (l.diferencia ?? 0) !== 0);
    const fuera = all.filter((l) => l.fuera_de_tolerancia);
    const ajusteNeto = all.reduce((s, l) => s + (Number(l.diferencia_valor) || 0), 0);
    return {
      total: all.length,
      conDiff: conDiff.length,
      fuera: fuera.length,
      ajusteNeto,
    };
  }, [lineas]);

  const fuera = useMemo(() => (lineas ?? []).filter((l) => l.fuera_de_tolerancia), [lineas]);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          icon={<ClipboardList className="size-3.5" />}
          label="Productos contados"
          value={formatNumber(kpis.total)}
        />
        <KpiCard
          icon={<Calculator className="size-3.5" />}
          label="Líneas con diferencia"
          value={formatNumber(kpis.conDiff)}
          tone={kpis.conDiff > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          icon={<AlertTriangle className="size-3.5" />}
          label="Fuera de tolerancia"
          value={formatNumber(kpis.fuera)}
          tone={kpis.fuera > 0 ? 'destructive' : 'default'}
        />
        <KpiCard
          icon={<Calculator className="size-3.5" />}
          label="Ajuste neto"
          value={formatCurrency(kpis.ajusteNeto)}
          tone={kpis.ajusteNeto < 0 ? 'destructive' : kpis.ajusteNeto > 0 ? 'success' : 'default'}
        />
      </section>

      {fuera.length > 0 && (
        <FueraDeToleranciaList
          lineas={fuera}
          esContador={esContador}
          tolerancia={tolerancia}
          onLineaUpdated={(updated) => {
            if (!lineas) return;
            onLineasChange(lineas.map((l) => (l.linea_id === updated.linea_id ? updated : l)));
          }}
        />
      )}

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Acciones
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={`/rdb/inventario/levantamientos/${lev.id}/diferencias`}>
            <Button variant="outline">
              <FileText className="size-4" />
              Ver diferencias detalladas
            </Button>
          </Link>
          <FirmarSection
            lev={lev}
            esContador={esContador}
            isAdmin={isAdmin}
            tolerancia={tolerancia}
            lineas={lineas}
            firmas={firmas}
            kpis={kpis}
            onSuccess={onFirmaSuccess}
            onError={onError}
            onToast={onFirmaToast}
          />
        </div>

        {firmas && firmas.length > 0 && (
          <FirmasParcialesList firmas={firmas} firmasRequeridas={tolerancia?.firmas_requeridas} />
        )}
      </section>
    </>
  );
}

// ─── Firma electrónica (B3) ──────────────────────────────────────────────────

const PASO_ROL_3_FIRMAS = ['contador', 'revisor', 'autorizador'] as const;
const PASO_ROL_2_FIRMAS = ['contador', 'autorizador'] as const;
const PASO_ROL_1_FIRMA = ['contador'] as const;

const ROL_LABEL: Record<string, 'Contador' | 'Revisor' | 'Autorizador'> = {
  contador: 'Contador',
  revisor: 'Revisor',
  autorizador: 'Autorizador',
};

/**
 * Mapea (paso, firmas_requeridas) → rol, replicando la convención de la
 * función SQL `fn_firmar_levantamiento` y del config por empresa.
 */
function rolForPaso(paso: number, firmasRequeridas: number): string | null {
  let arr: readonly string[];
  if (firmasRequeridas <= 1) arr = PASO_ROL_1_FIRMA;
  else if (firmasRequeridas === 2) arr = PASO_ROL_2_FIRMAS;
  else arr = PASO_ROL_3_FIRMAS;
  return arr[paso - 1] ?? null;
}

function FirmarSection({
  lev,
  esContador,
  isAdmin,
  tolerancia,
  lineas,
  firmas,
  kpis,
  onSuccess,
  onError,
  onToast,
}: {
  lev: LevantamientoFull;
  esContador: boolean;
  isAdmin: boolean;
  tolerancia: ToleranciaConfig | null;
  lineas: LineaParaRevisar[] | null;
  firmas: FirmaRow[] | null;
  kpis: { total: number; conDiff: number; fuera: number; ajusteNeto: number };
  onSuccess: (aplicado: boolean) => void;
  onError: (msg: string) => void;
  onToast: (title: string, description?: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const firmasRequeridas = tolerancia?.firmas_requeridas ?? 3;
  const firmasActuales = firmas?.length ?? 0;
  const pasoActual = firmasActuales + 1;
  const rolActual = rolForPaso(pasoActual, firmasRequeridas);
  const completas = firmasActuales >= firmasRequeridas;

  // Pre-condición: toda línea fuera de tolerancia debe tener nota.
  const fueraSinNota = useMemo(() => {
    if (!lineas) return 0;
    return lineas.filter(
      (l) =>
        l.fuera_de_tolerancia && (l.notas_diferencia == null || l.notas_diferencia.trim() === '')
    ).length;
  }, [lineas]);

  // Permisos del paso actual.
  const puedeFirmarPasoActual = useMemo(() => {
    if (rolActual == null) return false;
    if (isAdmin) return true;
    if (rolActual === 'contador') return esContador;
    // revisor/autorizador: cualquier miembro de la empresa con acceso al módulo.
    // RequireAccess ya gateó el módulo, así que basta con tener sesión.
    return true;
  }, [rolActual, esContador, isAdmin]);

  // Mensaje de tooltip / disabled.
  const disabledReason = useMemo(() => {
    if (completas) return 'Levantamiento ya tiene todas las firmas requeridas.';
    if (fueraSinNota > 0) {
      return `Hay ${fueraSinNota} línea${fueraSinNota === 1 ? '' : 's'} fuera de tolerancia sin justificación — captura las notas antes de firmar.`;
    }
    if (!puedeFirmarPasoActual && rolActual === 'contador') {
      return 'Solo el contador asignado puede firmar el paso 1.';
    }
    return null;
  }, [completas, fueraSinNota, puedeFirmarPasoActual, rolActual]);

  const disabled = disabledReason != null;

  if (completas || rolActual == null) {
    // Si llegamos al máximo de firmas en estado=capturado, está pendiente la
    // próxima carga: no mostramos botón.
    return null;
  }

  const roleLabel = ROL_LABEL[rolActual];
  const requireConfirmText =
    pasoActual === 1 ? 'He contado físicamente cada producto declarado.' : null;

  async function handleSign(comment: string) {
    const res = await firmarPaso({
      levantamiento_id: lev.id,
      paso: pasoActual,
      rol: rolActual!,
      comentario: comment || undefined,
    });
    if (!res.ok) {
      // Errores de la RPC los propagamos al dialog (inline) y al toast.
      onError(res.error);
      return { error: res.error };
    }

    if (res.data.aplicado) {
      onToast(
        'Levantamiento aplicado',
        `${res.data.movimientos_generados} movimiento${res.data.movimientos_generados === 1 ? '' : 's'} de ajuste generado${res.data.movimientos_generados === 1 ? '' : 's'}.`
      );
    } else {
      const faltan = res.data.firmas_requeridas - res.data.firmas_actuales;
      onToast(
        'Firma registrada',
        `Faltan ${faltan} firma${faltan === 1 ? '' : 's'} para aplicar el levantamiento.`
      );
    }
    onSuccess(res.data.aplicado);
    return {
      aplicado: res.data.aplicado,
      firmasActuales: res.data.firmas_actuales,
      firmasRequeridas: res.data.firmas_requeridas,
      movimientosGenerados: res.data.movimientos_generados,
    };
  }

  // El total de "diferencia" que mostramos en el dialog es el ajuste neto.
  const summary = {
    totalLineas: kpis.total,
    totalDiferencia: kpis.ajusteNeto,
    totalLineasFuera: kpis.fuera,
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabledReason ?? `Firmar como ${roleLabel}`}
        data-testid="firmar-button"
      >
        <FileSignature className="size-4" />
        Firmar como {roleLabel}
      </Button>
      {disabled && disabledReason && (
        <p className="basis-full text-xs text-amber-700 dark:text-amber-400">{disabledReason}</p>
      )}
      <SignatureDialog
        open={open}
        onClose={() => setOpen(false)}
        step={pasoActual}
        totalSteps={firmasRequeridas}
        roleLabel={roleLabel}
        summary={summary}
        requireConfirmText={requireConfirmText}
        onSign={handleSign}
      />
    </>
  );
}

function FirmasParcialesList({
  firmas,
  firmasRequeridas,
}: {
  firmas: FirmaRow[];
  firmasRequeridas: number | undefined;
}) {
  if (firmas.length === 0) return null;
  return (
    <div className="mt-4 border-t pt-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        Firmas registradas ({firmas.length}
        {firmasRequeridas ? ` / ${firmasRequeridas}` : ''})
      </div>
      <ul className="mt-2 space-y-1.5">
        {firmas.map((f) => (
          <li
            key={f.id}
            className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
          >
            <div>
              <Badge variant="outline" className="mr-2 capitalize">
                {f.rol}
              </Badge>
              <span className="font-medium">{f.firmante_nombre}</span>
              {f.comentario && <span className="ml-1 text-muted-foreground">— {f.comentario}</span>}
            </div>
            <span className="tabular-nums text-muted-foreground">
              Paso {f.paso} · {formatDateTime(f.firmado_at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FueraDeToleranciaList({
  lineas,
  esContador,
  tolerancia,
  onLineaUpdated,
}: {
  lineas: LineaParaRevisar[];
  esContador: boolean;
  tolerancia: ToleranciaConfig | null;
  onLineaUpdated: (l: LineaParaRevisar) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-700 dark:text-amber-400" />
          <h2 className="text-sm font-medium uppercase tracking-wider text-amber-800 dark:text-amber-300">
            Fuera de tolerancia ({lineas.length})
          </h2>
        </div>
        {tolerancia && (
          <span className="text-xs text-muted-foreground">
            Tolerancia: {tolerancia.tolerancia_pct.toFixed(2)}% /{' '}
            {formatCurrency(tolerancia.tolerancia_monto)}
          </span>
        )}
      </button>
      {expanded && (
        <ul className="mt-4 space-y-3">
          {lineas.map((l) => (
            <FueraLineaRow
              key={l.linea_id}
              linea={l}
              esContador={esContador}
              onUpdated={onLineaUpdated}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FueraLineaRow({
  linea,
  esContador,
  onUpdated,
}: {
  linea: LineaParaRevisar;
  esContador: boolean;
  onUpdated: (l: LineaParaRevisar) => void;
}) {
  const toast = useToast();
  const [nota, setNota] = useState(linea.notas_diferencia ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = nota !== (linea.notas_diferencia ?? '');

  const guardar = async () => {
    setSaving(true);
    const res = await actualizarNotaDiferencia(linea.linea_id, nota);
    setSaving(false);
    if (!res.ok) {
      toast.add({ title: 'No se pudo guardar la nota', description: res.error, type: 'error' });
      return;
    }
    toast.add({ title: 'Nota guardada', type: 'success' });
    onUpdated({ ...linea, notas_diferencia: nota.trim() || null });
  };

  return (
    <li className="rounded-md bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{linea.producto_nombre}</div>
          <div className="text-xs text-muted-foreground">
            {linea.producto_codigo}
            {linea.categoria ? ` · ${linea.categoria}` : ''}
          </div>
        </div>
        <div className="text-right text-sm tabular-nums">
          <div>
            <span className="text-muted-foreground">Sistema:</span>{' '}
            {formatNumber(linea.stock_efectivo)} {linea.unidad}
          </div>
          <div>
            <span className="text-muted-foreground">Contado:</span>{' '}
            {formatNumber(linea.cantidad_contada)} {linea.unidad}
          </div>
          <div className="font-semibold text-destructive">
            Δ {formatNumber(linea.diferencia)} {linea.unidad} (
            {formatCurrency(linea.diferencia_valor)})
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={
            esContador
              ? 'Justificación: dónde estaba el producto, motivo de la diferencia, etc.'
              : 'Solo el contador puede editar esta nota.'
          }
          rows={2}
          disabled={!esContador || saving}
          className="text-sm"
        />
        {esContador && (
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline" onClick={guardar} disabled={!dirty || saving}>
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Guardar nota
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

// ─── Estado: aplicado ─────────────────────────────────────────────────────────

function AplicadoSection({
  lev,
  firmas,
  lineas,
}: {
  lev: LevantamientoFull;
  firmas: FirmaRow[] | null;
  lineas: LineaParaRevisar[] | null;
}) {
  const movimientos = lineas?.filter((l) => (l.diferencia ?? 0) !== 0).length ?? 0;

  return (
    <>
      <section className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-700 dark:text-emerald-400" />
          <h2 className="text-sm font-medium uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
            Aplicado
          </h2>
        </div>
        <p className="mt-2 text-sm">
          Aplicado el <strong>{formatDateTime(lev.fecha_aplicado)}</strong>. Se generaron{' '}
          <strong>{formatNumber(movimientos)}</strong> movimiento
          {movimientos === 1 ? '' : 's'} de ajuste contra el inventario.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Firmas recibidas ({firmas?.length ?? 0})
        </h2>
        {firmas == null ? (
          <Skeleton className="mt-3 h-16 w-full rounded-md" />
        ) : firmas.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Sin firmas registradas. (Levantamientos antiguos pre-flujo de firma).
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {firmas.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"
              >
                <div>
                  <Badge variant="outline" className="mr-2 capitalize">
                    {f.rol}
                  </Badge>
                  <span className="font-medium">{f.firmante_nombre}</span>
                  {f.comentario && (
                    <span className="ml-2 text-muted-foreground">— {f.comentario}</span>
                  )}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  Paso {f.paso} · {formatDateTime(f.firmado_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Acciones
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={`/rdb/inventario/levantamientos/${lev.id}/reporte`}>
            <Button variant="outline">
              <Printer className="size-4" />
              Ver reporte
            </Button>
          </Link>
          <Link href={`/rdb/inventario/levantamientos/${lev.id}/diferencias`}>
            <Button variant="outline">
              <FileText className="size-4" />
              Ver diferencias
            </Button>
          </Link>
          <Link href={`/rdb/inventario?ref=lev:${lev.id}`}>
            <Button variant="outline">
              <Calculator className="size-4" />
              Ver ajustes generados
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}

// ─── Estado: cancelado ────────────────────────────────────────────────────────

function CanceladoSection({ lev }: { lev: LevantamientoFull }) {
  return (
    <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-5">
      <div className="flex items-center gap-2">
        <XCircle className="size-4 text-destructive" />
        <h2 className="text-sm font-medium uppercase tracking-wider text-destructive">Cancelado</h2>
      </div>
      <p className="mt-2 text-sm">
        Cancelado el <strong>{formatDateTime(lev.fecha_cancelado)}</strong>.
      </p>
      {lev.motivo_cancelacion && (
        <div className="mt-3 rounded-md border border-destructive/20 bg-card p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Motivo</div>
          <p className="mt-1 whitespace-pre-wrap">{lev.motivo_cancelacion}</p>
        </div>
      )}
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="size-3.5" />
        Este levantamiento no generó movimientos en el inventario.
      </div>
    </section>
  );
}

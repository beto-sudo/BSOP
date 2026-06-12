'use client';

/**
 * Captura Fase 13 — Facturada (captura colaborativa: Sprint 1 de
 * `dilesa-ventas-captura-colaborativa`).
 *
 * El flujo real es de varias personas en momentos distintos (una sube la
 * factura, otra el Aviso PLD, una tercera revisa y cierra), así que:
 *
 *   - Cada documento PERSISTE AL SUBIRSE (storage + `erp.adjuntos` con
 *     `uploaded_by`); el slot muestra quién lo subió y cuándo. "Cambiar"
 *     versiona (conserva la anterior).
 *   - Los montos se guardan sin cerrar la fase ("Guardar montos").
 *   - "Cerrar fase" valida contra el expediente persistido — no contra la
 *     memoria del navegador — y registra la fase vía `marcarFase` (docs: []).
 *   - Valor real venta DILESA NO se captura: se pinta del motor de
 *     cuadratura (`lib/dilesa/cuadratura.ts`, fórmulas Coda) y su snapshot
 *     se persiste al guardar montos / cerrar. Valor facturado y monto NC
 *     siguen capturables (Sprint 2 los automatiza vía XML CFDI) con la
 *     sugerencia de la cuadratura como hint.
 *
 * Enforcement: Fase 12 (Detonada) debe estar cerrada.
 * Acceso: `dilesa.ventas.fase13_facturada` (Contabilidad + Gerencia Ventas +
 * Dirección).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Loader2, Lock, Save, Upload, XCircle } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';
import {
  faltantesParaCerrar,
  fetchDocsFase,
  subirDocFase,
  type DocRolEstado,
  type DocsPorRol,
} from '@/lib/dilesa/captura/docs-fase';
import { useVentaResumen } from '@/lib/dilesa/use-venta-resumen';

const DOCS_FASE13 = [
  { rol: 'factura', label: 'PDF Factura', requerido: true },
  { rol: 'nota_credito', label: 'PDF Nota de Crédito (si aplica)', requerido: false },
  { rol: 'aviso_pld', label: 'PDF Aviso PLD', requerido: true },
] as const;
const ROLES_FASE13 = DOCS_FASE13.map((d) => d.rol as string);
const ROLES_REQUERIDOS = DOCS_FASE13.filter((d) => d.requerido).map((d) => d.rol as string);
const LABEL_POR_ROL = new Map<string, string>(DOCS_FASE13.map((d) => [d.rol as string, d.label]));

type VentaCtx = {
  id: string;
  valor_escrituracion: number | null;
  valor_real_venta_dilesa: number | null;
  valor_facturado: number | null;
  monto_nota_credito: number | null;
};

type Deposito = {
  id: string;
  fecha: string | null;
  monto_total: number | null;
  fuente: string | null;
  forma_pago: string | null;
  referencia: string | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

/** `erp.adjuntos.created_at` viene en UTC — formatear en hora local. */
function fmtMomento(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CapturarFase13Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase13_facturada" write>
      <CapturarFase13Body />
    </RequireAccess>
  );
}

function CapturarFase13Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const resumen = useVentaResumen(ventaId);
  const cuadratura = resumen.status === 'ready' ? resumen.props.cuadratura : null;
  const clienteNombre = resumen.status === 'ready' ? resumen.props.cliente.nombre : null;
  const identificacionInv =
    resumen.status === 'ready' ? (resumen.props.vivienda.identificador ?? null) : null;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [fase12Cerrada, setFase12Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [docs, setDocs] = useState<DocsPorRol | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [subiendoRol, setSubiendoRol] = useState<string | null>(null);

  const [valorEscrituracion, setValorEscrituracion] = useState<string>('');
  const [valorFacturado, setValorFacturado] = useState<string>('');
  const [montoNotaCredito, setMontoNotaCredito] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoMontos, setGuardandoMontos] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const cargarDocs = useCallback(async () => {
    const r = await fetchDocsFase(ventaId, ROLES_FASE13);
    if (r.ok) {
      setDocs(r.docs);
      setDocsError(null);
    } else {
      setDocsError(r.error);
    }
  }, [ventaId]);

  // ── Cargar contexto ──────────────────────────────────────────────
  useEffect(() => {
    if (!ventaId) return;
    let activo = true;

    (async () => {
      setLoading(true);
      setError(null);

      const [vRes, fRes, dRes, userRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('ventas')
          .select(
            'id, valor_escrituracion, valor_real_venta_dilesa, valor_facturado, monto_nota_credito'
          )
          .eq('id', ventaId)
          .is('deleted_at', null)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', ventaId)
          .is('deleted_at', null),
        sb
          .schema('erp')
          .from('cxc_pagos')
          .select('id, fecha, monto_total, fuente, forma_pago, referencia')
          .eq('origen_tipo', 'venta_dilesa')
          .eq('origen_id', ventaId)
          .is('deleted_at', null)
          .order('fecha', { ascending: true }),
        sb.auth.getUser(),
      ]);
      if (!activo) return;

      if (vRes.error) {
        setError(getSupabaseErrorMessage(vRes.error, 'No se pudo cargar la venta.'));
        setLoading(false);
        return;
      }
      if (!vRes.data) {
        setError('Venta no encontrada.');
        setLoading(false);
        return;
      }
      const v = vRes.data as unknown as VentaCtx;
      setVenta(v);
      if (v.valor_escrituracion != null) setValorEscrituracion(String(v.valor_escrituracion));
      if (v.valor_facturado != null) setValorFacturado(String(v.valor_facturado));
      if (v.monto_nota_credito != null) setMontoNotaCredito(String(v.monto_nota_credito));

      setDepositos((dRes.data ?? []) as unknown as Deposito[]);
      const posiciones = ((fRes.data ?? []) as { posicion: number }[]).map((f) => f.posicion);
      setFase12Cerrada(posiciones.includes(12));
      setYaCerrada(posiciones.includes(13));
      setUserId(userRes.data?.user?.id ?? null);

      void cargarDocs();
      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb, cargarDocs]);

  const totalDepositos = useMemo(
    () => depositos.reduce((s, d) => s + Number(d.monto_total ?? 0), 0),
    [depositos]
  );

  // ── Subir documento (persiste al instante) ───────────────────────
  const onPickDoc = useCallback(
    async (rol: string, file: File) => {
      setSubiendoRol(rol);
      try {
        const r = await subirDocFase(sb, { ventaId, rol, archivo: file, userId });
        if (!r.ok) {
          toast.add({
            title: 'No se pudo subir el documento',
            description: r.error,
            type: 'error',
          });
          return;
        }
        toast.add({
          title: `${LABEL_POR_ROL.get(rol) ?? rol} guardado`,
          description: 'El documento quedó en el expediente — no se pierde al salir.',
          type: 'success',
        });
        await cargarDocs();
      } finally {
        setSubiendoRol(null);
      }
    },
    [sb, ventaId, userId, toast, cargarDocs]
  );

  // ── Guardar montos (sin cerrar la fase) ──────────────────────────
  const persistirMontos = useCallback(async (): Promise<boolean> => {
    const vEscr = Number(valorEscrituracion);
    if (!Number.isFinite(vEscr) || vEscr <= 0) {
      toast.add({
        title: 'Valor de escrituración inválido',
        description: 'Captura el valor de escrituración (mayor a cero).',
        type: 'error',
      });
      return false;
    }
    const campos: {
      valor_escrituracion: number;
      valor_facturado: number | null;
      monto_nota_credito: number | null;
      valor_real_venta_dilesa?: number;
    } = {
      valor_escrituracion: vEscr,
      valor_facturado: valorFacturado === '' ? null : Number(valorFacturado),
      monto_nota_credito: montoNotaCredito === '' ? null : Number(montoNotaCredito),
    };
    // Snapshot del derivado (fuente: motor de cuadratura). Solo si el
    // resumen cargó — no pisar un valor previo con null por un error de red.
    if (cuadratura) campos.valor_real_venta_dilesa = cuadratura.valorRealVentaDilesa;

    const { error: e } = await sb.schema('dilesa').from('ventas').update(campos).eq('id', ventaId);
    if (e) {
      toast.add({
        title: 'No se pudieron guardar los montos',
        description: getSupabaseErrorMessage(e, 'Reintenta.'),
        type: 'error',
      });
      return false;
    }
    return true;
  }, [valorEscrituracion, valorFacturado, montoNotaCredito, cuadratura, sb, ventaId, toast]);

  const onGuardarMontos = useCallback(async () => {
    setGuardandoMontos(true);
    try {
      if (await persistirMontos()) {
        toast.add({ title: 'Montos guardados', type: 'success' });
      }
    } finally {
      setGuardandoMontos(false);
    }
  }, [persistirMontos, toast]);

  // ── Cerrar fase (valida contra el expediente persistido) ─────────
  const faltantes = useMemo(
    () => (docs ? faltantesParaCerrar(docs, ROLES_REQUERIDOS) : ROLES_REQUERIDOS),
    [docs]
  );

  const onCerrarFase = useCallback(async () => {
    if (faltantes.length > 0) {
      toast.add({
        title: 'Faltan documentos en el expediente',
        description: `Sube: ${faltantes.map((r) => LABEL_POR_ROL.get(r) ?? r).join(', ')}.`,
        type: 'error',
      });
      return;
    }
    setCerrando(true);
    try {
      if (!(await persistirMontos())) return;

      const result = await marcarFase(sb, {
        ventaId,
        faseNombre: 'Facturada',
        faseposicion: 13,
        docs: [], // los documentos ya viven en el expediente (subida incremental)
        camposVenta: {},
        notas: null,
        registradoPor: userId,
      });
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 13',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 13 cerrada',
        description: 'Facturación registrada. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${ventaId}`);
    } finally {
      setCerrando(false);
    }
  }, [faltantes, persistirMontos, sb, ventaId, userId, toast, router]);

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
          faseposicion={13}
          faseNombre="Facturada"
          resumen={resumen}
        />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  const bloqueadaPorFase12 = fase12Cerrada === false && !yaCerrada;
  const capturaHabilitada = !bloqueadaPorFase12;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        ventaId={ventaId}
        clienteNombre={clienteNombre}
        identificacionInventario={identificacionInv}
        faseposicion={13}
        faseNombre="Facturada"
        descripcion="Sube la factura (y nota de crédito / aviso PLD si aplican) y captura los montos de cuadratura. Cada documento se guarda al subirse."
        resumen={resumen}
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 13 ya está cerrada"
          body="Esta venta ya está facturada. Puedes reemplazar un documento si hubo una corrección — queda versionado."
        />
      ) : bloqueadaPorFase12 ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 12 (Detonada)"
          body={
            <>
              Antes de facturar, la venta debe estar detonada (depósito recibido). Vuelve al detalle
              y captura la Fase 12 primero.
            </>
          }
          extra={
            <Link
              href={`/dilesa/ventas/${ventaId}`}
              className="mt-3 inline-block text-sm font-medium text-[var(--accent)] underline"
            >
              Volver al detalle
            </Link>
          }
        />
      ) : null}

      {capturaHabilitada ? (
        <>
          <Section title="Documentos">
            {docsError ? (
              <p className="mb-2 text-xs text-destructive">
                {docsError}{' '}
                <button type="button" className="underline" onClick={() => void cargarDocs()}>
                  Reintentar
                </button>
              </p>
            ) : null}
            <div className="space-y-2">
              {DOCS_FASE13.map((d) => (
                <DocSlot
                  key={d.rol}
                  label={`${d.label}${d.requerido ? ' *' : ''}`}
                  estado={docs?.[d.rol]}
                  cargando={docs == null && !docsError}
                  subiendo={subiendoRol === d.rol}
                  deshabilitado={subiendoRol != null && subiendoRol !== d.rol}
                  onPick={(f) => void onPickDoc(d.rol, f)}
                />
              ))}
            </div>
          </Section>

          <Section title="Montos">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Valor de escrituración *">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorEscrituracion}
                  onChange={(e) => setValorEscrituracion(e.target.value)}
                  disabled={yaCerrada}
                  required
                />
                <Hint>{money(Number(valorEscrituracion) || 0)}</Hint>
              </Field>
              <Field label="Valor real venta Dilesa (calculado)">
                <div className="flex h-9 items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg)]/40 px-3 text-sm">
                  <span className="font-medium tabular-nums">
                    {cuadratura ? money(cuadratura.valorRealVentaDilesa) : '—'}
                  </span>
                  <Lock className="h-3.5 w-3.5 text-[var(--text)]/35" />
                </div>
                <Hint>Del motor de cuadratura (depósitos − cheque notaría + pagaré).</Hint>
              </Field>
              <Field label="Valor facturado">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorFacturado}
                  onChange={(e) => setValorFacturado(e.target.value)}
                  disabled={yaCerrada}
                />
                <Hint>
                  {valorFacturado === '' ? '—' : money(Number(valorFacturado) || 0)}
                  {cuadratura ? ` · Cuadratura sugiere ${money(cuadratura.valorFacturado)}` : ''}
                </Hint>
              </Field>
              <Field label="Monto nota de crédito">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoNotaCredito}
                  onChange={(e) => setMontoNotaCredito(e.target.value)}
                  disabled={yaCerrada}
                />
                <Hint>
                  {montoNotaCredito === '' ? '—' : money(Number(montoNotaCredito) || 0)}
                  {cuadratura ? ` · Cuadratura sugiere ${money(cuadratura.montoNotaCredito)}` : ''}
                </Hint>
              </Field>
            </div>
          </Section>

          <Section title="Depósitos de la operación (referencia)">
            {depositos.length === 0 ? (
              <p className="text-sm text-[var(--text)]/60">
                No hay depósitos registrados para esta venta.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs text-[var(--text)]/60">
                      <th className="px-3 py-1.5 font-medium">Fecha</th>
                      <th className="px-3 py-1.5 font-medium">Tipo</th>
                      <th className="px-3 py-1.5 font-medium">Forma</th>
                      <th className="px-3 py-1.5 text-right font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositos.map((d) => (
                      <tr key={d.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-1.5">{d.fecha ?? '—'}</td>
                        <td className="px-3 py-1.5 capitalize text-[var(--text)]/70">
                          {d.fuente ?? '—'}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text)]/70">{d.forma_pago ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right font-medium">
                          {money(d.monto_total)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[var(--bg)]/40">
                      <td className="px-3 py-1.5 font-semibold" colSpan={3}>
                        Total depósitos
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {money(totalDepositos)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {!yaCerrada ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {faltantes.length > 0 && docs != null ? (
                <p className="mr-auto text-xs text-[var(--text)]/55">
                  Para cerrar falta: {faltantes.map((r) => LABEL_POR_ROL.get(r) ?? r).join(', ')}.
                </p>
              ) : null}
              <Link
                href={`/dilesa/ventas/${ventaId}`}
                className="text-sm text-muted-foreground hover:text-[var(--text)]"
              >
                Salir
              </Link>
              <Button
                type="button"
                variant="outline"
                onClick={() => void onGuardarMontos()}
                disabled={guardandoMontos || cerrando}
              >
                {guardandoMontos ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
                  </>
                ) : (
                  'Guardar montos'
                )}
              </Button>
              <Button
                type="button"
                onClick={() => void onCerrarFase()}
                disabled={
                  cerrando || guardandoMontos || subiendoRol != null || faltantes.length > 0
                }
              >
                {cerrando ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Cerrando…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 size-4" /> Cerrar fase
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
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

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[var(--text)]/50">{children}</p>;
}

/**
 * Slot de documento con persistencia inmediata: muestra el vigente del
 * expediente (quién lo subió y cuándo, link para verlo, versiones) y sube
 * al seleccionar el archivo — sin esperar el cierre de la fase.
 */
function DocSlot({
  label,
  estado,
  cargando,
  subiendo,
  deshabilitado,
  onPick,
}: {
  label: string;
  estado: DocRolEstado | undefined;
  cargando: boolean;
  subiendo: boolean;
  deshabilitado: boolean;
  onPick: (f: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const doc = estado?.vigente;

  const aceptar = (f: File | undefined) => {
    if (!f || subiendo || deshabilitado) return;
    if (
      !(
        f.type === 'application/pdf' ||
        f.type.startsWith('image/') ||
        f.name.toLowerCase().endsWith('.pdf')
      )
    ) {
      return;
    }
    onPick(f);
  };

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
        aceptar(e.dataTransfer.files?.[0]);
      }}
      className={`flex items-center justify-between gap-3 rounded-lg border bg-[var(--card)] px-4 py-3 transition-colors ${
        dragOver
          ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/40'
          : 'border-[var(--border)]'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        {doc ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-[var(--text)]/35" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{label}</span>
            {doc ? (
              <a
                href={getAdjuntoProxyUrl(doc.url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-0.5 text-xs text-[var(--accent)] hover:underline"
              >
                Ver <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          {cargando ? (
            <p className="text-xs text-[var(--text)]/45">Cargando expediente…</p>
          ) : doc ? (
            <p className="truncate text-xs text-[var(--text)]/60">
              <span className="font-mono">{doc.nombre}</span>
              {' · '}
              {doc.subidoPorNombre ? `Subió ${doc.subidoPorNombre}` : 'Subido'} ·{' '}
              {fmtMomento(doc.subidoAt)}
              {estado && estado.versiones > 1 ? ` · v${estado.versiones}` : ''}
            </p>
          ) : (
            <p className="text-xs text-[var(--text)]/45">Sin documento en el expediente.</p>
          )}
        </div>
      </div>
      <label
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium ${
          subiendo || deshabilitado
            ? 'cursor-not-allowed text-[var(--text)]/40'
            : 'cursor-pointer text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]'
        }`}
      >
        {subiendo ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo…
          </>
        ) : (
          <>
            <Upload className="h-3.5 w-3.5" />
            {doc ? 'Cambiar' : 'Subir'}
          </>
        )}
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          disabled={subiendo || deshabilitado}
          onChange={(e) => {
            aceptar(e.target.files?.[0] ?? undefined);
            e.target.value = '';
          }}
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

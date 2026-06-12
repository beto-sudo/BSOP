'use client';

/**
 * Captura Fase 13 — Facturada (captura colaborativa + XML CFDI: Sprints 1-2
 * de `dilesa-ventas-captura-colaborativa`).
 *
 * Sprint 1 — colaborativo: cada documento PERSISTE AL SUBIRSE
 * (storage + `erp.adjuntos` con `uploaded_by`); el slot muestra quién y
 * cuándo; "Cambiar" versiona; los montos se guardan sin cerrar; "Cerrar
 * fase" valida contra el expediente persistido (marcarFase con docs: []).
 *
 * Sprint 2 — XML CFDI como fuente de verdad:
 *   - `factura_xml` (requerido) y `nota_credito_xml` (opcional) se validan
 *     DETERMINISTA al subir (`lib/dilesa/captura/cfdi-validacion.ts` +
 *     parser de CxP): emisor = DILESA, receptor = cliente, tipo I/E, NC
 *     relacionada al folio de la factura, folio fiscal no usado en otra
 *     venta. Errores bloquean la subida; warnings quedan visibles y
 *     persistidos en `erp.adjuntos.metadata`.
 *   - `valor_facturado` y `monto_nota_credito` se derivan del XML vigente
 *     (read-only); corregir un monto = subir el XML correcto (queda
 *     versionado — esa es la auditoría). Sin XML (degradación) la captura
 *     manual sigue disponible.
 *   - El PDF de la factura pasa a opcional (representación visual); el XML
 *     es el documento fiscal.
 *   - Si la NC se sube antes que la factura, su check de relación queda en
 *     warning — re-subir la NC tras la factura lo revalida (S3 agrega la
 *     revisión integral que lo hace solo).
 *
 * Enforcement: Fase 12 (Detonada) debe estar cerrada.
 * Acceso: `dilesa.ventas.fase13_facturada` (Contabilidad + Gerencia Ventas +
 * Dirección).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  Loader2,
  Lock,
  Save,
  Upload,
  XCircle,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';
import {
  faltantesParaCerrar,
  fetchDocsFase,
  subirDocFase,
  type DocRolEstado,
  type DocsPorRol,
} from '@/lib/dilesa/captura/docs-fase';
import {
  cfdiAdjuntoMetadata,
  hayErrores,
  leerCfdiMetadata,
  validarCfdiFacturaVenta,
  validarCfdiNotaCredito,
  type CfdiResumen,
} from '@/lib/dilesa/captura/cfdi-validacion';
import { CfdiParseError, parseCfdiXml } from '@/lib/cxp/cfdi-parser';
import { useVentaResumen } from '@/lib/dilesa/use-venta-resumen';

type SlotDef = {
  rol: string;
  label: string;
  requerido: boolean;
  /** Slot de XML CFDI — valida determinista al subir. */
  cfdi?: 'factura' | 'nc';
};

const DOCS_FASE13: SlotDef[] = [
  { rol: 'factura_xml', label: 'XML Factura (CFDI)', requerido: true, cfdi: 'factura' },
  { rol: 'factura', label: 'PDF Factura', requerido: false },
  {
    rol: 'nota_credito_xml',
    label: 'XML Nota de Crédito (CFDI, si aplica)',
    requerido: false,
    cfdi: 'nc',
  },
  { rol: 'nota_credito', label: 'PDF Nota de Crédito (si aplica)', requerido: false },
  { rol: 'aviso_pld', label: 'PDF Aviso PLD', requerido: true },
];
const ROLES_FASE13 = DOCS_FASE13.map((d) => d.rol);
const ROLES_REQUERIDOS = DOCS_FASE13.filter((d) => d.requerido).map((d) => d.rol);
const LABEL_POR_ROL = new Map<string, string>(DOCS_FASE13.map((d) => [d.rol, d.label]));

type VentaCtx = {
  id: string;
  persona_id: string;
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
  const [empresaRfc, setEmpresaRfc] = useState<string | null>(null);
  const [clienteRfc, setClienteRfc] = useState<string | null>(null);

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

  // CFDI vigentes en el expediente (fuente de los montos derivados).
  const cfdiFactura: CfdiResumen | null = useMemo(
    () => leerCfdiMetadata(docs?.factura_xml?.vigente.metadata),
    [docs]
  );
  const cfdiNotaCredito: CfdiResumen | null = useMemo(
    () => leerCfdiMetadata(docs?.nota_credito_xml?.vigente.metadata),
    [docs]
  );

  // ── Cargar contexto ──────────────────────────────────────────────
  useEffect(() => {
    if (!ventaId) return;
    let activo = true;

    (async () => {
      setLoading(true);
      setError(null);

      const [vRes, fRes, dRes, eRes, userRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('ventas')
          .select(
            'id, persona_id, valor_escrituracion, valor_real_venta_dilesa, valor_facturado, monto_nota_credito'
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
        sb.schema('core').from('empresas').select('rfc').eq('id', DILESA_EMPRESA_ID).maybeSingle(),
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
      setEmpresaRfc(((eRes.data as { rfc: string | null } | null)?.rfc ?? '').trim() || null);

      // RFC del cliente — receptor esperado de los CFDI.
      const { data: pRow } = await sb
        .schema('erp')
        .from('personas')
        .select('rfc')
        .eq('id', v.persona_id)
        .maybeSingle();
      if (!activo) return;
      setClienteRfc(((pRow as { rfc: string | null } | null)?.rfc ?? '').trim() || null);

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

  // ── Subir documento (persiste al instante; XML valida primero) ───
  const onPickDoc = useCallback(
    async (slot: SlotDef, file: File) => {
      setSubiendoRol(slot.rol);
      try {
        let metadata: Record<string, unknown> | undefined;

        if (slot.cfdi) {
          // 1) Parse determinista del CFDI.
          let parsed;
          try {
            parsed = parseCfdiXml(await file.text());
          } catch (e) {
            toast.add({
              title: 'El XML no es un CFDI válido',
              description: e instanceof CfdiParseError ? e.message : (e as Error).message,
              type: 'error',
            });
            return;
          }

          // 2) Validación contra la operación. Errores bloquean la subida.
          if (!empresaRfc) {
            toast.add({
              title: 'No se pudo validar el CFDI',
              description: 'La empresa no tiene RFC configurado.',
              type: 'error',
            });
            return;
          }
          const ctx = { empresaRfc, clienteRfc };
          const checks =
            slot.cfdi === 'factura'
              ? validarCfdiFacturaVenta(parsed, ctx)
              : validarCfdiNotaCredito(parsed, ctx, cfdiFactura?.uuid ?? null);
          if (hayErrores(checks)) {
            const detalles = checks
              .filter((c) => !c.ok && c.severidad === 'error')
              .map((c) => c.detalle ?? c.label);
            toast.add({
              title: 'El CFDI no corresponde a esta operación',
              description: detalles.join(' '),
              type: 'error',
            });
            return;
          }

          // 3) Dedup: el folio fiscal no debe vivir en otra venta.
          if (parsed.uuid) {
            const { data: dup } = await sb
              .schema('erp')
              .from('adjuntos')
              .select('entidad_id')
              .eq('entidad_tipo', 'venta')
              .eq('rol', slot.rol)
              .eq('metadata->cfdi->>uuid', parsed.uuid)
              .neq('entidad_id', ventaId)
              .limit(1);
            if (dup && dup.length > 0) {
              toast.add({
                title: 'Folio fiscal duplicado',
                description: `El folio ${parsed.uuid} ya está registrado en otra venta.`,
                type: 'error',
              });
              return;
            }
          }

          metadata = cfdiAdjuntoMetadata(parsed, checks);
        }

        const r = await subirDocFase(sb, {
          ventaId,
          rol: slot.rol,
          archivo: file,
          userId,
          metadata,
        });
        if (!r.ok) {
          toast.add({
            title: 'No se pudo subir el documento',
            description: r.error,
            type: 'error',
          });
          return;
        }

        // 4) Montos derivados del XML — se persisten de inmediato.
        if (slot.cfdi) {
          const totalXml = leerCfdiMetadata(metadata ?? null)?.total ?? null;
          if (totalXml != null) {
            const camposXml =
              slot.cfdi === 'factura'
                ? { valor_facturado: totalXml }
                : { monto_nota_credito: totalXml };
            const { error: mErr } = await sb
              .schema('dilesa')
              .from('ventas')
              .update(camposXml)
              .eq('id', ventaId);
            if (!mErr) {
              if (slot.cfdi === 'factura') setValorFacturado(String(totalXml));
              else setMontoNotaCredito(String(totalXml));
            }
          }
        }

        const advertencias = metadata
          ? (metadata.checks as { ok: boolean; severidad: string }[]).filter(
              (c) => !c.ok && c.severidad === 'warning'
            ).length
          : 0;
        toast.add({
          title: `${LABEL_POR_ROL.get(slot.rol) ?? slot.rol} guardado`,
          description:
            advertencias > 0
              ? `Quedó en el expediente con ${advertencias} advertencia${advertencias !== 1 ? 's' : ''} — revisa el detalle en el slot.`
              : 'El documento quedó en el expediente — no se pierde al salir.',
          type: advertencias > 0 ? 'info' : 'success',
        });
        await cargarDocs();
      } finally {
        setSubiendoRol(null);
      }
    },
    [sb, ventaId, userId, empresaRfc, clienteRfc, cfdiFactura, toast, cargarDocs]
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
      // Con XML vigente, el XML manda (read-only en UI); sin XML, captura manual.
      valor_facturado: cfdiFactura
        ? cfdiFactura.total
        : valorFacturado === ''
          ? null
          : Number(valorFacturado),
      monto_nota_credito: cfdiNotaCredito
        ? cfdiNotaCredito.total
        : montoNotaCredito === ''
          ? null
          : Number(montoNotaCredito),
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
  }, [
    valorEscrituracion,
    valorFacturado,
    montoNotaCredito,
    cfdiFactura,
    cfdiNotaCredito,
    cuadratura,
    sb,
    ventaId,
    toast,
  ]);

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
        descripcion="Sube el XML de la factura (y nota de crédito / aviso PLD si aplican). Cada documento se valida y se guarda al subirse; los montos del CFDI se llenan solos."
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
                  slot={d}
                  estado={docs?.[d.rol]}
                  cargando={docs == null && !docsError}
                  subiendo={subiendoRol === d.rol}
                  deshabilitado={subiendoRol != null && subiendoRol !== d.rol}
                  onPick={(f) => void onPickDoc(d, f)}
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
                <MontoDerivado valor={cuadratura ? cuadratura.valorRealVentaDilesa : null} />
                <Hint>Del motor de cuadratura (depósitos − cheque notaría + pagaré).</Hint>
              </Field>
              <Field label={cfdiFactura ? 'Valor facturado (del XML)' : 'Valor facturado'}>
                {cfdiFactura ? (
                  <>
                    <MontoDerivado valor={cfdiFactura.total} />
                    <Hint>
                      CFDI{' '}
                      {[cfdiFactura.serie, cfdiFactura.folio].filter(Boolean).join('-') ||
                        's/folio'}
                      {cuadratura
                        ? ` · Cuadratura sugiere ${money(cuadratura.valorFacturado)}`
                        : ''}
                    </Hint>
                  </>
                ) : (
                  <>
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
                      {cuadratura
                        ? ` · Cuadratura sugiere ${money(cuadratura.valorFacturado)}`
                        : ''}
                    </Hint>
                  </>
                )}
              </Field>
              <Field
                label={
                  cfdiNotaCredito ? 'Monto nota de crédito (del XML)' : 'Monto nota de crédito'
                }
              >
                {cfdiNotaCredito ? (
                  <>
                    <MontoDerivado valor={cfdiNotaCredito.total} />
                    <Hint>
                      CFDI{' '}
                      {[cfdiNotaCredito.serie, cfdiNotaCredito.folio].filter(Boolean).join('-') ||
                        's/folio'}
                      {cuadratura
                        ? ` · Cuadratura sugiere ${money(cuadratura.montoNotaCredito)}`
                        : ''}
                    </Hint>
                  </>
                ) : (
                  <>
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
                      {cuadratura
                        ? ` · Cuadratura sugiere ${money(cuadratura.montoNotaCredito)}`
                        : ''}
                    </Hint>
                  </>
                )}
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

/** Caja read-only para montos derivados (cuadratura / XML CFDI). */
function MontoDerivado({ valor }: { valor: number | null }) {
  return (
    <div className="flex h-9 items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg)]/40 px-3 text-sm">
      <span className="font-medium tabular-nums">{money(valor)}</span>
      <Lock className="h-3.5 w-3.5 text-[var(--text)]/35" />
    </div>
  );
}

/**
 * Slot de documento con persistencia inmediata. Para slots XML (CFDI)
 * muestra el resultado de la validación persistida (folio, total y
 * advertencias); el archivo se valida ANTES de subirse.
 */
function DocSlot({
  slot,
  estado,
  cargando,
  subiendo,
  deshabilitado,
  onPick,
}: {
  slot: SlotDef;
  estado: DocRolEstado | undefined;
  cargando: boolean;
  subiendo: boolean;
  deshabilitado: boolean;
  onPick: (f: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const doc = estado?.vigente;
  const esXml = !!slot.cfdi;
  const cfdi = esXml ? leerCfdiMetadata(doc?.metadata) : null;
  const advertencias = cfdi?.checks.filter((c) => !c.ok) ?? [];

  const aceptar = (f: File | undefined) => {
    if (!f || subiendo || deshabilitado) return;
    const nombre = f.name.toLowerCase();
    const valido = esXml
      ? f.type === 'application/xml' || f.type === 'text/xml' || nombre.endsWith('.xml')
      : f.type === 'application/pdf' || f.type.startsWith('image/') || nombre.endsWith('.pdf');
    if (!valido) return;
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
      className={`rounded-lg border bg-[var(--card)] px-4 py-3 transition-colors ${
        dragOver
          ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/40'
          : 'border-[var(--border)]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          {doc ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 text-[var(--text)]/35" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {esXml ? <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[var(--text)]/45" /> : null}
              <span className="font-medium">
                {slot.label}
                {slot.requerido ? ' *' : ''}
              </span>
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
              <p className="text-xs text-[var(--text)]/45">
                {esXml ? 'Sin XML en el expediente.' : 'Sin documento en el expediente.'}
              </p>
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
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {esXml ? 'Validando…' : 'Subiendo…'}
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              {doc ? 'Cambiar' : 'Subir'}
            </>
          )}
          <input
            type="file"
            accept={esXml ? '.xml,application/xml,text/xml' : 'application/pdf,image/*'}
            className="hidden"
            disabled={subiendo || deshabilitado}
            onChange={(e) => {
              aceptar(e.target.files?.[0] ?? undefined);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {cfdi ? (
        <div className="mt-2 space-y-1 border-t border-dashed border-[var(--border)] pt-2">
          <p className="text-xs text-[var(--text)]/60">
            <span className="font-medium text-emerald-600">CFDI validado</span>
            {' · '}folio fiscal{' '}
            <span className="font-mono">{cfdi.uuid ? cfdi.uuid.slice(0, 8) + '…' : '—'}</span>
            {' · '}
            {money(cfdi.total)}
            {cfdi.fecha ? ` · ${cfdi.fecha}` : ''}
          </p>
          {advertencias.map((c) => (
            <p key={c.clave} className="flex items-start gap-1 text-xs text-amber-600">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{c.detalle ?? c.label}</span>
            </p>
          ))}
        </div>
      ) : null}
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

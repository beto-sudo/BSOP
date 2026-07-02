'use client';

/**
 * Captura Fase 13 — Facturada (captura colaborativa + XML CFDI: Sprints 1-2
 * de `dilesa-ventas-captura-colaborativa`).
 *
 * Sprint 1 — colaborativo: cada documento PERSISTE AL SUBIRSE
 * (storage + `erp.adjuntos` con `uploaded_by`); el slot muestra quién y
 * cuándo; "Cambiar" versiona.
 *
 * Sprint 3 — revisión asistida + gate: la sección "Revisión de la
 * operación" corre la extracción IA del Aviso PLD y el cruce determinista
 * contra el expediente (10 checks, semáforo persistido en
 * `dilesa.venta_fase_revisiones`). El cierre va por
 * `POST /api/dilesa/ventas/[id]/cerrar-fase13` — el gate vive en el server:
 * solo cierra con revisión VIGENTE en verde, o con override de Dirección
 * (motivo obligatorio, auditado). Una persona sin Dirección recibe la
 * advertencia de que la operación requiere esa autorización.
 *
 * Sprint 2 — XML CFDI como fuente de verdad:
 *   - `factura_xml` (requerido) y `nota_credito_xml` (opcional) se validan
 *     DETERMINISTA al subir (`lib/dilesa/captura/cfdi-validacion.ts` +
 *     parser de CxP): emisor = DILESA, receptor = cliente, tipo I/E, NC
 *     relacionada al folio de la factura, folio fiscal no usado en otra
 *     venta. Errores bloquean la subida; warnings quedan visibles y
 *     persistidos en `erp.adjuntos.metadata`.
 *   - NADA se captura a mano en esta pantalla: `valor_escrituracion` viene
 *     de la Fase 8 (Dictaminada) y aquí solo se muestra; `valor_facturado`
 *     y `monto_nota_credito` se derivan del XML vigente. Corregir un monto
 *     = subir el XML correcto (queda versionado — esa es la auditoría).
 *     Las ventas históricas (sin XML) conservan sus montos migrados: el
 *     cierre no pisa nada que el XML no respalde.
 *   - El PDF de la factura pasa a opcional (representación visual); el XML
 *     es el documento fiscal.
 *   - Si la NC se sube antes que la factura, su check de relación queda en
 *     warning — re-subir la NC tras la factura lo revalida.
 *
 * Sprint 4c — ciclo PLD en dos pasos (decisión Beto 2026-06-12): factura
 * (y NC si aplica) van ANTES — el slot del PLD se habilita al tener el XML
 * de la factura. El informe se revisa contra el expediente; en verde se
 * CONGELA (solo Dirección puede reemplazarlo) y se habilita presentar el
 * aviso + cargar el acuse; la revisión con acuse completa el ciclo y solo
 * entonces se prende el cierre.
 *
 * La revisión se ejecuta SOLA al subir el aviso, el acuse o una NC con
 * revisión previa (decisión Beto 2026-07-01: nadie debe aterrizar en el
 * override de Dirección solo porque faltó el click en "Re-ejecutar"; caso
 * DIE2026-19). El botón manual queda como reintento si la corrida falla.
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
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
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
import {
  separarChecks,
  veredictoDe,
  type RevisionCheck,
  type VeredictoRevision,
} from '@/lib/dilesa/captura/pld-revision';
import { useVentaCapturaResumen } from '@/components/dilesa/venta-detalle/captura-shell';
import { useEffectiveUser } from '@/components/providers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

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
  { rol: 'acuse_pld', label: 'PDF Acuse de envío PLD', requerido: true },
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

/** DTO de `GET/POST /api/dilesa/ventas/[id]/revision-pld`. */
type RevisionDto = {
  id: string;
  adjuntoId: string | null;
  adjuntoAcuseId: string | null;
  estado: 'completada' | 'error';
  veredicto: VeredictoRevision;
  checks: RevisionCheck[];
  /** Snapshot de la NC que exige la cuadratura (null en revisiones previas
   *  al feature). Los ids permiten detectar que la NC cambió tras la corrida. */
  facturacion: {
    requerida: boolean;
    montoEsperado: number;
    facturaXmlId: string | null;
    ncXmlId: string | null;
    ncPdfId: string | null;
  } | null;
  errorDetalle: string | null;
  ejecutadoPorNombre: string | null;
  createdAt: string;
  /** false si el Aviso PLD del expediente cambió después de esta revisión. */
  vigente: boolean;
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

  const resumen = useVentaCapturaResumen();
  const cuadratura = resumen.status === 'ready' ? resumen.props.cuadratura : null;

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

  const [revision, setRevision] = useState<RevisionDto | null>(null);
  const [tienePld, setTienePld] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideMotivo, setOverrideMotivo] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const effectiveUser = useEffectiveUser();
  const soyDireccion =
    !!effectiveUser.data &&
    (effectiveUser.data.isAdmin ||
      effectiveUser.data.direccionEmpresaIds.includes(DILESA_EMPRESA_ID));

  const cargarDocs = useCallback(async () => {
    const r = await fetchDocsFase(ventaId, ROLES_FASE13);
    if (r.ok) {
      setDocs(r.docs);
      setDocsError(null);
    } else {
      setDocsError(r.error);
    }
  }, [ventaId]);

  const cargarRevision = useCallback(async () => {
    try {
      const res = await fetch(`/api/dilesa/ventas/${ventaId}/revision-pld`);
      const json = (await res.json()) as {
        ok: boolean;
        revision: RevisionDto | null;
        tienePld: boolean;
      };
      if (res.ok && json.ok) {
        setRevision(json.revision);
        setTienePld(json.tienePld);
      }
    } catch {
      // Silencioso: la sección de revisión muestra su propio estado.
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

  // ── Flujo PLD en dos pasos (decisión Beto 2026-06-12) ───────────
  // Paso 1: el informe se revisa contra el expediente; en verde se CONGELA
  // (solo Dirección puede reemplazarlo) y se habilita presentar + acuse.
  // Paso 2: el acuse completa el ciclo. El gate server-side es la verdad;
  // estos derivados solo ordenan la UI.
  const pasosPld = useMemo(() => {
    const partes = revision
      ? separarChecks(revision.checks)
      : { informe: [], acuse: [], facturacion: [] };
    const informeVigente =
      !!revision &&
      revision.estado === 'completada' &&
      !!docs?.aviso_pld &&
      revision.adjuntoId === docs.aviso_pld.vigente.id;
    const veredictoInforme =
      informeVigente && partes.informe.length > 0 ? veredictoDe(partes.informe) : null;
    // La NC de la revisión quedó stale si los documentos de NC del expediente
    // cambiaron después de la corrida (típico: se subieron en respuesta al
    // check rojo) → hay que re-ejecutar para que el cierre la tome en cuenta.
    const f = revision?.facturacion ?? null;
    const facturacionStale =
      !!f &&
      ((docs?.nota_credito_xml?.vigente.id ?? null) !== f.ncXmlId ||
        (docs?.nota_credito?.vigente.id ?? null) !== f.ncPdfId);
    return {
      checksInforme: partes.informe,
      checksAcuse: partes.acuse,
      checksFacturacion: partes.facturacion,
      facturacionStale,
      veredictoInforme,
      informeVerde: veredictoInforme === 'verde',
      acuseRevisado: !!revision && revision.adjuntoAcuseId != null && revision.vigente,
    };
  }, [revision, docs]);

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
      setDepositos((dRes.data ?? []) as unknown as Deposito[]);
      const posiciones = ((fRes.data ?? []) as { posicion: number }[]).map((f) => f.posicion);
      setFase12Cerrada(posiciones.includes(12));
      setYaCerrada(posiciones.includes(13));
      setUserId(userRes.data?.user?.id ?? null);
      setEmpresaRfc(((eRes.data as { rfc: string | null } | null)?.rfc ?? '').trim() || null);
      void cargarRevision();

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
  }, [ventaId, sb, cargarDocs, cargarRevision]);

  const totalDepositos = useMemo(
    () => depositos.reduce((s, d) => s + Number(d.monto_total ?? 0), 0),
    [depositos]
  );

  // ── Revisión PLD (extracción IA + cruce contra el expediente) ────
  const onRevisar = useCallback(async () => {
    setRevisando(true);
    try {
      const res = await fetch(`/api/dilesa/ventas/${ventaId}/revision-pld`, { method: 'POST' });
      const json = (await res.json()) as {
        ok: boolean;
        revision?: RevisionDto;
        error?: string;
      };
      if (json.revision) setRevision(json.revision);
      if (!res.ok || !json.ok) {
        toast.add({
          title: 'La revisión no pudo completarse',
          description: json.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      const v = json.revision?.veredicto;
      toast.add({
        title:
          v === 'verde'
            ? 'Revisión en verde — la operación cumple'
            : v === 'advertencias'
              ? 'Revisión con advertencias'
              : 'Revisión en rojo',
        description:
          v === 'verde'
            ? 'Todos los checks del Aviso PLD cuadran con el expediente.'
            : 'Revisa el detalle de los checks marcados.',
        type: v === 'verde' ? 'success' : 'info',
      });
    } finally {
      setRevisando(false);
    }
  }, [ventaId, toast]);

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

        // 4) Montos derivados del XML — se persisten de inmediato (la UI
        //    los pinta del metadata del doc vigente tras recargar docs).
        if (slot.cfdi) {
          const totalXml = leerCfdiMetadata(metadata ?? null)?.total ?? null;
          if (totalXml != null) {
            const camposXml =
              slot.cfdi === 'factura'
                ? { valor_facturado: totalXml }
                : { monto_nota_credito: totalXml };
            await sb.schema('dilesa').from('ventas').update(camposXml).eq('id', ventaId);
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
        // Un informe o acuse nuevos dejan la revisión anterior obsoleta →
        // la revisión corre SOLA (el server reusa la extracción del informe
        // cuando solo cambió el acuse — la 2a corrida no re-paga la visión).
        // NC nueva con revisión previa: re-correr para que los checks de
        // facturación tomen la versión vigente (si no, quedan stale).
        if (
          slot.rol === 'aviso_pld' ||
          slot.rol === 'acuse_pld' ||
          ((slot.rol === 'nota_credito_xml' || slot.rol === 'nota_credito') && revision != null)
        ) {
          void onRevisar();
        }
      } finally {
        setSubiendoRol(null);
      }
    },
    [
      sb,
      ventaId,
      userId,
      empresaRfc,
      clienteRfc,
      cfdiFactura,
      toast,
      cargarDocs,
      revision,
      onRevisar,
    ]
  );

  // ── Cerrar fase (el gate real vive en el endpoint) ───────────────
  const faltantes = useMemo(
    () => (docs ? faltantesParaCerrar(docs, ROLES_REQUERIDOS) : ROLES_REQUERIDOS),
    [docs]
  );
  const revisionVerdeVigente =
    !!revision &&
    revision.vigente &&
    revision.estado === 'completada' &&
    revision.veredicto === 'verde';
  // Una revisión no vigente puede serlo por dos razones distintas — el
  // mensaje debe decir cuál: el AVISO cambió (re-revisar desde cero) o solo
  // se cargó el ACUSE después de la corrida (re-ejecutar completa el ciclo).
  const avisoCambio =
    !!revision && !!docs?.aviso_pld && revision.adjuntoId !== docs.aviso_pld.vigente.id;

  const cerrar = useCallback(
    async (motivoOverride?: string) => {
      setCerrando(true);
      try {
        const res = await fetch(`/api/dilesa/ventas/${ventaId}/cerrar-fase13`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valorRealSnapshot: cuadratura?.valorRealVentaDilesa ?? null,
            ...(motivoOverride ? { override: { motivo: motivoOverride } } : {}),
          }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          requiereDireccion?: boolean;
        };
        if (!res.ok || !json.ok) {
          if (json.requiereDireccion && !motivoOverride && soyDireccion) {
            setOverrideOpen(true);
            return;
          }
          toast.add({
            title: json.requiereDireccion
              ? 'La operación no cumple la revisión'
              : 'No se pudo cerrar la fase',
            description: json.error ?? 'Error desconocido.',
            type: json.requiereDireccion ? 'info' : 'error',
          });
          return;
        }
        toast.add({
          title: 'Fase 13 cerrada',
          description: motivoOverride
            ? 'Cierre autorizado por Dirección — quedó registrado en la bitácora.'
            : 'Facturación registrada. Continúa con la siguiente fase desde el detalle.',
          type: 'success',
        });
        router.push(`/dilesa/ventas/${ventaId}`);
      } finally {
        setCerrando(false);
      }
    },
    [ventaId, cuadratura, soyDireccion, toast, router]
  );

  const onCerrarFase = useCallback(() => {
    if (faltantes.length > 0) {
      toast.add({
        title: 'Faltan documentos en el expediente',
        description: `Sube: ${faltantes.map((r) => LABEL_POR_ROL.get(r) ?? r).join(', ')}.`,
        type: 'error',
      });
      return;
    }
    // Sin revisión en verde: Dirección autoriza con motivo; el resto recibe
    // la advertencia (el endpoint re-valida todo server-side).
    if (!revisionVerdeVigente) {
      if (soyDireccion) {
        setOverrideOpen(true);
        return;
      }
      toast.add({
        title: 'La operación no cumple la revisión',
        description:
          'Para avanzar una operación que no cumple, debe autorizarla Dirección. Corre la revisión o pide la autorización.',
        type: 'info',
      });
      return;
    }
    void cerrar();
  }, [faltantes, revisionVerdeVigente, soyDireccion, cerrar, toast]);

  const onConfirmarOverride = useCallback(() => {
    const motivo = overrideMotivo.trim();
    if (!motivo) return;
    setOverrideOpen(false);
    void cerrar(motivo);
  }, [overrideMotivo, cerrar]);

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
        <CapturarFaseHeader faseposicion={13} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  const bloqueadaPorFase12 = fase12Cerrada === false && !yaCerrada;
  const capturaHabilitada = !bloqueadaPorFase12;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={13}
        descripcion="Sube el XML de la factura (y nota de crédito / aviso PLD si aplican). Cada documento se valida y se guarda al subirse; los montos del CFDI se llenan solos."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 13 ya está cerrada"
          body="Esta venta ya está facturada. Los documentos quedan congelados; si hubo un error, solo Dirección puede reemplazarlos (queda versionado y la revisión debe re-correrse)."
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
              {DOCS_FASE13.map((d) => {
                // Paso 1 en verde → el PLD se congela (solo Dirección
                // reemplaza); el acuse se habilita hasta entonces.
                const bloqueo = yaCerrada
                  ? soyDireccion
                    ? null
                    : 'La fase está cerrada — solo Dirección puede reemplazar documentos.'
                  : d.rol === 'aviso_pld' && !docs?.factura_xml
                    ? 'Se habilita al cargar el XML de la factura (y la nota de crédito, si aplica).'
                    : d.rol === 'aviso_pld' && pasosPld.informeVerde && !soyDireccion
                      ? 'El PLD quedó congelado para presentación — solo Dirección puede reemplazarlo.'
                      : d.rol === 'acuse_pld' && !pasosPld.informeVerde
                        ? 'Se habilita cuando la revisión del PLD esté en verde.'
                        : null;
                return (
                  <DocSlot
                    key={d.rol}
                    slot={d}
                    estado={docs?.[d.rol]}
                    cargando={docs == null && !docsError}
                    subiendo={subiendoRol === d.rol}
                    deshabilitado={
                      bloqueo != null || (subiendoRol != null && subiendoRol !== d.rol)
                    }
                    notaBloqueo={bloqueo}
                    onPick={(f) => void onPickDoc(d, f)}
                  />
                );
              })}
            </div>
          </Section>

          <Section title="Revisión de la operación (Aviso PLD)">
            {!tienePld ? (
              <p className="text-sm text-[var(--text)]/60">
                Sube el Aviso PLD al expediente para poder correr la revisión.
              </p>
            ) : revisando ? (
              <p className="flex items-center gap-2 text-sm text-[var(--text)]/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                Extrayendo el aviso y cruzándolo contra el expediente… (~1 minuto)
              </p>
            ) : !revision ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--text)]/60">
                  La operación aún no tiene revisión. El sistema lee el Aviso PLD y lo cruza contra
                  el expediente (cliente, escritura, avalúo, depósitos).
                </p>
                <Button type="button" variant="outline" onClick={() => void onRevisar()}>
                  <ShieldCheck className="mr-2 size-4" /> Revisar operación
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {!revision.vigente && !pasosPld.informeVerde ? (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {avisoCambio
                      ? 'El Aviso PLD cambió después de esta revisión — re-ejecútala para que el cierre la tome en cuenta.'
                      : 'El acuse se cargó después de esta revisión — re-ejecútala para completar el ciclo.'}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <VeredictoBadge
                    veredicto={revision.veredicto}
                    estado={revision.estado}
                    vigente={revision.vigente}
                  />
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text)]/55">
                      {revision.ejecutadoPorNombre
                        ? `Revisó ${revision.ejecutadoPorNombre} · `
                        : ''}
                      {fmtMomento(revision.createdAt)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void onRevisar()}
                    >
                      Re-ejecutar
                    </Button>
                  </div>
                </div>
                {revision.estado === 'error' ? (
                  <p className="text-xs text-destructive">
                    La última revisión falló: {revision.errorDetalle ?? 'error desconocido'}. Puedes
                    re-ejecutarla; si persiste, el cierre requiere autorización de Dirección.
                  </p>
                ) : (
                  <>
                    {/* Paso 1 — el informe contra el expediente */}
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                        Paso 1 · Informe del aviso (PLD)
                      </p>
                      <ul className="space-y-1">
                        {pasosPld.checksInforme.map((c) => (
                          <CheckLinea key={c.clave} check={c} />
                        ))}
                      </ul>
                      {pasosPld.informeVerde ? (
                        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          El PLD cumple y quedó congelado — preséntalo en el portal SPPLD y carga
                          aquí el acuse de envío.
                        </p>
                      ) : null}
                    </div>

                    {/* Paso 2 — la presentación y su acuse */}
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                        Paso 2 · Presentación y acuse
                      </p>
                      {pasosPld.checksAcuse.length > 0 ? (
                        <ul className="space-y-1">
                          {pasosPld.checksAcuse.map((c) => (
                            <CheckLinea key={c.clave} check={c} />
                          ))}
                        </ul>
                      ) : pasosPld.informeVerde ? (
                        <p className="text-xs text-[var(--text)]/55">
                          {docs?.acuse_pld
                            ? 'Acuse cargado — re-ejecuta la revisión para completar el ciclo.'
                            : 'Pendiente: presenta el aviso y sube el acuse de envío.'}
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--text)]/45">
                          Se habilita cuando el Paso 1 esté en verde.
                        </p>
                      )}
                    </div>

                    {/* Facturación — la nota de crédito que exige la cuadratura */}
                    {pasosPld.checksFacturacion.length > 0 ? (
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                          Facturación · Nota de crédito
                        </p>
                        <ul className="space-y-1">
                          {pasosPld.checksFacturacion.map((c) => (
                            <CheckLinea key={c.clave} check={c} />
                          ))}
                        </ul>
                        {pasosPld.facturacionStale ? (
                          <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Los documentos de la nota de crédito cambiaron después de esta revisión
                            — re-ejecútala para que el cierre la tome en cuenta.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </Section>
          <Section title="Montos (informativos — nada se captura aquí)">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Valor de escrituración">
                <MontoDerivado valor={venta.valor_escrituracion} />
                <Hint>
                  {venta.valor_escrituracion == null
                    ? 'Falta — se captura en la Fase 8 (Dictaminada).'
                    : 'Capturado en la Fase 8 (Dictaminada).'}
                </Hint>
              </Field>
              <Field label="Valor real venta Dilesa (calculado)">
                <MontoDerivado valor={cuadratura ? cuadratura.valorRealVentaDilesa : null} />
                <Hint>Del motor de cuadratura (depósitos − cheque notaría + pagaré).</Hint>
              </Field>
              <Field label="Valor facturado (del XML)">
                <MontoDerivado valor={cfdiFactura ? cfdiFactura.total : null} />
                <Hint>
                  {cfdiFactura
                    ? `CFDI ${[cfdiFactura.serie, cfdiFactura.folio].filter(Boolean).join('-') || 's/folio'}${
                        cuadratura
                          ? ` · Cuadratura sugiere ${money(cuadratura.valorFacturadoSugerido)}`
                          : ''
                      }`
                    : 'Se llena solo al subir el XML de la factura.'}
                </Hint>
              </Field>
              <Field label="Monto nota de crédito (del XML)">
                <MontoDerivado valor={cfdiNotaCredito ? cfdiNotaCredito.total : null} />
                <Hint>
                  {cfdiNotaCredito
                    ? `CFDI ${[cfdiNotaCredito.serie, cfdiNotaCredito.folio].filter(Boolean).join('-') || 's/folio'}${
                        cuadratura
                          ? ` · Cuadratura sugiere ${money(cuadratura.montoNotaCreditoSugerido)}`
                          : ''
                      }`
                    : 'Se llena solo al subir el XML de la nota de crédito (si aplica).'}
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
                onClick={() => onCerrarFase()}
                disabled={cerrando || revisando || subiendoRol != null || faltantes.length > 0}
              >
                {cerrando ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Cerrando…
                  </>
                ) : !revisionVerdeVigente && soyDireccion ? (
                  <>
                    <ShieldCheck className="mr-2 size-4" /> Autorizar y cerrar (Dirección)
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

      {/* Override de Dirección: la operación no cumple la revisión. */}
      <Dialog
        open={overrideOpen}
        onOpenChange={(v) => {
          if (!v) setOverrideOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Autorizar cierre sin revisión en verde</DialogTitle>
            <DialogDescription>
              {revision
                ? revision.vigente
                  ? `La revisión está en ${revision.veredicto}.`
                  : avisoCambio
                    ? 'El Aviso PLD cambió después de la última revisión.'
                    : 'El acuse se cargó después de la última revisión — re-ejecutarla completa el ciclo sin necesidad de este override.'
                : 'La operación no tiene revisión PLD.'}{' '}
              El cierre quedará registrado en la bitácora como autorizado por Dirección, con tu
              motivo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={overrideMotivo}
            onChange={(e) => setOverrideMotivo(e.target.value)}
            placeholder="Motivo de la autorización (obligatorio)…"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)} disabled={cerrando}>
              Cancelar
            </Button>
            <Button
              onClick={() => onConfirmarOverride()}
              disabled={overrideMotivo.trim().length === 0 || cerrando}
            >
              <ShieldCheck className="mr-2 size-4" /> Autorizar y cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VeredictoBadge({
  veredicto,
  estado,
  vigente,
}: {
  veredicto: VeredictoRevision;
  estado: 'completada' | 'error';
  /** false = el expediente cambió tras la corrida; el veredicto ya no manda. */
  vigente: boolean;
}) {
  if (estado === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">
        <XCircle className="h-3.5 w-3.5" /> Revisión fallida
      </span>
    );
  }
  if (!vigente) {
    // Sin esto, un veredicto verde de una corrida vieja gritaba "listo para
    // cerrar" mientras el gate pedía re-ejecutar (caso DIE2026-19).
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="h-3.5 w-3.5" /> Desactualizada — re-ejecuta la revisión
      </span>
    );
  }
  if (veredicto === 'verde') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" /> Cumple — listo para cerrar
      </span>
    );
  }
  if (veredicto === 'advertencias') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="h-3.5 w-3.5" /> Con advertencias — requiere Dirección
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">
      <XCircle className="h-3.5 w-3.5" /> No cumple — requiere Dirección
    </span>
  );
}

function CheckLinea({ check }: { check: RevisionCheck }) {
  const icono = check.ok ? (
    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
  ) : check.severidad === 'error' ? (
    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
  ) : (
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
  );
  return (
    <li className="flex items-start gap-1.5 text-xs">
      {icono}
      <span className={check.ok ? 'text-[var(--text)]/60' : 'text-[var(--text)]'}>
        {check.label}
        {!check.ok && check.detalle ? (
          <span className="text-[var(--text)]/60"> — {check.detalle}</span>
        ) : null}
      </span>
    </li>
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
  notaBloqueo,
  onPick,
}: {
  slot: SlotDef;
  estado: DocRolEstado | undefined;
  cargando: boolean;
  subiendo: boolean;
  deshabilitado: boolean;
  /** Razón visible del bloqueo (PLD congelado / acuse pendiente del Paso 1). */
  notaBloqueo?: string | null;
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
            {notaBloqueo ? (
              <p className="mt-0.5 flex items-start gap-1 text-xs text-[var(--text)]/50">
                <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                {notaBloqueo}
              </p>
            ) : null}
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

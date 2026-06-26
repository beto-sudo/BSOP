'use client';

/**
 * Captura Fase 8 — Dictaminada (cierre financiero, ADR-048).
 *
 * Gerencia/notario suben la Carta de Instrucción + el Anexo B (por el magic
 * link del notario o aquí), la IA pre-llena los números y **Dirección cuadra la
 * operación, define el crédito directo (pagaré) y cierra la fase** — aquí están
 * los datos reales del crédito y los gastos notariales. El magic link YA NO
 * avanza la fase: solo sube el dictamen; el cierre lo controla Dirección.
 *
 * Captura:
 *   - PDF Carta de Instrucción Notarial (rol `carta_instruccion_notarial`)
 *   - PDF Condiciones Financieras Anexo B (rol `condiciones_financieras`,
 *     opcional — los créditos no-Infonavit pueden no traerlo)
 *   - Fecha del dictamen (default hoy) + montos/referencias del crédito
 *
 * Análisis IA automático (Beto, 2026-06-10): al seleccionar cualquiera de
 * los dos PDFs se analiza con Claude y se PRECARGAN los campos del form
 * (valor de escrituración, monto crédito, referencia, gastos) + chips de
 * verificación cruzada (NSS, nombre, domicilio vs unidad, CLABE de DILESA).
 * Nada se escribe a la venta hasta "Guardar" — la precarga es editable.
 *
 * Enforcement: Fase 7 (Dictamen Solicitado) debe estar cerrada.
 *
 * Acceso: `dilesa.ventas.fase08_dictaminada` (Gerencia Ventas + Dirección).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MinusCircle,
  Save,
  Sparkles,
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
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase } from '@/lib/dilesa/captura/marcar-fase';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { useEffectiveUser } from '@/components/providers';
import { useVentaCapturaResumen } from '@/components/dilesa/venta-detalle/captura-shell';
import { CuadraturaPanel } from '@/components/dilesa/cuadratura-panel';
import {
  CreditoDirectoCaptura,
  type PlanPagoJson,
} from '@/components/dilesa/captura/credito-directo-captura';
import {
  DocsFaseSection,
  useDocsFaseColaborativos,
  type SlotColaborativo,
} from '@/components/dilesa/captura/docs-fase-colaborativos';
import {
  fetchDocsFase,
  subirDocFase,
  type DocRolEstado,
  type DocsPorRol,
} from '@/lib/dilesa/captura/docs-fase';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';

// Pagaré firmado (decisión Beto 2026-06-24): el documento se recaba en la
// dictaminación (no en la firma). Mismo adjunto (rol `pagare`) que reconoce la
// fase Escriturar; obligatorio para cerrar la fase cuando hay crédito directo.
const SLOTS_PAGARE: SlotColaborativo[] = [
  { rol: 'pagare', label: 'Pagaré firmado por el cliente', requerido: true },
];

// Re-firma de documentos (ADR-048 D5): cuando el precio dictaminado difiere del de
// los documentos firmados, Gerencia re-sube estos 2 con el precio nuevo. Cada uno
// PERSISTE al subirse (storage + erp.adjuntos, igual que el pagaré) — no espera al
// botón de Dirección. La confirmación (solo Dirección) marca los viejos sustituidos
// y mueve el snapshot; el documento subido lleva `metadata.refirma_precio` para
// distinguir el del precio nuevo de los que ya estaban en el expediente.
const REFIRMA_ROLES = ['solicitud_asignacion', 'contrato_promesa'] as const;
const REFIRMA_LABEL: Record<string, string> = {
  solicitud_asignacion: 'Solicitud de Asignación firmada',
  contrato_promesa: 'Promesa de Compraventa firmada',
};

/** `erp.adjuntos.created_at` viene en UTC — formatear en hora local. */
function fmtMomentoRefirma(iso: string): string {
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

/** Precio con el que se subió un documento de re-firma (metadata.refirma_precio). */
function refirmaPrecioDe(estado: DocRolEstado | undefined): number | null {
  const rp = estado?.vigente.metadata?.refirma_precio;
  return typeof rp === 'number' ? rp : null;
}

type VentaCtx = {
  id: string;
  empresa_id: string;
  persona_id: string;
  unidad_id: string | null;
  notario_id: string | null;
  tipo_credito: string | null;
  credito_titular_ref: string | null;
  credito_cotitular_ref: string | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  gastos_escrituracion: number | null;
  valor_escrituracion: number | null;
  // Re-firma de documentos (ADR-048 D5): si el precio dictaminado difiere del que
  // tienen los documentos firmados vigentes, hay que re-firmar Solicitud + Promesa.
  precio_asignacion: number | null;
  precio_documentos_firmados: number | null;
  // Crédito directo (pagaré) — se captura aquí desde el rediseño ADR-048.
  monto_credito_directo: number | null;
  cd_plan_pagos: PlanPagoJson[] | null;
  cd_tiie28_pct: number | null;
  cd_spread_ordinario_pct: number | null;
  cd_fecha_suscripcion: string | null;
  cd_aval_nombre: string | null;
  cd_aval_domicilio: string | null;
  // Resolución del saldo residual de precio (iniciativa dilesa-saldos-residuales).
  saldo_residual_resolucion: 'cobrar' | 'absorber' | null;
  saldo_residual_monto: number | null;
  saldo_residual_autorizado_por: string | null;
  saldo_residual_at: string | null;
};

type Verificaciones = {
  nss_coincide: boolean | null;
  nombre_coincide: boolean | null;
  domicilio_coincide: boolean | null;
  clabe_es_dilesa: boolean | null;
  vendedor_es_dilesa: boolean | null;
};
type Extraccion = {
  tipo_documento: string;
  nombre_titular: string;
  nss: string;
  numero_credito: string;
  institucion_credito: string;
  precio_compraventa: number;
  monto_credito: number;
  gastos_titulacion: number;
  impuestos_derechos: number;
  costo_avaluo: number;
  domicilio_inmueble: string;
  vendedor: string;
  clabe_beneficiario: string;
  banco_beneficiario: string;
};
type AdjuntoNotarial = {
  id: string;
  rol: string;
  metadata: {
    analisis_notarial?: { extraccion: Extraccion; verificaciones: Verificaciones };
  } | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));
// Con centavos — para el saldo residual (puede traer .42, p.ej. $792.42).
const moneyFmt2 = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money2 = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt2.format(Number(n));

export default function CapturarFase8Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase08_dictaminada" write>
      <CapturarFase8Body />
    </RequireAccess>
  );
}

function CapturarFase8Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;
  // Resumen liviano del shell de captura → cuadratura completa + saldo del
  // pagaré (ADR-048: el cierre financiero se cuadra aquí, con los datos reales).
  const resumen = useVentaCapturaResumen();
  const { data: me } = useEffectiveUser();
  // Pagaré firmado: estado del adjunto colaborativo (rol `pagare`) — gate del cierre.
  const docsPagare = useDocsFaseColaborativos(ventaId, SLOTS_PAGARE);

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  // El crédito directo (pagaré) reporta su estado "guardado" para el gate del
  // cierre de la fase cuando hay saldo.
  const [cdGuardado, setCdGuardado] = useState(false);
  // Resolución del saldo residual de precio (iniciativa dilesa-saldos-residuales).
  const [resolviendoSaldo, setResolviendoSaldo] = useState(false);
  // Re-firma de documentos (ADR-048 D5): los 2 PDF firmados re-subidos con el precio
  // nuevo. Persisten al subirse (Gerencia los carga; quedan en el expediente) — el
  // estado aquí es lo persistido, no un File en memoria que se perdía al cambiar de
  // usuario. La confirmación del cambio sigue siendo solo de Dirección.
  const [docsRefirma, setDocsRefirma] = useState<DocsPorRol | null>(null);
  const [subiendoRefirma, setSubiendoRefirma] = useState<string | null>(null);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [confirmandoRefirma, setConfirmandoRefirma] = useState(false);
  const [notarioNombre, setNotarioNombre] = useState<string | null>(null);
  const [fase7Cerrada, setFase7Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [fechaDictamen, setFechaDictamen] = useState<string>(new Date().toISOString().slice(0, 10));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoCondiciones, setArchivoCondiciones] = useState<File | null>(null);
  // Confirmar/editar (acarrean de Fase 6) + capturar gastos de escrituración.
  const [montoTitular, setMontoTitular] = useState<string>('');
  const [montoCotitular, setMontoCotitular] = useState<string>('');
  const [creditoTitularRef, setCreditoTitularRef] = useState<string>('');
  const [creditoCotitularRef, setCreditoCotitularRef] = useState<string>('');
  const [gastosEscrituracion, setGastosEscrituracion] = useState<string>('');
  const [valorEscrituracion, setValorEscrituracion] = useState<string>('');

  // Análisis IA automático al subir documentos (o de los ya cargados).
  const [analizando, setAnalizando] = useState(false);
  const [verif, setVerif] = useState<Verificaciones | null>(null);
  const [extracciones, setExtracciones] = useState<Extraccion[]>([]);
  const [adjuntosNotariales, setAdjuntosNotariales] = useState<AdjuntoNotarial[]>([]);
  // Evita re-analizar los adjuntos existentes en cada re-render.
  const adjuntosProcesadosRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Aplica un resultado de análisis al estado: precarga campos + acumula
   * verificaciones. `pisar=true` cuando el operador acaba de subir el archivo
   * (lo extraído manda); `pisar=false` para análisis de adjuntos ya cargados
   * al abrir la página (solo rellena campos vacíos — no pisa lo guardado).
   */
  const registrarAnalisis = useCallback(
    (extraccion: Extraccion, verificaciones: Verificaciones, pisar: boolean) => {
      const setSuave = (setter: (fn: (prev: string) => string) => void, valor: string) =>
        setter((prev) => (pisar || !prev.trim() ? valor : prev));
      if (extraccion.precio_compraventa > 0)
        setSuave(setValorEscrituracion, String(extraccion.precio_compraventa));
      if (extraccion.monto_credito > 0) setSuave(setMontoTitular, String(extraccion.monto_credito));
      if (extraccion.numero_credito) {
        const inst = extraccion.institucion_credito ? `${extraccion.institucion_credito} ` : '';
        setSuave(setCreditoTitularRef, `${inst}${extraccion.numero_credito}`);
      }
      const gastos = extraccion.gastos_titulacion + extraccion.impuestos_derechos;
      if (gastos > 0) setSuave(setGastosEscrituracion, String(gastos));

      // Las verificaciones se acumulan entre documentos: un false o un true
      // nuevo pisa un null previo, pero un null nunca borra un resultado.
      setVerif((prev) => {
        const next = { ...(prev ?? verificaciones) };
        (Object.keys(verificaciones) as (keyof Verificaciones)[]).forEach((k) => {
          if (verificaciones[k] !== null) next[k] = verificaciones[k];
        });
        return next;
      });
      setExtracciones((prev) => [...prev, extraccion]);
    },
    []
  );

  /**
   * Analiza el PDF con Claude apenas se selecciona y PRECARGA los campos del
   * form (el operador revisa/edita antes de guardar — nada se persiste aquí).
   * Si la extracción falla o el doc no trae un dato, los campos quedan como
   * están y se capturan a mano (créditos no-Infonavit, escaneos malos, etc.).
   */
  const analizarArchivo = useCallback(
    async (f: File) => {
      setAnalizando(true);
      try {
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch(`/api/dilesa/ventas/${ventaId}/analizar-notarial`, {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const { extraccion, verificaciones } = (await res.json()) as {
          extraccion: Extraccion;
          verificaciones: Verificaciones;
        };
        registrarAnalisis(extraccion, verificaciones, true);
        toast.add({
          title: 'Documento analizado',
          description: 'Campos precargados — revisa los datos antes de guardar.',
          type: 'success',
        });
      } catch (e) {
        toast.add({
          title: 'No se pudo analizar el documento',
          description: `${e instanceof Error ? e.message : 'Error'}. Captura los datos manualmente.`,
          type: 'error',
        });
      } finally {
        setAnalizando(false);
      }
    },
    [registrarAnalisis, toast, ventaId]
  );

  /**
   * Análisis de los documentos YA cargados (típico: el notario los subió por
   * su magic link). Los que ya tienen `metadata.analisis_notarial` se
   * muestran al instante; los que no, se analizan una vez (el endpoint
   * persiste el resultado). Precarga suave: solo campos vacíos.
   */
  useEffect(() => {
    if (adjuntosProcesadosRef.current || adjuntosNotariales.length === 0) return;
    adjuntosProcesadosRef.current = true;
    let activo = true;

    (async () => {
      const pendientes: AdjuntoNotarial[] = [];
      for (const adj of adjuntosNotariales) {
        const previo = adj.metadata?.analisis_notarial;
        if (previo) {
          registrarAnalisis(previo.extraccion, previo.verificaciones, false);
        } else {
          pendientes.push(adj);
        }
      }
      if (pendientes.length === 0) return;
      setAnalizando(true);
      try {
        for (const adj of pendientes) {
          const res = await fetch(`/api/dilesa/ventas/${ventaId}/analizar-notarial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adjunto_id: adj.id }),
          });
          if (!activo) return;
          if (!res.ok) continue; // best-effort: el doc se puede analizar después
          const { extraccion, verificaciones } = (await res.json()) as {
            extraccion: Extraccion;
            verificaciones: Verificaciones;
          };
          registrarAnalisis(extraccion, verificaciones, false);
        }
      } finally {
        if (activo) setAnalizando(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, [adjuntosNotariales, registrarAnalisis, ventaId]);

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
          'id, empresa_id, persona_id, unidad_id, notario_id, tipo_credito, credito_titular_ref, credito_cotitular_ref, monto_credito_titular, monto_credito_cotitular, gastos_escrituracion, valor_escrituracion, precio_asignacion, precio_documentos_firmados, monto_credito_directo, cd_plan_pagos, cd_tiie28_pct, cd_spread_ordinario_pct, cd_fecha_suscripcion, cd_aval_nombre, cd_aval_domicilio, saldo_residual_resolucion, saldo_residual_monto, saldo_residual_autorizado_por, saldo_residual_at'
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
      if (v.monto_credito_titular != null) setMontoTitular(String(v.monto_credito_titular));
      if (v.monto_credito_cotitular != null) setMontoCotitular(String(v.monto_credito_cotitular));
      if (v.credito_titular_ref) setCreditoTitularRef(v.credito_titular_ref);
      if (v.credito_cotitular_ref) setCreditoCotitularRef(v.credito_cotitular_ref);
      if (v.gastos_escrituracion != null) setGastosEscrituracion(String(v.gastos_escrituracion));
      if (v.valor_escrituracion != null) setValorEscrituracion(String(v.valor_escrituracion));

      const [fRes, notRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', v.id)
          .is('deleted_at', null),
        v.notario_id
          ? sb
              .schema('erp')
              .from('personas')
              .select('nombre, apellido_paterno, apellido_materno')
              .eq('id', v.notario_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!activo) return;

      if (notRes.data) {
        const apellidos = [notRes.data.apellido_paterno, notRes.data.apellido_materno]
          .filter(Boolean)
          .join(' ')
          .trim();
        setNotarioNombre(
          apellidos ? `${notRes.data.nombre} ${apellidos}` : (notRes.data.nombre as string)
        );
      }
      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase7Cerrada(posiciones.includes(7));
      setYaCerrada(posiciones.includes(8));

      // Documentos del notario ya cargados (magic link o captura previa) —
      // disparan el análisis IA automático (efecto aparte).
      const { data: adjs } = await sb
        .schema('erp')
        .from('adjuntos')
        .select('id, rol, metadata')
        .eq('entidad_tipo', 'venta')
        .eq('entidad_id', v.id)
        .in('rol', ['carta_instruccion_notarial', 'condiciones_financieras']);
      if (activo) setAdjuntosNotariales((adjs ?? []) as AdjuntoNotarial[]);

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      // ADR-048: solo Dirección cuadra y cierra la dictaminación.
      const esDir = !!me?.isAdmin || (me?.direccionEmpresaIds ?? []).includes(venta.empresa_id);
      if (!esDir) {
        toast.add({
          title: 'Solo Dirección cierra la dictaminación',
          description:
            'Gerencia sube el dictamen y captura los datos; Dirección cuadra y avanza la fase.',
          type: 'error',
        });
        return;
      }
      // Saldo residual de precio "siempre explícito" (iniciativa dilesa-saldos-residuales):
      // si el precio queda con un residual real, Dirección lo resuelve (cobrar/absorber)
      // antes de cerrar. La NC sigue derivada; esto registra la decisión.
      const cuadResumen = resumen.status === 'ready' ? resumen.props.cuadratura : null;
      const cob = cuadResumen?.coberturaGastos ?? null;
      if (cuadResumen?.requiereResolucionSaldoResidual && venta.saldo_residual_resolucion == null) {
        toast.add({
          title: 'Falta resolver el saldo del cliente',
          description:
            'Hay un saldo de precio por resolver. Cóbralo (pagaré) o absórbelo (nota de crédito) antes de cerrar la dictaminación.',
          type: 'error',
        });
        return;
      }
      // El crédito directo (pagaré) se exige por faltante de GASTOS o porque Dirección
      // eligió "Cobrar" el residual de precio (S2). Un solo pagaré cubre ambos; el motor
      // lo asigna gastos-primero. Debe estar guardado + firmado antes de cerrar.
      const requierePagare =
        (cob != null && cob.pagareNecesario > 0.0049) ||
        venta.saldo_residual_resolucion === 'cobrar';
      if (requierePagare && !cdGuardado) {
        toast.add({
          title: 'Falta configurar el crédito directo',
          description:
            'Hay un saldo por cubrir. Guarda el crédito directo (pagaré) antes de cerrar la fase.',
          type: 'error',
        });
        return;
      }
      if (requierePagare && docsPagare.faltantes.length > 0) {
        toast.add({
          title: 'Falta el pagaré firmado',
          description: 'Sube el pagaré firmado por el cliente antes de cerrar la dictaminación.',
          type: 'error',
        });
        return;
      }
      // Re-firma pendiente (ADR-048 D5): si el precio dictaminado difiere del de los
      // documentos firmados, no se avanza hasta re-firmar Solicitud + Promesa.
      const valorN = Number(valorEscrituracion) || 0;
      if (
        venta.precio_documentos_firmados != null &&
        valorN > 0 &&
        Math.abs(valorN - venta.precio_documentos_firmados) > 0.5
      ) {
        toast.add({
          title: 'Re-firma de documentos pendiente',
          description:
            'El precio cambió: re-firma la Solicitud y la Promesa con el precio nuevo antes de avanzar.',
          type: 'error',
        });
        return;
      }
      // El notario pudo subir la carta por el magic link (ADR-048: sin avanzar la
      // fase). Si ya está cargada, Dirección cierra sin re-subirla.
      const cartaYaSubida = adjuntosNotariales.some((a) => a.rol === 'carta_instruccion_notarial');
      if (!archivo && !cartaYaSubida) {
        toast.add({
          title: 'Falta la Carta de Instrucción',
          description: 'Sube el PDF entregado por el notario (o pídele que lo suba por su enlace).',
          type: 'error',
        });
        return;
      }
      // Anexo B (Condiciones Financieras) obligatorio en créditos Infonavit
      // (Beto 2026-06-23). De aquí en adelante; las ya cerradas se quedan.
      const esInfonavit = (venta.tipo_credito ?? '').toLowerCase().includes('infonavit');
      const condicionesSubida = adjuntosNotariales.some((a) => a.rol === 'condiciones_financieras');
      if (esInfonavit && !archivoCondiciones && !condicionesSubida) {
        toast.add({
          title: 'Falta el Anexo B',
          description:
            'Las Condiciones Financieras (Anexo B) son obligatorias en créditos Infonavit.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const gastosNum = gastosEscrituracion.trim() ? Number(gastosEscrituracion) : null;
      const docs = archivo ? [{ rol: 'carta_instruccion_notarial', archivo }] : [];
      if (archivoCondiciones)
        docs.push({ rol: 'condiciones_financieras', archivo: archivoCondiciones });
      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseposicion: 8,
        docs,
        camposVenta: {
          fecha_dictaminada: fechaDictamen,
          monto_credito_titular: montoTitular.trim() ? Number(montoTitular) : null,
          monto_credito_cotitular: montoCotitular.trim() ? Number(montoCotitular) : null,
          credito_titular_ref: creditoTitularRef.trim() || null,
          credito_cotitular_ref: creditoCotitularRef.trim() || null,
          gastos_escrituracion: gastosNum,
          valor_escrituracion: valorEscrituracion.trim() ? Number(valorEscrituracion) : null,
        },
        notas: null,
        registradoPor: userId,
      });

      setSubmitting(false);
      if (!result.ok) {
        toast.add({
          title: 'Error al cerrar Fase 8',
          description: result.error ?? 'Error desconocido.',
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Fase 8 cerrada',
        description: 'Dictamen registrado. Continúa con la siguiente fase desde el detalle.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [
      archivo,
      archivoCondiciones,
      fechaDictamen,
      montoTitular,
      montoCotitular,
      creditoTitularRef,
      creditoCotitularRef,
      gastosEscrituracion,
      valorEscrituracion,
      adjuntosNotariales,
      cdGuardado,
      docsPagare,
      me,
      resumen,
      router,
      sb,
      toast,
      venta,
    ]
  );

  // Caso magic link: el notario ya cerró F8 subiendo la carta, pero los
  // datos administrativos (número de crédito + gastos de escrituración)
  // los captura Gerencia Ventas. Este path hace UPDATE directo de la venta
  // SIN insertar otra fila en venta_fases (la fase ya está cerrada). Si
  // se subieron las Condiciones Financieras aquí, se archivan como adjunto.
  const onActualizarDatos = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!venta) return;
      // ADR-048: solo Dirección modifica/cuadra la dictaminación, también con la
      // fase ya cerrada.
      const esDir = !!me?.isAdmin || (me?.direccionEmpresaIds ?? []).includes(venta.empresa_id);
      if (!esDir) {
        toast.add({
          title: 'Solo Dirección modifica la dictaminación',
          description: 'El cierre financiero (cuadratura, pagaré, datos) lo controla Dirección.',
          type: 'error',
        });
        return;
      }
      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      if (archivoCondiciones) {
        const path = buildAdjuntoPath({
          empresa: 'dilesa',
          entidad: 'ventas',
          entidadId: venta.id,
          filename: archivoCondiciones.name,
        });
        const { error: upStorageErr } = await sb.storage
          .from('adjuntos')
          .upload(path, archivoCondiciones, {
            contentType: archivoCondiciones.type || 'application/octet-stream',
            upsert: false,
          });
        if (!upStorageErr) {
          await sb
            .schema('erp')
            .from('adjuntos')
            .insert({
              empresa_id: DILESA_EMPRESA_ID,
              entidad_tipo: 'venta',
              entidad_id: venta.id,
              rol: 'condiciones_financieras',
              nombre: archivoCondiciones.name,
              url: path,
              tipo_mime: archivoCondiciones.type || null,
              tamano_bytes: archivoCondiciones.size,
              uploaded_by: userId,
            });
        } else {
          toast.add({
            title: 'No se pudo subir el PDF de condiciones',
            description: upStorageErr.message,
            type: 'error',
          });
          setSubmitting(false);
          return;
        }
      }

      const gastosNum = gastosEscrituracion.trim() ? Number(gastosEscrituracion) : null;
      const { error: upErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .update({
          monto_credito_titular: montoTitular.trim() ? Number(montoTitular) : null,
          monto_credito_cotitular: montoCotitular.trim() ? Number(montoCotitular) : null,
          credito_titular_ref: creditoTitularRef.trim() || null,
          credito_cotitular_ref: creditoCotitularRef.trim() || null,
          gastos_escrituracion: gastosNum,
          valor_escrituracion: valorEscrituracion.trim() ? Number(valorEscrituracion) : null,
        })
        .eq('id', venta.id);
      setSubmitting(false);
      if (upErr) {
        toast.add({
          title: 'Error al actualizar datos',
          description: getSupabaseErrorMessage(upErr, 'No se pudieron guardar los datos.'),
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Datos actualizados',
        description: 'Números de crédito y datos de escrituración guardados.',
        type: 'success',
      });
      router.push(`/dilesa/ventas/${venta.id}`);
    },
    [
      archivoCondiciones,
      montoTitular,
      montoCotitular,
      creditoTitularRef,
      creditoCotitularRef,
      gastosEscrituracion,
      valorEscrituracion,
      me,
      router,
      sb,
      toast,
      venta,
    ]
  );

  // Usuario autenticado → `uploaded_by` de los documentos de re-firma.
  useEffect(() => {
    sb.auth.getUser().then((r) => setUsuarioId(r.data?.user?.id ?? null));
  }, [sb]);

  // Documentos de re-firma ya en el expediente (los pudo subir Gerencia en otra
  // sesión). Se cargan siempre: el indicador "del precio nuevo" se deriva del
  // `metadata.refirma_precio` de cada vigente.
  const cargarDocsRefirma = useCallback(async () => {
    const r = await fetchDocsFase(ventaId, [...REFIRMA_ROLES]);
    if (r.ok) setDocsRefirma(r.docs);
  }, [ventaId]);
  useEffect(() => {
    if (ventaId) void cargarDocsRefirma();
  }, [ventaId, cargarDocsRefirma]);

  // Subir UN documento de re-firma — persiste de inmediato (storage + erp.adjuntos),
  // como el pagaré. Lo puede cargar Gerencia: NO espera al botón de Dirección, así que
  // el archivo ya no se pierde al cambiar de usuario. Sella `refirma_precio` con el
  // precio nuevo para distinguirlo de los documentos viejos del expediente.
  const onSubirRefirma = useCallback(
    async (rol: string, archivo: File) => {
      const valorNum = Number(valorEscrituracion) || 0;
      if (valorNum <= 0) return;
      setSubiendoRefirma(rol);
      try {
        const r = await subirDocFase(sb, {
          ventaId,
          rol,
          archivo,
          userId: usuarioId,
          metadata: { refirma_precio: valorNum },
        });
        if (!r.ok) {
          toast.add({
            title: 'No se pudo subir el documento',
            description: r.error,
            type: 'error',
          });
          return;
        }
        toast.add({
          title: `${REFIRMA_LABEL[rol] ?? 'Documento'} guardado`,
          description:
            'Quedó en el expediente — no se pierde al salir. Dirección confirma el cambio.',
          type: 'success',
        });
        await cargarDocsRefirma();
      } finally {
        setSubiendoRefirma(null);
      }
    },
    [sb, ventaId, usuarioId, valorEscrituracion, toast, cargarDocsRefirma]
  );

  // Confirmar la re-firma (solo Dirección, ADR-048 D5): los documentos del precio
  // nuevo ya están subidos (Gerencia) — aquí solo se marcan los anteriores como
  // sustituidos (auditoría LFPIORPI: no se borran) y se mueve el snapshot al precio
  // dictaminado para que no se vuelva a pedir. No sube archivos.
  const confirmarRefirma = useCallback(async () => {
    if (!venta) return;
    const valorNum = Number(valorEscrituracion) || 0;
    if (valorNum <= 0) return;
    const esDir = !!me?.isAdmin || (me?.direccionEmpresaIds ?? []).includes(venta.empresa_id);
    if (!esDir) {
      toast.add({
        title: 'Solo Dirección confirma la re-firma',
        description: 'Gerencia sube los documentos; Dirección registra el cambio de precio.',
        type: 'error',
      });
      return;
    }
    // Ambos roles deben tener un vigente sellado con el precio nuevo (no los viejos).
    const vigentes = REFIRMA_ROLES.map((rol) => docsRefirma?.[rol]);
    const completos = vigentes.every((est) => {
      const rp = refirmaPrecioDe(est);
      return rp != null && Math.abs(rp - valorNum) <= 0.5;
    });
    if (!completos) {
      toast.add({
        title: 'Faltan los documentos del precio nuevo',
        description:
          'Sube la Solicitud y la Promesa firmadas con el precio nuevo antes de confirmar.',
        type: 'error',
      });
      return;
    }
    const vigenteIds = vigentes.map((est) => est?.vigente.id).filter((x): x is string => !!x);

    setConfirmandoRefirma(true);
    // Marca como sustituidos los demás adjuntos de estos roles (los del precio viejo),
    // conservando los vigentes (los recién subidos con el precio nuevo).
    const { data: previos } = await sb
      .schema('erp')
      .from('adjuntos')
      .select('id')
      .eq('entidad_tipo', 'venta')
      .eq('entidad_id', venta.id)
      .in('rol', [...REFIRMA_ROLES])
      .is('sustituido_at', null);
    const idsViejos = (previos ?? [])
      .map((a) => a.id as string)
      .filter((id) => !vigenteIds.includes(id));
    if (idsViejos.length > 0) {
      await sb
        .schema('erp')
        .from('adjuntos')
        .update({ sustituido_at: new Date().toISOString() })
        .in('id', idsViejos);
    }

    // Snapshot = precio dictaminado (cierra la re-firma) + persiste el valor.
    const { error: upVErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({ precio_documentos_firmados: valorNum, valor_escrituracion: valorNum })
      .eq('id', venta.id);
    setConfirmandoRefirma(false);
    if (upVErr) {
      toast.add({
        title: 'No se pudo cerrar la re-firma',
        description: getSupabaseErrorMessage(upVErr, 'Error desconocido.'),
        type: 'error',
      });
      return;
    }
    setVenta((v) =>
      v ? { ...v, precio_documentos_firmados: valorNum, valor_escrituracion: valorNum } : v
    );
    await cargarDocsRefirma();
    toast.add({
      title: 'Re-firma confirmada',
      description: 'Documentos actualizados con el precio nuevo. Ya puedes avanzar la fase.',
      type: 'success',
    });
  }, [docsRefirma, me, sb, toast, valorEscrituracion, venta, cargarDocsRefirma]);

  // Imprime el documento de re-firma con el precio NUEVO. El endpoint del PDF
  // decide el precio leyendo `valor_escrituracion` de la BD (ADR-048 D5): si el
  // precio dictaminado solo vive en el form (precarga IA sin guardar), el PDF
  // cae al precio congelado y sale el VIEJO. Por eso lo persistimos antes de
  // abrir el PDF. Requiere Dirección para persistir (igual que el resto del
  // cierre financiero); si ya está guardado, cualquiera puede reimprimir.
  const imprimirRefirma = useCallback(
    async (tipo: 'solicitud-asignacion' | 'promesa-compraventa') => {
      if (!venta) return;
      const valorNum = Number(valorEscrituracion) || 0;
      const url = `/api/dilesa/ventas/${venta.id}/pdf/${tipo}`;
      const necesitaPersistir = valorNum > 0 && Number(venta.valor_escrituracion ?? 0) !== valorNum;
      const esDir = !!me?.isAdmin || (me?.direccionEmpresaIds ?? []).includes(venta.empresa_id);
      if (necesitaPersistir && !esDir) {
        toast.add({
          title: 'Solo Dirección fija el valor de escrituración',
          description:
            'El precio nuevo aún no está guardado. Pide a Dirección que lo confirme antes de imprimir.',
          type: 'error',
        });
        return;
      }
      // Abrimos la pestaña dentro del gesto del click (sincrónico) para que el
      // popup blocker no la mate tras el await del guardado.
      const win = window.open('about:blank', '_blank');
      if (necesitaPersistir) {
        const { error: upErr } = await sb
          .schema('dilesa')
          .from('ventas')
          .update({ valor_escrituracion: valorNum })
          .eq('id', venta.id);
        if (upErr) {
          win?.close();
          toast.add({
            title: 'No se pudo guardar el precio antes de imprimir',
            description: getSupabaseErrorMessage(upErr, 'Intenta de nuevo.'),
            type: 'error',
          });
          return;
        }
        setVenta((v) => (v ? { ...v, valor_escrituracion: valorNum } : v));
      }
      if (win) win.location.href = url;
      else window.location.href = url; // popup bloqueado: dispara la descarga aquí
    },
    [venta, valorEscrituracion, me, sb, toast]
  );

  // Gate de Dirección (ADR-048): solo Dirección (o admin) cuadra y cierra la
  // fase. Gerencia sube el dictamen + pre-llena, pero el cierre lo hace Dirección.
  const esDireccion =
    !!me?.isAdmin || (venta != null && (me?.direccionEmpresaIds ?? []).includes(venta.empresa_id));
  // Cuadratura desde el motor (resumen del shell).
  const cuadratura = resumen.status === 'ready' ? resumen.props.cuadratura : null;
  const cobGastos = cuadratura?.coberturaGastos ?? null;

  // Saldo residual de precio (iniciativa dilesa-saldos-residuales): cuando el
  // precio queda con un residual real (> tolerancia), Dirección decide explícito
  // cobrarlo (pagaré) o absorberlo (nota de crédito). El gate del cierre lo exige.
  // El monto absorbido ya cae en la NC derivada; esto registra decisión + rastro.
  const requiereResolucionSaldo = cuadratura?.requiereResolucionSaldoResidual ?? false;
  const saldoResidualMonto = cuadratura?.saldoPrecioPorCubrir ?? 0;
  const resolucionSaldo = venta?.saldo_residual_resolucion ?? null;

  // Crédito directo (pagaré): cubre el faltante de GASTOS y, si Dirección eligió
  // "Cobrar", también el residual de PRECIO (S2 — un solo pagaré; el motor lo asigna
  // gastos-primero). `saldoCD` = lo que el cliente debe financiar; el captura se
  // muestra por faltante de gastos o porque se eligió cobrar el residual.
  const saldoGastosPagare = cobGastos ? cobGastos.pagareNecesario : 0;
  const saldoCD = saldoGastosPagare + (resolucionSaldo === 'cobrar' ? saldoResidualMonto : 0);
  const aplicaCD = saldoGastosPagare > 0.0049 || resolucionSaldo === 'cobrar';
  const resolverSaldo = useCallback(
    async (tipo: 'cobrar' | 'absorber') => {
      if (!venta) return;
      const esDir = !!me?.isAdmin || (me?.direccionEmpresaIds ?? []).includes(venta.empresa_id);
      if (!esDir) {
        toast.add({
          title: 'Solo Dirección resuelve el saldo',
          description: 'El cierre financiero lo controla Dirección.',
          type: 'error',
        });
        return;
      }
      const monto =
        resumen.status === 'ready' ? (resumen.props.cuadratura.saldoPrecioPorCubrir ?? 0) : 0;
      const montoR = Math.round(monto * 100) / 100;
      setResolviendoSaldo(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;
      const at = new Date().toISOString();
      const { error: upErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .update({
          saldo_residual_resolucion: tipo,
          saldo_residual_monto: montoR,
          saldo_residual_autorizado_por: userId,
          saldo_residual_at: at,
        })
        .eq('id', venta.id);
      setResolviendoSaldo(false);
      if (upErr) {
        toast.add({
          title: 'No se pudo guardar la resolución',
          description: getSupabaseErrorMessage(upErr, 'Error desconocido.'),
          type: 'error',
        });
        return;
      }
      setVenta((v) =>
        v
          ? {
              ...v,
              saldo_residual_resolucion: tipo,
              saldo_residual_monto: montoR,
              saldo_residual_autorizado_por: userId,
              saldo_residual_at: at,
            }
          : v
      );
      toast.add({
        title:
          tipo === 'absorber' ? 'Saldo absorbido (nota de crédito)' : 'Saldo marcado por cobrar',
        description:
          tipo === 'absorber'
            ? `DILESA absorbe ${money2(montoR)}. Ya puedes cerrar la dictaminación.`
            : `${money2(montoR)} quedan por cobrar al cliente (pagaré). Ya puedes cerrar la dictaminación.`,
        type: 'success',
      });
    },
    [venta, me, resumen, sb, toast]
  );

  // Pagaré firmado (decisión Beto 2026-06-24): se recaba en la dictaminación, no
  // en la firma. Obligatorio para cerrar la fase cuando hay crédito directo (el
  // gate vive en onSubmit). Reusado en ambos forms (cierre y "ya cerrada") para
  // que las ventas ya dictaminadas también puedan subirlo.
  const pagareFirmadoSection = aplicaCD ? (
    <Section title="Pagaré firmado">
      <p className="mb-3 text-xs text-[var(--text)]/60">
        Imprime el pagaré del crédito directo (sección de arriba), recábalo firmado por el cliente y
        súbelo aquí. Es obligatorio para cerrar la dictaminación.
      </p>
      <DocsFaseSection state={docsPagare} titulo="Pagaré firmado" />
    </Section>
  ) : null;

  // Resolución del saldo residual de precio (iniciativa dilesa-saldos-residuales):
  // Dirección decide cobrarlo (pagaré) o absorberlo (nota de crédito). Reusada en
  // ambos forms (cierre y "ya cerrada") para que las ya dictaminadas también lo
  // resuelvan. El gate del cierre la exige; la NC sigue derivada.
  const saldoResidualSection = requiereResolucionSaldo ? (
    <Section title="Resolver saldo del cliente">
      <p className="mb-3 text-xs text-[var(--text)]/60">
        Queda un saldo de <strong>{money2(saldoResidualMonto)}</strong> en el precio que el crédito
        y el enganche no cubren. Dirección lo resuelve para cerrar la dictaminación:{' '}
        <strong>absorberlo</strong> (nota de crédito de DILESA — ya entra al descuento; la NC se
        emite al facturar) o <strong>cobrarlo</strong> (el cliente lo paga con pagaré).
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant={resolucionSaldo === 'absorber' ? 'default' : 'outline'}
          onClick={() => resolverSaldo('absorber')}
          disabled={resolviendoSaldo || !esDireccion}
        >
          {resolviendoSaldo ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Absorber con nota de crédito
        </Button>
        <Button
          type="button"
          variant={resolucionSaldo === 'cobrar' ? 'default' : 'outline'}
          onClick={() => resolverSaldo('cobrar')}
          disabled={resolviendoSaldo || !esDireccion}
        >
          {resolviendoSaldo ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Cobrar con pagaré
        </Button>
      </div>
      {resolucionSaldo ? (
        <p className="mt-3 text-[11px] text-emerald-700 dark:text-emerald-300">
          {resolucionSaldo === 'absorber'
            ? `Absorbido por DILESA (nota de crédito) por ${money2(venta?.saldo_residual_monto)}.`
            : `Por cobrar al cliente (pagaré) por ${money2(venta?.saldo_residual_monto)}. Configura el crédito directo abajo y sube el pagaré firmado para cerrar.`}
        </p>
      ) : (
        <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">
          Elige una opción para poder cerrar la dictaminación.
        </p>
      )}
      {!esDireccion ? (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          Solo Dirección resuelve el saldo.
        </p>
      ) : null}
    </Section>
  ) : null;

  // Re-firma de documentos (ADR-048 D5): el precio dictaminado capturado difiere
  // del que tienen los documentos firmados vigentes → hay que re-firmar Solicitud
  // + Promesa antes de avanzar. El snapshot se actualiza al confirmar la re-firma.
  const valorEscrNum = Number(valorEscrituracion) || 0;
  const precioDocs = venta?.precio_documentos_firmados ?? null;
  const precioCambio =
    valorEscrNum > 0 && precioDocs != null && Math.abs(valorEscrNum - precioDocs) > 0.5;
  // Anexo B obligatorio en créditos Infonavit (Beto 2026-06-23, de aquí en adelante).
  const esInfonavitVenta = (venta?.tipo_credito ?? '').toLowerCase().includes('infonavit');

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
        <CapturarFaseHeader faseposicion={8} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  // Re-firma de documentos (ADR-048 D5): solo cuando el precio dictaminado difiere
  // del de los documentos firmados. Se reusa en ambos forms (cierre y "ya cerrada").
  // Cada documento del precio nuevo ya está vigente cuando su `refirma_precio` casa
  // con el valor capturado — independiente de quién lo subió (típico: Gerencia).
  const refirmaOkDe = (rol: string): boolean => {
    const rp = refirmaPrecioDe(docsRefirma?.[rol]);
    return rp != null && valorEscrNum > 0 && Math.abs(rp - valorEscrNum) <= 0.5;
  };
  const refirmaCompleta = REFIRMA_ROLES.every((rol) => refirmaOkDe(rol));
  const refirmaSection = precioCambio ? (
    <Section title="Re-firma de documentos requerida">
      <div className="mb-3 rounded-md border border-amber-400/40 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        El precio cambió de <strong>{money(precioDocs ?? 0)}</strong> a{' '}
        <strong>{money(valorEscrNum)}</strong>. La Solicitud de Asignación y la Promesa de
        Compraventa firmadas quedaron desactualizadas — re-fírmalas con el precio nuevo antes de
        avanzar la fase.
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void imprimirRefirma('solicitud-asignacion')}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40"
        >
          <Upload className="h-3.5 w-3.5" /> Imprimir Solicitud (precio nuevo)
        </button>
        <button
          type="button"
          onClick={() => void imprimirRefirma('promesa-compraventa')}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40"
        >
          <Upload className="h-3.5 w-3.5" /> Imprimir Promesa (precio nuevo)
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REFIRMA_ROLES.map((rol) => (
          <RefirmaDocSlot
            key={rol}
            label={`${REFIRMA_LABEL[rol]} *`}
            estado={docsRefirma?.[rol]}
            delPrecioNuevo={refirmaOkDe(rol)}
            subiendo={subiendoRefirma === rol}
            deshabilitado={subiendoRefirma != null && subiendoRefirma !== rol}
            onPick={(f) => void onSubirRefirma(rol, f)}
          />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[var(--text)]/55">
        Cada documento se guarda al subirlo y queda en el expediente —{' '}
        <strong>lo puede cargar Gerencia</strong> sin esperar a Dirección. Cuando los dos del precio
        nuevo estén arriba, <strong>Dirección confirma</strong> para registrar el cambio y avanzar.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={confirmarRefirma}
          disabled={confirmandoRefirma || !esDireccion || !refirmaCompleta}
        >
          {confirmandoRefirma ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Confirmando…
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" /> Confirmar re-firma
            </>
          )}
        </Button>
        {!esDireccion ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            Solo Dirección confirma la re-firma. Gerencia ya puede subir los documentos arriba.
          </span>
        ) : !refirmaCompleta ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            Sube los 2 documentos firmados con el precio nuevo para confirmar.
          </span>
        ) : null}
      </div>
    </Section>
  ) : null;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={8}
        descripcion="Captura manual del dictamen (cuando el notario no usa el magic link del email)."
      />

      {yaCerrada ? (
        <>
          <Banner
            tone="success"
            title="Fase 8 ya está cerrada"
            body="La Carta de Instrucción ya está capturada. Aquí puedes confirmar/actualizar los números de crédito y los gastos de escrituración (útil si el notario cerró la fase desde el enlace del correo)."
          />
          <form onSubmit={onActualizarDatos} className="mt-4 space-y-6">
            <Section title="Condiciones Financieras (Anexo B)">
              <FileSlot
                label="Condiciones Financieras Definitivas (opcional)"
                archivo={archivoCondiciones}
                onChange={(f) => {
                  setArchivoCondiciones(f);
                  if (f) void analizarArchivo(f);
                }}
              />
              <Hint>
                Al subirlo se analiza automáticamente y se precargan los datos del crédito — revisa
                y guarda. Si el crédito no es Infonavit y no hay anexo, captura manual.
              </Hint>
            </Section>

            <PanelAnalisis analizando={analizando} verif={verif} extracciones={extracciones} />

            <Section title="Datos del crédito y escrituración">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Valor de Escrituración">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valorEscrituracion}
                    onChange={(e) => setValorEscrituracion(e.target.value)}
                    placeholder="0"
                  />
                  <Hint>{money(Number(valorEscrituracion) || 0)} — precio de compra-venta</Hint>
                </Field>
                <Field label="Monto Crédito Titular">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={montoTitular}
                    onChange={(e) => setMontoTitular(e.target.value)}
                    placeholder="0"
                  />
                  <Hint>{money(Number(montoTitular) || 0)}</Hint>
                </Field>
                <Field label="Monto Crédito Co-Titular">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={montoCotitular}
                    onChange={(e) => setMontoCotitular(e.target.value)}
                    placeholder="0"
                  />
                  <Hint>{money(Number(montoCotitular) || 0)}</Hint>
                </Field>
                <Field label="Número de Crédito Titular e Institución">
                  <Input
                    value={creditoTitularRef}
                    onChange={(e) => setCreditoTitularRef(e.target.value)}
                    placeholder="Ej. Infonavit 1234567890"
                  />
                </Field>
                <Field label="Número de Crédito Co-Titular e Institución">
                  <Input
                    value={creditoCotitularRef}
                    onChange={(e) => setCreditoCotitularRef(e.target.value)}
                    placeholder="Si no hay co-titular, déjalo en blanco"
                  />
                </Field>
                <Field label="Gastos de Escrituración">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={gastosEscrituracion}
                    onChange={(e) => setGastosEscrituracion(e.target.value)}
                    placeholder="0"
                  />
                  <Hint>{money(Number(gastosEscrituracion) || 0)}</Hint>
                </Field>
              </div>
            </Section>

            {/* Cuadratura + crédito directo también con la fase ya cerrada
                (ADR-048): Dirección cuadra el pagaré con los datos reales del
                dictamen. El crédito directo se guarda aparte (su propio botón). */}
            {cuadratura ? (
              <Section title="Cuadratura de la operación">
                <CuadraturaPanel
                  cuadratura={cuadratura}
                  valorEscrituracion={Number(valorEscrituracion) || venta.valor_escrituracion}
                  chequeCapturado={false}
                  hayFacturaCfdi={false}
                  saldoResidual={{
                    resolucion: venta.saldo_residual_resolucion,
                    monto: venta.saldo_residual_monto,
                  }}
                />
              </Section>
            ) : null}

            {saldoResidualSection}

            {aplicaCD ? (
              <Section title="Crédito directo (DILESA financia el saldo)">
                <CreditoDirectoCaptura
                  ventaId={venta.id}
                  saldo={saldoCD}
                  inicial={{
                    monto: venta.monto_credito_directo,
                    plan: venta.cd_plan_pagos,
                    tiie: venta.cd_tiie28_pct,
                    spread: venta.cd_spread_ordinario_pct,
                    fechaSuscripcion: venta.cd_fecha_suscripcion,
                    avalNombre: venta.cd_aval_nombre,
                    avalDomicilio: venta.cd_aval_domicilio,
                  }}
                  onGuardadoChange={setCdGuardado}
                  canWrite={esDireccion}
                />
              </Section>
            ) : null}

            {pagareFirmadoSection}

            {refirmaSection}

            <div className="flex items-center justify-end gap-3">
              {!esDireccion ? (
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  Solo Dirección modifica la dictaminación.
                </span>
              ) : null}
              <Link
                href={`/dilesa/ventas/${venta.id}`}
                className="text-sm text-muted-foreground hover:text-[var(--text)]"
              >
                Volver al detalle
              </Link>
              <Button type="submit" disabled={submitting || !esDireccion}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 size-4" /> Actualizar datos
                  </>
                )}
              </Button>
            </div>
          </form>
        </>
      ) : !fase7Cerrada ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 7 (Dictamen Solicitado)"
          body={
            <>
              Antes de capturar el dictamen, asegúrate de haber enviado la solicitud al notario.
              Vuelve al detalle y captura la Fase 7 primero.
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
              <span className="font-medium text-[var(--text)]/80">Notaría:</span> {notarioNombre}
            </div>
          ) : null}

          <Section title="Documentos del notario">
            <div className="space-y-3">
              <FileSlot
                label="Carta de Instrucción firmada por el notario *"
                archivo={archivo}
                onChange={(f) => {
                  setArchivo(f);
                  if (f) void analizarArchivo(f);
                }}
              />
              <FileSlot
                label={
                  esInfonavitVenta
                    ? 'Condiciones Financieras Definitivas — Anexo B *'
                    : 'Condiciones Financieras Definitivas — Anexo B (opcional)'
                }
                archivo={archivoCondiciones}
                onChange={(f) => {
                  setArchivoCondiciones(f);
                  if (f) void analizarArchivo(f);
                }}
              />
            </div>
            <Hint>
              Al seleccionar cada PDF se analiza automáticamente y se precargan los campos de abajo
              — revisa antes de guardar. Créditos no-Infonavit: se extrae lo que el documento
              traiga; lo demás se captura manual.
            </Hint>
          </Section>

          <PanelAnalisis analizando={analizando} verif={verif} extracciones={extracciones} />

          <Section title="Datos del dictamen">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fecha del dictamen *">
                <Input
                  type="date"
                  value={fechaDictamen}
                  onChange={(e) => setFechaDictamen(e.target.value)}
                  required
                />
              </Field>
              <Field label="Valor de Escrituración">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorEscrituracion}
                  onChange={(e) => setValorEscrituracion(e.target.value)}
                  placeholder="0"
                />
                <Hint>{money(Number(valorEscrituracion) || 0)} — precio de compra-venta</Hint>
              </Field>
              <Field label="Gastos de Escrituración">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={gastosEscrituracion}
                  onChange={(e) => setGastosEscrituracion(e.target.value)}
                  placeholder="0"
                />
                <Hint>{money(Number(gastosEscrituracion) || 0)} — los calcula el notario</Hint>
              </Field>
            </div>
          </Section>

          <Section title="Confirmar datos del crédito">
            <p className="mb-3 text-xs text-[var(--text)]/50">
              Acarreados de Inscrita (Fase 6). Confirma o corrige si el banco cambió algo.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Monto Crédito Titular">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={montoTitular}
                  onChange={(e) => setMontoTitular(e.target.value)}
                  placeholder="0"
                />
                <Hint>{money(Number(montoTitular) || 0)}</Hint>
              </Field>
              <Field label="Monto Crédito Co-Titular">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={montoCotitular}
                  onChange={(e) => setMontoCotitular(e.target.value)}
                  placeholder="0"
                />
                <Hint>{money(Number(montoCotitular) || 0)}</Hint>
              </Field>
              <Field label="Número de Crédito Titular e Institución">
                <Input
                  value={creditoTitularRef}
                  onChange={(e) => setCreditoTitularRef(e.target.value)}
                  placeholder="Ej. Infonavit 1234567890"
                />
              </Field>
              <Field label="Número de Crédito Co-Titular e Institución">
                <Input
                  value={creditoCotitularRef}
                  onChange={(e) => setCreditoCotitularRef(e.target.value)}
                  placeholder="Si no hay co-titular, déjalo en blanco"
                />
              </Field>
            </div>
          </Section>

          {/* Cuadratura completa (ADR-048): Dirección cuadra aquí, con los datos
              reales del dictamen. Refleja lo persistido — guarda los datos de
              arriba para que se recalcule. */}
          {cuadratura ? (
            <Section title="Cuadratura de la operación">
              <p className="mb-3 text-xs text-[var(--text)]/60">
                Con el crédito y los gastos del dictamen. Si ajustas algo arriba, ciérrala y vuelve
                a abrir para refrescar los números.
              </p>
              <CuadraturaPanel
                cuadratura={cuadratura}
                valorEscrituracion={Number(valorEscrituracion) || venta.valor_escrituracion}
                chequeCapturado={false}
                hayFacturaCfdi={false}
                saldoResidual={{
                  resolucion: venta.saldo_residual_resolucion,
                  monto: venta.saldo_residual_monto,
                }}
              />
            </Section>
          ) : null}

          {saldoResidualSection}

          {aplicaCD ? (
            <Section title="Crédito directo (DILESA financia el saldo)">
              <CreditoDirectoCaptura
                ventaId={venta.id}
                saldo={saldoCD}
                inicial={{
                  monto: venta.monto_credito_directo,
                  plan: venta.cd_plan_pagos,
                  tiie: venta.cd_tiie28_pct,
                  spread: venta.cd_spread_ordinario_pct,
                  fechaSuscripcion: venta.cd_fecha_suscripcion,
                  avalNombre: venta.cd_aval_nombre,
                  avalDomicilio: venta.cd_aval_domicilio,
                }}
                onGuardadoChange={setCdGuardado}
                canWrite={esDireccion}
              />
            </Section>
          ) : null}

          {pagareFirmadoSection}

          {refirmaSection}

          <div className="flex items-center justify-end gap-3">
            {!esDireccion ? (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                Solo Dirección cierra la dictaminación.
              </span>
            ) : null}
            <Link
              href={`/dilesa/ventas/${venta.id}`}
              className="text-sm text-muted-foreground hover:text-[var(--text)]"
            >
              Cancelar
            </Link>
            <Button type="submit" disabled={submitting || !esDireccion}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Save className="mr-2 size-4" /> Cuadrar y cerrar fase
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

/**
 * Resultado del análisis IA: chips de verificación cruzada contra la venta +
 * resumen de lo extraído. Solo informativo — los valores editables viven en
 * los campos del form (precargados).
 */
function PanelAnalisis({
  analizando,
  verif,
  extracciones,
}: {
  analizando: boolean;
  verif: Verificaciones | null;
  extracciones: Extraccion[];
}) {
  if (analizando) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--text)]/70">
        <Loader2 className="size-4 animate-spin" /> Analizando documento…
      </div>
    );
  }
  if (!verif || extracciones.length === 0) return null;

  const checks: Array<{ label: string; valor: boolean | null }> = [
    { label: 'NSS coincide con el cliente', valor: verif.nss_coincide },
    { label: 'Nombre coincide con el cliente', valor: verif.nombre_coincide },
    { label: 'Domicilio coincide con la unidad', valor: verif.domicilio_coincide },
    { label: 'CLABE de depósito es de DILESA', valor: verif.clabe_es_dilesa },
    { label: 'Vendedor es DILESA', valor: verif.vendedor_es_dilesa },
  ];
  const ultima = extracciones[extracciones.length - 1];
  const hayRojo = checks.some((c) => c.valor === false);

  return (
    <section
      className={`rounded-lg border p-4 ${
        hayRojo
          ? 'border-red-400/50 bg-red-50 dark:bg-red-950/20'
          : 'border-[var(--border)] bg-[var(--card)]'
      }`}
    >
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text)]/60">
        <Sparkles className="size-3.5" /> Análisis del documento
      </h3>
      <div className="flex flex-wrap gap-2">
        {checks.map((c) => (
          <span
            key={c.label}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
              c.valor === true
                ? 'border-emerald-400/50 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                : c.valor === false
                  ? 'border-red-400/60 bg-red-100 font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200'
                  : 'border-[var(--border)] text-[var(--text)]/45'
            }`}
          >
            {c.valor === true ? (
              <CheckCircle2 className="size-3" />
            ) : c.valor === false ? (
              <XCircle className="size-3" />
            ) : (
              <MinusCircle className="size-3" />
            )}
            {c.label}
          </span>
        ))}
      </div>
      {hayRojo ? (
        <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">
          ⚠ Hay datos del documento que NO coinciden con la venta — verifica antes de guardar.
        </p>
      ) : null}
      {ultima ? (
        <p className="mt-2 text-[11px] text-[var(--text)]/55">
          Último documento: {ultima.tipo_documento.replace('_', ' ')}
          {ultima.numero_credito ? ` · crédito ${ultima.numero_credito}` : ''}
          {ultima.banco_beneficiario ? ` · depósito vía ${ultima.banco_beneficiario}` : ''}
          {ultima.costo_avaluo > 0 ? ` · costo avalúo ${moneyFmt.format(ultima.costo_avaluo)}` : ''}
        </p>
      ) : null}
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

/**
 * Slot de re-firma con persistencia inmediata (ADR-048 D5): a diferencia de
 * `FileSlot` (File en memoria), muestra el documento YA en el expediente —
 * quién lo subió y cuándo — para que la carga de Gerencia sobreviva entre
 * sesiones. El check verde solo prende cuando el vigente es del precio NUEVO
 * (`delPrecioNuevo`); un documento del precio anterior se ve en ámbar y pide
 * re-subirse.
 */
function RefirmaDocSlot({
  label,
  estado,
  delPrecioNuevo,
  subiendo,
  deshabilitado,
  onPick,
}: {
  label: string;
  estado: DocRolEstado | undefined;
  delPrecioNuevo: boolean;
  subiendo: boolean;
  deshabilitado: boolean;
  onPick: (f: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const doc = estado?.vigente;
  const bloqueado = subiendo || deshabilitado;

  const aceptar = (f: File | undefined) => {
    if (!f || bloqueado) return;
    const nombre = f.name.toLowerCase();
    if (!(f.type === 'application/pdf' || f.type.startsWith('image/') || nombre.endsWith('.pdf'))) {
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
        {delPrecioNuevo ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle
            className={`h-4 w-4 shrink-0 ${doc ? 'text-amber-500' : 'text-[var(--text)]/35'}`}
          />
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
          {doc ? (
            <p className="truncate text-xs text-[var(--text)]/60">
              <span className="font-mono">{doc.nombre}</span>
              {' · '}
              {doc.subidoPorNombre ? `Subió ${doc.subidoPorNombre}` : 'Subido'} ·{' '}
              {fmtMomentoRefirma(doc.subidoAt)}
              {!delPrecioNuevo ? (
                <span className="ml-1 font-medium text-amber-700 dark:text-amber-300">
                  · del precio anterior, vuelve a subir
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-xs text-[var(--text)]/45">Sin documento del precio nuevo.</p>
          )}
        </div>
      </div>
      <label
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium ${
          bloqueado
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
            {doc ? 'Cambiar' : 'Subir PDF'}
          </>
        )}
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          disabled={bloqueado}
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

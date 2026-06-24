'use client';

/**
 * Captura Fase 8 — Dictaminar (cierre financiero, ADR-048).
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
 * Enforcement: Fase 7 (Solicitar dictamen) debe estar cerrada.
 *
 * Acceso: `dilesa.ventas.fase08_dictaminada` (Gerencia Ventas + Dirección).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, MinusCircle, Save, Sparkles, Upload, XCircle } from 'lucide-react';
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

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  // El crédito directo (pagaré) reporta su estado "guardado" para el gate del
  // cierre de la fase cuando hay saldo.
  const [cdGuardado, setCdGuardado] = useState(false);
  // Re-firma de documentos (ADR-048 D5): los 2 PDF firmados que sube el gerente
  // cuando el precio dictaminado cambió respecto al de los documentos firmados.
  const [archivoSolicitudRef, setArchivoSolicitudRef] = useState<File | null>(null);
  const [archivoPromesaRef, setArchivoPromesaRef] = useState<File | null>(null);
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
          'id, empresa_id, persona_id, unidad_id, notario_id, tipo_credito, credito_titular_ref, credito_cotitular_ref, monto_credito_titular, monto_credito_cotitular, gastos_escrituracion, valor_escrituracion, precio_asignacion, precio_documentos_firmados, monto_credito_directo, cd_plan_pagos, cd_tiie28_pct, cd_spread_ordinario_pct, cd_fecha_suscripcion, cd_aval_nombre, cd_aval_domicilio'
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
      // Si la cuadratura arroja un saldo, el crédito directo (pagaré) debe estar
      // guardado antes de cerrar — se captura aquí, con el saldo real del Anexo B.
      const cob = resumen.status === 'ready' ? resumen.props.cuadratura.coberturaGastos : null;
      if (cob && cob.pagareNecesario > 0.0049 && !cdGuardado) {
        toast.add({
          title: 'Falta configurar el crédito directo',
          description:
            'Hay un saldo por cubrir. Guarda el crédito directo (pagaré) antes de cerrar la fase.',
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

  // Re-firma de documentos (ADR-048 D5): sube los 2 documentos firmados nuevos,
  // marca los anteriores como sustituidos (no se borran — auditoría LFPIORPI) y
  // actualiza el snapshot al precio dictaminado para que no se vuelva a pedir.
  const confirmarRefirma = useCallback(async () => {
    if (!venta) return;
    const valorNum = Number(valorEscrituracion) || 0;
    if (valorNum <= 0) return;
    if (!archivoSolicitudRef || !archivoPromesaRef) {
      toast.add({
        title: 'Faltan los documentos firmados',
        description: 'Sube la Solicitud de Asignación y la Promesa de Compraventa firmadas.',
        type: 'error',
      });
      return;
    }
    setConfirmandoRefirma(true);
    const { data: userRes } = await sb.auth.getUser();
    const userId = userRes?.user?.id ?? null;

    // 1. Documentos vigentes (no sustituidos) de estos 2 roles = los que se reemplazan.
    const { data: vigentes } = await sb
      .schema('erp')
      .from('adjuntos')
      .select('id')
      .eq('entidad_tipo', 'venta')
      .eq('entidad_id', venta.id)
      .in('rol', ['solicitud_asignacion', 'contrato_promesa'])
      .is('sustituido_at', null);
    const idsViejos = (vigentes ?? []).map((a) => a.id as string);

    // 2. Subir los 2 documentos nuevos.
    const subir = async (archivo: File, rol: string): Promise<boolean> => {
      const path = buildAdjuntoPath({
        empresa: 'dilesa',
        entidad: 'ventas',
        entidadId: venta.id,
        filename: archivo.name,
      });
      const { error: upErr } = await sb.storage
        .from('adjuntos')
        .upload(path, archivo, { contentType: archivo.type || 'application/pdf', upsert: false });
      if (upErr) return false;
      const { error: insErr } = await sb
        .schema('erp')
        .from('adjuntos')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          entidad_tipo: 'venta',
          entidad_id: venta.id,
          rol,
          nombre: archivo.name,
          url: path,
          tipo_mime: archivo.type || null,
          tamano_bytes: archivo.size,
          uploaded_by: userId,
        });
      return !insErr;
    };
    const okS = await subir(archivoSolicitudRef, 'solicitud_asignacion');
    const okP = await subir(archivoPromesaRef, 'contrato_promesa');
    if (!okS || !okP) {
      setConfirmandoRefirma(false);
      toast.add({
        title: 'No se pudieron subir los documentos',
        description: 'Intenta de nuevo.',
        type: 'error',
      });
      return;
    }

    // 3. Marcar los anteriores como sustituidos (siguen en el expediente).
    if (idsViejos.length > 0) {
      await sb
        .schema('erp')
        .from('adjuntos')
        .update({ sustituido_at: new Date().toISOString() })
        .in('id', idsViejos);
    }

    // 4. Snapshot = precio dictaminado (cierra la re-firma) + persiste el valor.
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
    setArchivoSolicitudRef(null);
    setArchivoPromesaRef(null);
    toast.add({
      title: 'Re-firma confirmada',
      description: 'Documentos actualizados con el precio nuevo. Ya puedes avanzar la fase.',
      type: 'success',
    });
  }, [archivoPromesaRef, archivoSolicitudRef, sb, toast, valorEscrituracion, venta]);

  // Gate de Dirección (ADR-048): solo Dirección (o admin) cuadra y cierra la
  // fase. Gerencia sube el dictamen + pre-llena, pero el cierre lo hace Dirección.
  const esDireccion =
    !!me?.isAdmin || (venta != null && (me?.direccionEmpresaIds ?? []).includes(venta.empresa_id));
  // Cuadratura + saldo del pagaré desde el motor (resumen del shell). El saldo es
  // el faltante de gastos que cubre el crédito directo (igual que en la fase 10).
  const cuadratura = resumen.status === 'ready' ? resumen.props.cuadratura : null;
  const cobGastos = cuadratura?.coberturaGastos ?? null;
  const saldoCD = cobGastos ? cobGastos.pagareNecesario : 0;
  const aplicaCD = saldoCD > 0.0049;

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
  const refirmaSection = precioCambio ? (
    <Section title="Re-firma de documentos requerida">
      <div className="mb-3 rounded-md border border-amber-400/40 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        El precio cambió de <strong>{money(precioDocs ?? 0)}</strong> a{' '}
        <strong>{money(valorEscrNum)}</strong>. La Solicitud de Asignación y la Promesa de
        Compraventa firmadas quedaron desactualizadas — re-fírmalas con el precio nuevo antes de
        avanzar la fase.
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href={`/api/dilesa/ventas/${venta.id}/pdf/solicitud-asignacion`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40"
        >
          <Upload className="h-3.5 w-3.5" /> Imprimir Solicitud (precio nuevo)
        </a>
        <a
          href={`/api/dilesa/ventas/${venta.id}/pdf/promesa-compraventa`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40"
        >
          <Upload className="h-3.5 w-3.5" /> Imprimir Promesa (precio nuevo)
        </a>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FileSlot
          label="Solicitud de Asignación firmada *"
          archivo={archivoSolicitudRef}
          onChange={setArchivoSolicitudRef}
        />
        <FileSlot
          label="Promesa de Compraventa firmada *"
          archivo={archivoPromesaRef}
          onChange={setArchivoPromesaRef}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={confirmarRefirma}
          disabled={
            confirmandoRefirma || !esDireccion || !archivoSolicitudRef || !archivoPromesaRef
          }
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
            Solo Dirección confirma la re-firma.
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
                />
              </Section>
            ) : null}

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
          title="Falta cerrar Fase 7 (Solicitar dictamen)"
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
              Acarreados de Inscribir crédito (Fase 6). Confirma o corrige si el banco cambió algo.
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
              />
            </Section>
          ) : null}

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

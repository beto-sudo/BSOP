'use client';

/**
 * Captura Fase 10 — Firmas Programadas (Sprint 7h).
 *
 * Gerencia Ventas (o Dirección) programa la fecha + hora de firma ya
 * acordada con el notario (el notario viene de Fase 7). Se listan y
 * totalizan los depósitos del cliente (CxC `erp.cxc_pagos`) como
 * referencia de cobertura.
 *
 * PR2 — Crédito directo: si crédito institución + depósitos < precio, DILESA
 * puede financiar el saldo. Se configura el monto + plan de pagos + tasas y
 * se genera el Pagaré PDF para imprimir, firmar y subir.
 *
 * Tasas (regla Beto 2026-06-11): interés ORDINARIO = TIIE 28d + spread
 * (mínimo 4 puntos); interés MORATORIO = 3× el ordinario. Ambos se derivan
 * aquí y se persisten como snapshot pactado de la venta.
 *
 * Captura:
 *   - `fecha_firma_programada` + `hora_firma_programada`
 *   - Crédito directo (si aplica): monto, plan de pagos (jsonb), tasas, aval.
 *   - Doc opcional: pagaré firmado (rol `pagare`, el mismo que reconoce la fase
 *     Escriturada y `rolesOpcionales` — así el pagaré subido aquí aparece como
 *     cargado en el pipeline y no se pide de nuevo).
 *
 * Enforcement: Fase 9 (Validación Patronal) cerrada. Si hay saldo, el crédito
 * directo debe estar configurado para cerrar la fase.
 * Acceso: `dilesa.ventas.fase10_firmas_programadas`.
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Download, Loader2, Lock, Plus, Save, Trash2 } from 'lucide-react';
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

const SLOTS_FASE: SlotColaborativo[] = [
  {
    rol: 'pagare',
    label: 'Pagaré firmado (súbelo cuando lo tengas)',
    requerido: false,
  },
];
import { desglosarPagare } from '@/lib/dilesa/pagare-interes';
import { getNotaria } from '@/lib/dilesa/notarios';
import { useVentaCapturaResumen } from '@/components/dilesa/venta-detalle/captura-shell';

type PlanPagoJson = { num?: number; fecha?: string; monto?: number };

type VentaCtx = {
  id: string;
  empresa_id: string;
  persona_id: string;
  unidad_id: string | null;
  precio_asignacion: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  notario_id: string | null;
  fecha_firma_programada: string | null;
  hora_firma_programada: string | null;
  poliza_garantia_expedida_at: string | null;
  monto_credito_directo: number | null;
  cd_plan_pagos: PlanPagoJson[] | null;
  cd_tiie28_pct: number | null;
  cd_spread_ordinario_pct: number | null;
  cd_interes_ordinario_pct: number | null;
  cd_fecha_suscripcion: string | null;
  cd_aval_nombre: string | null;
  cd_aval_domicilio: string | null;
};

type Deposito = {
  id: string;
  fecha: string | null;
  monto_total: number | null;
  forma_pago: string | null;
  referencia: string | null;
};

type PlanRow = { fecha: string; monto: string };

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));
const hoy = () => new Date().toISOString().slice(0, 10);

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
  const [depositos, setDepositos] = useState<Deposito[]>([]);
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

  // ── Crédito directo ──
  const [montoCD, setMontoCD] = useState<string>('');
  const [planPagos, setPlanPagos] = useState<PlanRow[]>([]);
  const [fechaSuscripcion, setFechaSuscripcion] = useState<string>(hoy());
  const [tiie, setTiie] = useState<string>('');
  const [spread, setSpread] = useState<string>('4');
  const [avalNombre, setAvalNombre] = useState<string>('');
  const [avalDomicilio, setAvalDomicilio] = useState<string>('');
  const [cdGuardado, setCdGuardado] = useState<boolean>(false);
  const [savingCD, setSavingCD] = useState<boolean>(false);

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
          'id, empresa_id, persona_id, unidad_id, precio_asignacion, monto_credito_titular, monto_credito_cotitular, notario_id, fecha_firma_programada, hora_firma_programada, poliza_garantia_expedida_at, monto_credito_directo, cd_plan_pagos, cd_tiie28_pct, cd_spread_ordinario_pct, cd_interes_ordinario_pct, cd_fecha_suscripcion, cd_aval_nombre, cd_aval_domicilio'
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

      const [fRes, nRes, dRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', v.id)
          .is('deleted_at', null),
        // Notaría desde el catálogo de proveedores (categoria='notaria').
        v.notario_id ? getNotaria(sb, v.notario_id) : Promise.resolve(null),
        sb
          .schema('erp')
          .from('cxc_pagos')
          .select('id, fecha, monto_total, forma_pago, referencia')
          .eq('origen_tipo', 'venta_dilesa')
          .eq('origen_id', v.id)
          .is('deleted_at', null)
          .order('fecha', { ascending: true }),
      ]);
      if (!activo) return;

      if (nRes) {
        setNotarioNombre(
          nRes.numeroNotaria ? `Notaría ${nRes.numeroNotaria} — ${nRes.nombre}` : nRes.nombre
        );
      }
      const deps = (dRes.data ?? []) as unknown as Deposito[];
      setDepositos(deps);
      const posiciones = (fRes.data ?? []).map((f) => f.posicion as number);
      setFase9Cerrada(posiciones.includes(9));
      setYaCerrada(posiciones.includes(10));

      // Prefill del crédito directo persistido. El default (cuando aún no se
      // captura) se llena desde el motor de cuadratura en un efecto aparte: el
      // pagaré cubre el faltante de GASTOS (no el saldo de precio, que el crédito
      // institución ya cubre).
      if (v.monto_credito_directo != null) {
        setMontoCD(String(v.monto_credito_directo));
        const plan = Array.isArray(v.cd_plan_pagos) ? v.cd_plan_pagos : [];
        setPlanPagos(
          plan.length > 0
            ? plan.map((p) => ({ fecha: p?.fecha ?? '', monto: String(p?.monto ?? '') }))
            : [{ fecha: '', monto: String(v.monto_credito_directo) }]
        );
        setCdGuardado(true);
      }
      if (v.cd_tiie28_pct != null) setTiie(String(v.cd_tiie28_pct));
      if (v.cd_spread_ordinario_pct != null) setSpread(String(v.cd_spread_ordinario_pct));
      if (v.cd_fecha_suscripcion) setFechaSuscripcion(v.cd_fecha_suscripcion);
      if (v.cd_aval_nombre) setAvalNombre(v.cd_aval_nombre);
      if (v.cd_aval_domicilio) setAvalDomicilio(v.cd_aval_domicilio);

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  // ── Cobertura ────────────────────────────────────────────────────
  const totalDepositos = useMemo(
    () => depositos.reduce((s, d) => s + Number(d.monto_total ?? 0), 0),
    [depositos]
  );
  const creditoInstitucion =
    Number(venta?.monto_credito_titular ?? 0) + Number(venta?.monto_credito_cotitular ?? 0);
  const precio = Number(venta?.precio_asignacion ?? 0);
  const cobertura = creditoInstitucion + totalDepositos;
  const saldoPrecio = precio - cobertura;

  // El pagaré (crédito directo) cubre el faltante de GASTOS de escrituración —
  // NO el saldo de precio (el crédito institución cubre el precio). Con el
  // desglose poblado (ADR-045) el motor deriva ese pagaré
  // (gastos − apoyo − promoción − enganche − sobreprecio): MAYRA = 9,387 aunque
  // el precio esté sobre-cubierto por el crédito. Sin desglose (legacy) cae al
  // saldo de precio (comportamiento viejo).
  const resumen = useVentaCapturaResumen();
  const cobGastos = resumen.status === 'ready' ? resumen.props.cuadratura.coberturaGastos : null;
  const saldo = cobGastos ? cobGastos.pagareNecesario : saldoPrecio;
  const aplicaCD = saldo > 0.0049;

  // Default del monto del pagaré: el faltante que deriva el motor, una vez que
  // la cuadratura cargó y si aún no se capturó ni editó.
  const prefilledCD = useRef(false);
  useEffect(() => {
    if (prefilledCD.current || cdGuardado) return;
    if (venta?.monto_credito_directo != null) return;
    if (saldo <= 0.0049) return;
    prefilledCD.current = true;
    // Sincroniza el default del pagaré desde el motor una sola vez (guardado por
    // el ref), patrón de pre-fill desde dato async — igual que otras páginas DILESA.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setMontoCD(saldo.toFixed(2));
    setPlanPagos([{ fecha: '', monto: saldo.toFixed(2) }]);
  }, [saldo, cdGuardado, venta]);

  // ── Candado de la fecha de firma ─────────────────────────────────
  // Dirección/Admin (espejo de erp.fn_es_direccion) puede reprogramar aun
  // congelada; los demás roles la editan solo antes de expedir/cerrar.
  const esDireccion =
    !!me?.isAdmin || (venta != null && (me?.direccionEmpresaIds ?? []).includes(venta.empresa_id));
  const polizaExpedida = venta?.poliza_garantia_expedida_at != null || polizaImpresaLocal;
  const firmaCongelada = polizaExpedida || yaCerrada;
  const fechaBloqueada = firmaCongelada && !esDireccion;
  const tieneFechaPersistida = !!venta?.fecha_firma_programada;

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

  const sumaPlan = useMemo(
    () => planPagos.reduce((s, r) => s + (Number(r.monto) || 0), 0),
    [planPagos]
  );
  const montoCDNum = Number(montoCD) || 0;
  const planCuadra = Math.abs(sumaPlan - montoCDNum) < 0.01 && montoCDNum > 0;

  // Tasas derivadas (regla 2026-06-11): ordinario = TIIE + spread (mín. 4);
  // moratorio = 3× ordinario. Se persisten como snapshot al guardar.
  const tiieNum = Number(tiie) || 0;
  const spreadNum = Number(spread) || 0;
  const ordinarioPct = tiieNum > 0 ? Math.round((tiieNum + spreadNum) * 100) / 100 : 0;
  const moratorioPct = ordinarioPct > 0 ? Math.round(ordinarioPct * 3 * 100) / 100 : 0;
  const desglose = useMemo(() => {
    if (ordinarioPct <= 0) return null;
    const filas = planPagos.filter((r) => r.fecha && Number(r.monto) > 0);
    if (filas.length === 0) return null;
    return desglosarPagare(
      filas.map((r) => ({ fecha: r.fecha, monto: Number(r.monto) })),
      ordinarioPct,
      fechaSuscripcion || null
    );
  }, [planPagos, ordinarioPct, fechaSuscripcion]);

  // Cualquier edición del crédito directo invalida el "guardado" (hay que
  // re-guardar antes de generar el pagaré con datos frescos).
  const touchCD = useCallback(() => setCdGuardado(false), []);

  const setPlanRow = useCallback(
    (i: number, patch: Partial<PlanRow>) => {
      setPlanPagos((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
      touchCD();
    },
    [touchCD]
  );
  const addPlanRow = useCallback(() => {
    setPlanPagos((rows) => [...rows, { fecha: '', monto: '' }]);
    touchCD();
  }, [touchCD]);
  const removePlanRow = useCallback(
    (i: number) => {
      setPlanPagos((rows) => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));
      touchCD();
    },
    [touchCD]
  );

  const guardarCreditoDirecto = useCallback(async () => {
    if (!venta) return;
    if (montoCDNum <= 0) {
      toast.add({
        title: 'Monto inválido',
        description: 'Captura el monto del crédito directo.',
        type: 'error',
      });
      return;
    }
    if (planPagos.some((r) => !r.fecha || !(Number(r.monto) > 0))) {
      toast.add({
        title: 'Plan de pagos incompleto',
        description: 'Cada pago necesita fecha y monto mayor a cero.',
        type: 'error',
      });
      return;
    }
    if (!(tiieNum > 0)) {
      toast.add({
        title: 'Falta la TIIE',
        description: 'Captura la TIIE a 28 días vigente — el interés ordinario es TIIE + spread.',
        type: 'error',
      });
      return;
    }
    if (spreadNum < 4) {
      toast.add({
        title: 'Spread fuera de regla',
        description: 'El spread del interés ordinario es mínimo 4 puntos sobre la TIIE.',
        type: 'error',
      });
      return;
    }
    if (!planCuadra) {
      toast.add({
        title: 'El plan no cuadra',
        description: `La suma de los pagos (${money(sumaPlan)}) debe igualar el monto del crédito (${money(montoCDNum)}).`,
        type: 'error',
      });
      return;
    }
    setSavingCD(true);
    const planJson = planPagos.map((r, i) => ({
      num: i + 1,
      fecha: r.fecha,
      monto: Math.round((Number(r.monto) || 0) * 100) / 100,
    }));
    const { error: upErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({
        monto_credito_directo: Math.round(montoCDNum * 100) / 100,
        cd_plan_pagos: planJson,
        cd_tiie28_pct: tiieNum,
        cd_spread_ordinario_pct: spreadNum,
        cd_interes_ordinario_pct: ordinarioPct,
        cd_interes_moratorio_pct: moratorioPct,
        cd_fecha_suscripcion: fechaSuscripcion || null,
        cd_aval_nombre: avalNombre.trim() || null,
        cd_aval_domicilio: avalDomicilio.trim() || null,
      })
      .eq('id', venta.id);
    setSavingCD(false);
    if (upErr) {
      toast.add({
        title: 'No se pudo guardar el crédito directo',
        description: getSupabaseErrorMessage(upErr, 'Error desconocido.'),
        type: 'error',
      });
      return;
    }
    setCdGuardado(true);
    toast.add({
      title: 'Crédito directo guardado',
      description: 'Ya puedes generar el pagaré.',
      type: 'success',
    });
  }, [
    avalDomicilio,
    avalNombre,
    fechaSuscripcion,
    montoCDNum,
    moratorioPct,
    ordinarioPct,
    planCuadra,
    planPagos,
    sb,
    spreadNum,
    sumaPlan,
    tiieNum,
    toast,
    venta,
  ]);

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
      if (aplicaCD && !cdGuardado) {
        toast.add({
          title: 'Falta configurar el crédito directo',
          description:
            'Hay un saldo por cubrir. Configura y guarda el crédito directo antes de cerrar la fase.',
          type: 'error',
        });
        return;
      }

      setSubmitting(true);
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const result = await marcarFase(sb, {
        ventaId: venta.id,
        faseNombre: 'Firmas Programadas',
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
    [aplicaCD, cdGuardado, fechaBloqueada, fechaFirma, horaFirma, router, sb, toast, venta]
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
        <CapturarFaseHeader faseposicion={10} faseNombre="Firmas Programadas" />
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

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={10}
        faseNombre="Firmas Programadas"
        descripcion="Programa la fecha y hora de firma acordada con el notario. Genera la Póliza de Garantía y, si hay saldo, el crédito directo con su pagaré."
      />

      {yaCerrada ? (
        <div className="space-y-6">
          <Banner
            tone="success"
            title="Fase 10 ya está cerrada"
            body={
              fechaFirmaLabel
                ? `Firma programada para el ${fechaFirmaLabel}. La siguiente fase es Escriturada.`
                : 'Esta venta ya tiene la firma programada. La siguiente fase es Escriturada.'
            }
          />

          <Section title="Documento para el notario">
            <p className="text-sm text-[var(--text)]/70">
              La <span className="font-medium">Póliza de Garantía</span> sale con la fecha de la
              firma. Vuelve a generarla cuando la necesites — saldrá con la misma fecha.
            </p>
            {polizaButton}
          </Section>

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

          <Section title="Depósitos del cliente (referencia de cobertura)">
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
                      <th className="px-3 py-1.5 font-medium">Forma de pago</th>
                      <th className="px-3 py-1.5 font-medium">Referencia</th>
                      <th className="px-3 py-1.5 text-right font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositos.map((d) => (
                      <tr key={d.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-1.5">{d.fecha ?? '—'}</td>
                        <td className="px-3 py-1.5">{d.forma_pago ?? '—'}</td>
                        <td className="px-3 py-1.5 text-[var(--text)]/70">{d.referencia ?? '—'}</td>
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

            <div className="mt-4 space-y-1 rounded-md border border-[var(--border)] bg-[var(--bg)]/20 p-3 text-sm">
              {cobGastos ? (
                // Desglose (ADR-045): el crédito cubre el precio; el pagaré cubre
                // el faltante de GASTOS de escrituración tras las demás fuentes.
                <>
                  <CoberturaRow
                    label="Presupuesto notarial (neto de apoyo)"
                    value={money(cobGastos.gastosNetos)}
                  />
                  <CoberturaRow label="(−) Promoción DILESA" value={money(cobGastos.promocion)} />
                  <CoberturaRow
                    label="(−) Enganche del cliente"
                    value={money(cobGastos.engancheCliente)}
                  />
                  <CoberturaRow
                    label="(−) Sobreprecio (lo cubre el crédito)"
                    value={money(cobGastos.sobreprecio)}
                  />
                  <div className="my-1 border-t border-[var(--border)]" />
                  <CoberturaRow
                    label={aplicaCD ? '(=) Pagaré necesario del cliente' : '(=) Gastos cubiertos'}
                    value={money(saldo)}
                    strong
                    tone={aplicaCD ? 'warn' : 'ok'}
                  />
                </>
              ) : (
                <>
                  <CoberturaRow label="Precio de asignación" value={money(precio)} />
                  <CoberturaRow
                    label="Crédito institución (titular + co-titular)"
                    value={money(creditoInstitucion)}
                  />
                  <CoberturaRow label="Depósitos del cliente" value={money(totalDepositos)} />
                  <div className="my-1 border-t border-[var(--border)]" />
                  <CoberturaRow label="Cobertura total" value={money(cobertura)} />
                  <CoberturaRow
                    label={aplicaCD ? 'Saldo pendiente' : 'Saldo'}
                    value={money(saldo)}
                    strong
                    tone={aplicaCD ? 'warn' : 'ok'}
                  />
                </>
              )}
            </div>
          </Section>

          {aplicaCD ? (
            <Section title="Crédito directo (DILESA financia el saldo)">
              <p className="mb-3 text-xs text-[var(--text)]/60">
                Configura el monto y el plan de pagos, guarda, genera el pagaré, imprímelo y súbelo
                firmado.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Monto del crédito directo *">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={montoCD}
                    onChange={(e) => {
                      setMontoCD(e.target.value);
                      touchCD();
                    }}
                  />
                  <Hint>Saldo a cubrir: {money(saldo)}</Hint>
                </Field>
                <Field label="Fecha de suscripción del pagaré">
                  <Input
                    type="date"
                    value={fechaSuscripcion}
                    onChange={(e) => {
                      setFechaSuscripcion(e.target.value);
                      touchCD();
                    }}
                  />
                </Field>
              </div>

              {/* Plan de pagos */}
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                    Plan de pagos *
                  </span>
                  <button
                    type="button"
                    onClick={addPlanRow}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/80 hover:bg-[var(--bg)]/40"
                  >
                    <Plus className="h-3 w-3" /> Agregar pago
                  </button>
                </div>
                <div className="space-y-2">
                  {planPagos.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-xs text-[var(--text)]/50">{i + 1}.</span>
                      <Input
                        type="date"
                        value={r.fecha}
                        onChange={(e) => setPlanRow(i, { fecha: e.target.value })}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Monto"
                        value={r.monto}
                        onChange={(e) => setPlanRow(i, { monto: e.target.value })}
                        className="w-36"
                      />
                      <button
                        type="button"
                        onClick={() => removePlanRow(i)}
                        disabled={planPagos.length <= 1}
                        className="rounded-md p-1.5 text-[var(--text)]/50 hover:bg-[var(--bg)]/40 hover:text-red-500 disabled:opacity-30"
                        title="Quitar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <p
                  className={`mt-2 text-[11px] ${
                    planCuadra
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  Suma del plan (capital): {money(sumaPlan)} / {money(montoCDNum)}{' '}
                  {planCuadra
                    ? '✓ cuadra'
                    : '— debe igualar el monto del crédito; el interés ordinario se calcula aparte'}
                </p>

                {desglose ? (
                  <div className="mt-3 overflow-hidden rounded-md border border-[var(--border)]">
                    <div className="border-b border-[var(--border)] bg-[var(--bg)]/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text)]/60">
                      Desglose con interés ordinario ({ordinarioPct}% anual, saldos insolutos, año
                      de 360 días) — así saldrá en el pagaré
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[var(--text)]/50">
                          <th className="px-3 py-1 text-left font-medium">No.</th>
                          <th className="px-3 py-1 text-left font-medium">Vencimiento</th>
                          <th className="px-3 py-1 text-right font-medium">Capital</th>
                          <th className="px-3 py-1 text-right font-medium">Interés</th>
                          <th className="px-3 py-1 text-right font-medium">Pago total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {desglose.parcialidades.map((p) => (
                          <tr key={p.num} className="border-t border-[var(--border)]/60">
                            <td className="px-3 py-1">{p.num}</td>
                            <td className="px-3 py-1">
                              {p.fecha}
                              <span className="ml-1 text-[var(--text)]/40">({p.dias} días)</span>
                            </td>
                            <td className="px-3 py-1 text-right">{money(p.capital)}</td>
                            <td className="px-3 py-1 text-right">{money(p.interes)}</td>
                            <td className="px-3 py-1 text-right font-medium">{money(p.pago)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-[var(--border)] bg-[var(--bg)]/40 font-semibold">
                          <td className="px-3 py-1.5" colSpan={2}>
                            Total
                          </td>
                          <td className="px-3 py-1.5 text-right">{money(desglose.totalCapital)}</td>
                          <td className="px-3 py-1.5 text-right">{money(desglose.totalInteres)}</td>
                          <td className="px-3 py-1.5 text-right">{money(desglose.totalPagar)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              {/* Tasas: ordinario = TIIE + spread (mín. 4); moratorio = 3× ordinario */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="TIIE 28d (%) *">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tiie}
                    onChange={(e) => {
                      setTiie(e.target.value);
                      touchCD();
                    }}
                  />
                  <Hint>Tasa vigente a la suscripción</Hint>
                </Field>
                <Field label="Spread ordinario (puntos) *">
                  <Input
                    type="number"
                    step="0.01"
                    min="4"
                    value={spread}
                    onChange={(e) => {
                      setSpread(e.target.value);
                      touchCD();
                    }}
                  />
                  <Hint>Mínimo 4 sobre la TIIE, editable a más</Hint>
                </Field>
              </div>
              {ordinarioPct > 0 ? (
                <p className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2 text-[11px] text-[var(--text)]/70">
                  Interés ordinario: TIIE {tiieNum.toFixed(2)}% + {spreadNum.toFixed(2)} puntos ={' '}
                  <span className="font-semibold">{ordinarioPct.toFixed(2)}% anual</span> · Interés
                  moratorio (3× ordinario):{' '}
                  <span className="font-semibold">{moratorioPct.toFixed(2)}% anual</span>
                  {spreadNum < 4 ? (
                    <span className="ml-1 text-amber-700 dark:text-amber-300">
                      — el spread mínimo es 4
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                  Captura la TIIE para derivar el interés ordinario (TIIE + spread) y el moratorio
                  (3× ordinario).
                </p>
              )}

              {/* Aval */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Aval — nombre (opcional)">
                  <Input
                    value={avalNombre}
                    onChange={(e) => {
                      setAvalNombre(e.target.value);
                      touchCD();
                    }}
                  />
                </Field>
                <Field label="Aval — domicilio (opcional)">
                  <Input
                    value={avalDomicilio}
                    onChange={(e) => {
                      setAvalDomicilio(e.target.value);
                      touchCD();
                    }}
                  />
                </Field>
              </div>

              {/* Acciones CD */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={guardarCreditoDirecto}
                  disabled={savingCD}
                >
                  {savingCD ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 size-4" /> Guardar crédito directo
                    </>
                  )}
                </Button>
                {cdGuardado ? (
                  <a
                    href={`/api/dilesa/ventas/${venta.id}/pdf/pagare-credito-directo`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
                  >
                    <Download className="h-3.5 w-3.5" /> Generar pagaré
                  </a>
                ) : (
                  <span className="text-[11px] text-[var(--text)]/50">
                    Guarda el crédito directo para habilitar el pagaré.
                  </span>
                )}
              </div>

              {/* Pagaré firmado — persiste al subirse (captura colaborativa S4b) */}
              <div className="mt-4">
                <DocsFaseSection state={docsFase} titulo="Pagaré firmado" />
              </div>
            </Section>
          ) : (
            <Section title="Crédito directo">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                La operación queda cubierta con el crédito y los depósitos — no se requiere crédito
                directo.
              </p>
            </Section>
          )}

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

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[var(--text)]/50">{children}</p>;
}

function CoberturaRow({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'warn' | 'ok';
}) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-700 dark:text-amber-300'
      : tone === 'ok'
        ? 'text-emerald-600 dark:text-emerald-400'
        : '';
  return (
    <div className="flex items-center justify-between">
      <span className={`${strong ? 'font-semibold' : 'text-[var(--text)]/70'} ${toneClass}`}>
        {label}
      </span>
      <span className={`${strong ? 'font-semibold' : 'font-medium'} ${toneClass}`}>{value}</span>
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

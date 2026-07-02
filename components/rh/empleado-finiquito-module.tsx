'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Supabase row mapping is dynamic; data-sync en useEffect es el patrón
 * estándar de la app.
 */

/**
 * EmpleadoFiniquitoModule — vista de impresión de convenio de
 * terminación laboral y finiquito. Parametrizada por `empresaSlug`
 * para consumir los datos fiscales de la empresa.
 *
 * Política (Beto, 2026-04-27): no hay generación de finiquito sin
 * datos fiscales completos en `core.empresas`. Si faltan campos,
 * mensaje claro y CTA a Configuración. Cero fallback hardcoded.
 */

import { RequireAccess } from '@/components/require-access';
import Link from 'next/link';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useTriggerPrint } from '@/components/print';
import { ArrowLeft, Printer, AlertCircle, Settings, Save, Loader2 } from 'lucide-react';
import {
  FiniquitoPrintable,
  type FiniquitoEmpleadoData,
  type FormaPagoFiniquito,
} from '@/components/rh/finiquito-printable';
import type { ContratoPatron } from '@/components/rh/contrato-printable';
import { useDatosFiscalesEmpresa, buildPatronFromDatos } from '@/lib/rh/datos-fiscales-empresa';
import {
  calcularFiniquito,
  CAUSA_LABELS,
  type CausaTerminacion,
} from '@/lib/hr/calcular-finiquito';
import {
  getSalarioMinimoZona,
  labelZona,
  type ZonaSalarioMinimo,
} from '@/lib/hr/salario-minimo-zona';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

const FORMA_PAGO_LABELS: Record<FormaPagoFiniquito, string> = {
  efectivo: 'Efectivo',
  cheque: 'Cheque',
  transferencia: 'Transferencia bancaria',
};

function placeholderReferencia(forma: FormaPagoFiniquito): string {
  if (forma === 'cheque') return 'Nº de cheque (ej. 0001234)';
  if (forma === 'transferencia') return 'Referencia / SPEI';
  return 'No aplica para efectivo';
}

export type EmpleadoFiniquitoModuleProps = {
  empresaSlug: 'rdb' | 'dilesa';
};

function Inner({ empresaSlug }: EmpleadoFiniquitoModuleProps) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();

  const triggerPrint = useTriggerPrint();
  const [empleado, setEmpleado] = useState<FiniquitoEmpleadoData | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [fechaIngreso, setFechaIngreso] = useState<string>('');
  const [fechaBajaGuardada, setFechaBajaGuardada] = useState<string | null>(null);
  const [motivoBajaGuardado, setMotivoBajaGuardado] = useState<string | null>(null);
  const [sueldoDiario, setSueldoDiario] = useState<number>(0);
  const [sdi, setSdi] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form de ajustes en vivo (la fecha y causa pueden cambiar antes de generar)
  const [fechaBaja, setFechaBaja] = useState<string>('');
  const [causa, setCausa] = useState<CausaTerminacion>('mutuo_consentimiento');
  const [diasPend, setDiasPend] = useState<string>('0');
  const [vacsTomadas, setVacsTomadas] = useState<string>('0');
  const [motivoDetalle, setMotivoDetalle] = useState<string>('');
  const [salarioMinimo, setSalarioMinimo] = useState<number>(0);
  const [salarioMinimoZona, setSalarioMinimoZona] = useState<ZonaSalarioMinimo>('general');
  // Marca si el usuario ya editó el SM manualmente — evita que el effect
  // de auto-set por zona pise un valor ajustado a propósito.
  const [smTouched, setSmTouched] = useState(false);

  // Forma de pago + referencia (Sprint 2): se capturan en el panel y
  // entran al convenio impreso + al snapshot persistido.
  const [formaPago, setFormaPago] = useState<FormaPagoFiniquito>('transferencia');
  const [referenciaPago, setReferenciaPago] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const datosFiscales = useDatosFiscalesEmpresa(empresaId);
  const toast = useToast();

  // Auto-setear SM según municipio fiscal de la empresa, una sola vez
  // cuando los datos fiscales y la fecha de baja están disponibles.
  useEffect(() => {
    if (smTouched) return;
    if (!datosFiscales.datos) return;
    if (!fechaBaja) return;
    const anio = Number(fechaBaja.slice(0, 4)) || new Date().getFullYear();
    const sm = getSalarioMinimoZona({
      municipio: datosFiscales.datos.domicilio_municipio,
      estado: datosFiscales.datos.domicilio_estado,
      anio,
    });
    setSalarioMinimo(sm.valor);
    setSalarioMinimoZona(sm.zona);
  }, [datosFiscales.datos, fechaBaja, smTouched]);

  const fetchAll = useCallback(async () => {
    const { data: emp, error: eErr } = await supabase
      .schema('erp')
      .from('empleados')
      .select(
        `id, empresa_id, numero_empleado, fecha_ingreso, fecha_baja, motivo_baja,
         persona:persona_id(nombre, apellido_paterno, apellido_materno, rfc, nss),
         departamento:departamento_id(nombre),
         puesto:puesto_id(nombre)`
      )
      .eq('id', id)
      .single();

    if (eErr || !emp) {
      setError(eErr?.message ?? 'Empleado no encontrado');
      setLoading(false);
      return;
    }

    setEmpresaId((emp as any).empresa_id as string);

    const { data: comp } = await supabase
      .schema('erp')
      .from('empleados_compensacion')
      .select('sueldo_diario, sueldo_mensual, sdi')
      .eq('empleado_id', id)
      .eq('vigente', true)
      .maybeSingle();

    const p = Array.isArray((emp as any).persona) ? (emp as any).persona[0] : (emp as any).persona;
    const dep = Array.isArray((emp as any).departamento)
      ? (emp as any).departamento[0]
      : (emp as any).departamento;
    const pue = Array.isArray((emp as any).puesto) ? (emp as any).puesto[0] : (emp as any).puesto;

    setEmpleado({
      nombre: p?.nombre ?? '',
      apellido_paterno: p?.apellido_paterno ?? null,
      apellido_materno: p?.apellido_materno ?? null,
      rfc: p?.rfc ?? null,
      nss: p?.nss ?? null,
      puesto: pue?.nombre ?? null,
      departamento: dep?.nombre ?? null,
      numero_empleado: (emp as any).numero_empleado ?? null,
    });

    const fi = (emp as any).fecha_ingreso as string | null;
    const fb = (emp as any).fecha_baja as string | null;
    setFechaIngreso(fi ?? '');
    setFechaBajaGuardada(fb);
    setMotivoBajaGuardado((emp as any).motivo_baja ?? null);
    setFechaBaja(fb ?? hoyISOMatamoros());

    const sueldoD =
      (comp as any)?.sueldo_diario ??
      ((comp as any)?.sueldo_mensual ? Number((comp as any).sueldo_mensual) / 30 : 0);
    setSueldoDiario(Number(sueldoD) || 0);
    setSdi(Number((comp as any)?.sdi) || 0);

    // Prellenar causa si viene por query param (desde el dialog de baja)
    const qCausa = searchParams.get('causa') as CausaTerminacion | null;
    if (qCausa && qCausa in CAUSA_LABELS) setCausa(qCausa);

    setLoading(false);
  }, [id, supabase, searchParams]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const calculo = useMemo(() => {
    if (!fechaIngreso || !fechaBaja || sueldoDiario <= 0) return null;
    return calcularFiniquito({
      fechaIngreso,
      fechaBaja,
      sueldoDiario,
      sdi: sdi || null,
      salarioMinimoDiario: salarioMinimo,
      causa,
      diasPendientesPago: Number(diasPend) || 0,
      diasVacacionesTomadasAnioActual: Number(vacsTomadas) || 0,
    });
  }, [fechaIngreso, fechaBaja, sueldoDiario, sdi, salarioMinimo, causa, diasPend, vacsTomadas]);

  // Construir patron solo cuando datos fiscales completos. Memoizado para
  // que `handleGuardarYDescargar` pueda referenciarlo en sus deps sin
  // re-construir en cada render.
  const patron = useMemo<ContratoPatron | null>(() => {
    if (!datosFiscales.completo || !datosFiscales.datos) return null;
    try {
      return buildPatronFromDatos(datosFiscales.datos);
    } catch {
      return null;
    }
  }, [datosFiscales.completo, datosFiscales.datos]);

  // Guarda un snapshot inmutable del finiquito en `erp.finiquitos` y
  // dispara el print dialog. Si el usuario cancela el print, el registro
  // ya quedó persistido — eso es intencional: el motivo de persistir es
  // tener audit trail del que se enseñó al trabajador.
  const handleGuardarYDescargar = useCallback(async () => {
    if (!calculo || !empleado || !empresaId || !patron) return;
    setSaving(true);
    try {
      const row = {
        empleado_id: id,
        empresa_id: empresaId,
        fecha_baja: calculo.fechaBaja,
        fecha_convenio: hoyISOMatamoros(),
        causa: calculo.causa,
        motivo_detalle: motivoDetalle || motivoBajaGuardado || null,
        fecha_ingreso: calculo.fechaIngreso,
        antiguedad_anios: calculo.antiguedad.anios,
        antiguedad_meses: calculo.antiguedad.meses,
        antiguedad_dias: calculo.antiguedad.dias,
        sueldo_diario: calculo.sueldoDiario,
        sdi: calculo.sdi !== calculo.sueldoDiario ? calculo.sdi : null,
        salario_minimo_diario: salarioMinimo,
        zona_salario_minimo: salarioMinimoZona,
        total_finiquito: calculo.totalFiniquito,
        total_indemnizacion: calculo.totalIndemnizacion,
        total_general: calculo.totalGeneral,
        conceptos: calculo.conceptos,
        notas_calculo: calculo.notas,
        empleado_snapshot: empleado,
        patron_snapshot: patron,
        forma_pago: formaPago,
        referencia_pago: formaPago === 'efectivo' ? null : referenciaPago.trim() || null,
      };
      // `erp.finiquitos` se agrega en migración 20260430160000_erp_finiquitos.sql.
      // Hasta que se aplique con psql + se regeneren types/supabase.ts, la
      // tabla no aparece en los tipos generados — por eso el cast.
      const { error: insertErr } = await (supabase.schema('erp') as any)
        .from('finiquitos')
        .insert(row);
      if (insertErr) {
        toast.add({
          title: 'No se pudo guardar el finiquito',
          description: getSupabaseErrorMessage(insertErr, 'Error desconocido al insertar.'),
          type: 'error',
        });
        return;
      }
      toast.add({
        title: 'Finiquito guardado',
        description: 'El registro queda en histórico del empleado.',
        type: 'success',
      });
      // Pequeña espera para que el toast sea visible antes del print dialog.
      setTimeout(() => triggerPrint(), 300);
    } finally {
      setSaving(false);
    }
  }, [
    calculo,
    empleado,
    empresaId,
    id,
    patron,
    motivoDetalle,
    motivoBajaGuardado,
    salarioMinimo,
    salarioMinimoZona,
    formaPago,
    referenciaPago,
    supabase,
    toast,
    triggerPrint,
  ]);

  if (loading || datosFiscales.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !empleado) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-red-400">{error ?? 'Empleado no encontrado'}</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4 rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
    );
  }

  if (!datosFiscales.completo) {
    return (
      <div className="space-y-4">
        <div className="no-print flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/${empresaSlug}/rh/personal/${id}`)}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver al empleado
          </Button>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-amber-400">
                Datos fiscales de la empresa incompletos
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                No se puede generar el finiquito hasta que la empresa tenga su CSF y datos fiscales
                capturados. Faltan los siguientes campos:
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-300 space-y-0.5">
                {datosFiscales.faltantes.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <Link
              href={`/settings/empresas/${empresaSlug}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm text-white hover:bg-[var(--accent)]/90"
            >
              <Settings className="h-4 w-4" /> Capturar en Settings → Empresas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!patron) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-400">
        Error construyendo datos del patrón. Revisa los datos fiscales en Settings → Empresas.
      </div>
    );
  }

  const hayDatosFaltantes = sueldoDiario <= 0 || !fechaIngreso;
  const referenciaRequerida = formaPago !== 'efectivo' && referenciaPago.trim() === '';
  const puedeGuardar = !!calculo && !hayDatosFaltantes && !referenciaRequerida && !saving;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/${empresaSlug}/rh/personal/${id}`)}
          className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] sm:w-auto"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver al empleado
        </Button>
        {calculo && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={triggerPrint}
              className="gap-1.5 rounded-xl border-[var(--border)] text-[var(--text)]"
              title="Vista previa sin guardar el registro"
            >
              <Printer className="h-4 w-4" /> Vista previa
            </Button>
            <Button
              onClick={handleGuardarYDescargar}
              disabled={!puedeGuardar}
              title={
                referenciaRequerida
                  ? `Captura la referencia para forma de pago "${FORMA_PAGO_LABELS[formaPago]}"`
                  : 'Guarda el snapshot en histórico y abre el print dialog'
              }
              className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{' '}
              Guardar y descargar
            </Button>
          </div>
        )}
      </div>

      {/* Panel de ajustes (oculto al imprimir) */}
      <div className="no-print rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text)]/60">
          Parámetros de cálculo
        </h2>
        {hayDatosFaltantes && (
          <p className="text-xs text-amber-400">
            ⚠️ Este empleado no tiene sueldo diario capturado en erp.empleados_compensacion o carece
            de fecha de ingreso. Captura los datos antes de generar el finiquito.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel>Fecha de baja</FieldLabel>
            <Input
              type="date"
              value={fechaBaja}
              onChange={(e) => setFechaBaja(e.target.value)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Causa de terminación</FieldLabel>
            <Combobox
              value={causa}
              onChange={(v) => setCausa(v as CausaTerminacion)}
              options={Object.entries(CAUSA_LABELS).map(([k, label]) => ({
                value: k,
                label,
              }))}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Salario mínimo diario</FieldLabel>
            <Input
              type="number"
              step="0.01"
              value={salarioMinimo}
              onChange={(e) => {
                setSalarioMinimo(Number(e.target.value) || 0);
                setSmTouched(true);
              }}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
              Detectado: {labelZona(salarioMinimoZona)} (
              {datosFiscales.datos?.domicilio_municipio ?? '—'},{' '}
              {datosFiscales.datos?.domicilio_estado ?? '—'}). Editable si la empresa opera en una
              zona distinta.
            </p>
          </div>
          <div>
            <FieldLabel>Días pendientes de pago</FieldLabel>
            <Input
              type="number"
              min="0"
              value={diasPend}
              onChange={(e) => setDiasPend(e.target.value)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Vacaciones ya tomadas en el año</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={vacsTomadas}
              onChange={(e) => setVacsTomadas(e.target.value)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Sueldo diario (auto)</FieldLabel>
            <Input
              type="number"
              step="0.01"
              value={sueldoDiario}
              onChange={(e) => setSueldoDiario(Number(e.target.value) || 0)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div className="sm:col-span-3">
            <FieldLabel>Motivo / detalle adicional</FieldLabel>
            <Input
              value={motivoDetalle || motivoBajaGuardado || ''}
              onChange={(e) => setMotivoDetalle(e.target.value)}
              placeholder="Texto que se agrega a la cláusula de causa…"
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
        </div>

        {/* Forma de pago — entra a la cláusula PRIMERA del convenio. */}
        <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
          <div>
            <FieldLabel>Forma de pago</FieldLabel>
            <Combobox
              value={formaPago}
              onChange={(v) => {
                setFormaPago(v as FormaPagoFiniquito);
                if (v === 'efectivo') setReferenciaPago('');
              }}
              options={(Object.keys(FORMA_PAGO_LABELS) as FormaPagoFiniquito[]).map((k) => ({
                value: k,
                label: FORMA_PAGO_LABELS[k],
              }))}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>
              Referencia / nº de cheque {formaPago === 'efectivo' ? '(opcional)' : '(requerida)'}
            </FieldLabel>
            <Input
              value={referenciaPago}
              onChange={(e) => setReferenciaPago(e.target.value)}
              disabled={formaPago === 'efectivo'}
              placeholder={placeholderReferencia(formaPago)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] disabled:opacity-60"
            />
          </div>
        </div>

        {fechaBajaGuardada && fechaBaja !== fechaBajaGuardada && (
          <p className="text-[10px] text-amber-400">
            La fecha de baja guardada en BSOP es {fechaBajaGuardada}; estás calculando con{' '}
            {fechaBaja}. El cálculo es en vivo — no modifica la fecha guardada.
          </p>
        )}
      </div>

      {/* Plantilla printable */}
      {calculo && (
        <div className="rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          <FiniquitoPrintable
            empleado={empleado}
            calculo={calculo}
            motivoDetalle={motivoDetalle || motivoBajaGuardado || undefined}
            patron={patron}
            formaPago={formaPago}
            referenciaPago={referenciaPago.trim() || null}
          />
        </div>
      )}
    </div>
  );
}

export function EmpleadoFiniquitoModule({ empresaSlug }: EmpleadoFiniquitoModuleProps) {
  return (
    <RequireAccess empresa={empresaSlug}>
      <Inner empresaSlug={empresaSlug} />
    </RequireAccess>
  );
}

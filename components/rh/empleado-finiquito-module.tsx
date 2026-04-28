'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect --
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
import { ArrowLeft, Printer, AlertCircle, Settings } from 'lucide-react';
import {
  FiniquitoPrintable,
  type FiniquitoEmpleadoData,
} from '@/components/rh/finiquito-printable';
import type { ContratoPatron } from '@/components/rh/contrato-printable';
import { useDatosFiscalesEmpresa, buildPatronFromDatos } from '@/lib/rh/datos-fiscales-empresa';
import {
  calcularFiniquito,
  CAUSA_LABELS,
  type CausaTerminacion,
} from '@/lib/hr/calcular-finiquito';

// Salario mínimo diario 2026 (zona libre de frontera norte — Piedras Negras).
// ⚠️ Ajustar anualmente o extraer a una tabla en DB si es necesario.
// Fuente: CONASAMI. Al 2026 el SMG general es $248.93/día, zona frontera
// $374.89/día. Las empresas que operan en otras zonas pueden ajustar el
// valor en el panel de cálculo (campo "Salario mínimo diario").
const SALARIO_MINIMO_DIARIO_ZLFN_2026 = 374.89;

export type EmpleadoFiniquitoModuleProps = {
  empresaSlug: 'rdb' | 'dilesa';
};

function Inner({ empresaSlug }: EmpleadoFiniquitoModuleProps) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();

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
  const [salarioMinimo, setSalarioMinimo] = useState<number>(SALARIO_MINIMO_DIARIO_ZLFN_2026);

  const datosFiscales = useDatosFiscalesEmpresa(empresaId);

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
    setFechaBaja(fb ?? new Date().toISOString().split('T')[0]);

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

  let patron: ContratoPatron;
  try {
    patron = buildPatronFromDatos(datosFiscales.datos!);
  } catch (err) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-400">
        Error construyendo datos del patrón: {err instanceof Error ? err.message : 'desconocido'}
      </div>
    );
  }

  const hayDatosFaltantes = sueldoDiario <= 0 || !fechaIngreso;

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
        {calculo && (
          <Button
            onClick={() => window.print()}
            className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
          >
            <Printer className="h-4 w-4" /> Imprimir finiquito
          </Button>
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
              onChange={(e) => setSalarioMinimo(Number(e.target.value) || 0)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
              Zona libre frontera norte 2026: $374.89. Ajustar si cambia vigencia.
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

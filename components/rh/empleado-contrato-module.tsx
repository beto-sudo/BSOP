'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect --
 * Supabase row mapping is dynamic; tightening types requires generated
 * Database shape refinements that are out of scope for the contrato
 * printable route. El useEffect con fetchAll es el patrón estándar
 * de la app para carga inicial de datos.
 */

/**
 * EmpleadoContratoModule — vista de impresión de contrato individual
 * de trabajo. Parametrizada por `empresaSlug` para consumir los datos
 * fiscales de la empresa correspondiente desde `core.empresas`.
 *
 * Política (Beto, 2026-04-27): no hay generación de contrato sin datos
 * fiscales completos. Si faltan campos, no se renderea el printable —
 * se muestra mensaje claro con la lista de faltantes y CTA a
 * Configuración → Empresas. Cero fallback hardcoded.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Printer, AlertCircle, Settings } from 'lucide-react';
import {
  ContratoPrintable,
  type ContratoEmpleado,
  type ContratoPatron,
} from '@/components/rh/contrato-printable';
import { useDatosFiscalesEmpresa, buildPatronFromDatos } from '@/lib/rh/datos-fiscales-empresa';

export type EmpleadoContratoModuleProps = {
  empresaSlug: 'rdb' | 'dilesa';
};

function Inner({ empresaSlug }: EmpleadoContratoModuleProps) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();

  const [empleado, setEmpleado] = useState<ContratoEmpleado | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const datosFiscales = useDatosFiscalesEmpresa(empresaId);

  const fetchAll = useCallback(async () => {
    const { data: emp, error: eErr } = await supabase
      .schema('erp')
      .from('empleados')
      .select(
        `id, empresa_id, numero_empleado, fecha_ingreso, tipo_contrato,
         periodo_prueba_dias, periodo_prueba_numero, horario, lugar_trabajo,
         dia_pago, funciones,
         persona:persona_id(nombre, apellido_paterno, apellido_materno,
           nacionalidad, sexo, estado_civil, fecha_nacimiento, lugar_nacimiento,
           rfc, curp, nss, domicilio, telefono),
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

    const [compRes, benefRes] = await Promise.all([
      supabase
        .schema('erp')
        .from('empleados_compensacion')
        .select('sueldo_mensual, sueldo_diario')
        .eq('empleado_id', id)
        .eq('vigente', true)
        .maybeSingle(),
      supabase
        .schema('erp')
        .from('empleado_beneficiarios')
        .select('nombre, parentesco, porcentaje')
        .eq('empleado_id', id)
        .order('orden'),
    ]);

    const p = Array.isArray((emp as any).persona) ? (emp as any).persona[0] : (emp as any).persona;
    const dep = Array.isArray((emp as any).departamento)
      ? (emp as any).departamento[0]
      : (emp as any).departamento;
    const pue = Array.isArray((emp as any).puesto) ? (emp as any).puesto[0] : (emp as any).puesto;

    setEmpleado({
      nombre: p?.nombre ?? '',
      apellido_paterno: p?.apellido_paterno ?? null,
      apellido_materno: p?.apellido_materno ?? null,
      nacionalidad: p?.nacionalidad ?? 'Mexicana',
      sexo: p?.sexo ?? null,
      estado_civil: p?.estado_civil ?? null,
      fecha_nacimiento: p?.fecha_nacimiento ?? null,
      lugar_nacimiento: p?.lugar_nacimiento ?? null,
      rfc: p?.rfc ?? null,
      curp: p?.curp ?? null,
      nss: p?.nss ?? null,
      domicilio: p?.domicilio ?? null,
      telefono: p?.telefono ?? null,
      numero_empleado: (emp as any).numero_empleado ?? null,
      fecha_ingreso: (emp as any).fecha_ingreso ?? null,
      tipo_contrato: (emp as any).tipo_contrato ?? null,
      periodo_prueba_dias: (emp as any).periodo_prueba_dias ?? null,
      periodo_prueba_numero: (emp as any).periodo_prueba_numero ?? null,
      horario: (emp as any).horario ?? null,
      lugar_trabajo: (emp as any).lugar_trabajo ?? null,
      dia_pago: (emp as any).dia_pago ?? null,
      funciones: (emp as any).funciones ?? null,
      puesto: pue?.nombre ?? null,
      departamento: dep?.nombre ?? null,
      sueldo_mensual: (compRes.data as any)?.sueldo_mensual ?? null,
      sueldo_diario: (compRes.data as any)?.sueldo_diario ?? null,
      beneficiarios: (benefRes.data ?? []) as ContratoEmpleado['beneficiarios'],
    });
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

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

  // Si la empresa no tiene datos fiscales completos, NO se renderea el
  // contrato — se muestra mensaje claro con CTA a Configuración. La regla
  // dura es: cero fallback. Cada empresa captura sus datos antes de usar
  // RH formal.
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
                No se puede generar el contrato hasta que la empresa tenga su CSF y datos fiscales
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
    // Defensivo: en teoría `completo` ya garantiza que no se lanza.
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-400">
        Error construyendo datos del patrón: {err instanceof Error ? err.message : 'desconocido'}
      </div>
    );
  }

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
        <Button
          onClick={() => window.print()}
          className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
        >
          <Printer className="h-4 w-4" /> Imprimir contrato
        </Button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <ContratoPrintable empleado={empleado} patron={patron} />
      </div>
    </div>
  );
}

export function EmpleadoContratoModule({ empresaSlug }: EmpleadoContratoModuleProps) {
  return (
    <RequireAccess empresa={empresaSlug}>
      <Inner empresaSlug={empresaSlug} />
    </RequireAccess>
  );
}

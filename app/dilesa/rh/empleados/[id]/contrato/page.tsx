'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect --
 * Supabase row mapping is dynamic; tightening types requires generated
 * Database shape refinements that are out of scope for the contrato
 * printable route. El useEffect con fetchAll es el patrón estándar
 * de la app para carga inicial de datos.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Printer } from 'lucide-react';
import { ContratoPrintable, type ContratoEmpleado } from '@/components/rh/contrato-printable';

function Inner() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();

  const [data, setData] = useState<ContratoEmpleado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    setData({
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-red-400">{error ?? 'Empleado no encontrado'}</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4 rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/dilesa/rh/empleados/${id}`)}
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
        <ContratoPrintable empleado={data} />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <Inner />
    </RequireAccess>
  );
}

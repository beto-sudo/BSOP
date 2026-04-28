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
import {
  ContratoPrintable,
  type ContratoEmpleado,
  type ContratoPatron,
  PATRON_DILESA,
} from '@/components/rh/contrato-printable';

function Inner() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();

  const [data, setData] = useState<ContratoEmpleado | null>(null);
  const [patron, setPatron] = useState<ContratoPatron>(PATRON_DILESA);
  const [patronFromDb, setPatronFromDb] = useState<boolean>(false);
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

    // Cargar la empresa (razón social, RFC, domicilio, representante,
    // escrituras, registro patronal). Si faltan campos se usa PATRON_DILESA
    // como fallback.
    const { data: empresa } = await supabase
      .schema('core')
      .from('empresas')
      .select(
        `razon_social, rfc, registro_patronal_imss, representante_legal,
         escritura_constitutiva, escritura_poder,
         domicilio_calle, domicilio_numero_ext, domicilio_numero_int,
         domicilio_colonia, domicilio_cp, domicilio_municipio, domicilio_estado`
      )
      .eq('id', (emp as any).empresa_id)
      .maybeSingle();

    if (empresa && (empresa as any).rfc) {
      const e = empresa as any;
      const domParts = [
        e.domicilio_calle,
        e.domicilio_numero_ext ? `#${e.domicilio_numero_ext}` : null,
        e.domicilio_colonia ? `Col. ${e.domicilio_colonia}` : null,
        e.domicilio_cp ? `C.P. ${e.domicilio_cp}` : null,
        e.domicilio_municipio,
        e.domicilio_estado,
      ].filter(Boolean);
      setPatron({
        razonSocial: e.razon_social
          ? `${e.razon_social}${/S\.A\.|SA DE CV/i.test(e.razon_social) ? '' : ', S.A. DE C.V.'}`
          : PATRON_DILESA.razonSocial,
        rfc: e.rfc,
        domicilio: domParts.join(', '),
        registroPatronalImss: e.registro_patronal_imss ?? '__________________',
        representanteLegal: e.representante_legal ?? '__________________',
        escrituraConstitutiva: e.escritura_constitutiva
          ? {
              numero: e.escritura_constitutiva.numero ?? '—',
              fecha: e.escritura_constitutiva.fecha_texto ?? e.escritura_constitutiva.fecha ?? '—',
              notario: e.escritura_constitutiva.notario ?? '—',
              notariaNumero: e.escritura_constitutiva.notaria_numero ?? '—',
              distrito: e.escritura_constitutiva.distrito ?? '—',
            }
          : PATRON_DILESA.escrituraConstitutiva,
        poderRepresentante: e.escritura_poder
          ? {
              numero: e.escritura_poder.numero ?? '—',
              fecha: e.escritura_poder.fecha_texto ?? e.escritura_poder.fecha ?? '—',
              notario: e.escritura_poder.notario ?? '—',
              notariaNumero: e.escritura_poder.notaria_numero ?? '—',
              distrito: e.escritura_poder.distrito ?? '—',
            }
          : PATRON_DILESA.poderRepresentante,
      });
      setPatronFromDb(true);
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
          onClick={() => router.push(`/dilesa/rh/personal/${id}`)}
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

      {!patronFromDb && (
        <div className="no-print rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
          ⚠️ No se encontraron datos fiscales de la empresa en BSOP. Se están usando los
          placeholders hardcoded. Captura la CSF en Configuración → Empresas para que el contrato
          tenga los datos correctos.
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <ContratoPrintable empleado={data} patron={patron} />
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

'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect --
 * Supabase row mapping is dynamic; data-sync en useEffect es el patrón
 * estándar de la app.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Printer } from 'lucide-react';
import {
  FiniquitoPrintable,
  type FiniquitoEmpleadoData,
} from '@/components/rh/finiquito-printable';
import { type ContratoPatron, PATRON_DILESA } from '@/components/rh/contrato-printable';
import {
  calcularFiniquito,
  CAUSA_LABELS,
  type CausaTerminacion,
} from '@/lib/hr/calcular-finiquito';

// Salario mínimo diario 2026 (zona libre de frontera norte — Piedras Negras).
// ⚠️ Ajustar anualmente o extraer a una tabla en DB si es necesario.
// Fuente: CONASAMI. Al 2026 el SMG general es $248.93/día, zona frontera
// $374.89/día. DILESA opera en Coahuila (zona frontera).
const SALARIO_MINIMO_DIARIO_ZLFN_2026 = 374.89;

function Inner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();

  const [empleado, setEmpleado] = useState<FiniquitoEmpleadoData | null>(null);
  const [patron, setPatron] = useState<ContratoPatron>(PATRON_DILESA);
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

    const { data: comp } = await supabase
      .schema('erp')
      .from('empleados_compensacion')
      .select('sueldo_diario, sueldo_mensual, sdi')
      .eq('empleado_id', id)
      .eq('vigente', true)
      .maybeSingle();

    // Cargar datos de la empresa para la cabecera del finiquito.
    const { data: empresa } = await supabase
      .schema('core')
      .from('empresas')
      .select(
        `razon_social, rfc, registro_patronal_imss, representante_legal,
         escritura_constitutiva, escritura_poder,
         domicilio_calle, domicilio_numero_ext, domicilio_colonia,
         domicilio_cp, domicilio_municipio, domicilio_estado`
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
        registroPatronalImss: e.registro_patronal_imss ?? '—',
        representanteLegal: e.representante_legal ?? '—',
        escrituraConstitutiva: e.escritura_constitutiva
          ? {
              numero: e.escritura_constitutiva.numero ?? '—',
              fecha: e.escritura_constitutiva.fecha_texto ?? '—',
              notario: e.escritura_constitutiva.notario ?? '—',
              notariaNumero: e.escritura_constitutiva.notaria_numero ?? '—',
              distrito: e.escritura_constitutiva.distrito ?? '—',
            }
          : PATRON_DILESA.escrituraConstitutiva,
        poderRepresentante: e.escritura_poder
          ? {
              numero: e.escritura_poder.numero ?? '—',
              fecha: e.escritura_poder.fecha_texto ?? '—',
              notario: e.escritura_poder.notario ?? '—',
              notariaNumero: e.escritura_poder.notaria_numero ?? '—',
              distrito: e.escritura_poder.distrito ?? '—',
            }
          : PATRON_DILESA.poderRepresentante,
      });
    }

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

  if (loading) {
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

  const hayDatosFaltantes = sueldoDiario <= 0 || !fechaIngreso;

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
            <Select value={causa} onValueChange={(v) => setCausa(v as CausaTerminacion)}>
              <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CAUSA_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <p className="mt-1 text-[10px] text-[var(--text)]/40">
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

export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <Inner />
    </RequireAccess>
  );
}

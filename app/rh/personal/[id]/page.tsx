'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect --
 * Cleanup PR (#30): pre-existing debt. `any` in Supabase row mapping;
 * set-state-in-effect in data-sync pattern. Both are behavioral rewrites,
 * out of scope for bulk lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Save, Loader2, UserX } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type EmpleadoDetail = {
  id: string;
  empresa_id: string;
  numero_empleado: string | null;
  fecha_ingreso: string | null;
  fecha_baja: string | null;
  motivo_baja: string | null;
  nss: string | null;
  fecha_nacimiento: string | null;
  telefono_empresa: string | null;
  extension: string | null;
  email_empresa: string | null;
  tipo_contrato: string | null;
  horario: string | null;
  lugar_trabajo: string | null;
  dia_pago: string | null;
  funciones: string | null;
  periodo_prueba_dias: number | null;
  // Sprint 1 schema delta — campos IMSS y SAT
  umf: string | null;
  zona_salario: string | null;
  regimen_imss: string | null;
  tipo_prestacion: string | null;
  sindicalizado: string | null;
  metodo_pago_sat: string | null;
  activo: boolean;
  persona: {
    id: string;
    nombre: string;
    apellido_paterno: string | null;
    apellido_materno: string | null;
    email: string | null;
    telefono: string | null;
    telefono_casa: string | null;
    rfc: string | null;
    curp: string | null;
    sexo: string | null;
    estado_civil: string | null;
    lugar_nacimiento: string | null;
    domicilio: string | null;
    nacionalidad: string | null;
    contacto_emergencia_nombre: string | null;
    contacto_emergencia_telefono: string | null;
    contacto_emergencia_parentesco: string | null;
  } | null;
  departamento: { id: string; nombre: string } | null;
  puesto: { id: string; nombre: string } | null;
};

type EmpleadoCompensacion = {
  id: string;
  sueldo_diario: number | null;
  sueldo_mensual: number | null;
  sdi: number | null;
  tipo_contrato: string | null;
  frecuencia_pago: string | null;
  comisiones_mensuales: number | null;
  bonificaciones_mensuales: number | null;
  compensaciones_mensuales: number | null;
  fecha_inicio: string | null;
};

type EmpleadoPago = {
  id: string;
  banco_codigo: string | null;
  banco_nombre: string | null;
  numero_cuenta: string | null;
  clabe: string | null;
  sucursal: string | null;
  fecha_inicio: string | null;
};

type PuestoAsignado = {
  id: string;
  principal: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  puesto: { id: string; nombre: string } | null;
};

type ImportLogEntry = {
  id: string;
  snapshot_fecha: string;
  origen: string;
  accion: string;
  match_metodo: string | null;
  diff: Record<string, unknown> | null;
  created_at: string;
};

type Departamento = { id: string; nombre: string };
type Puesto = { id: string; nombre: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fullName(emp: EmpleadoDetail) {
  if (!emp.persona) return '—';
  return [emp.persona.nombre, emp.persona.apellido_paterno, emp.persona.apellido_materno]
    .filter(Boolean)
    .join(' ');
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d.includes('T') ? d : `${d}T00:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-3">
      {children}
    </h2>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | number }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="text-sm text-[var(--text)]">
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </p>
    </div>
  );
}

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(n);
}

const REGIMEN_IMSS_LABELS: Record<string, string> = {
  '02': '02 — Sueldos y Salarios',
  '03': '03 — Jubilados',
  '04': '04 — Pensionados',
  '05': '05 — Asimilados a comisionistas',
  '06': '06 — Asimilados honorarios',
  '07': '07 — Asimilados acciones',
};

const METODO_PAGO_SAT_LABELS: Record<string, string> = {
  '01': '01 — Efectivo',
  '02': '02 — Cheque nominativo',
  '03': '03 — Transferencia electrónica',
  '28': '28 — Tarjeta de débito',
};

const SINDICALIZADO_LABELS: Record<string, string> = {
  C: 'Confianza',
  S: 'Sindicalizado',
};

const SEXO_LABELS: Record<string, string> = { M: 'Masculino', F: 'Femenino' };
const ESTADO_CIVIL_LABELS: Record<string, string> = {
  S: 'Soltero(a)',
  C: 'Casado(a)',
  U: 'Unión libre',
  V: 'Viudo(a)',
  D: 'Divorciado(a)',
};

// ─── Main component ───────────────────────────────────────────────────────────

function EmpleadoDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();

  const [empleado, setEmpleado] = useState<EmpleadoDetail | null>(null);
  const [compensacion, setCompensacion] = useState<EmpleadoCompensacion | null>(null);
  const [pago, setPago] = useState<EmpleadoPago | null>(null);
  const [puestosAsignados, setPuestosAsignados] = useState<PuestoAsignado[]>([]);
  const [auditLog, setAuditLog] = useState<ImportLogEntry[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [numeroEmpleado, setNumeroEmpleado] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [departamentoId, setDepartamentoId] = useState('');
  const [puestoId, setPuestoId] = useState('');
  const [nss, setNss] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [telefonoEmpresa, setTelefonoEmpresa] = useState('');
  const [extension, setExtension] = useState('');

  const departamentoOptions = useMemo(() => {
    const opts = departamentos.map((d) => ({ value: d.id, label: d.nombre }));
    const current = empleado?.departamento;
    if (current?.id && !opts.some((o) => o.value === current.id)) {
      opts.unshift({ value: current.id, label: `${current.nombre} (inactivo)` });
    }
    return opts;
  }, [departamentos, empleado?.departamento]);

  const puestoOptions = useMemo(() => {
    const opts = puestos.map((p) => ({ value: p.id, label: p.nombre }));
    const current = empleado?.puesto;
    if (current?.id && !opts.some((o) => o.value === current.id)) {
      opts.unshift({ value: current.id, label: `${current.nombre} (inactivo)` });
    }
    return opts;
  }, [puestos, empleado?.puesto]);

  // Baja dialog
  const [showBajaDialog, setShowBajaDialog] = useState(false);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().split('T')[0]);
  const [givingBaja, setGivingBaja] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: emp, error: eErr } = await supabase
      .schema('erp')
      .from('empleados')
      .select(
        'id, empresa_id, numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, nss, fecha_nacimiento, telefono_empresa, extension, email_empresa, tipo_contrato, horario, lugar_trabajo, dia_pago, funciones, periodo_prueba_dias, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, activo, persona:persona_id(id, nombre, apellido_paterno, apellido_materno, email, telefono, telefono_casa, rfc, curp, sexo, estado_civil, lugar_nacimiento, domicilio, nacionalidad, contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_parentesco), departamento:departamento_id(id, nombre), puesto:puesto_id(id, nombre)'
      )
      .eq('id', id)
      .single();

    if (eErr || !emp) {
      setError(eErr?.message ?? 'Empleado no encontrado');
      setLoading(false);
      return;
    }

    const normalized = {
      ...emp,
      persona: Array.isArray(emp.persona) ? (emp.persona[0] ?? null) : emp.persona,
      departamento: Array.isArray(emp.departamento)
        ? (emp.departamento[0] ?? null)
        : emp.departamento,
      puesto: Array.isArray(emp.puesto) ? (emp.puesto[0] ?? null) : emp.puesto,
    } as unknown as EmpleadoDetail;
    setEmpleado(normalized);
    setNumeroEmpleado(emp.numero_empleado ?? '');
    setFechaIngreso(emp.fecha_ingreso ?? '');
    setDepartamentoId((emp.departamento as any)?.id ?? '');
    setPuestoId((emp.puesto as any)?.id ?? '');
    setNss(emp.nss ?? '');
    setFechaNacimiento(emp.fecha_nacimiento ?? '');
    setTelefonoEmpresa(emp.telefono_empresa ?? '');
    setExtension(emp.extension ?? '');

    const [deptRes, puestosRes, compRes, pagoRes, puestosAsigRes, logRes] = await Promise.all([
      supabase
        .schema('erp')
        .from('departamentos')
        .select('id, nombre')
        .eq('empresa_id', emp.empresa_id)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .schema('erp')
        .from('puestos')
        .select('id, nombre')
        .eq('empresa_id', emp.empresa_id)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .schema('erp')
        .from('empleados_compensacion')
        .select(
          'id, sueldo_diario, sueldo_mensual, sdi, tipo_contrato, frecuencia_pago, comisiones_mensuales, bonificaciones_mensuales, compensaciones_mensuales, fecha_inicio'
        )
        .eq('empleado_id', emp.id)
        .eq('vigente', true)
        .maybeSingle(),
      supabase
        .schema('erp')
        .from('empleados_pago')
        .select('id, banco_codigo, banco_nombre, numero_cuenta, clabe, sucursal, fecha_inicio')
        .eq('empleado_id', emp.id)
        .eq('vigente', true)
        .maybeSingle(),
      supabase
        .schema('erp')
        .from('empleados_puestos')
        .select('id, principal, fecha_inicio, fecha_fin, puesto:puesto_id(id, nombre)')
        .eq('empleado_id', emp.id)
        .order('principal', { ascending: false }),
      supabase
        .schema('erp')
        .from('empleados_import_log')
        .select('id, snapshot_fecha, origen, accion, match_metodo, diff, created_at')
        .eq('empleado_id', emp.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    setDepartamentos(deptRes.data ?? []);
    setPuestos(puestosRes.data ?? []);
    setCompensacion((compRes.data ?? null) as EmpleadoCompensacion | null);
    setPago((pagoRes.data ?? null) as EmpleadoPago | null);
    const puestosNormalized = (puestosAsigRes.data ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      puesto: Array.isArray(p.puesto) ? (p.puesto[0] ?? null) : p.puesto,
    })) as PuestoAsignado[];
    setPuestosAsignados(puestosNormalized);
    setAuditLog((logRes.data ?? []) as ImportLogEntry[]);

    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleSave = async () => {
    if (!empleado) return;
    setSaving(true);
    const { error: err } = await supabase
      .schema('erp')
      .from('empleados')
      .update({
        numero_empleado: numeroEmpleado.trim() || null,
        fecha_ingreso: fechaIngreso || null,
        departamento_id: departamentoId || null,
        puesto_id: puestoId || null,
        nss: nss.trim() || null,
        fecha_nacimiento: fechaNacimiento || null,
        telefono_empresa: telefonoEmpresa.trim() || null,
        extension: extension.trim() || null,
      })
      .eq('id', empleado.id);
    setSaving(false);
    if (err) alert(`Error al guardar: ${err.message}`);
    else await fetchAll();
  };

  const handleBaja = async () => {
    if (!empleado) return;
    setGivingBaja(true);
    const { error: err } = await supabase
      .schema('erp')
      .from('empleados')
      .update({
        activo: false,
        fecha_baja: fechaBaja || new Date().toISOString().split('T')[0],
        motivo_baja: motivoBaja.trim() || null,
      })
      .eq('id', empleado.id);
    setGivingBaja(false);
    if (err) {
      alert(`Error: ${err.message}`);
      return;
    }
    setShowBajaDialog(false);
    await fetchAll();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
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

  const isBaja = !empleado.activo || Boolean(empleado.fecha_baja);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/rh/personal')}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
              {fullName(empleado)}
            </h1>
            <p className="text-xs text-[var(--text)]/50 mt-0.5">
              {empleado.puesto?.nombre ?? 'Sin puesto'} ·{' '}
              {empleado.departamento?.nombre ?? 'Sin departamento'}
            </p>
          </div>
          {isBaja && (
            <span className="inline-flex items-center rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
              Ex-empleado
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isBaja && (
            <Button
              variant="outline"
              onClick={() => setShowBajaDialog(true)}
              className="gap-1.5 rounded-xl border-red-500/40 text-red-500 hover:bg-red-500/10"
            >
              <UserX className="h-4 w-4" />
              Dar de baja
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </div>

      {/* Photo + identity */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-start gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-3xl font-bold text-[var(--accent)]">
            {(empleado.persona?.nombre?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Nombre completo" value={fullName(empleado)} />
            <InfoRow label="Email" value={empleado.persona?.email ?? null} />
            <InfoRow label="Teléfono personal" value={empleado.persona?.telefono ?? null} />
            <InfoRow label="RFC" value={empleado.persona?.rfc ?? null} />
            <InfoRow label="CURP" value={empleado.persona?.curp ?? null} />
          </div>
        </div>
      </div>

      {/* Employment info */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>Datos laborales</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <FieldLabel>No. Empleado</FieldLabel>
            <Input
              value={numeroEmpleado}
              onChange={(e) => setNumeroEmpleado(e.target.value)}
              placeholder="EMP-001"
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Fecha de ingreso</FieldLabel>
            <Input
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Departamento</FieldLabel>
            <Combobox
              value={departamentoId}
              onChange={setDepartamentoId}
              options={departamentoOptions}
              placeholder="Sin departamento"
              allowClear
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Puesto</FieldLabel>
            <Combobox
              value={puestoId}
              onChange={setPuestoId}
              options={puestoOptions}
              placeholder="Sin puesto"
              allowClear
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Teléfono empresa</FieldLabel>
            <Input
              value={telefonoEmpresa}
              onChange={(e) => setTelefonoEmpresa(e.target.value)}
              placeholder="(844) 000-0000"
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Extensión</FieldLabel>
            <Input
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
              placeholder="101"
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
        </div>
      </div>

      {/* Personal info */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>Datos personales</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <FieldLabel>NSS</FieldLabel>
            <Input
              value={nss}
              onChange={(e) => setNss(e.target.value)}
              placeholder="000-00-0000-0"
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Fecha de nacimiento</FieldLabel>
            <Input
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <InfoRow
            label="Sexo"
            value={SEXO_LABELS[empleado.persona?.sexo ?? ''] ?? empleado.persona?.sexo ?? null}
          />
          <InfoRow
            label="Estado civil"
            value={
              ESTADO_CIVIL_LABELS[empleado.persona?.estado_civil ?? ''] ??
              empleado.persona?.estado_civil ??
              null
            }
          />
          <InfoRow label="Nacionalidad" value={empleado.persona?.nacionalidad ?? null} />
          <InfoRow label="Lugar de nacimiento" value={empleado.persona?.lugar_nacimiento ?? null} />
          <InfoRow label="Teléfono casa" value={empleado.persona?.telefono_casa ?? null} />
          <div className="sm:col-span-2 lg:col-span-3">
            <InfoRow label="Domicilio" value={empleado.persona?.domicilio ?? null} />
          </div>
        </div>
      </div>

      {/* IMSS */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>IMSS y régimen fiscal</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="UMF (Unidad Médica Familiar)" value={empleado.umf ?? null} />
          <InfoRow label="Zona de salario mínimo" value={empleado.zona_salario ?? null} />
          <InfoRow
            label="Régimen IMSS"
            value={
              REGIMEN_IMSS_LABELS[empleado.regimen_imss ?? ''] ?? empleado.regimen_imss ?? null
            }
          />
          <InfoRow label="Tipo de prestación" value={empleado.tipo_prestacion ?? null} />
          <InfoRow
            label="Categoría laboral"
            value={
              SINDICALIZADO_LABELS[empleado.sindicalizado ?? ''] ?? empleado.sindicalizado ?? null
            }
          />
          <InfoRow
            label="Método de pago SAT"
            value={
              METODO_PAGO_SAT_LABELS[empleado.metodo_pago_sat ?? ''] ??
              empleado.metodo_pago_sat ??
              null
            }
          />
          <InfoRow label="Tipo contrato" value={empleado.tipo_contrato ?? null} />
          <InfoRow label="Horario / turno" value={empleado.horario ?? null} />
          <InfoRow label="Lugar de trabajo" value={empleado.lugar_trabajo ?? null} />
          <InfoRow label="Día de pago" value={empleado.dia_pago ?? null} />
          <InfoRow label="Periodo de prueba (días)" value={empleado.periodo_prueba_dias ?? null} />
        </div>
        {empleado.funciones && (
          <div className="pt-2">
            <FieldLabel>Funciones</FieldLabel>
            <p className="text-sm text-[var(--text)] whitespace-pre-wrap">{empleado.funciones}</p>
          </div>
        )}
      </div>

      {/* Compensación vigente */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>Compensación vigente</SectionTitle>
        {compensacion ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Sueldo diario" value={formatMoney(compensacion.sueldo_diario)} />
            <InfoRow label="Sueldo mensual" value={formatMoney(compensacion.sueldo_mensual)} />
            <InfoRow label="SDI" value={formatMoney(compensacion.sdi)} />
            <InfoRow label="Tipo contrato" value={compensacion.tipo_contrato ?? null} />
            <InfoRow label="Frecuencia de pago" value={compensacion.frecuencia_pago ?? null} />
            <InfoRow label="Vigente desde" value={formatDate(compensacion.fecha_inicio)} />
            <InfoRow
              label="Comisiones mensuales"
              value={formatMoney(compensacion.comisiones_mensuales)}
            />
            <InfoRow
              label="Bonificaciones mensuales"
              value={formatMoney(compensacion.bonificaciones_mensuales)}
            />
            <InfoRow
              label="Compensaciones mensuales"
              value={formatMoney(compensacion.compensaciones_mensuales)}
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Sin compensación vigente registrada.</p>
        )}
      </div>

      {/* Banco / Pago vigente */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>Cuenta bancaria de nómina</SectionTitle>
        {pago ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow
              label="Banco"
              value={
                pago.banco_nombre ?? (pago.banco_codigo ? `Código ${pago.banco_codigo}` : null)
              }
            />
            <InfoRow label="Código de banco" value={pago.banco_codigo ?? null} />
            <InfoRow label="Número de cuenta" value={pago.numero_cuenta ?? null} />
            <InfoRow label="CLABE interbancaria" value={pago.clabe ?? null} />
            <InfoRow label="Sucursal" value={pago.sucursal ?? null} />
            <InfoRow label="Vigente desde" value={formatDate(pago.fecha_inicio)} />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Sin cuenta bancaria registrada.</p>
        )}
      </div>

      {/* Puestos asignados (multi via empleados_puestos) */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>Puestos asignados</SectionTitle>
        {puestosAsignados.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Sin puestos asignados en empleados_puestos.
          </p>
        ) : (
          <div className="space-y-2">
            {puestosAsignados.map((pa) => (
              <div
                key={pa.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"
              >
                <span className="text-sm font-medium text-[var(--text)]">
                  {pa.puesto?.nombre ?? '—'}
                </span>
                {pa.principal && (
                  <span className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    Principal
                  </span>
                )}
                {pa.fecha_fin && (
                  <span className="rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] text-[var(--text-subtle)]">
                    Vencido {formatDate(pa.fecha_fin)}
                  </span>
                )}
                <span className="ml-auto text-xs text-[var(--text-subtle)]">
                  desde {formatDate(pa.fecha_inicio)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contacto de emergencia */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>Contacto de emergencia</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InfoRow label="Nombre" value={empleado.persona?.contacto_emergencia_nombre ?? null} />
          <InfoRow
            label="Teléfono"
            value={empleado.persona?.contacto_emergencia_telefono ?? null}
          />
          <InfoRow
            label="Parentesco"
            value={empleado.persona?.contacto_emergencia_parentesco ?? null}
          />
        </div>
      </div>

      {/* Audit log */}
      {auditLog.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
          <SectionTitle>Historial de cambios (audit)</SectionTitle>
          <div className="space-y-2">
            {auditLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-xs"
              >
                <span
                  className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-medium ${
                    entry.accion === 'insert'
                      ? 'border-green-500/20 bg-green-500/10 text-green-400'
                      : entry.accion === 'update'
                        ? 'border-blue-500/20 bg-blue-500/10 text-blue-400'
                        : entry.accion === 'baja'
                          ? 'border-red-500/20 bg-red-500/10 text-red-400'
                          : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-subtle)]'
                  }`}
                >
                  {entry.accion}
                </span>
                <span className="text-[var(--text)]/70">{entry.origen}</span>
                {entry.match_metodo && (
                  <span className="text-[var(--text-subtle)]">via {entry.match_metodo}</span>
                )}
                <span className="ml-auto text-[var(--text-subtle)]">
                  {formatDate(entry.created_at.split('T')[0])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Baja info (read-only) */}
      {isBaja && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 space-y-3">
          <SectionTitle>Registro de baja</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Fecha de baja" value={formatDate(empleado.fecha_baja)} />
            <InfoRow label="Motivo" value={empleado.motivo_baja} />
          </div>
        </div>
      )}

      {/* Baja dialog */}
      <Dialog open={showBajaDialog} onOpenChange={setShowBajaDialog}>
        <DialogContent className="max-w-sm rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Dar de baja al empleado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
              <FieldLabel>Motivo de baja</FieldLabel>
              <Input
                placeholder="Renuncia voluntaria, término de contrato..."
                value={motivoBaja}
                onChange={(e) => setMotivoBaja(e.target.value)}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBajaDialog(false)}
              className="rounded-xl border-[var(--border)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleBaja}
              disabled={givingBaja}
              className="gap-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {givingBaja ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserX className="h-4 w-4" />
              )}
              Confirmar baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * @module Empleado detail (cross-empresa)
 * @responsive responsive
 */
export default function Page() {
  return (
    <RequireAccess adminOnly>
      <EmpleadoDetailInner />
    </RequireAccess>
  );
}

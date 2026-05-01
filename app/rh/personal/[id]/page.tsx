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

function EditField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'date' | 'number' | 'email' | 'tel';
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
      />
    </div>
  );
}

function EditCombo({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Combobox
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder ?? '—'}
        allowClear
        className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
      />
    </div>
  );
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

  // Editable fields — empleado
  const [numeroEmpleado, setNumeroEmpleado] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [departamentoId, setDepartamentoId] = useState('');
  const [puestoId, setPuestoId] = useState('');
  const [nss, setNss] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [telefonoEmpresa, setTelefonoEmpresa] = useState('');
  const [extension, setExtension] = useState('');
  const [emailEmpresa, setEmailEmpresa] = useState('');
  const [tipoContrato, setTipoContrato] = useState('');
  const [horario, setHorario] = useState('');
  const [lugarTrabajo, setLugarTrabajo] = useState('');
  const [diaPago, setDiaPago] = useState('');
  const [funciones, setFunciones] = useState('');
  const [periodoPrueba, setPeriodoPrueba] = useState('');
  const [umf, setUmf] = useState('');
  const [zonaSalario, setZonaSalario] = useState('');
  const [regimenImss, setRegimenImss] = useState('');
  const [tipoPrestacion, setTipoPrestacion] = useState('');
  const [sindicalizado, setSindicalizado] = useState('');
  const [metodoPagoSat, setMetodoPagoSat] = useState('');
  // Editable fields — persona
  const [personaEmail, setPersonaEmail] = useState('');
  const [personaTelefono, setPersonaTelefono] = useState('');
  const [personaTelefonoCasa, setPersonaTelefonoCasa] = useState('');
  const [personaSexo, setPersonaSexo] = useState('');
  const [personaEstadoCivil, setPersonaEstadoCivil] = useState('');
  const [personaNacionalidad, setPersonaNacionalidad] = useState('');
  const [personaLugarNacimiento, setPersonaLugarNacimiento] = useState('');
  const [personaDomicilio, setPersonaDomicilio] = useState('');
  const [contactoEmergenciaNombre, setContactoEmergenciaNombre] = useState('');
  const [contactoEmergenciaTelefono, setContactoEmergenciaTelefono] = useState('');
  const [contactoEmergenciaParentesco, setContactoEmergenciaParentesco] = useState('');
  // Editable fields — compensación
  const [compSueldoDiario, setCompSueldoDiario] = useState('');
  const [compSueldoMensual, setCompSueldoMensual] = useState('');
  const [compSdi, setCompSdi] = useState('');
  const [compFrecuencia, setCompFrecuencia] = useState('');
  const [compComisiones, setCompComisiones] = useState('');
  const [compBonificaciones, setCompBonificaciones] = useState('');
  const [compCompensaciones, setCompCompensaciones] = useState('');
  // Editable fields — pago
  const [pagoBancoCodigo, setPagoBancoCodigo] = useState('');
  const [pagoBancoNombre, setPagoBancoNombre] = useState('');
  const [pagoNumeroCuenta, setPagoNumeroCuenta] = useState('');
  const [pagoClabe, setPagoClabe] = useState('');
  const [pagoSucursal, setPagoSucursal] = useState('');

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
    setEmailEmpresa(emp.email_empresa ?? '');
    setTipoContrato(emp.tipo_contrato ?? '');
    setHorario(emp.horario ?? '');
    setLugarTrabajo(emp.lugar_trabajo ?? '');
    setDiaPago(emp.dia_pago ?? '');
    setFunciones(emp.funciones ?? '');
    setPeriodoPrueba(emp.periodo_prueba_dias != null ? String(emp.periodo_prueba_dias) : '');
    setUmf(emp.umf ?? '');
    setZonaSalario(emp.zona_salario ?? '');
    setRegimenImss(emp.regimen_imss ?? '');
    setTipoPrestacion(emp.tipo_prestacion ?? '');
    setSindicalizado(emp.sindicalizado ?? '');
    setMetodoPagoSat(emp.metodo_pago_sat ?? '');
    const pn = normalized.persona;
    setPersonaEmail(pn?.email ?? '');
    setPersonaTelefono(pn?.telefono ?? '');
    setPersonaTelefonoCasa(pn?.telefono_casa ?? '');
    setPersonaSexo(pn?.sexo ?? '');
    setPersonaEstadoCivil(pn?.estado_civil ?? '');
    setPersonaNacionalidad(pn?.nacionalidad ?? '');
    setPersonaLugarNacimiento(pn?.lugar_nacimiento ?? '');
    setPersonaDomicilio(pn?.domicilio ?? '');
    setContactoEmergenciaNombre(pn?.contacto_emergencia_nombre ?? '');
    setContactoEmergenciaTelefono(pn?.contacto_emergencia_telefono ?? '');
    setContactoEmergenciaParentesco(pn?.contacto_emergencia_parentesco ?? '');

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
    const comp = (compRes.data ?? null) as EmpleadoCompensacion | null;
    setCompensacion(comp);
    setCompSueldoDiario(comp?.sueldo_diario != null ? String(comp.sueldo_diario) : '');
    setCompSueldoMensual(comp?.sueldo_mensual != null ? String(comp.sueldo_mensual) : '');
    setCompSdi(comp?.sdi != null ? String(comp.sdi) : '');
    setCompFrecuencia(comp?.frecuencia_pago ?? '');
    setCompComisiones(comp?.comisiones_mensuales != null ? String(comp.comisiones_mensuales) : '');
    setCompBonificaciones(
      comp?.bonificaciones_mensuales != null ? String(comp.bonificaciones_mensuales) : ''
    );
    setCompCompensaciones(
      comp?.compensaciones_mensuales != null ? String(comp.compensaciones_mensuales) : ''
    );
    const pg = (pagoRes.data ?? null) as EmpleadoPago | null;
    setPago(pg);
    setPagoBancoCodigo(pg?.banco_codigo ?? '');
    setPagoBancoNombre(pg?.banco_nombre ?? '');
    setPagoNumeroCuenta(pg?.numero_cuenta ?? '');
    setPagoClabe(pg?.clabe ?? '');
    setPagoSucursal(pg?.sucursal ?? '');
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
    const todayISO = new Date().toISOString().split('T')[0];
    const trimOrNull = (s: string) => (s.trim() === '' ? null : s.trim());
    const numOrNull = (s: string) => {
      const v = parseFloat(s);
      return Number.isFinite(v) ? v : null;
    };
    const intOrNull = (s: string) => {
      const v = parseInt(s, 10);
      return Number.isFinite(v) ? v : null;
    };

    // 1. UPDATE erp.empleados
    const { error: empErr } = await supabase
      .schema('erp')
      .from('empleados')
      .update({
        numero_empleado: trimOrNull(numeroEmpleado),
        fecha_ingreso: fechaIngreso || null,
        departamento_id: departamentoId || null,
        puesto_id: puestoId || null,
        nss: trimOrNull(nss),
        fecha_nacimiento: fechaNacimiento || null,
        telefono_empresa: trimOrNull(telefonoEmpresa),
        extension: trimOrNull(extension),
        email_empresa: trimOrNull(emailEmpresa),
        tipo_contrato: trimOrNull(tipoContrato),
        horario: trimOrNull(horario),
        lugar_trabajo: trimOrNull(lugarTrabajo),
        dia_pago: trimOrNull(diaPago),
        funciones: trimOrNull(funciones),
        periodo_prueba_dias: intOrNull(periodoPrueba),
        umf: trimOrNull(umf),
        zona_salario: trimOrNull(zonaSalario),
        regimen_imss: trimOrNull(regimenImss),
        tipo_prestacion: trimOrNull(tipoPrestacion),
        sindicalizado: trimOrNull(sindicalizado),
        metodo_pago_sat: trimOrNull(metodoPagoSat),
      })
      .eq('id', empleado.id);
    if (empErr) {
      setSaving(false);
      alert(`Error al guardar empleado: ${empErr.message}`);
      return;
    }

    // 2. UPDATE erp.personas
    if (empleado.persona?.id) {
      const { error: pErr } = await supabase
        .schema('erp')
        .from('personas')
        .update({
          email: trimOrNull(personaEmail),
          telefono: trimOrNull(personaTelefono),
          telefono_casa: trimOrNull(personaTelefonoCasa),
          sexo: trimOrNull(personaSexo),
          estado_civil: trimOrNull(personaEstadoCivil),
          nacionalidad: trimOrNull(personaNacionalidad),
          lugar_nacimiento: trimOrNull(personaLugarNacimiento),
          domicilio: trimOrNull(personaDomicilio),
          contacto_emergencia_nombre: trimOrNull(contactoEmergenciaNombre),
          contacto_emergencia_telefono: trimOrNull(contactoEmergenciaTelefono),
          contacto_emergencia_parentesco: trimOrNull(contactoEmergenciaParentesco),
        })
        .eq('id', empleado.persona.id);
      if (pErr) {
        setSaving(false);
        alert(`Error al guardar persona: ${pErr.message}`);
        return;
      }
    }

    // 3. Upsert vigente de erp.empleados_compensacion (solo si hay datos)
    const compChanged =
      compSueldoDiario !==
        (compensacion?.sueldo_diario != null ? String(compensacion.sueldo_diario) : '') ||
      compSueldoMensual !==
        (compensacion?.sueldo_mensual != null ? String(compensacion.sueldo_mensual) : '') ||
      compSdi !== (compensacion?.sdi != null ? String(compensacion.sdi) : '') ||
      compFrecuencia !== (compensacion?.frecuencia_pago ?? '') ||
      compComisiones !==
        (compensacion?.comisiones_mensuales != null
          ? String(compensacion.comisiones_mensuales)
          : '') ||
      compBonificaciones !==
        (compensacion?.bonificaciones_mensuales != null
          ? String(compensacion.bonificaciones_mensuales)
          : '') ||
      compCompensaciones !==
        (compensacion?.compensaciones_mensuales != null
          ? String(compensacion.compensaciones_mensuales)
          : '');
    const compHasData =
      compSueldoDiario !== '' ||
      compSueldoMensual !== '' ||
      compSdi !== '' ||
      compFrecuencia !== '' ||
      compComisiones !== '' ||
      compBonificaciones !== '' ||
      compCompensaciones !== '';
    if (compChanged && compHasData) {
      if (compensacion?.id) {
        await supabase
          .schema('erp')
          .from('empleados_compensacion')
          .update({ vigente: false, fecha_fin: todayISO })
          .eq('id', compensacion.id);
      }
      const { error: cErr } = await supabase
        .schema('erp')
        .from('empleados_compensacion')
        .insert({
          empresa_id: empleado.empresa_id,
          empleado_id: empleado.id,
          sueldo_diario: numOrNull(compSueldoDiario),
          sueldo_mensual: numOrNull(compSueldoMensual),
          sdi: numOrNull(compSdi),
          frecuencia_pago: trimOrNull(compFrecuencia),
          comisiones_mensuales: numOrNull(compComisiones) ?? 0,
          bonificaciones_mensuales: numOrNull(compBonificaciones) ?? 0,
          compensaciones_mensuales: numOrNull(compCompensaciones) ?? 0,
          fecha_inicio: todayISO,
          vigente: true,
        });
      if (cErr) {
        setSaving(false);
        alert(`Error al guardar compensación: ${cErr.message}`);
        return;
      }
    }

    // 4. Upsert vigente de erp.empleados_pago (solo si hay datos)
    const pagoChanged =
      pagoBancoCodigo !== (pago?.banco_codigo ?? '') ||
      pagoBancoNombre !== (pago?.banco_nombre ?? '') ||
      pagoNumeroCuenta !== (pago?.numero_cuenta ?? '') ||
      pagoClabe !== (pago?.clabe ?? '') ||
      pagoSucursal !== (pago?.sucursal ?? '');
    const pagoHasMin =
      (pagoBancoCodigo.trim() !== '' || pagoBancoNombre.trim() !== '') &&
      (pagoNumeroCuenta.trim() !== '' || pagoClabe.trim() !== '');
    if (pagoChanged && pagoHasMin) {
      if (pago?.id) {
        await supabase
          .schema('erp')
          .from('empleados_pago')
          .update({ vigente: false, fecha_fin: todayISO })
          .eq('id', pago.id);
      }
      const { error: pgErr } = await supabase
        .schema('erp')
        .from('empleados_pago')
        .insert({
          empresa_id: empleado.empresa_id,
          empleado_id: empleado.id,
          banco_codigo: trimOrNull(pagoBancoCodigo),
          banco_nombre: trimOrNull(pagoBancoNombre),
          numero_cuenta: trimOrNull(pagoNumeroCuenta),
          clabe: trimOrNull(pagoClabe),
          sucursal: trimOrNull(pagoSucursal),
          fecha_inicio: todayISO,
          vigente: true,
        });
      if (pgErr) {
        setSaving(false);
        alert(`Error al guardar pago: ${pgErr.message}`);
        return;
      }
    }

    setSaving(false);
    await fetchAll();
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
            <InfoRow label="RFC" value={empleado.persona?.rfc ?? null} />
            <InfoRow label="CURP" value={empleado.persona?.curp ?? null} />
            <EditField
              label="Email personal"
              value={personaEmail}
              onChange={setPersonaEmail}
              type="email"
              placeholder="ej. juan@gmail.com"
            />
            <EditField
              label="Email empresa"
              value={emailEmpresa}
              onChange={setEmailEmpresa}
              type="email"
              placeholder="ej. juan@dilesa.mx"
            />
            <EditField
              label="Teléfono celular"
              value={personaTelefono}
              onChange={setPersonaTelefono}
              type="tel"
              placeholder="(844) 000-0000"
            />
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
          <EditCombo
            label="Sexo"
            value={personaSexo}
            onChange={setPersonaSexo}
            options={[
              { value: 'M', label: 'Masculino' },
              { value: 'F', label: 'Femenino' },
            ]}
          />
          <EditCombo
            label="Estado civil"
            value={personaEstadoCivil}
            onChange={setPersonaEstadoCivil}
            options={[
              { value: 'S', label: 'Soltero(a)' },
              { value: 'C', label: 'Casado(a)' },
              { value: 'U', label: 'Unión libre' },
              { value: 'V', label: 'Viudo(a)' },
              { value: 'D', label: 'Divorciado(a)' },
            ]}
          />
          <EditField
            label="Nacionalidad"
            value={personaNacionalidad}
            onChange={setPersonaNacionalidad}
            placeholder="Mexicana"
          />
          <EditField
            label="Lugar de nacimiento"
            value={personaLugarNacimiento}
            onChange={setPersonaLugarNacimiento}
            placeholder="Ciudad, Estado"
          />
          <EditField
            label="Teléfono casa"
            value={personaTelefonoCasa}
            onChange={setPersonaTelefonoCasa}
            type="tel"
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <EditField
              label="Domicilio"
              value={personaDomicilio}
              onChange={setPersonaDomicilio}
              placeholder="Calle, número, colonia, CP, ciudad"
            />
          </div>
        </div>
      </div>

      {/* IMSS */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>IMSS y régimen fiscal</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EditField
            label="UMF (Unidad Médica Familiar)"
            value={umf}
            onChange={setUmf}
            placeholder="79"
          />
          <EditCombo
            label="Zona de salario mínimo"
            value={zonaSalario}
            onChange={setZonaSalario}
            options={[
              { value: 'A', label: 'A — Zona Libre Frontera Norte' },
              { value: 'B', label: 'B — General' },
              { value: 'C', label: 'C — Otra' },
            ]}
          />
          <EditCombo
            label="Régimen IMSS"
            value={regimenImss}
            onChange={setRegimenImss}
            options={Object.entries(REGIMEN_IMSS_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <EditCombo
            label="Tipo de prestación"
            value={tipoPrestacion}
            onChange={setTipoPrestacion}
            options={[
              { value: 'De_Ley', label: 'De Ley' },
              { value: 'Superior_a_Ley', label: 'Superior a Ley' },
            ]}
          />
          <EditCombo
            label="Categoría laboral"
            value={sindicalizado}
            onChange={setSindicalizado}
            options={[
              { value: 'C', label: 'Confianza' },
              { value: 'S', label: 'Sindicalizado' },
            ]}
          />
          <EditCombo
            label="Método de pago SAT"
            value={metodoPagoSat}
            onChange={setMetodoPagoSat}
            options={Object.entries(METODO_PAGO_SAT_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <EditField label="Tipo contrato" value={tipoContrato} onChange={setTipoContrato} />
          <EditField
            label="Horario / turno"
            value={horario}
            onChange={setHorario}
            placeholder="Matutino"
          />
          <EditField label="Lugar de trabajo" value={lugarTrabajo} onChange={setLugarTrabajo} />
          <EditField
            label="Día de pago"
            value={diaPago}
            onChange={setDiaPago}
            placeholder="Viernes"
          />
          <EditField
            label="Periodo de prueba (días)"
            value={periodoPrueba}
            onChange={setPeriodoPrueba}
            type="number"
          />
        </div>
        <div className="pt-2">
          <FieldLabel>Funciones</FieldLabel>
          <textarea
            value={funciones}
            onChange={(e) => setFunciones(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
            placeholder="Descripción de funciones del puesto"
          />
        </div>
      </div>

      {/* Compensación vigente */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Compensación vigente</SectionTitle>
          {compensacion?.fecha_inicio && (
            <span className="text-xs text-[var(--text-subtle)]">
              Vigente desde {formatDate(compensacion.fecha_inicio)}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-subtle)]">
          Al guardar, los cambios cierran la fila vigente actual y crean una nueva — el histórico se
          preserva.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EditField
            label="Sueldo diario"
            value={compSueldoDiario}
            onChange={setCompSueldoDiario}
            type="number"
          />
          <EditField
            label="Sueldo mensual"
            value={compSueldoMensual}
            onChange={setCompSueldoMensual}
            type="number"
          />
          <EditField label="SDI" value={compSdi} onChange={setCompSdi} type="number" />
          <EditCombo
            label="Frecuencia de pago"
            value={compFrecuencia}
            onChange={setCompFrecuencia}
            options={[
              { value: 'semanal', label: 'Semanal' },
              { value: 'quincenal', label: 'Quincenal' },
              { value: 'mensual', label: 'Mensual' },
            ]}
          />
          <EditField
            label="Comisiones mensuales"
            value={compComisiones}
            onChange={setCompComisiones}
            type="number"
          />
          <EditField
            label="Bonificaciones mensuales"
            value={compBonificaciones}
            onChange={setCompBonificaciones}
            type="number"
          />
          <EditField
            label="Compensaciones mensuales"
            value={compCompensaciones}
            onChange={setCompCompensaciones}
            type="number"
          />
        </div>
      </div>

      {/* Banco / Pago vigente */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Cuenta bancaria de nómina</SectionTitle>
          {pago?.fecha_inicio && (
            <span className="text-xs text-[var(--text-subtle)]">
              Vigente desde {formatDate(pago.fecha_inicio)}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-subtle)]">
          Captura banco + (cuenta o CLABE). CLABE debe ser 18 dígitos. Cambios cierran la fila
          vigente y crean una nueva.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EditField
            label="Banco — código (3 dígitos)"
            value={pagoBancoCodigo}
            onChange={setPagoBancoCodigo}
            placeholder="012"
          />
          <EditField
            label="Banco — nombre"
            value={pagoBancoNombre}
            onChange={setPagoBancoNombre}
            placeholder="BBVA"
          />
          <EditField label="Sucursal" value={pagoSucursal} onChange={setPagoSucursal} />
          <EditField
            label="Número de cuenta"
            value={pagoNumeroCuenta}
            onChange={setPagoNumeroCuenta}
          />
          <EditField
            label="CLABE interbancaria (18 dígitos)"
            value={pagoClabe}
            onChange={setPagoClabe}
            placeholder="012180000000000000"
          />
        </div>
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
          <EditField
            label="Nombre"
            value={contactoEmergenciaNombre}
            onChange={setContactoEmergenciaNombre}
          />
          <EditField
            label="Teléfono"
            value={contactoEmergenciaTelefono}
            onChange={setContactoEmergenciaTelefono}
            type="tel"
          />
          <EditField
            label="Parentesco"
            value={contactoEmergenciaParentesco}
            onChange={setContactoEmergenciaParentesco}
            placeholder="Madre, Pareja, Hermano(a)..."
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

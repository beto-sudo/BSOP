'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect --
 * Cleanup PR (#30): pre-existing debt. `any` in Supabase row mapping;
 * set-state-in-effect in data-sync pattern. Both are behavioral rewrites,
 * out of scope for bulk lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { usePermissions } from '@/components/providers';
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
import { ArrowLeft, Save, Loader2, UserX, Pencil, X } from 'lucide-react';

const EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
const EMPRESA_SLUG = 'rdb';

type Persona = {
  id: string;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
  telefono: string | null;
  rfc: string | null;
  curp: string | null;
  nss: string | null;
  fecha_nacimiento: string | null;
};

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
  activo: boolean;
  persona: Persona | null;
  departamento: { id: string; nombre: string } | null;
  puesto: { id: string; nombre: string } | null;
};

type Compensacion = {
  id: string;
  sueldo_mensual: number | null;
  sueldo_diario: number | null;
  comisiones_mensuales: number | null;
  bonificaciones_mensuales: number | null;
  compensaciones_mensuales: number | null;
  sdi: number | null;
  tipo_contrato: string | null;
  frecuencia_pago: string | null;
};

type Departamento = { id: string; nombre: string };
type Puesto = { id: string; nombre: string };

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

function calcAge(d: string | null): string | null {
  if (!d) return null;
  const birth = new Date(d.includes('T') ? d : `${d}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  )
    age--;
  return `${age} años`;
}

function calcSeniority(d: string | null): string | null {
  if (!d) return null;
  const start = new Date(d.includes('T') ? d : `${d}T00:00:00`);
  const now = new Date();
  const years = now.getFullYear() - start.getFullYear();
  const months = now.getMonth() - start.getMonth() + (now.getDate() < start.getDate() ? -1 : 0);
  const totalMonths = years * 12 + months;
  if (totalMonths < 12) return `${Math.max(0, totalMonths)} meses`;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  return m > 0
    ? `${y} año${y !== 1 ? 's' : ''}, ${m} mes${m !== 1 ? 'es' : ''}`
    : `${y} año${y !== 1 ? 's' : ''}`;
}

function formatCurrency(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-3">
      {children}
    </h2>
  );
}

function InfoRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | null;
  sub?: string | null;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="text-sm text-[var(--text)]">{value || '—'}</p>
      {sub && <p className="text-xs text-[var(--text-subtle)] mt-0.5">{sub}</p>}
    </div>
  );
}

const TIPO_CONTRATO_LABELS: Record<string, string> = {
  indefinido: 'Indefinido',
  temporal: 'Temporal',
  por_obra: 'Por obra',
  honorarios: 'Honorarios',
};

function EmpleadoDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();
  const { permissions } = usePermissions();
  const isAdmin = permissions.isAdmin;

  const [empleado, setEmpleado] = useState<EmpleadoDetail | null>(null);
  const [compensacion, setCompensacion] = useState<Compensacion | null>(null);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [numeroEmpleado, setNumeroEmpleado] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [departamentoId, setDepartamentoId] = useState('');
  const [puestoId, setPuestoId] = useState('');
  const [nss, setNss] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [telefonoEmpresa, setTelefonoEmpresa] = useState('');
  const [extensionVal, setExtensionVal] = useState('');
  const [emailEmpresa, setEmailEmpresa] = useState('');

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

  const [showBajaDialog, setShowBajaDialog] = useState(false);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().split('T')[0]);
  const [givingBaja, setGivingBaja] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: emp, error: eErr } = await supabase
      .schema('erp')
      .from('empleados')
      .select(
        'id, empresa_id, numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, nss, fecha_nacimiento, telefono_empresa, extension, email_empresa, activo, persona:persona_id(id, nombre, apellido_paterno, apellido_materno, email, telefono, rfc, curp, nss, fecha_nacimiento), departamento:departamento_id(id, nombre), puesto:puesto_id(id, nombre)'
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
    setExtensionVal(emp.extension ?? '');
    setEmailEmpresa(emp.email_empresa ?? '');

    const [deptRes, puestosRes, compRes] = await Promise.all([
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
          'id, sueldo_mensual, sueldo_diario, comisiones_mensuales, bonificaciones_mensuales, compensaciones_mensuales, sdi, tipo_contrato, frecuencia_pago'
        )
        .eq('empleado_id', id)
        .eq('vigente', true)
        .maybeSingle(),
    ]);
    setDepartamentos(deptRes.data ?? []);
    setPuestos(puestosRes.data ?? []);
    setCompensacion(compRes.data as Compensacion | null);
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
        extension: extensionVal.trim() || null,
        email_empresa: emailEmpresa.trim() || null,
      })
      .eq('id', empleado.id);
    setSaving(false);
    if (err) {
      alert(`Error al guardar: ${err.message}`);
      return;
    }
    setEditing(false);
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
        <Skeleton className="h-32 w-full rounded-2xl" />
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
  const persona = empleado.persona;
  const birthDate = persona?.fecha_nacimiento ?? empleado.fecha_nacimiento;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/${EMPRESA_SLUG}/rh/empleados`)}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-2xl font-bold text-[var(--accent)]">
            {(persona?.nombre?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
              {fullName(empleado)}
            </h1>
            <p className="text-xs text-[var(--text)]/50 mt-0.5">
              {empleado.puesto?.nombre ?? 'Sin puesto'} ·{' '}
              {empleado.departamento?.nombre ?? 'Sin departamento'}
            </p>
          </div>
          {isBaja ? (
            <span className="inline-flex items-center rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
              Inactivo
            </span>
          ) : (
            <span className="inline-flex items-center rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
              Activo
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {!isBaja && (
              <Button
                variant="outline"
                onClick={() => setShowBajaDialog(true)}
                className="gap-1.5 rounded-xl border-red-500/40 text-red-500 hover:bg-red-500/10"
              >
                <UserX className="h-4 w-4" /> Dar de baja
              </Button>
            )}
            {editing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setEditing(false)}
                  className="gap-1.5 rounded-xl border-[var(--border)] text-[var(--text)]"
                >
                  <X className="h-4 w-4" /> Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}{' '}
                  Guardar
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setEditing(true)}
                className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              >
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Baja warning banner */}
      {isBaja && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 space-y-3">
          <SectionTitle>Registro de baja</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Fecha de baja" value={formatDate(empleado.fecha_baja)} />
            <InfoRow label="Motivo" value={empleado.motivo_baja} />
          </div>
        </div>
      )}

      {/* Personal info */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <SectionTitle>Datos personales</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Nombre completo" value={fullName(empleado)} />
          <InfoRow label="Email personal" value={persona?.email ?? null} />
          <InfoRow label="Teléfono personal" value={persona?.telefono ?? null} />
          <InfoRow label="RFC" value={persona?.rfc ?? null} />
          <InfoRow label="CURP" value={persona?.curp ?? null} />
          <InfoRow label="NSS" value={persona?.nss ?? empleado.nss ?? null} />
          <InfoRow
            label="Fecha de nacimiento"
            value={formatDate(birthDate)}
            sub={calcAge(birthDate)}
          />
        </div>
      </div>

      {/* Employment info */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>Datos laborales</SectionTitle>
        {editing ? (
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
              <FieldLabel>Email empresa</FieldLabel>
              <Input
                value={emailEmpresa}
                onChange={(e) => setEmailEmpresa(e.target.value)}
                placeholder="nombre@rdb.com"
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
                value={extensionVal}
                onChange={(e) => setExtensionVal(e.target.value)}
                placeholder="101"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
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
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="No. Empleado" value={empleado.numero_empleado} />
            <InfoRow
              label="Fecha de ingreso"
              value={formatDate(empleado.fecha_ingreso)}
              sub={calcSeniority(empleado.fecha_ingreso)}
            />
            <InfoRow label="Departamento" value={empleado.departamento?.nombre ?? null} />
            <InfoRow label="Puesto" value={empleado.puesto?.nombre ?? null} />
            <InfoRow label="Email empresa" value={empleado.email_empresa} />
            <InfoRow label="Teléfono empresa" value={empleado.telefono_empresa} />
            <InfoRow label="Extensión" value={empleado.extension} />
          </div>
        )}
      </div>

      {/* Compensation (admin only) */}
      {isAdmin && compensacion && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
          <SectionTitle>Compensación</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Sueldo mensual" value={formatCurrency(compensacion.sueldo_mensual)} />
            <InfoRow label="Comisiones" value={formatCurrency(compensacion.comisiones_mensuales)} />
            <InfoRow
              label="Bonificaciones"
              value={formatCurrency(compensacion.bonificaciones_mensuales)}
            />
            <InfoRow
              label="Compensaciones"
              value={formatCurrency(compensacion.compensaciones_mensuales)}
            />
            <InfoRow label="SDI" value={formatCurrency(compensacion.sdi)} />
            <InfoRow
              label="Tipo de contrato"
              value={
                compensacion.tipo_contrato
                  ? (TIPO_CONTRATO_LABELS[compensacion.tipo_contrato] ?? compensacion.tipo_contrato)
                  : null
              }
            />
          </div>
          <Separator className="bg-[var(--border)]" />
          <div className="grid grid-cols-2 gap-4">
            <InfoRow
              label="Total percepciones mensuales"
              value={formatCurrency(
                (compensacion.sueldo_mensual ?? 0) +
                  (compensacion.comisiones_mensuales ?? 0) +
                  (compensacion.bonificaciones_mensuales ?? 0) +
                  (compensacion.compensaciones_mensuales ?? 0)
              )}
            />
            <InfoRow
              label="Frecuencia de pago"
              value={
                compensacion.frecuencia_pago
                  ? compensacion.frecuencia_pago.charAt(0).toUpperCase() +
                    compensacion.frecuencia_pago.slice(1)
                  : null
              }
            />
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
              )}{' '}
              Confirmar baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.rh.empleados">
      <EmpleadoDetailInner />
    </RequireAccess>
  );
}

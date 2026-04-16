'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  activo: boolean;
  persona: {
    id: string;
    nombre: string;
    apellido_paterno: string | null;
    apellido_materno: string | null;
    email: string | null;
    telefono: string | null;
    rfc: string | null;
    curp: string | null;
  } | null;
  departamento: { id: string; nombre: string } | null;
  puesto: { id: string; nombre: string } | null;
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-3">
      {children}
    </h2>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="text-sm text-[var(--text)]">{value || '—'}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function EmpleadoDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();

  const [empleado, setEmpleado] = useState<EmpleadoDetail | null>(null);
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

  // Baja dialog
  const [showBajaDialog, setShowBajaDialog] = useState(false);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().split('T')[0]);
  const [givingBaja, setGivingBaja] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: emp, error: eErr } = await supabase
      .schema('erp')
      .from('empleados')
      .select('id, empresa_id, numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, nss, fecha_nacimiento, telefono_empresa, extension, activo, persona:persona_id(id, nombre, apellido_paterno, apellido_materno, email, telefono, rfc, curp), departamento:departamento_id(id, nombre), puesto:puesto_id(id, nombre)')
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
      departamento: Array.isArray(emp.departamento) ? (emp.departamento[0] ?? null) : emp.departamento,
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

    const [deptRes, puestosRes] = await Promise.all([
      supabase.schema('erp').from('departamentos').select('id, nombre').eq('empresa_id', emp.empresa_id).eq('activo', true).order('nombre'),
      supabase.schema('erp').from('puestos').select('id, nombre').eq('empresa_id', emp.empresa_id).eq('activo', true).order('nombre'),
    ]);
    setDepartamentos(deptRes.data ?? []);
    setPuestos(puestosRes.data ?? []);

    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

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
    if (err) { alert(`Error: ${err.message}`); return; }
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
            onClick={() => router.push('/rh/empleados')}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">{fullName(empleado)}</h1>
            <p className="text-xs text-[var(--text)]/50 mt-0.5">
              {empleado.puesto?.nombre ?? 'Sin puesto'} · {empleado.departamento?.nombre ?? 'Sin departamento'}
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
            <Select value={departamentoId} onValueChange={(v) => setDepartamentoId(v ?? '')}>
              <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue placeholder="Sin departamento" />
              </SelectTrigger>
              <SelectContent>
                {departamentos.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Puesto</FieldLabel>
            <Select value={puestoId} onValueChange={(v) => setPuestoId(v ?? '')}>
              <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue placeholder="Sin puesto" />
              </SelectTrigger>
              <SelectContent>
                {puestos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </div>
      </div>

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
              {givingBaja ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
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
    <RequireAccess adminOnly>
      <EmpleadoDetailInner />
    </RequireAccess>
  );
}

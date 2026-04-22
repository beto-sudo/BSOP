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
import { composeFullName, titleCase } from '@/lib/name-case';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { EmpleadoAdjuntos } from '@/components/rh/empleado-adjuntos';
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
import { ArrowLeft, Save, Loader2, UserX, Pencil, X, FileText, FileSignature } from 'lucide-react';

const EMPRESA_SLUG = 'dilesa';

type Persona = {
  id: string;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
  telefono: string | null;
  telefono_casa: string | null;
  rfc: string | null;
  curp: string | null;
  nss: string | null;
  fecha_nacimiento: string | null;
  domicilio: string | null;
  nacionalidad: string | null;
  estado_civil: string | null;
  sexo: string | null;
  lugar_nacimiento: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  contacto_emergencia_parentesco: string | null;
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
  tipo_contrato: string | null;
  periodo_prueba_dias: number | null;
  periodo_prueba_numero: number | null;
  horario: string | null;
  lugar_trabajo: string | null;
  dia_pago: string | null;
  funciones: string | null;
  notas: string | null;
  activo: boolean;
  persona: Persona | null;
  departamento: { id: string; nombre: string } | null;
  puesto: { id: string; nombre: string } | null;
};

type Beneficiario = {
  id: string;
  nombre: string;
  parentesco: string | null;
  porcentaje: number | null;
  telefono: string | null;
  orden: number;
};

const TIPO_CONTRATO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'prueba', label: 'Periodo de prueba (Art. 39-A)' },
  { value: 'indefinido', label: 'Tiempo indefinido / Planta' },
  { value: 'determinado', label: 'Tiempo determinado (Art. 37)' },
  { value: 'obra', label: 'Obra determinada (Art. 37)' },
  { value: 'temporada', label: 'Temporada' },
  { value: 'capacitacion_inicial', label: 'Capacitación inicial (Art. 39-B)' },
];

const ESTADO_CIVIL_OPTIONS = ['Soltero/a', 'Casado/a', 'Unión libre', 'Divorciado/a', 'Viudo/a'];
const SEXO_OPTIONS = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'X', label: 'Otro / No especifica' },
];

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
  return (
    composeFullName(
      emp.persona.nombre,
      emp.persona.apellido_paterno,
      emp.persona.apellido_materno
    ) || '—'
  );
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

/**
 * BeneficiariosSection — CRUD simple para Art. 501 LFT.
 * Los beneficiarios se guardan en `erp.empleado_beneficiarios` con nombre,
 * parentesco, porcentaje y teléfono. No se valida que la suma de porcentajes
 * sea 100 — el patrón debe declarar porcentajes equivalentes (la ley permite
 * que se compartan en partes iguales si no se especifica).
 */
function BeneficiariosSection({
  empleadoId,
  empresaId,
  beneficiarios,
  canEdit,
  onRefresh,
}: {
  empleadoId: string;
  empresaId: string;
  beneficiarios: Beneficiario[];
  canEdit: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const supabase = createSupabaseERPClient();
  const [adding, setAdding] = useState(false);
  const [nombre, setNombre] = useState('');
  const [parentesco, setParentesco] = useState('');
  const [telefono, setTelefono] = useState('');
  const [porcentaje, setPorcentaje] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const nombreClean = titleCase(nombre);
    if (!nombreClean) return;
    setSaving(true);
    const pct = porcentaje ? Number(porcentaje) : null;
    const { error } = await supabase
      .schema('erp')
      .from('empleado_beneficiarios')
      .insert({
        empresa_id: empresaId,
        empleado_id: empleadoId,
        nombre: nombreClean,
        parentesco: titleCase(parentesco) || null,
        telefono: telefono.trim() || null,
        porcentaje: pct,
        orden: beneficiarios.length + 1,
      });
    setSaving(false);
    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }
    setNombre('');
    setParentesco('');
    setTelefono('');
    setPorcentaje('');
    setAdding(false);
    await onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este beneficiario?')) return;
    const { error } = await supabase
      .schema('erp')
      .from('empleado_beneficiarios')
      .delete()
      .eq('id', id);
    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }
    await onRefresh();
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Beneficiarios (Art. 501 LFT)</SectionTitle>
        {canEdit && !adding && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            className="gap-1.5 rounded-xl border-[var(--border)] text-[var(--text)]"
          >
            + Agregar
          </Button>
        )}
      </div>
      {beneficiarios.length === 0 && !adding ? (
        <p className="text-xs text-[var(--text-subtle)]">
          Sin beneficiarios registrados. El Art. 501 LFT permite designar a quién pagarle salarios y
          prestaciones devengadas en caso de fallecimiento del trabajador.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {beneficiarios.map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)]">{b.nombre}</p>
                <p className="text-xs text-[var(--text)]/50">
                  {[b.parentesco, b.telefono, b.porcentaje != null ? `${b.porcentaje}%` : null]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(b.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text)]/30 hover:text-red-400"
                  title="Eliminar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input
            placeholder="Nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={(e) => setNombre(titleCase(e.target.value))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
          <Input
            placeholder="Parentesco"
            value={parentesco}
            onChange={(e) => setParentesco(e.target.value)}
            onBlur={(e) => setParentesco(titleCase(e.target.value))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
          <Input
            placeholder="Teléfono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
          <div className="flex gap-2">
            <Input
              placeholder="% (opc.)"
              type="number"
              min="0"
              max="100"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] w-24"
            />
            <Button
              onClick={handleAdd}
              disabled={saving || !nombre.trim()}
              size="sm"
              className="rounded-xl bg-[var(--accent)] text-white"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setAdding(false)}
              size="sm"
              className="rounded-xl border-[var(--border)] text-[var(--text)]"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
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

  // Campos de persona (se guardan en erp.personas, no en erp.empleados).
  // Se mantienen separados en el UI para que Nombre/Ap.Paterno/Ap.Materno
  // queden siempre en campos distintos y el nombre completo se compone.
  const [pNombre, setPNombre] = useState('');
  const [pApellidoPaterno, setPApellidoPaterno] = useState('');
  const [pApellidoMaterno, setPApellidoMaterno] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pTelefono, setPTelefono] = useState('');
  const [pTelefonoCasa, setPTelefonoCasa] = useState('');
  const [pRfc, setPRfc] = useState('');
  const [pCurp, setPCurp] = useState('');
  const [pDomicilio, setPDomicilio] = useState('');
  const [pNacionalidad, setPNacionalidad] = useState('Mexicana');
  const [pEstadoCivil, setPEstadoCivil] = useState('');
  const [pSexo, setPSexo] = useState('');
  const [pLugarNac, setPLugarNac] = useState('');
  const [pEmergNombre, setPEmergNombre] = useState('');
  const [pEmergTelefono, setPEmergTelefono] = useState('');
  const [pEmergParentesco, setPEmergParentesco] = useState('');

  // Campos adicionales de empleado (LFT)
  const [tipoContrato, setTipoContrato] = useState('');
  const [periodoPruebaDias, setPeriodoPruebaDias] = useState('');
  const [periodoPruebaNumero, setPeriodoPruebaNumero] = useState('');
  const [horario, setHorario] = useState('');
  const [lugarTrabajo, setLugarTrabajo] = useState('');
  const [diaPago, setDiaPago] = useState('');
  const [funciones, setFunciones] = useState('');
  const [notas, setNotas] = useState('');

  // Beneficiarios (Art. 501 LFT)
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([]);

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
        `id, empresa_id, numero_empleado, fecha_ingreso, fecha_baja, motivo_baja,
         nss, fecha_nacimiento, telefono_empresa, extension, email_empresa,
         tipo_contrato, periodo_prueba_dias, periodo_prueba_numero, horario,
         lugar_trabajo, dia_pago, funciones, notas, activo,
         persona:persona_id(id, nombre, apellido_paterno, apellido_materno, email,
           telefono, telefono_casa, rfc, curp, nss, fecha_nacimiento,
           domicilio, nacionalidad, estado_civil, sexo, lugar_nacimiento,
           contacto_emergencia_nombre, contacto_emergencia_telefono,
           contacto_emergencia_parentesco),
         departamento:departamento_id(id, nombre),
         puesto:puesto_id(id, nombre)`
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
    setTipoContrato((emp as any).tipo_contrato ?? '');
    setPeriodoPruebaDias((emp as any).periodo_prueba_dias?.toString() ?? '');
    setPeriodoPruebaNumero((emp as any).periodo_prueba_numero?.toString() ?? '');
    setHorario((emp as any).horario ?? '');
    setLugarTrabajo((emp as any).lugar_trabajo ?? '');
    setDiaPago((emp as any).dia_pago ?? '');
    setFunciones((emp as any).funciones ?? '');
    setNotas((emp as any).notas ?? '');

    const p = normalized.persona;
    setPNombre(p?.nombre ?? '');
    setPApellidoPaterno(p?.apellido_paterno ?? '');
    setPApellidoMaterno(p?.apellido_materno ?? '');
    setPEmail(p?.email ?? '');
    setPTelefono(p?.telefono ?? '');
    setPTelefonoCasa((p as any)?.telefono_casa ?? '');
    setPRfc(p?.rfc ?? '');
    setPCurp(p?.curp ?? '');
    setPDomicilio((p as any)?.domicilio ?? '');
    setPNacionalidad((p as any)?.nacionalidad ?? 'Mexicana');
    setPEstadoCivil((p as any)?.estado_civil ?? '');
    setPSexo((p as any)?.sexo ?? '');
    setPLugarNac((p as any)?.lugar_nacimiento ?? '');
    setPEmergNombre((p as any)?.contacto_emergencia_nombre ?? '');
    setPEmergTelefono((p as any)?.contacto_emergencia_telefono ?? '');
    setPEmergParentesco((p as any)?.contacto_emergencia_parentesco ?? '');

    const [deptRes, puestosRes, compRes, fotoRes, benefRes] = await Promise.all([
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
      supabase
        .schema('erp')
        .from('adjuntos')
        .select('url')
        .eq('entidad_tipo', 'empleado')
        .eq('entidad_id', id)
        .eq('rol', 'foto')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .schema('erp')
        .from('empleado_beneficiarios')
        .select('id, nombre, parentesco, porcentaje, telefono, orden')
        .eq('empleado_id', id)
        .order('orden'),
    ]);
    setDepartamentos(deptRes.data ?? []);
    setPuestos(puestosRes.data ?? []);
    setCompensacion(compRes.data as Compensacion | null);
    const fotoPath = (fotoRes.data as { url?: string } | null)?.url ?? null;
    setPhotoUrl(fotoPath ? getAdjuntoProxyUrl(fotoPath) : null);
    setBeneficiarios((benefRes.data ?? []) as Beneficiario[]);
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleSave = async () => {
    if (!empleado) return;
    setSaving(true);

    // 1) Empleado fields
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
        email_empresa: emailEmpresa.trim().toLowerCase() || null,
        tipo_contrato: tipoContrato || null,
        periodo_prueba_dias: periodoPruebaDias ? Number(periodoPruebaDias) : null,
        periodo_prueba_numero: periodoPruebaNumero ? Number(periodoPruebaNumero) : null,
        horario: horario.trim() || null,
        lugar_trabajo: lugarTrabajo.trim() || null,
        dia_pago: diaPago.trim() || null,
        funciones: funciones.trim() || null,
        notas: notas.trim() || null,
      })
      .eq('id', empleado.id);

    // 2) Persona fields — aplicamos title-case a nombre/apellidos para
    //    mantener consistencia (entradas antiguas vienen en MAYÚSCULAS).
    let personaErr: string | null = null;
    if (empleado.persona?.id) {
      const nombreClean = titleCase(pNombre);
      if (!nombreClean) {
        setSaving(false);
        alert('El nombre no puede quedar vacío.');
        return;
      }
      const { error: pErr } = await supabase
        .schema('erp')
        .from('personas')
        .update({
          nombre: nombreClean,
          apellido_paterno: titleCase(pApellidoPaterno) || null,
          apellido_materno: titleCase(pApellidoMaterno) || null,
          email: pEmail.trim().toLowerCase() || null,
          telefono: pTelefono.trim() || null,
          telefono_casa: pTelefonoCasa.trim() || null,
          rfc: pRfc.trim().toUpperCase() || null,
          curp: pCurp.trim().toUpperCase() || null,
          domicilio: pDomicilio.trim() || null,
          nacionalidad: pNacionalidad.trim() || null,
          estado_civil: pEstadoCivil || null,
          sexo: pSexo || null,
          lugar_nacimiento: pLugarNac.trim() || null,
          contacto_emergencia_nombre: titleCase(pEmergNombre) || null,
          contacto_emergencia_telefono: pEmergTelefono.trim() || null,
          contacto_emergencia_parentesco: pEmergParentesco.trim() || null,
        })
        .eq('id', empleado.persona.id);
      if (pErr) personaErr = pErr.message;
    }

    setSaving(false);
    if (err || personaErr) {
      alert(`Error al guardar: ${err?.message ?? personaErr}`);
      return;
    }
    setEditing(false);
    await fetchAll();
  };

  const handleBaja = async (generarFiniquito = false) => {
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
    if (generarFiniquito) {
      router.push(`/${EMPRESA_SLUG}/rh/empleados/${empleado.id}/finiquito`);
      return;
    }
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
          {photoUrl ? (
            <a
              href={photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
              title="Ver foto completa"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt={fullName(empleado)}
                className="h-32 w-32 rounded-2xl border border-[var(--border)] object-cover shadow-sm"
              />
            </a>
          ) : (
            <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-5xl font-bold text-[var(--accent)]">
              {(titleCase(persona?.nombre ?? '').charAt(0) || '?').toUpperCase()}
            </div>
          )}
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
            <Button
              variant="outline"
              onClick={() => router.push(`/${EMPRESA_SLUG}/rh/empleados/${empleado.id}/contrato`)}
              className="gap-1.5 rounded-xl border-[var(--border)] text-[var(--text)]"
              title="Generar contrato individual de trabajo"
            >
              <FileText className="h-4 w-4" /> Contrato
            </Button>
            {isBaja && (
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/${EMPRESA_SLUG}/rh/empleados/${empleado.id}/finiquito`)
                }
                className="gap-1.5 rounded-xl border-[var(--border)] text-[var(--text)]"
                title="Generar convenio de terminación y finiquito"
              >
                <FileSignature className="h-4 w-4" /> Finiquito
              </Button>
            )}
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
        {editing ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <FieldLabel required>Nombre(s)</FieldLabel>
              <Input
                value={pNombre}
                onChange={(e) => setPNombre(e.target.value)}
                onBlur={(e) => setPNombre(titleCase(e.target.value))}
                placeholder="Juan Carlos"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Apellido paterno</FieldLabel>
              <Input
                value={pApellidoPaterno}
                onChange={(e) => setPApellidoPaterno(e.target.value)}
                onBlur={(e) => setPApellidoPaterno(titleCase(e.target.value))}
                placeholder="Pérez"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Apellido materno</FieldLabel>
              <Input
                value={pApellidoMaterno}
                onChange={(e) => setPApellidoMaterno(e.target.value)}
                onBlur={(e) => setPApellidoMaterno(titleCase(e.target.value))}
                placeholder="González"
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
            <div>
              <FieldLabel>Lugar de nacimiento</FieldLabel>
              <Input
                value={pLugarNac}
                onChange={(e) => setPLugarNac(e.target.value)}
                onBlur={(e) => setPLugarNac(titleCase(e.target.value))}
                placeholder="Piedras Negras, Coahuila"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Nacionalidad</FieldLabel>
              <Input
                value={pNacionalidad}
                onChange={(e) => setPNacionalidad(e.target.value)}
                onBlur={(e) => setPNacionalidad(titleCase(e.target.value))}
                placeholder="Mexicana"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Estado civil</FieldLabel>
              <Combobox
                value={pEstadoCivil}
                onChange={setPEstadoCivil}
                options={ESTADO_CIVIL_OPTIONS.map((o) => ({ value: o, label: o }))}
                placeholder="Seleccionar…"
                allowClear
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Sexo</FieldLabel>
              <Combobox
                value={pSexo}
                onChange={setPSexo}
                options={SEXO_OPTIONS}
                placeholder="Seleccionar…"
                allowClear
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>RFC</FieldLabel>
              <Input
                value={pRfc}
                onChange={(e) => setPRfc(e.target.value.toUpperCase())}
                placeholder="XXXX000000XXX"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
              />
            </div>
            <div>
              <FieldLabel>CURP</FieldLabel>
              <Input
                value={pCurp}
                onChange={(e) => setPCurp(e.target.value.toUpperCase())}
                placeholder="XXXX000000XXXXXX00"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
              />
            </div>
            <div>
              <FieldLabel>NSS</FieldLabel>
              <Input
                value={nss}
                onChange={(e) => setNss(e.target.value)}
                placeholder="00000000000"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <FieldLabel>Domicilio</FieldLabel>
              <Input
                value={pDomicilio}
                onChange={(e) => setPDomicilio(e.target.value)}
                placeholder="Calle, número, colonia, C.P., ciudad, estado"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Nombre completo" value={fullName(empleado)} />
            <InfoRow
              label="Fecha de nacimiento"
              value={formatDate(birthDate)}
              sub={calcAge(birthDate)}
            />
            <InfoRow label="Lugar de nacimiento" value={persona?.lugar_nacimiento ?? null} />
            <InfoRow label="Nacionalidad" value={persona?.nacionalidad ?? null} />
            <InfoRow label="Estado civil" value={persona?.estado_civil ?? null} />
            <InfoRow
              label="Sexo"
              value={
                persona?.sexo
                  ? (SEXO_OPTIONS.find((o) => o.value === persona.sexo)?.label ?? persona.sexo)
                  : null
              }
            />
            <InfoRow label="RFC" value={persona?.rfc ?? null} />
            <InfoRow label="CURP" value={persona?.curp ?? null} />
            <InfoRow label="NSS" value={persona?.nss ?? empleado.nss ?? null} />
            <div className="sm:col-span-2 lg:col-span-3">
              <InfoRow label="Domicilio" value={persona?.domicilio ?? null} />
            </div>
          </div>
        )}
      </div>

      {/* Contacto */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <SectionTitle>Contacto</SectionTitle>
        {editing ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <FieldLabel>Email personal</FieldLabel>
              <Input
                value={pEmail}
                onChange={(e) => setPEmail(e.target.value)}
                placeholder="correo@dominio.com"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Teléfono celular</FieldLabel>
              <Input
                value={pTelefono}
                onChange={(e) => setPTelefono(e.target.value)}
                placeholder="(878) 000-0000"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Teléfono de casa</FieldLabel>
              <Input
                value={pTelefonoCasa}
                onChange={(e) => setPTelefonoCasa(e.target.value)}
                placeholder="(878) 000-0000"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div className="pt-3 border-t border-[var(--border)] sm:col-span-2 lg:col-span-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-subtle)] mb-2">
                Contacto de emergencia
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <FieldLabel>Nombre</FieldLabel>
                  <Input
                    value={pEmergNombre}
                    onChange={(e) => setPEmergNombre(e.target.value)}
                    onBlur={(e) => setPEmergNombre(titleCase(e.target.value))}
                    placeholder="Nombre completo"
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                </div>
                <div>
                  <FieldLabel>Parentesco</FieldLabel>
                  <Input
                    value={pEmergParentesco}
                    onChange={(e) => setPEmergParentesco(e.target.value)}
                    onBlur={(e) => setPEmergParentesco(titleCase(e.target.value))}
                    placeholder="Esposa, madre, hermano…"
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                </div>
                <div>
                  <FieldLabel>Teléfono</FieldLabel>
                  <Input
                    value={pEmergTelefono}
                    onChange={(e) => setPEmergTelefono(e.target.value)}
                    placeholder="(878) 000-0000"
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Email personal" value={persona?.email ?? null} />
            <InfoRow label="Teléfono celular" value={persona?.telefono ?? null} />
            <InfoRow label="Teléfono de casa" value={persona?.telefono_casa ?? null} />
            <div className="sm:col-span-2 lg:col-span-3 pt-3 border-t border-[var(--border)]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-subtle)] mb-2">
                Contacto de emergencia
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <InfoRow label="Nombre" value={persona?.contacto_emergencia_nombre ?? null} />
                <InfoRow
                  label="Parentesco"
                  value={persona?.contacto_emergencia_parentesco ?? null}
                />
                <InfoRow label="Teléfono" value={persona?.contacto_emergencia_telefono ?? null} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Beneficiarios (Art. 501 LFT) */}
      <BeneficiariosSection
        empleadoId={empleado.id}
        empresaId={empleado.empresa_id}
        beneficiarios={beneficiarios}
        canEdit={isAdmin}
        onRefresh={fetchAll}
      />

      {/* Documentos */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <SectionTitle>Documentos</SectionTitle>
        <EmpleadoAdjuntos
          empleadoId={empleado.id}
          empresaId={empleado.empresa_id}
          readOnly={!isAdmin}
        />
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
                placeholder="nombre@dilesa.com"
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
              <FieldLabel>Tipo de contrato</FieldLabel>
              <Combobox
                value={tipoContrato}
                onChange={setTipoContrato}
                options={TIPO_CONTRATO_OPTIONS}
                placeholder="Seleccionar…"
                allowClear
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            {(tipoContrato === 'prueba' || tipoContrato === 'capacitacion_inicial') && (
              <>
                <div>
                  <FieldLabel>Días de prueba</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    max="180"
                    value={periodoPruebaDias}
                    onChange={(e) => setPeriodoPruebaDias(e.target.value)}
                    placeholder="30"
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                </div>
                <div>
                  <FieldLabel>Número de prueba</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    max="3"
                    value={periodoPruebaNumero}
                    onChange={(e) => setPeriodoPruebaNumero(e.target.value)}
                    placeholder="1 / 2 / 3"
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                </div>
              </>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <FieldLabel>Horario y jornada</FieldLabel>
              <Input
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                placeholder="Lun-Vie 8:00-17:00, 1h comida (48 h/sem)"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <FieldLabel>Lugar(es) de trabajo</FieldLabel>
              <Input
                value={lugarTrabajo}
                onChange={(e) => setLugarTrabajo(e.target.value)}
                placeholder="Oficinas DILESA Piedras Negras / obra en turno"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Día y lugar de pago</FieldLabel>
              <Input
                value={diaPago}
                onChange={(e) => setDiaPago(e.target.value)}
                placeholder="Viernes quincenal, transferencia bancaria"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <FieldLabel>Funciones (Art. 25-III LFT)</FieldLabel>
              <textarea
                value={funciones}
                onChange={(e) => setFunciones(e.target.value)}
                rows={3}
                placeholder="Descripción detallada de las funciones del puesto…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] p-2 text-sm"
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
            <InfoRow
              label="Tipo de contrato"
              value={
                empleado.tipo_contrato
                  ? (TIPO_CONTRATO_OPTIONS.find((o) => o.value === empleado.tipo_contrato)?.label ??
                    empleado.tipo_contrato)
                  : null
              }
              sub={
                empleado.tipo_contrato === 'prueba' && empleado.periodo_prueba_dias
                  ? `${empleado.periodo_prueba_dias} días · prueba #${empleado.periodo_prueba_numero ?? 1}`
                  : null
              }
            />
            <InfoRow label="Email empresa" value={empleado.email_empresa} />
            <InfoRow label="Teléfono empresa" value={empleado.telefono_empresa} />
            <InfoRow label="Extensión" value={empleado.extension} />
            <div className="sm:col-span-2 lg:col-span-3">
              <InfoRow label="Horario y jornada" value={empleado.horario ?? null} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <InfoRow label="Lugar(es) de trabajo" value={empleado.lugar_trabajo ?? null} />
            </div>
            <div className="sm:col-span-2">
              <InfoRow label="Día y lugar de pago" value={empleado.dia_pago ?? null} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <InfoRow label="Funciones" value={empleado.funciones ?? null} />
            </div>
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

      {/* Notas */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <SectionTitle>Notas / Anotaciones</SectionTitle>
        {editing ? (
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={5}
            placeholder="Observaciones de HR, contexto personal relevante, compromisos, etc…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] p-3 text-sm"
          />
        ) : empleado.notas ? (
          <div
            className="prose prose-sm max-w-none text-[var(--text)]/80"
            // Contenido migrado desde Coda (HTML sanitizado por el script de
            // migración). En nuevo texto capturado en BSOP se renderea igual
            // — no se permite JS embebido porque entra por textarea.
            dangerouslySetInnerHTML={{ __html: empleado.notas }}
          />
        ) : (
          <p className="text-xs text-[var(--text-subtle)]">Sin notas registradas.</p>
        )}
      </div>

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
              onClick={() => handleBaja(false)}
              disabled={givingBaja}
              variant="outline"
              className="gap-1.5 rounded-xl border-red-500/40 text-red-500 hover:bg-red-500/10 disabled:opacity-60"
            >
              {givingBaja ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserX className="h-4 w-4" />
              )}{' '}
              Solo dar de baja
            </Button>
            <Button
              onClick={() => handleBaja(true)}
              disabled={givingBaja}
              className="gap-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {givingBaja ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSignature className="h-4 w-4" />
              )}{' '}
              Baja + generar finiquito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <EmpleadoDetailInner />
    </RequireAccess>
  );
}

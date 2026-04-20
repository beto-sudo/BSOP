'use client';

/**
 * EmpleadoAltaWizard — alta completa en 3 pasos que cumple con el contrato
 * individual LFT + expediente legal + IMSS.
 *
 * Política (Beto, 2026-04-19): no hay contratación sin expediente completo.
 * El wizard bloquea el botón "Crear" hasta que todos los campos y archivos
 * obligatorios estén presentes. Beneficiarios mínimo 1 (Art. 501 LFT).
 *
 * Paso 1 — Identidad: datos personales + domicilio + contacto emergencia.
 * Paso 2 — Puesto y contrato: depto/puesto, LFT (horario, funciones,
 *          lugar de pago), compensación con SDI auto-calculado.
 * Paso 3 — Expediente: archivos obligatorios (foto, INE, CURP, acta,
 *          domicilio, CSF, IMSS) + beneficiarios.
 *
 * "Primer empleo" exenta NSS y constancia IMSS; se genera después con
 * el trámite de alta del IMSS.
 *
 * Inserción en secuencia con rollback best-effort si falla a mitad:
 *   1. erp.personas
 *   2. erp.empleados
 *   3. erp.empleados_compensacion (vigente=true)
 *   4. erp.empleado_beneficiarios
 *   5. storage.adjuntos + erp.adjuntos (por cada archivo)
 *
 * Si cualquier paso falla: se borra lo creado y se muestra toast. El cliente
 * de Supabase no soporta transacciones multi-tabla, así que el rollback es
 * best-effort; con las validaciones client-side los fallos quedan limitados
 * a errores de red o RLS.
 */

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { composeFullName, titleCase } from '@/lib/name-case';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

type Departamento = { id: string; nombre: string };
type Puesto = { id: string; nombre: string };

type BeneficiarioDraft = {
  nombre: string;
  parentesco: string;
  porcentaje: string;
  telefono: string;
};

type FileRole = {
  rol: string;
  label: string;
  /** Si es true, el archivo es obligatorio solo cuando NO es "primer empleo". */
  primerEmpleoExento?: boolean;
};

const REQUIRED_FILE_ROLES: FileRole[] = [
  { rol: 'foto', label: 'Fotografía' },
  { rol: 'ine', label: 'INE (frente y reverso)' },
  { rol: 'curp', label: 'CURP' },
  { rol: 'acta_nacimiento', label: 'Acta de nacimiento' },
  { rol: 'comprobante_domicilio', label: 'Comprobante de domicilio' },
  { rol: 'csf', label: 'Constancia de Situación Fiscal (CSF)' },
  { rol: 'imss', label: 'Constancia IMSS', primerEmpleoExento: true },
];

const OPTIONAL_FILE_ROLES: FileRole[] = [
  { rol: 'cv', label: 'Currículum Vitae' },
  { rol: 'solicitud', label: 'Solicitud de empleo' },
  { rol: 'constancia_estudios', label: 'Constancia de estudios' },
  { rol: 'licencia_conducir', label: 'Licencia de conducir' },
];

// SDI factor para 1er año de servicio (Art. 28-B LIMSS):
// (365 + 15 aguinaldo + 6 vac × 0.25 prima) / 365 = 1.0452
const FACTOR_INTEGRACION_1YR = 1.0452;

const ESTADO_CIVIL_OPTIONS = ['Soltero/a', 'Casado/a', 'Unión libre', 'Divorciado/a', 'Viudo/a'];
const SEXO_OPTIONS = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'X', label: 'Otro / No especifica' },
];
const TIPO_CONTRATO_OPTIONS = [
  { value: 'prueba', label: 'Periodo de prueba (Art. 39-A)' },
  { value: 'indefinido', label: 'Tiempo indefinido / Planta' },
  { value: 'determinado', label: 'Tiempo determinado (Art. 37)' },
  { value: 'obra', label: 'Obra determinada (Art. 37)' },
  { value: 'temporada', label: 'Temporada' },
  { value: 'capacitacion_inicial', label: 'Capacitación inicial (Art. 39-B)' },
];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

export type EmpleadoAltaWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
  departamentos: Departamento[];
  puestos: Puesto[];
  /** Invocado cuando el alta completa OK — recibe el id del empleado creado. */
  onCreated: (empleadoId: string) => void;
};

export function EmpleadoAltaWizard({
  open,
  onOpenChange,
  empresaId,
  departamentos,
  puestos,
  onCreated,
}: EmpleadoAltaWizardProps) {
  const supabase = createSupabaseERPClient();
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // ─── Step 1: Identidad ──────────────────────────────────────────────────────
  const [persona, setPersona] = useState({
    nombre: '',
    apellido_paterno: '',
    apellido_materno: '',
    fecha_nacimiento: '',
    lugar_nacimiento: '',
    nacionalidad: 'Mexicana',
    sexo: '',
    estado_civil: '',
    rfc: '',
    curp: '',
    nss: '',
    primer_empleo: false,
    domicilio: '',
    telefono: '',
    telefono_casa: '',
    email: '',
    emerg_nombre: '',
    emerg_parentesco: '',
    emerg_telefono: '',
  });

  // ─── Step 2: Puesto / contrato / compensación ───────────────────────────────
  const [empleado, setEmpleado] = useState({
    departamento_id: '',
    puesto_id: '',
    numero_empleado: '',
    fecha_ingreso: new Date().toISOString().slice(0, 10),
    tipo_contrato: 'prueba',
    periodo_prueba_dias: '30',
    periodo_prueba_numero: '1',
    horario: '',
    lugar_trabajo: '',
    dia_pago: '',
    funciones: '',
    sueldo_mensual: '',
    sueldo_diario: '',
    sdi: '',
  });

  // ─── Step 3: Expediente ─────────────────────────────────────────────────────
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [beneficiarios, setBeneficiarios] = useState<BeneficiarioDraft[]>([
    { nombre: '', parentesco: '', porcentaje: '', telefono: '' },
  ]);

  // ─── Auto-cálculo sueldo diario + SDI ──────────────────────────────────────
  const updateSueldoMensual = (value: string) => {
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0) {
      const diario = num / 30.4167;
      const sdi = diario * FACTOR_INTEGRACION_1YR;
      setEmpleado((e) => ({
        ...e,
        sueldo_mensual: value,
        sueldo_diario: diario.toFixed(2),
        sdi: sdi.toFixed(2),
      }));
    } else {
      setEmpleado((e) => ({ ...e, sueldo_mensual: value, sueldo_diario: '', sdi: '' }));
    }
  };

  // ─── Validación por paso ────────────────────────────────────────────────────
  const step1Missing = useMemo(() => {
    const m: string[] = [];
    if (!persona.nombre.trim()) m.push('Nombre');
    if (!persona.apellido_paterno.trim()) m.push('Apellido paterno');
    if (!persona.fecha_nacimiento) m.push('Fecha de nacimiento');
    if (!persona.lugar_nacimiento.trim()) m.push('Lugar de nacimiento');
    if (!persona.nacionalidad.trim()) m.push('Nacionalidad');
    if (!persona.sexo) m.push('Sexo');
    if (!persona.estado_civil) m.push('Estado civil');
    if (!persona.rfc.trim()) m.push('RFC');
    if (!persona.curp.trim()) m.push('CURP');
    if (!persona.primer_empleo && !persona.nss.trim()) m.push('NSS');
    if (!persona.domicilio.trim()) m.push('Domicilio');
    if (!persona.telefono.trim()) m.push('Teléfono celular');
    if (!persona.emerg_nombre.trim()) m.push('Contacto emergencia: nombre');
    if (!persona.emerg_parentesco.trim()) m.push('Contacto emergencia: parentesco');
    if (!persona.emerg_telefono.trim()) m.push('Contacto emergencia: teléfono');
    return m;
  }, [persona]);

  const step2Missing = useMemo(() => {
    const m: string[] = [];
    if (!empleado.departamento_id) m.push('Departamento');
    if (!empleado.puesto_id) m.push('Puesto');
    if (!empleado.fecha_ingreso) m.push('Fecha de ingreso');
    if (!empleado.tipo_contrato) m.push('Tipo de contrato');
    if (
      (empleado.tipo_contrato === 'prueba' || empleado.tipo_contrato === 'capacitacion_inicial') &&
      (!empleado.periodo_prueba_dias || !empleado.periodo_prueba_numero)
    ) {
      m.push('Días / número de periodo de prueba');
    }
    if (!empleado.horario.trim()) m.push('Horario y jornada');
    if (!empleado.lugar_trabajo.trim()) m.push('Lugar de trabajo');
    if (!empleado.dia_pago.trim()) m.push('Día y lugar de pago');
    if (!empleado.funciones.trim()) m.push('Funciones (Art. 25-III LFT)');
    if (!empleado.sueldo_mensual || Number(empleado.sueldo_mensual) <= 0) m.push('Sueldo mensual');
    return m;
  }, [empleado]);

  const step3Missing = useMemo(() => {
    const m: string[] = [];
    for (const r of REQUIRED_FILE_ROLES) {
      if (r.primerEmpleoExento && persona.primer_empleo) continue;
      if (!files[r.rol]) m.push(r.label);
    }
    const validBenef = beneficiarios.filter((b) => b.nombre.trim());
    if (validBenef.length === 0) m.push('Al menos 1 beneficiario (Art. 501 LFT)');
    return m;
  }, [files, beneficiarios, persona.primer_empleo]);

  const allValid =
    step1Missing.length === 0 && step2Missing.length === 0 && step3Missing.length === 0;

  // ─── Navegación ─────────────────────────────────────────────────────────────
  const tryAdvance = () => {
    const current = step === 1 ? step1Missing : step === 2 ? step2Missing : step3Missing;
    if (current.length > 0) {
      setShowErrors(true);
      toast.add({
        title: 'Faltan campos',
        description: `${current.length} campo(s) pendiente(s) en este paso`,
        type: 'error',
      });
      return;
    }
    setShowErrors(false);
    if (step < 3) setStep((step + 1) as 1 | 2 | 3);
  };

  const goBack = () => {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3);
    setShowErrors(false);
  };

  // ─── Reset al cerrar ────────────────────────────────────────────────────────
  const handleOpenChange = (next: boolean) => {
    if (!next && !submitting) {
      // Reset al cerrar
      setStep(1);
      setShowErrors(false);
      setPersona({
        nombre: '',
        apellido_paterno: '',
        apellido_materno: '',
        fecha_nacimiento: '',
        lugar_nacimiento: '',
        nacionalidad: 'Mexicana',
        sexo: '',
        estado_civil: '',
        rfc: '',
        curp: '',
        nss: '',
        primer_empleo: false,
        domicilio: '',
        telefono: '',
        telefono_casa: '',
        email: '',
        emerg_nombre: '',
        emerg_parentesco: '',
        emerg_telefono: '',
      });
      setEmpleado({
        departamento_id: '',
        puesto_id: '',
        numero_empleado: '',
        fecha_ingreso: new Date().toISOString().slice(0, 10),
        tipo_contrato: 'prueba',
        periodo_prueba_dias: '30',
        periodo_prueba_numero: '1',
        horario: '',
        lugar_trabajo: '',
        dia_pago: '',
        funciones: '',
        sueldo_mensual: '',
        sueldo_diario: '',
        sdi: '',
      });
      setFiles({});
      setBeneficiarios([{ nombre: '', parentesco: '', porcentaje: '', telefono: '' }]);
    }
    onOpenChange(next);
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!allValid) {
      setShowErrors(true);
      toast.add({ title: 'Alta incompleta', type: 'error' });
      return;
    }

    setSubmitting(true);
    let personaId: string | null = null;
    let empleadoId: string | null = null;
    const uploadedPaths: string[] = [];

    // Rollback best-effort: Supabase client no expone transacciones
    // multi-tabla desde el browser. Con las validaciones del wizard el
    // riesgo real queda en errores de red/RLS.
    const rollback = async () => {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('adjuntos').remove(uploadedPaths);
      }
      if (empleadoId) {
        await supabase
          .schema('erp')
          .from('empleado_beneficiarios')
          .delete()
          .eq('empleado_id', empleadoId);
        await supabase
          .schema('erp')
          .from('empleados_compensacion')
          .delete()
          .eq('empleado_id', empleadoId);
        await supabase
          .schema('erp')
          .from('adjuntos')
          .delete()
          .eq('entidad_tipo', 'empleado')
          .eq('entidad_id', empleadoId);
        await supabase.schema('erp').from('empleados').delete().eq('id', empleadoId);
      }
      if (personaId) {
        await supabase.schema('erp').from('personas').delete().eq('id', personaId);
      }
    };

    try {
      // 1) Persona
      const nombreClean = titleCase(persona.nombre);
      const { data: newP, error: pErr } = await supabase
        .schema('erp')
        .from('personas')
        .insert({
          empresa_id: empresaId,
          nombre: nombreClean,
          apellido_paterno: titleCase(persona.apellido_paterno) || null,
          apellido_materno: titleCase(persona.apellido_materno) || null,
          email: persona.email.trim().toLowerCase() || null,
          telefono: persona.telefono.trim() || null,
          telefono_casa: persona.telefono_casa.trim() || null,
          rfc: persona.rfc.trim().toUpperCase() || null,
          curp: persona.curp.trim().toUpperCase() || null,
          nss: persona.primer_empleo ? null : persona.nss.trim() || null,
          fecha_nacimiento: persona.fecha_nacimiento || null,
          lugar_nacimiento: titleCase(persona.lugar_nacimiento) || null,
          nacionalidad: titleCase(persona.nacionalidad) || 'Mexicana',
          estado_civil: persona.estado_civil || null,
          sexo: persona.sexo || null,
          domicilio: persona.domicilio.trim() || null,
          contacto_emergencia_nombre: titleCase(persona.emerg_nombre) || null,
          contacto_emergencia_telefono: persona.emerg_telefono.trim() || null,
          contacto_emergencia_parentesco: titleCase(persona.emerg_parentesco) || null,
          tipo: 'empleado',
          activo: true,
        })
        .select('id')
        .single();
      if (pErr || !newP) throw new Error(pErr?.message ?? 'No se pudo crear persona');
      personaId = newP.id as string;

      // 2) Empleado
      const esPrueba =
        empleado.tipo_contrato === 'prueba' || empleado.tipo_contrato === 'capacitacion_inicial';
      const { data: newE, error: eErr } = await supabase
        .schema('erp')
        .from('empleados')
        .insert({
          empresa_id: empresaId,
          persona_id: personaId,
          departamento_id: empleado.departamento_id || null,
          puesto_id: empleado.puesto_id || null,
          numero_empleado: empleado.numero_empleado.trim() || null,
          fecha_ingreso: empleado.fecha_ingreso || null,
          fecha_nacimiento: persona.fecha_nacimiento || null,
          nss: persona.primer_empleo ? null : persona.nss.trim() || null,
          tipo_contrato: empleado.tipo_contrato,
          periodo_prueba_dias: esPrueba ? Number(empleado.periodo_prueba_dias) : null,
          periodo_prueba_numero: esPrueba ? Number(empleado.periodo_prueba_numero) : null,
          horario: empleado.horario.trim(),
          lugar_trabajo: empleado.lugar_trabajo.trim(),
          dia_pago: empleado.dia_pago.trim(),
          funciones: empleado.funciones.trim(),
          activo: true,
        })
        .select('id')
        .single();
      if (eErr || !newE) throw new Error(eErr?.message ?? 'No se pudo crear empleado');
      const eId: string = newE.id as string;
      empleadoId = eId;

      // 3) Compensación (vigente)
      const { error: cErr } = await supabase
        .schema('erp')
        .from('empleados_compensacion')
        .insert({
          empresa_id: empresaId,
          empleado_id: eId,
          sueldo_mensual: Number(empleado.sueldo_mensual),
          sueldo_diario: empleado.sueldo_diario ? Number(empleado.sueldo_diario) : null,
          sdi: empleado.sdi ? Number(empleado.sdi) : null,
          fecha_inicio: empleado.fecha_ingreso || new Date().toISOString().slice(0, 10),
          vigente: true,
          frecuencia_pago: 'quincenal',
        });
      if (cErr) throw new Error(`Compensación: ${cErr.message}`);

      // 4) Beneficiarios
      const validBenef = beneficiarios.filter((b) => b.nombre.trim());
      const benefInserts = validBenef.map((b, idx) => ({
        empresa_id: empresaId,
        empleado_id: eId,
        nombre: titleCase(b.nombre),
        parentesco: titleCase(b.parentesco) || null,
        porcentaje: b.porcentaje ? Number(b.porcentaje) : null,
        telefono: b.telefono.trim() || null,
        orden: idx + 1,
      }));
      if (benefInserts.length > 0) {
        const { error: bErr } = await supabase
          .schema('erp')
          .from('empleado_beneficiarios')
          .insert(benefInserts);
        if (bErr) throw new Error(`Beneficiarios: ${bErr.message}`);
      }

      // 5) Archivos — subir a storage y registrar en erp.adjuntos
      for (const [rol, file] of Object.entries(files)) {
        if (!file) continue;
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
        const safe = sanitizeFilename(file.name);
        const path = `empleados/${eId}/${Date.now()}-${rol}-${safe || rol}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('adjuntos')
          .upload(path, file, { upsert: false });
        if (upErr) throw new Error(`Subida ${rol}: ${upErr.message}`);
        uploadedPaths.push(path);
        const { error: adjErr } = await supabase
          .schema('erp')
          .from('adjuntos')
          .insert({
            empresa_id: empresaId,
            entidad_tipo: 'empleado',
            entidad_id: eId,
            nombre: file.name,
            url: path,
            tipo_mime: file.type || null,
            tamano_bytes: file.size,
            rol,
          });
        if (adjErr) throw new Error(`Adjunto ${rol}: ${adjErr.message}`);
      }

      toast.add({
        title: 'Empleado creado',
        description: 'Expediente completo. Listo para generar contrato.',
        type: 'success',
      });
      setSubmitting(false);
      onCreated(eId);
      handleOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      await rollback();
      toast.add({
        title: 'No se pudo completar el alta',
        description: `${msg} · Se revirtieron los cambios parciales.`,
        type: 'error',
      });
      setSubmitting(false);
    }
  };

  // ─── Stepper ────────────────────────────────────────────────────────────────
  const Stepper = (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-4">
      {[
        { n: 1 as const, label: 'Identidad', missing: step1Missing.length },
        { n: 2 as const, label: 'Puesto y contrato', missing: step2Missing.length },
        { n: 3 as const, label: 'Expediente', missing: step3Missing.length },
      ].map((s, idx) => {
        const isActive = step === s.n;
        const isComplete = s.missing === 0 && step > s.n;
        return (
          <div key={s.n} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(s.n)}
              className={[
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition',
                isActive
                  ? 'bg-[var(--accent)] text-white'
                  : isComplete
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-[var(--panel)] text-[var(--text)]/50 border border-[var(--border)]',
              ].join(' ')}
              title={`Ir al paso ${s.n}`}
            >
              {isComplete ? <Check className="h-3.5 w-3.5" /> : s.n}
            </button>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-xs font-medium ${
                  isActive ? 'text-[var(--text)]' : 'text-[var(--text)]/50'
                }`}
              >
                {s.label}
              </p>
              {s.missing > 0 && step > s.n && (
                <p className="text-[10px] text-red-400">{s.missing} pendiente(s)</p>
              )}
            </div>
            {idx < 2 && <div className="h-px flex-1 bg-[var(--border)]" />}
          </div>
        );
      })}
    </div>
  );

  // ─── Footer ─────────────────────────────────────────────────────────────────
  const Footer = (
    <SheetFooter className="gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={goBack}
        disabled={step === 1 || submitting}
        className="gap-1.5 rounded-xl border-[var(--border)] text-[var(--text)]"
      >
        <ChevronLeft className="h-4 w-4" />
        Atrás
      </Button>
      {step < 3 ? (
        <Button
          type="button"
          onClick={tryAdvance}
          className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !allValid}
          className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Crear empleado
        </Button>
      )}
    </SheetFooter>
  );

  // ─── Step 1 render ──────────────────────────────────────────────────────────
  const Step1 = (
    <div className="space-y-4 py-2">
      <p className="text-xs text-[var(--text)]/55">
        Datos del trabajador y su contacto de emergencia. Obligatorios para el contrato individual y
        el expediente.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel required>Nombre(s)</FieldLabel>
          <Input
            placeholder="Juan Carlos"
            value={persona.nombre}
            onChange={(e) => setPersona((p) => ({ ...p, nombre: e.target.value }))}
            onBlur={(e) => setPersona((p) => ({ ...p, nombre: titleCase(e.target.value) }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel required>Apellido paterno</FieldLabel>
          <Input
            placeholder="Pérez"
            value={persona.apellido_paterno}
            onChange={(e) => setPersona((p) => ({ ...p, apellido_paterno: e.target.value }))}
            onBlur={(e) =>
              setPersona((p) => ({ ...p, apellido_paterno: titleCase(e.target.value) }))
            }
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Apellido materno</FieldLabel>
          <Input
            placeholder="González"
            value={persona.apellido_materno}
            onChange={(e) => setPersona((p) => ({ ...p, apellido_materno: e.target.value }))}
            onBlur={(e) =>
              setPersona((p) => ({ ...p, apellido_materno: titleCase(e.target.value) }))
            }
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      {persona.nombre && (
        <p className="text-[10px] text-[var(--text)]/40">
          Nombre completo:{' '}
          <span className="text-[var(--text)]/70">
            {composeFullName(persona.nombre, persona.apellido_paterno, persona.apellido_materno)}
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel required>Fecha nacimiento</FieldLabel>
          <Input
            type="date"
            value={persona.fecha_nacimiento}
            onChange={(e) => setPersona((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel required>Lugar nacimiento</FieldLabel>
          <Input
            placeholder="Piedras Negras, Coahuila"
            value={persona.lugar_nacimiento}
            onChange={(e) => setPersona((p) => ({ ...p, lugar_nacimiento: e.target.value }))}
            onBlur={(e) =>
              setPersona((p) => ({ ...p, lugar_nacimiento: titleCase(e.target.value) }))
            }
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel required>Nacionalidad</FieldLabel>
          <Input
            value={persona.nacionalidad}
            onChange={(e) => setPersona((p) => ({ ...p, nacionalidad: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel required>Sexo</FieldLabel>
          <Select
            value={persona.sexo}
            onValueChange={(v) => setPersona((p) => ({ ...p, sexo: v ?? '' }))}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              {SEXO_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel required>Estado civil</FieldLabel>
          <Select
            value={persona.estado_civil}
            onValueChange={(v) => setPersona((p) => ({ ...p, estado_civil: v ?? '' }))}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              {ESTADO_CIVIL_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel required>RFC</FieldLabel>
          <Input
            placeholder="XXXX000000XXX"
            value={persona.rfc}
            onChange={(e) => setPersona((p) => ({ ...p, rfc: e.target.value.toUpperCase() }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
          />
        </div>
        <div>
          <FieldLabel required>CURP</FieldLabel>
          <Input
            placeholder="XXXX000000XXXXXX00"
            value={persona.curp}
            onChange={(e) => setPersona((p) => ({ ...p, curp: e.target.value.toUpperCase() }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
          />
        </div>
        <div>
          <FieldLabel required={!persona.primer_empleo}>NSS</FieldLabel>
          <Input
            placeholder={persona.primer_empleo ? 'Se tramita con el alta IMSS' : '00000000000'}
            value={persona.nss}
            onChange={(e) => setPersona((p) => ({ ...p, nss: e.target.value }))}
            disabled={persona.primer_empleo}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono disabled:opacity-50"
          />
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={persona.primer_empleo}
          onChange={(e) => setPersona((p) => ({ ...p, primer_empleo: e.target.checked }))}
          className="mt-0.5"
        />
        <div className="text-xs">
          <p className="font-medium text-[var(--text)]">Primer empleo formal</p>
          <p className="text-[var(--text)]/50">
            No tiene NSS todavía. Se genera con el alta ante el IMSS. Exenta NSS y constancia IMSS
            del expediente.
          </p>
        </div>
      </label>

      <div>
        <FieldLabel required>Domicilio completo</FieldLabel>
        <Input
          placeholder="Calle, número, colonia, C.P., ciudad, estado"
          value={persona.domicilio}
          onChange={(e) => setPersona((p) => ({ ...p, domicilio: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel required>Teléfono celular</FieldLabel>
          <Input
            placeholder="(878) 000-0000"
            value={persona.telefono}
            onChange={(e) => setPersona((p) => ({ ...p, telefono: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Teléfono casa</FieldLabel>
          <Input
            placeholder="(878) 000-0000"
            value={persona.telefono_casa}
            onChange={(e) => setPersona((p) => ({ ...p, telefono_casa: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Email personal</FieldLabel>
          <Input
            placeholder="correo@dominio.com"
            value={persona.email}
            onChange={(e) => setPersona((p) => ({ ...p, email: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/40 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Contacto de emergencia
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel required>Nombre</FieldLabel>
            <Input
              placeholder="Nombre completo"
              value={persona.emerg_nombre}
              onChange={(e) => setPersona((p) => ({ ...p, emerg_nombre: e.target.value }))}
              onBlur={(e) => setPersona((p) => ({ ...p, emerg_nombre: titleCase(e.target.value) }))}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel required>Parentesco</FieldLabel>
            <Input
              placeholder="Esposa, madre…"
              value={persona.emerg_parentesco}
              onChange={(e) => setPersona((p) => ({ ...p, emerg_parentesco: e.target.value }))}
              onBlur={(e) =>
                setPersona((p) => ({ ...p, emerg_parentesco: titleCase(e.target.value) }))
              }
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel required>Teléfono</FieldLabel>
            <Input
              placeholder="(878) 000-0000"
              value={persona.emerg_telefono}
              onChange={(e) => setPersona((p) => ({ ...p, emerg_telefono: e.target.value }))}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
        </div>
      </div>

      {showErrors && step1Missing.length > 0 && (
        <MissingList title="Faltan campos en identidad" items={step1Missing} />
      )}
    </div>
  );

  // ─── Step 2 render ──────────────────────────────────────────────────────────
  const esPrueba =
    empleado.tipo_contrato === 'prueba' || empleado.tipo_contrato === 'capacitacion_inicial';

  const Step2 = (
    <div className="space-y-4 py-2">
      <p className="text-xs text-[var(--text)]/55">
        Puesto, cláusulas de contrato (Art. 25 LFT) y compensación. El SDI se calcula
        automáticamente a partir del sueldo mensual.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel required>Departamento</FieldLabel>
          <Select
            value={empleado.departamento_id}
            onValueChange={(v) => setEmpleado((e) => ({ ...e, departamento_id: v ?? '' }))}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              {departamentos.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel required>Puesto</FieldLabel>
          <Select
            value={empleado.puesto_id}
            onValueChange={(v) => setEmpleado((e) => ({ ...e, puesto_id: v ?? '' }))}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              {puestos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>No. Empleado</FieldLabel>
          <Input
            placeholder="EMP-001 (opcional)"
            value={empleado.numero_empleado}
            onChange={(e) => setEmpleado((s) => ({ ...s, numero_empleado: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel required>Fecha ingreso</FieldLabel>
          <Input
            type="date"
            value={empleado.fecha_ingreso}
            onChange={(e) => setEmpleado((s) => ({ ...s, fecha_ingreso: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      <div>
        <FieldLabel required>Tipo de contrato</FieldLabel>
        <Select
          value={empleado.tipo_contrato}
          onValueChange={(v) => setEmpleado((s) => ({ ...s, tipo_contrato: v ?? 'prueba' }))}
        >
          <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPO_CONTRATO_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {esPrueba && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Días de prueba</FieldLabel>
            <Input
              type="number"
              min="1"
              max="180"
              value={empleado.periodo_prueba_dias}
              onChange={(e) => setEmpleado((s) => ({ ...s, periodo_prueba_dias: e.target.value }))}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel required>Número de prueba (1-3)</FieldLabel>
            <Input
              type="number"
              min="1"
              max="3"
              value={empleado.periodo_prueba_numero}
              onChange={(e) =>
                setEmpleado((s) => ({ ...s, periodo_prueba_numero: e.target.value }))
              }
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
        </div>
      )}

      <div>
        <FieldLabel required>Horario y jornada</FieldLabel>
        <Input
          placeholder="Lun-Vie 8:00-17:00, 1h comida (48 h/sem)"
          value={empleado.horario}
          onChange={(e) => setEmpleado((s) => ({ ...s, horario: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>

      <div>
        <FieldLabel required>Lugar(es) de trabajo</FieldLabel>
        <Input
          placeholder="Oficinas DILESA Piedras Negras / obra en turno"
          value={empleado.lugar_trabajo}
          onChange={(e) => setEmpleado((s) => ({ ...s, lugar_trabajo: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>

      <div>
        <FieldLabel required>Día y lugar de pago</FieldLabel>
        <Input
          placeholder="Viernes quincenal, transferencia bancaria"
          value={empleado.dia_pago}
          onChange={(e) => setEmpleado((s) => ({ ...s, dia_pago: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>

      <div>
        <FieldLabel required>Funciones (Art. 25-III LFT)</FieldLabel>
        <textarea
          value={empleado.funciones}
          onChange={(e) => setEmpleado((s) => ({ ...s, funciones: e.target.value }))}
          rows={4}
          placeholder="Descripción detallada de las funciones del puesto…"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] p-2 text-sm"
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/40 p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Compensación
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel required>Sueldo mensual</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="15000.00"
              value={empleado.sueldo_mensual}
              onChange={(e) => updateSueldoMensual(e.target.value)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
            />
          </div>
          <div>
            <FieldLabel>Sueldo diario</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={empleado.sueldo_diario}
              onChange={(e) => setEmpleado((s) => ({ ...s, sueldo_diario: e.target.value }))}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
            />
            <p className="mt-1 text-[10px] text-[var(--text)]/40">Auto = mensual / 30.4167</p>
          </div>
          <div>
            <FieldLabel>SDI</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={empleado.sdi}
              onChange={(e) => setEmpleado((s) => ({ ...s, sdi: e.target.value }))}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
            />
            <p className="mt-1 text-[10px] text-[var(--text)]/40">
              Auto = diario × 1.0452 (1er año)
            </p>
          </div>
        </div>
        {empleado.sueldo_mensual && Number(empleado.sueldo_mensual) > 0 && (
          <p className="text-[11px] text-[var(--text)]/55">
            Mensual {formatCurrency(Number(empleado.sueldo_mensual))} · diario{' '}
            {empleado.sueldo_diario ? formatCurrency(Number(empleado.sueldo_diario)) : '—'} · SDI{' '}
            {empleado.sdi ? formatCurrency(Number(empleado.sdi)) : '—'}
          </p>
        )}
      </div>

      {showErrors && step2Missing.length > 0 && (
        <MissingList title="Faltan campos en puesto/contrato" items={step2Missing} />
      )}
    </div>
  );

  // ─── Step 3 render ──────────────────────────────────────────────────────────
  const handleFileSelect = (rol: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFiles((f) => ({ ...f, [rol]: file }));
  };

  const renderFileRow = (r: FileRole, required: boolean) => {
    const file = files[r.rol];
    const exento = r.primerEmpleoExento && persona.primer_empleo;
    return (
      <div
        key={r.rol}
        className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            file
              ? 'bg-green-500/10 text-green-400'
              : required && !exento
                ? 'bg-red-500/10 text-red-400'
                : 'bg-[var(--card)] text-[var(--text)]/40'
          }`}
        >
          {file && isImageFile(file) ? (
            <ImageIcon className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--text)] flex items-center gap-1">
            {r.label}
            {required && !exento && <span className="text-red-400">*</span>}
            {exento && (
              <span className="text-[10px] text-[var(--text)]/40">(exento · primer empleo)</span>
            )}
          </p>
          {file && (
            <p className="truncate text-xs text-[var(--text)]/60">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>
        {file ? (
          <button
            type="button"
            onClick={() => setFiles((f) => ({ ...f, [r.rol]: null }))}
            className="shrink-0 rounded-lg p-1.5 text-[var(--text)]/50 hover:bg-red-500/10 hover:text-red-400"
            title="Quitar"
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          !exento && (
            <label className="cursor-pointer shrink-0">
              <input
                type="file"
                accept="image/*,application/pdf,.doc,.docx"
                className="hidden"
                onChange={handleFileSelect(r.rol)}
                disabled={submitting}
              />
              <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] text-[var(--text)]/70 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]">
                <Upload className="h-3 w-3" />
                Subir
              </span>
            </label>
          )
        )}
      </div>
    );
  };

  const addBeneficiario = () => {
    setBeneficiarios((b) => [...b, { nombre: '', parentesco: '', porcentaje: '', telefono: '' }]);
  };
  const updateBeneficiario = (idx: number, patch: Partial<BeneficiarioDraft>) => {
    setBeneficiarios((b) => b.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };
  const removeBeneficiario = (idx: number) => {
    setBeneficiarios((b) => (b.length === 1 ? b : b.filter((_, i) => i !== idx)));
  };

  const Step3 = (
    <div className="space-y-5 py-2">
      <p className="text-xs text-[var(--text)]/55">
        Expediente legal: archivos obligatorios (INE, CURP, acta, comprobante de domicilio, CSF y
        constancia IMSS) + foto y beneficiarios (Art. 501 LFT). Sin estos archivos no se puede
        generar contrato.
      </p>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Archivos obligatorios
        </p>
        <div className="space-y-2">{REQUIRED_FILE_ROLES.map((r) => renderFileRow(r, true))}</div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Archivos opcionales
        </p>
        <div className="space-y-2">{OPTIONAL_FILE_ROLES.map((r) => renderFileRow(r, false))}</div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Beneficiarios — Art. 501 LFT (mínimo 1)
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addBeneficiario}
            className="gap-1.5 rounded-lg border-[var(--border)] text-xs text-[var(--text)]"
          >
            <Plus className="h-3 w-3" />
            Agregar
          </Button>
        </div>
        <div className="space-y-2">
          {beneficiarios.map((b, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Input
                  placeholder="Nombre completo"
                  value={b.nombre}
                  onChange={(e) => updateBeneficiario(idx, { nombre: e.target.value })}
                  onBlur={(e) => updateBeneficiario(idx, { nombre: titleCase(e.target.value) })}
                  className="sm:col-span-2 rounded-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                />
                <Input
                  placeholder="Parentesco"
                  value={b.parentesco}
                  onChange={(e) => updateBeneficiario(idx, { parentesco: e.target.value })}
                  onBlur={(e) => updateBeneficiario(idx, { parentesco: titleCase(e.target.value) })}
                  className="rounded-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                />
                <div className="flex items-center gap-1.5">
                  <Input
                    placeholder="% (opc)"
                    type="number"
                    min="0"
                    max="100"
                    value={b.porcentaje}
                    onChange={(e) => updateBeneficiario(idx, { porcentaje: e.target.value })}
                    className="rounded-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                  />
                  {beneficiarios.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBeneficiario(idx)}
                      className="rounded-lg p-1.5 text-[var(--text)]/40 hover:bg-red-500/10 hover:text-red-400"
                      title="Quitar beneficiario"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <Input
                placeholder="Teléfono (opcional)"
                value={b.telefono}
                onChange={(e) => updateBeneficiario(idx, { telefono: e.target.value })}
                className="mt-2 rounded-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
              />
            </div>
          ))}
        </div>
      </div>

      {showErrors && step3Missing.length > 0 && (
        <MissingList title="Faltan campos/archivos en expediente" items={step3Missing} />
      )}

      {allValid && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
          <p className="text-sm font-medium text-green-400 flex items-center gap-2">
            <Check className="h-4 w-4" />
            Expediente completo — listo para generar contrato
          </p>
          <p className="mt-1 text-[11px] text-[var(--text)]/55">
            Al crear el empleado se guardan los datos, se suben los archivos y se redirige a la
            ficha. Desde ahí se puede imprimir el contrato individual de trabajo.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-2xl overflow-y-auto border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
      >
        <SheetHeader>
          <SheetTitle>Nuevo empleado</SheetTitle>
        </SheetHeader>
        <div className="space-y-4">
          {Stepper}
          {step === 1 && Step1}
          {step === 2 && Step2}
          {step === 3 && Step3}
        </div>
        {Footer}
      </SheetContent>
    </Sheet>
  );
}

function MissingList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
      <p className="text-xs font-medium text-red-400">{title}</p>
      <ul className="mt-1 list-disc pl-4 text-[11px] text-red-300">
        {items.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

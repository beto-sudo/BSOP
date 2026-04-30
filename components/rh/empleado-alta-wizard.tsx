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
 *
 * Migrado a `<Wizard>` (ADR-025) — schema zod unificado, validación parcial
 * por paso, beneficiarios con `useFieldArray`, archivos via `<WizardFileSlot>`
 * con upload diferido.
 */

import { useCallback, useEffect, useState } from 'react';
import { useFieldArray, type Path } from 'react-hook-form';
import { z } from 'zod';
import { Plus, Trash2, UserPlus } from 'lucide-react';

import { useZodForm, FormField, FormRow, FormSection } from '@/components/forms';
import { useDirtyConfirm } from '@/components/forms';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import {
  Wizard,
  WizardActions,
  WizardFileSlot,
  WizardStep,
  WizardStepper,
} from '@/components/wizard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { composeFullName, titleCase } from '@/lib/name-case';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { buildAdjuntoPath, slugifyFilename, type EmpresaSlug } from '@/lib/storage';

type Departamento = { id: string; nombre: string };
type Puesto = { id: string; nombre: string };

type FileRoleConfig = {
  rol: string;
  label: string;
  /** Si es true, el archivo es obligatorio solo cuando NO es "primer empleo". */
  primerEmpleoExento?: boolean;
};

const REQUIRED_FILE_ROLES: ReadonlyArray<FileRoleConfig> = [
  { rol: 'foto', label: 'Fotografía' },
  { rol: 'ine', label: 'INE (frente y reverso)' },
  { rol: 'curp', label: 'CURP' },
  { rol: 'acta_nacimiento', label: 'Acta de nacimiento' },
  { rol: 'comprobante_domicilio', label: 'Comprobante de domicilio' },
  { rol: 'csf', label: 'Constancia de Situación Fiscal (CSF)' },
  { rol: 'imss', label: 'Constancia IMSS', primerEmpleoExento: true },
];

const OPTIONAL_FILE_ROLES: ReadonlyArray<FileRoleConfig> = [
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

const required = (msg = 'Requerido') => z.string().trim().min(1, msg);

const BeneficiarioSchema = z.object({
  nombre: z.string().default(''),
  parentesco: z.string().default(''),
  porcentaje: z.string().default(''),
  telefono: z.string().default(''),
});

const WizardSchema = z
  .object({
    // Step 1 — Identidad
    nombre: required('Nombre requerido'),
    apellido_paterno: required('Apellido paterno requerido'),
    apellido_materno: z.string().default(''),
    fecha_nacimiento: required('Fecha de nacimiento requerida'),
    lugar_nacimiento: required('Lugar de nacimiento requerido'),
    nacionalidad: required('Nacionalidad requerida'),
    sexo: required('Sexo requerido'),
    estado_civil: required('Estado civil requerido'),
    rfc: required('RFC requerido'),
    curp: required('CURP requerido'),
    nss: z.string().default(''),
    primer_empleo: z.boolean().default(false),
    domicilio: required('Domicilio requerido'),
    telefono: required('Teléfono celular requerido'),
    telefono_casa: z.string().default(''),
    email: z.string().default(''),
    emerg_nombre: required('Contacto de emergencia: nombre requerido'),
    emerg_parentesco: required('Contacto de emergencia: parentesco requerido'),
    emerg_telefono: required('Contacto de emergencia: teléfono requerido'),
    // Step 2 — Puesto y contrato
    departamento_id: required('Departamento requerido'),
    puesto_id: required('Puesto requerido'),
    numero_empleado: z.string().default(''),
    fecha_ingreso: required('Fecha de ingreso requerida'),
    tipo_contrato: required('Tipo de contrato requerido'),
    periodo_prueba_dias: z.string().default(''),
    periodo_prueba_numero: z.string().default(''),
    horario: required('Horario requerido'),
    lugar_trabajo: required('Lugar de trabajo requerido'),
    dia_pago: required('Día y lugar de pago requerido'),
    funciones: required('Funciones requeridas (Art. 25-III LFT)'),
    sueldo_mensual: z.string().refine((v) => Number(v) > 0, 'Sueldo mensual requerido'),
    sueldo_diario: z.string().default(''),
    sdi: z.string().default(''),
    // Step 3 — Expediente
    beneficiarios: z.array(BeneficiarioSchema).default([]),
  })
  .superRefine((data, ctx) => {
    if (!data.primer_empleo && !data.nss.trim()) {
      ctx.addIssue({ code: 'custom', path: ['nss'], message: 'NSS requerido' });
    }
    const esPrueba =
      data.tipo_contrato === 'prueba' || data.tipo_contrato === 'capacitacion_inicial';
    if (esPrueba) {
      if (!data.periodo_prueba_dias.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['periodo_prueba_dias'],
          message: 'Días de prueba requeridos',
        });
      }
      if (!data.periodo_prueba_numero.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['periodo_prueba_numero'],
          message: 'Número de prueba requerido',
        });
      }
    }
    const validBenef = data.beneficiarios.filter((b) => b.nombre.trim().length > 0);
    if (validBenef.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['beneficiarios'],
        message: 'Mínimo 1 beneficiario (Art. 501 LFT)',
      });
    }
  });

type WizardValues = z.infer<typeof WizardSchema>;

const STEP1_FIELDS: ReadonlyArray<Path<WizardValues>> = [
  'nombre',
  'apellido_paterno',
  'apellido_materno',
  'fecha_nacimiento',
  'lugar_nacimiento',
  'nacionalidad',
  'sexo',
  'estado_civil',
  'rfc',
  'curp',
  'nss',
  'primer_empleo',
  'domicilio',
  'telefono',
  'telefono_casa',
  'email',
  'emerg_nombre',
  'emerg_parentesco',
  'emerg_telefono',
];
const STEP2_FIELDS: ReadonlyArray<Path<WizardValues>> = [
  'departamento_id',
  'puesto_id',
  'numero_empleado',
  'fecha_ingreso',
  'tipo_contrato',
  'periodo_prueba_dias',
  'periodo_prueba_numero',
  'horario',
  'lugar_trabajo',
  'dia_pago',
  'funciones',
  'sueldo_mensual',
  'sueldo_diario',
  'sdi',
];
const STEP3_FIELDS: ReadonlyArray<Path<WizardValues>> = ['beneficiarios'];

const DEFAULT_VALUES: WizardValues = {
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
  beneficiarios: [{ nombre: '', parentesco: '', porcentaje: '', telefono: '' }],
};

export type EmpleadoAltaWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
  /** Slug de la empresa, para `buildAdjuntoPath()` (FA2 ADR-022). */
  empresaSlug?: EmpresaSlug;
  departamentos: Departamento[];
  puestos: Puesto[];
  /** Invocado cuando el alta completa OK — recibe el id del empleado creado. */
  onCreated: (empleadoId: string) => void;
};

export function EmpleadoAltaWizard({
  open,
  onOpenChange,
  empresaId,
  empresaSlug,
  departamentos,
  puestos,
  onCreated,
}: EmpleadoAltaWizardProps) {
  const supabase = createSupabaseERPClient();
  const toast = useToast();

  const form = useZodForm({ schema: WizardSchema, defaultValues: DEFAULT_VALUES });

  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  const primerEmpleo = form.watch('primer_empleo');
  const tipoContrato = form.watch('tipo_contrato');
  const sueldoMensual = form.watch('sueldo_mensual');
  const esPrueba = tipoContrato === 'prueba' || tipoContrato === 'capacitacion_inicial';

  // SDI auto-calc cuando cambia el sueldo mensual (cruza pasos vía 1 form global, W1).
  useEffect(() => {
    const num = Number(sueldoMensual);
    if (!Number.isNaN(num) && num > 0) {
      const diario = num / 30.4167;
      const sdi = diario * FACTOR_INTEGRACION_1YR;
      form.setValue('sueldo_diario', diario.toFixed(2), { shouldValidate: false });
      form.setValue('sdi', sdi.toFixed(2), { shouldValidate: false });
    } else {
      form.setValue('sueldo_diario', '', { shouldValidate: false });
      form.setValue('sdi', '', { shouldValidate: false });
    }
  }, [sueldoMensual, form]);

  const validateFiles = useCallback((): string[] => {
    const missing: string[] = [];
    for (const r of REQUIRED_FILE_ROLES) {
      if (r.primerEmpleoExento && primerEmpleo) continue;
      if (!files[r.rol]) missing.push(r.label);
    }
    return missing;
  }, [files, primerEmpleo]);

  const resetAll = useCallback(() => {
    form.reset(DEFAULT_VALUES);
    setFiles({});
    setFileErrors([]);
  }, [form]);

  const requestCloseImpl = useCallback(() => {
    resetAll();
    onOpenChange(false);
  }, [onOpenChange, resetAll]);

  const filesDirty = Object.values(files).some(Boolean);
  const { requestClose, confirmDialog } = useDirtyConfirm({
    isDirty: form.formState.isDirty || filesDirty,
    onConfirmClose: requestCloseImpl,
  });

  const submitPipeline = useCallback(
    async (values: WizardValues) => {
      const missingFiles = validateFiles();
      if (missingFiles.length > 0) {
        setFileErrors(missingFiles);
        toast.add({
          title: 'Faltan archivos',
          description: `${missingFiles.length} archivo(s) obligatorio(s) pendiente(s)`,
          type: 'error',
        });
        return;
      }
      setFileErrors([]);

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
        const { data: newP, error: pErr } = await supabase
          .schema('erp')
          .from('personas')
          .insert({
            empresa_id: empresaId,
            nombre: titleCase(values.nombre),
            apellido_paterno: titleCase(values.apellido_paterno) || null,
            apellido_materno: titleCase(values.apellido_materno) || null,
            email: values.email.trim().toLowerCase() || null,
            telefono: values.telefono.trim() || null,
            telefono_casa: values.telefono_casa.trim() || null,
            rfc: values.rfc.trim().toUpperCase() || null,
            curp: values.curp.trim().toUpperCase() || null,
            nss: values.primer_empleo ? null : values.nss.trim() || null,
            fecha_nacimiento: values.fecha_nacimiento || null,
            lugar_nacimiento: titleCase(values.lugar_nacimiento) || null,
            nacionalidad: titleCase(values.nacionalidad) || 'Mexicana',
            estado_civil: values.estado_civil || null,
            sexo: values.sexo || null,
            domicilio: values.domicilio.trim() || null,
            contacto_emergencia_nombre: titleCase(values.emerg_nombre) || null,
            contacto_emergencia_telefono: values.emerg_telefono.trim() || null,
            contacto_emergencia_parentesco: titleCase(values.emerg_parentesco) || null,
            tipo: 'empleado',
            activo: true,
          })
          .select('id')
          .single();
        if (pErr || !newP) throw new Error(pErr?.message ?? 'No se pudo crear persona');
        personaId = newP.id as string;

        // 2) Empleado
        const { data: newE, error: eErr } = await supabase
          .schema('erp')
          .from('empleados')
          .insert({
            empresa_id: empresaId,
            persona_id: personaId,
            departamento_id: values.departamento_id || null,
            puesto_id: values.puesto_id || null,
            numero_empleado: values.numero_empleado.trim() || null,
            fecha_ingreso: values.fecha_ingreso || null,
            fecha_nacimiento: values.fecha_nacimiento || null,
            nss: values.primer_empleo ? null : values.nss.trim() || null,
            tipo_contrato: values.tipo_contrato,
            periodo_prueba_dias:
              values.tipo_contrato === 'prueba' || values.tipo_contrato === 'capacitacion_inicial'
                ? Number(values.periodo_prueba_dias)
                : null,
            periodo_prueba_numero:
              values.tipo_contrato === 'prueba' || values.tipo_contrato === 'capacitacion_inicial'
                ? Number(values.periodo_prueba_numero)
                : null,
            horario: values.horario.trim(),
            lugar_trabajo: values.lugar_trabajo.trim(),
            dia_pago: values.dia_pago.trim(),
            funciones: values.funciones.trim(),
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
            sueldo_mensual: Number(values.sueldo_mensual),
            sueldo_diario: values.sueldo_diario ? Number(values.sueldo_diario) : null,
            sdi: values.sdi ? Number(values.sdi) : null,
            fecha_inicio: values.fecha_ingreso || new Date().toISOString().slice(0, 10),
            vigente: true,
            frecuencia_pago: 'quincenal',
          });
        if (cErr) throw new Error(`Compensación: ${cErr.message}`);

        // 4) Beneficiarios
        const validBenef = values.beneficiarios.filter((b) => b.nombre.trim());
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
          const path = empresaSlug
            ? buildAdjuntoPath({
                empresa: empresaSlug,
                entidad: 'empleados',
                entidadId: eId,
                filename: file.name,
              })
            : `empleados/${eId}/${Date.now()}-${rol}-${slugifyFilename(file.name)}`;
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
        onCreated(eId);
        resetAll();
        onOpenChange(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        await rollback();
        toast.add({
          title: 'No se pudo completar el alta',
          description: `${msg} · Se revirtieron los cambios parciales.`,
          type: 'error',
        });
        // Re-throw so <Wizard> stays on the last step (no reset).
        throw err;
      }
    },
    [
      empresaId,
      empresaSlug,
      files,
      onCreated,
      onOpenChange,
      resetAll,
      supabase,
      toast,
      validateFiles,
    ]
  );

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : requestClose())}
      title="Nuevo empleado"
      description="Alta completa en 3 pasos: identidad, puesto y expediente."
      size="xl"
    >
      {confirmDialog}
      <DetailDrawerContent>
        <Wizard form={form} onSubmit={submitPipeline}>
          <WizardStepper />

          <WizardStep
            id="identidad"
            label="Identidad"
            fields={STEP1_FIELDS}
            description="Datos del trabajador y su contacto de emergencia. Obligatorios para el contrato individual y el expediente."
          >
            <FormSection>
              <FormRow cols={3}>
                <FormField name="nombre" label="Nombre(s)" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      aria-invalid={field.invalid || undefined}
                      aria-describedby={field.describedBy}
                      placeholder="Juan Carlos"
                      onBlur={(e) => {
                        field.onChange(titleCase(e.target.value));
                        field.onBlur();
                      }}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name="apellido_paterno" label="Apellido paterno" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      aria-invalid={field.invalid || undefined}
                      aria-describedby={field.describedBy}
                      placeholder="Pérez"
                      onBlur={(e) => {
                        field.onChange(titleCase(e.target.value));
                        field.onBlur();
                      }}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name="apellido_materno" label="Apellido materno">
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="González"
                      onBlur={(e) => {
                        field.onChange(titleCase(e.target.value));
                        field.onBlur();
                      }}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
              </FormRow>
              <NombreCompletoPreview />
            </FormSection>

            <FormSection>
              <FormRow cols={3}>
                <FormField name="fecha_nacimiento" label="Fecha nacimiento" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      type="date"
                      aria-invalid={field.invalid || undefined}
                      aria-describedby={field.describedBy}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name="lugar_nacimiento" label="Lugar nacimiento" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="Piedras Negras, Coahuila"
                      onBlur={(e) => {
                        field.onChange(titleCase(e.target.value));
                        field.onBlur();
                      }}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name="nacionalidad" label="Nacionalidad" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
              </FormRow>

              <FormRow cols={2}>
                <FormField name="sexo" label="Sexo" required>
                  {(field) => (
                    <Select value={field.value} onValueChange={(v) => field.onChange(v ?? '')}>
                      <SelectTrigger
                        id={field.id}
                        aria-invalid={field.invalid || undefined}
                        className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                      >
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
                  )}
                </FormField>
                <FormField name="estado_civil" label="Estado civil" required>
                  {(field) => (
                    <Select value={field.value} onValueChange={(v) => field.onChange(v ?? '')}>
                      <SelectTrigger
                        id={field.id}
                        aria-invalid={field.invalid || undefined}
                        className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                      >
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
                  )}
                </FormField>
              </FormRow>

              <FormRow cols={3}>
                <FormField name="rfc" label="RFC" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="XXXX000000XXX"
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
                    />
                  )}
                </FormField>
                <FormField name="curp" label="CURP" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="XXXX000000XXXXXX00"
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
                    />
                  )}
                </FormField>
                <FormField name="nss" label="NSS" required={!primerEmpleo}>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder={primerEmpleo ? 'Se tramita con el alta IMSS' : '00000000000'}
                      disabled={primerEmpleo}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono disabled:opacity-50"
                    />
                  )}
                </FormField>
              </FormRow>

              <FormField name="primer_empleo" label="">
                {(field) => (
                  <label className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      onBlur={field.onBlur}
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <p className="font-medium text-[var(--text)]">Primer empleo formal</p>
                      <p className="text-[var(--text)]/50">
                        No tiene NSS todavía. Se genera con el alta ante el IMSS. Exenta NSS y
                        constancia IMSS del expediente.
                      </p>
                    </div>
                  </label>
                )}
              </FormField>

              <FormField name="domicilio" label="Domicilio completo" required>
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    placeholder="Calle, número, colonia, C.P., ciudad, estado"
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                )}
              </FormField>

              <FormRow cols={3}>
                <FormField name="telefono" label="Teléfono celular" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="(878) 000-0000"
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name="telefono_casa" label="Teléfono casa">
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="(878) 000-0000"
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name="email" label="Email personal">
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="correo@dominio.com"
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
              </FormRow>
            </FormSection>

            <FormSection title="Contacto de emergencia">
              <FormRow cols={3}>
                <FormField name="emerg_nombre" label="Nombre" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="Nombre completo"
                      onBlur={(e) => {
                        field.onChange(titleCase(e.target.value));
                        field.onBlur();
                      }}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name="emerg_parentesco" label="Parentesco" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="Esposa, madre…"
                      onBlur={(e) => {
                        field.onChange(titleCase(e.target.value));
                        field.onBlur();
                      }}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name="emerg_telefono" label="Teléfono" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="(878) 000-0000"
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
              </FormRow>
            </FormSection>
          </WizardStep>

          <WizardStep
            id="puesto"
            label="Puesto y contrato"
            fields={STEP2_FIELDS}
            description="Puesto, cláusulas de contrato (Art. 25 LFT) y compensación. El SDI se calcula automáticamente a partir del sueldo mensual."
          >
            <FormSection>
              <FormRow cols={2}>
                <FormField name="departamento_id" label="Departamento" required>
                  {(field) => (
                    <Select value={field.value} onValueChange={(v) => field.onChange(v ?? '')}>
                      <SelectTrigger
                        id={field.id}
                        aria-invalid={field.invalid || undefined}
                        className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                      >
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
                  )}
                </FormField>
                <FormField name="puesto_id" label="Puesto" required>
                  {(field) => (
                    <Select value={field.value} onValueChange={(v) => field.onChange(v ?? '')}>
                      <SelectTrigger
                        id={field.id}
                        aria-invalid={field.invalid || undefined}
                        className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                      >
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
                  )}
                </FormField>
              </FormRow>

              <FormRow cols={2}>
                <FormField name="numero_empleado" label="No. Empleado">
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="EMP-001 (opcional)"
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name="fecha_ingreso" label="Fecha ingreso" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      type="date"
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    />
                  )}
                </FormField>
              </FormRow>

              <FormField name="tipo_contrato" label="Tipo de contrato" required>
                {(field) => (
                  <Select value={field.value} onValueChange={(v) => field.onChange(v ?? 'prueba')}>
                    <SelectTrigger
                      id={field.id}
                      aria-invalid={field.invalid || undefined}
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                    >
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
                )}
              </FormField>

              {esPrueba && (
                <FormRow cols={2}>
                  <FormField name="periodo_prueba_dias" label="Días de prueba" required>
                    {(field) => (
                      <Input
                        {...field}
                        id={field.id}
                        type="number"
                        min="1"
                        max="180"
                        className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                      />
                    )}
                  </FormField>
                  <FormField name="periodo_prueba_numero" label="Número de prueba (1-3)" required>
                    {(field) => (
                      <Input
                        {...field}
                        id={field.id}
                        type="number"
                        min="1"
                        max="3"
                        className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                      />
                    )}
                  </FormField>
                </FormRow>
              )}

              <FormField name="horario" label="Horario y jornada" required>
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    placeholder="Lun-Vie 8:00-17:00, 1h comida (48 h/sem)"
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                )}
              </FormField>

              <FormField name="lugar_trabajo" label="Lugar(es) de trabajo" required>
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    placeholder="Oficinas DILESA Piedras Negras / obra en turno"
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                )}
              </FormField>

              <FormField name="dia_pago" label="Día y lugar de pago" required>
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    placeholder="Viernes quincenal, transferencia bancaria"
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                )}
              </FormField>

              <FormField name="funciones" label="Funciones (Art. 25-III LFT)" required>
                {(field) => (
                  <textarea
                    {...field}
                    id={field.id}
                    rows={4}
                    placeholder="Descripción detallada de las funciones del puesto…"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] p-2 text-sm"
                  />
                )}
              </FormField>
            </FormSection>

            <FormSection title="Compensación">
              <FormRow cols={3}>
                <FormField name="sueldo_mensual" label="Sueldo mensual" required>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="15000.00"
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
                    />
                  )}
                </FormField>
                <FormField
                  name="sueldo_diario"
                  label="Sueldo diario"
                  description="Auto = mensual / 30.4167"
                >
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      type="number"
                      min="0"
                      step="0.01"
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
                    />
                  )}
                </FormField>
                <FormField name="sdi" label="SDI" description="Auto = diario × 1.0452 (1er año)">
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      type="number"
                      min="0"
                      step="0.01"
                      className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
                    />
                  )}
                </FormField>
              </FormRow>
              <CompensacionPreview />
            </FormSection>
          </WizardStep>

          <WizardStep
            id="expediente"
            label="Expediente"
            fields={STEP3_FIELDS}
            description="Expediente legal: archivos obligatorios (INE, CURP, acta, comprobante de domicilio, CSF y constancia IMSS) + foto y beneficiarios (Art. 501 LFT). Sin estos archivos no se puede generar contrato."
          >
            <FormSection title="Archivos obligatorios">
              <div className="space-y-2">
                {REQUIRED_FILE_ROLES.map((r) => {
                  const exempt = !!r.primerEmpleoExento && primerEmpleo;
                  return (
                    <WizardFileSlot
                      key={r.rol}
                      role={r.rol}
                      label={r.label}
                      required
                      exempt={exempt}
                      exemptHint="(exento · primer empleo)"
                      file={files[r.rol] ?? null}
                      onChange={(f) => setFiles((m) => ({ ...m, [r.rol]: f }))}
                    />
                  );
                })}
              </div>
            </FormSection>

            <FormSection title="Archivos opcionales">
              <div className="space-y-2">
                {OPTIONAL_FILE_ROLES.map((r) => (
                  <WizardFileSlot
                    key={r.rol}
                    role={r.rol}
                    label={r.label}
                    file={files[r.rol] ?? null}
                    onChange={(f) => setFiles((m) => ({ ...m, [r.rol]: f }))}
                  />
                ))}
              </div>
            </FormSection>

            <BeneficiariosSection />

            {fileErrors.length > 0 && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3" role="alert">
                <p className="text-xs font-medium text-red-400">Faltan archivos en expediente</p>
                <ul className="mt-1 list-disc pl-4 text-[11px] text-red-300">
                  {fileErrors.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </WizardStep>

          <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-[var(--border)] bg-[var(--card)] px-6 py-3">
            <WizardActions
              submitLabel={
                <>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Crear empleado
                </>
              }
              submittingLabel="Creando..."
              cancelLabel="Cancelar"
              onCancel={requestClose}
              submitDisabled={validateFiles().length > 0}
            />
          </div>
        </Wizard>
      </DetailDrawerContent>
    </DetailDrawer>
  );

  // ─── Sub-componentes que viven en closure ───────────────────────────────────

  function NombreCompletoPreview() {
    const nombre = form.watch('nombre');
    const apellidoPaterno = form.watch('apellido_paterno');
    const apellidoMaterno = form.watch('apellido_materno');
    if (!nombre) return null;
    return (
      <p className="text-[10px] text-[var(--text-subtle)]">
        Nombre completo:{' '}
        <span className="text-[var(--text)]/70">
          {composeFullName(nombre, apellidoPaterno, apellidoMaterno)}
        </span>
      </p>
    );
  }

  function CompensacionPreview() {
    const mensualNum = Number(sueldoMensual);
    if (!sueldoMensual || mensualNum <= 0) return null;
    const diario = form.watch('sueldo_diario');
    const sdi = form.watch('sdi');
    return (
      <p className="text-[11px] text-[var(--text-muted)]">
        Mensual {formatCurrency(mensualNum)} · diario{' '}
        {diario ? formatCurrency(Number(diario)) : '—'} · SDI{' '}
        {sdi ? formatCurrency(Number(sdi)) : '—'}
      </p>
    );
  }

  function BeneficiariosSection() {
    const { fields, append, remove } = useFieldArray({
      control: form.control,
      name: 'beneficiarios',
    });
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Beneficiarios — Art. 501 LFT (mínimo 1)
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ nombre: '', parentesco: '', porcentaje: '', telefono: '' })}
            className="gap-1.5 rounded-lg border-[var(--border)] text-xs text-[var(--text)]"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Agregar
          </Button>
        </div>
        <div className="space-y-2">
          {fields.map((bf, idx) => (
            <div
              key={bf.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <FormField name={`beneficiarios.${idx}.nombre` as const} label="" hideLabel>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="Nombre completo"
                      onBlur={(e) => {
                        field.onChange(titleCase(e.target.value));
                        field.onBlur();
                      }}
                      className="sm:col-span-2 rounded-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <FormField name={`beneficiarios.${idx}.parentesco` as const} label="" hideLabel>
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      placeholder="Parentesco"
                      onBlur={(e) => {
                        field.onChange(titleCase(e.target.value));
                        field.onBlur();
                      }}
                      className="rounded-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                    />
                  )}
                </FormField>
                <div className="flex items-center gap-1.5">
                  <FormField
                    name={`beneficiarios.${idx}.porcentaje` as const}
                    label=""
                    hideLabel
                    className="flex-1"
                  >
                    {(field) => (
                      <Input
                        {...field}
                        id={field.id}
                        placeholder="% (opc)"
                        type="number"
                        min="0"
                        max="100"
                        className="rounded-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                      />
                    )}
                  </FormField>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="rounded-lg p-1.5 text-[var(--text-subtle)] hover:bg-red-500/10 hover:text-red-400"
                      title="Quitar beneficiario"
                      aria-label="Quitar beneficiario"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <FormField
                name={`beneficiarios.${idx}.telefono` as const}
                label=""
                hideLabel
                className="mt-2"
              >
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    placeholder="Teléfono (opcional)"
                    className="rounded-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                  />
                )}
              </FormField>
            </div>
          ))}
        </div>
      </div>
    );
  }
}

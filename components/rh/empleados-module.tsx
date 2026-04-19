'use client';

/**
 * EmpleadosModule — reusable RH › Empleados module.
 *
 * Consolidates the previously duplicated pages under
 * `app/rdb/rh/empleados`, `app/dilesa/rh/empleados` and `app/rh/empleados`
 * into one parametrized component.
 *
 * Usage:
 *
 *   // Per-empresa (rdb/dilesa style)
 *   <EmpleadosModule
 *     empresaId="<uuid>"
 *     empresaSlug="rdb"
 *     title="Empleados — Rincón del Bosque"
 *   />
 *
 *   // Global / admin (fetches all empresas the user belongs to)
 *   <EmpleadosModule
 *     scope="user-empresas"
 *     empresaSlug=""  // routes to /rh/empleados/[id]
 *     title="Empleados"
 *     createVariant="dialog"
 *   />
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, RefreshCw, Loader2, Users } from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { composeFullName, titleCase } from '@/lib/name-case';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
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
import { FilterCombobox } from '@/components/ui/filter-combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { Skeleton } from '@/components/ui/skeleton';
import { RowActions } from '@/components/shared/row-actions';
import { useToast } from '@/components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type Empleado = {
  id: string;
  empresa_id: string;
  numero_empleado: string | null;
  fecha_ingreso: string | null;
  fecha_baja: string | null;
  activo: boolean;
  persona: {
    nombre: string;
    apellido_paterno: string | null;
    apellido_materno: string | null;
    email: string | null;
  } | null;
  departamento: { nombre: string } | null;
  puesto: { nombre: string } | null;
};

type Persona = { id: string; nombre: string; apellido_paterno: string | null };
type Departamento = { id: string; nombre: string };
type Puesto = { id: string; nombre: string };

export type EmpleadosModuleProps = {
  /**
   * Single-empresa mode: filter all queries by this empresa_id.
   * Mutually exclusive with `scope="user-empresas"`.
   */
  empresaId?: string;

  /**
   * Scope mode:
   * - omitted or 'empresa' → use `empresaId` (single)
   * - 'user-empresas' → fetch the current user's empresa ids from
   *   core.usuarios_empresas and show all of them (global admin).
   */
  scope?: 'empresa' | 'user-empresas';

  /**
   * URL slug used to build detail page links.
   *  - 'rdb'    → /rdb/rh/empleados/:id
   *  - 'dilesa' → /dilesa/rh/empleados/:id
   *  - ''       → /rh/empleados/:id (global)
   */
  empresaSlug: string;

  /** Page heading (e.g. "Empleados — DILESA"). */
  title: string;

  /** Optional subtitle. Defaults to "Directorio de personal". */
  subtitle?: string;

  /** Use a Sheet (default) or a Dialog for the create form. */
  createVariant?: 'sheet' | 'dialog';

  /** Show extra "No. Empleado" column (DILESA variant). */
  showNumeroEmpleadoColumn?: boolean;

  /** Show extra "Estado" badge column (DILESA variant). */
  showEstadoColumn?: boolean;

  /** Show an extra "filter by departamento" chip in the toolbar (DILESA variant). */
  showDeptoFilter?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fullName(emp: Empleado) {
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
    month: 'short',
    year: 'numeric',
  });
}

function detailHref(empresaSlug: string, id: string) {
  const prefix = empresaSlug ? `/${empresaSlug}` : '';
  return `${prefix}/rh/empleados/${id}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EmpleadosModule({
  empresaId,
  scope = 'empresa',
  empresaSlug,
  title,
  subtitle = 'Directorio de personal',
  createVariant = 'sheet',
  showNumeroEmpleadoColumn = false,
  showEstadoColumn = false,
  showDeptoFilter = false,
}: EmpleadosModuleProps) {
  const router = useRouter();
  const supabase = createSupabaseERPClient();
  const toast = useToast();

  // In user-empresas mode, empresaIds is resolved at runtime.
  const [empresaIds, setEmpresaIds] = useState<string[]>(
    scope === 'empresa' && empresaId ? [empresaId] : []
  );

  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'activos' | 'inactivos'>('activos');
  const [search, setSearch] = useState('');
  const [filterDepto, setFilterDepto] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    // Campos de persona (separados para que Nombre/Apellidos siempre queden
    // en columnas distintas — facilita matching y preserva el formato
    // estándar Title Case de BSOP).
    nombre: '',
    apellido_paterno: '',
    apellido_materno: '',
    email: '',
    telefono: '',
    telefono_casa: '',
    rfc: '',
    curp: '',
    nss: '',
    fecha_nacimiento: '',
    lugar_nacimiento: '',
    nacionalidad: 'Mexicana',
    estado_civil: '',
    sexo: '',
    domicilio: '',
    contacto_emergencia_nombre: '',
    contacto_emergencia_telefono: '',
    contacto_emergencia_parentesco: '',
    // Campos de empleado.
    departamento_id: '',
    puesto_id: '',
    numero_empleado: '',
    fecha_ingreso: '',
    tipo_contrato: 'prueba',
    horario: '',
    lugar_trabajo: '',
  });

  const fetchEmpresaIds = useCallback(async (): Promise<string[]> => {
    if (scope === 'empresa') return empresaId ? [empresaId] : [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: coreUser } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', (user.email ?? '').toLowerCase())
      .maybeSingle();
    if (!coreUser) return [];
    const { data: ueData } = await supabase
      .schema('core')
      .from('usuarios_empresas')
      .select('empresa_id')
      .eq('usuario_id', coreUser.id)
      .eq('activo', true);
    const ids = (ueData ?? []).map((r: { empresa_id: string }) => r.empresa_id);
    setEmpresaIds(ids);
    return ids;
  }, [scope, empresaId, supabase]);

  const fetchAll = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setEmpleados([]);
        setPersonas([]);
        setDepartamentos([]);
        setPuestos([]);
        return;
      }

      const [empRes, personasRes, deptRes, puestosRes] = await Promise.all([
        supabase
          .schema('erp')
          .from('empleados')
          .select(
            'id, empresa_id, numero_empleado, fecha_ingreso, fecha_baja, activo, persona:persona_id(nombre, apellido_paterno, apellido_materno, email), departamento:departamento_id(nombre), puesto:puesto_id(nombre)'
          )
          .in('empresa_id', ids)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno')
          .in('empresa_id', ids)
          .eq('activo', true)
          .is('deleted_at', null)
          .order('nombre'),
        supabase
          .schema('erp')
          .from('departamentos')
          .select('id, nombre')
          .in('empresa_id', ids)
          .eq('activo', true)
          .order('nombre'),
        supabase
          .schema('erp')
          .from('puestos')
          .select('id, nombre')
          .in('empresa_id', ids)
          .eq('activo', true)
          .order('nombre'),
      ]);

      if (empRes.error) {
        setError(empRes.error.message);
        return;
      }
      const normalized = (empRes.data ?? []).map((e: Record<string, unknown>) => ({
        ...e,
        persona: Array.isArray(e.persona) ? (e.persona[0] ?? null) : e.persona,
        departamento: Array.isArray(e.departamento) ? (e.departamento[0] ?? null) : e.departamento,
        puesto: Array.isArray(e.puesto) ? (e.puesto[0] ?? null) : e.puesto,
      })) as Empleado[];
      setEmpleados(normalized);
      setPersonas((personasRes.data ?? []) as Persona[]);
      setDepartamentos((deptRes.data ?? []) as Departamento[]);
      setPuestos((puestosRes.data ?? []) as Puesto[]);
    },
    [supabase]
  );

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      const ids = await fetchEmpresaIds();
      if (cancelled) return;
      await fetchAll(ids);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchEmpresaIds, fetchAll]);

  const handleCreate = async () => {
    const nombre = titleCase(createForm.nombre);
    const apellidoPaterno = titleCase(createForm.apellido_paterno);
    const apellidoMaterno = titleCase(createForm.apellido_materno);
    if (!nombre) {
      toast.add({ title: 'Falta el nombre', type: 'error' });
      return;
    }

    const insertEmpresaId = empresaId ?? empresaIds[0];
    if (!insertEmpresaId) return;

    setCreating(true);

    // 1) Crear persona (o reusar si ya existe una con el mismo RFC para
    //    evitar duplicados silenciosos).
    const rfc = createForm.rfc.trim().toUpperCase();
    let personaId: string | null = null;
    if (rfc) {
      const { data: existing } = await supabase
        .schema('erp')
        .from('personas')
        .select('id')
        .eq('empresa_id', insertEmpresaId)
        .eq('rfc', rfc)
        .is('deleted_at', null)
        .maybeSingle();
      if (existing?.id) personaId = existing.id as string;
    }
    if (!personaId) {
      const { data: newP, error: pErr } = await supabase
        .schema('erp')
        .from('personas')
        .insert({
          empresa_id: insertEmpresaId,
          nombre,
          apellido_paterno: apellidoPaterno || null,
          apellido_materno: apellidoMaterno || null,
          email: createForm.email.trim().toLowerCase() || null,
          telefono: createForm.telefono.trim() || null,
          telefono_casa: createForm.telefono_casa.trim() || null,
          rfc: rfc || null,
          curp: createForm.curp.trim().toUpperCase() || null,
          nss: createForm.nss.trim() || null,
          fecha_nacimiento: createForm.fecha_nacimiento || null,
          lugar_nacimiento: titleCase(createForm.lugar_nacimiento) || null,
          nacionalidad: titleCase(createForm.nacionalidad) || 'Mexicana',
          estado_civil: createForm.estado_civil || null,
          sexo: createForm.sexo || null,
          domicilio: createForm.domicilio.trim() || null,
          contacto_emergencia_nombre: titleCase(createForm.contacto_emergencia_nombre) || null,
          contacto_emergencia_telefono: createForm.contacto_emergencia_telefono.trim() || null,
          contacto_emergencia_parentesco:
            titleCase(createForm.contacto_emergencia_parentesco) || null,
          tipo: 'empleado',
          activo: true,
        })
        .select('id')
        .single();
      if (pErr || !newP) {
        setCreating(false);
        toast.add({
          title: 'No se pudo crear la persona',
          description: pErr?.message,
          type: 'error',
        });
        return;
      }
      personaId = newP.id as string;
    }

    // 2) Crear empleado ligado a esa persona.
    const payload = {
      empresa_id: insertEmpresaId,
      persona_id: personaId,
      departamento_id: createForm.departamento_id || null,
      puesto_id: createForm.puesto_id || null,
      numero_empleado: createForm.numero_empleado.trim() || null,
      fecha_ingreso: createForm.fecha_ingreso || null,
      tipo_contrato: createForm.tipo_contrato || null,
      periodo_prueba_dias: createForm.tipo_contrato === 'prueba' ? 30 : null,
      periodo_prueba_numero: createForm.tipo_contrato === 'prueba' ? 1 : null,
      horario: createForm.horario.trim() || null,
      lugar_trabajo: createForm.lugar_trabajo.trim() || null,
      activo: true,
    };
    const { data: newEmp, error: err } = await supabase
      .schema('erp')
      .from('empleados')
      .insert(payload)
      .select()
      .single();
    setCreating(false);
    if (err) {
      toast.add({ title: 'No se pudo crear el empleado', description: err.message, type: 'error' });
      return;
    }
    setShowCreate(false);
    setCreateForm({
      nombre: '',
      apellido_paterno: '',
      apellido_materno: '',
      email: '',
      telefono: '',
      telefono_casa: '',
      rfc: '',
      curp: '',
      nss: '',
      fecha_nacimiento: '',
      lugar_nacimiento: '',
      nacionalidad: 'Mexicana',
      estado_civil: '',
      sexo: '',
      domicilio: '',
      contacto_emergencia_nombre: '',
      contacto_emergencia_telefono: '',
      contacto_emergencia_parentesco: '',
      departamento_id: '',
      puesto_id: '',
      numero_empleado: '',
      fecha_ingreso: '',
      tipo_contrato: 'prueba',
      horario: '',
      lugar_trabajo: '',
    });
    toast.add({ title: 'Empleado creado', type: 'success' });
    if (newEmp) router.push(detailHref(empresaSlug, newEmp.id as string));
  };

  const handleToggleActivo = async (emp: Empleado) => {
    const { error: err } = await supabase
      .schema('erp')
      .from('empleados')
      .update({ activo: !emp.activo })
      .eq('id', emp.id);
    if (err) {
      toast.add({ title: 'Error al cambiar estado', description: err.message, type: 'error' });
      return;
    }
    toast.add({
      title: emp.activo ? 'Empleado desactivado' : 'Empleado activado',
      type: 'success',
    });
    await fetchAll(empresaIds);
  };

  const handleSoftDelete = async (emp: Empleado) => {
    const { error: err } = await supabase
      .schema('erp')
      .from('empleados')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', emp.id);
    if (err) {
      toast.add({ title: 'No se pudo eliminar', description: err.message, type: 'error' });
      return;
    }
    toast.add({ title: `Empleado "${fullName(emp)}" eliminado`, type: 'success' });
    await fetchAll(empresaIds);
  };

  const visible = empleados.filter((e) => {
    const isActive = e.activo && !e.fecha_baja;
    if (tab === 'activos' && !isActive) return false;
    if (tab === 'inactivos' && isActive) return false;
    if (search) {
      const name = fullName(e).toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
    }
    if (showDeptoFilter && filterDepto !== 'all' && e.departamento?.nombre !== filterDepto) {
      return false;
    }
    return true;
  });

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('nombre', 'asc');

  // Form body shared between Sheet and Dialog variants
  const CreateFormBody = (
    <div className="space-y-4 py-2">
      {/* Persona — 3 campos separados. Title-case se aplica onBlur y al save. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel required>Nombre(s)</FieldLabel>
          <Input
            placeholder="Juan Carlos"
            value={createForm.nombre}
            onChange={(e) => setCreateForm((f) => ({ ...f, nombre: e.target.value }))}
            onBlur={(e) => setCreateForm((f) => ({ ...f, nombre: titleCase(e.target.value) }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Apellido paterno</FieldLabel>
          <Input
            placeholder="Pérez"
            value={createForm.apellido_paterno}
            onChange={(e) => setCreateForm((f) => ({ ...f, apellido_paterno: e.target.value }))}
            onBlur={(e) =>
              setCreateForm((f) => ({ ...f, apellido_paterno: titleCase(e.target.value) }))
            }
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Apellido materno</FieldLabel>
          <Input
            placeholder="González"
            value={createForm.apellido_materno}
            onChange={(e) => setCreateForm((f) => ({ ...f, apellido_materno: e.target.value }))}
            onBlur={(e) =>
              setCreateForm((f) => ({ ...f, apellido_materno: titleCase(e.target.value) }))
            }
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      {createForm.nombre && (
        <p className="text-[10px] text-[var(--text)]/40">
          Nombre completo:{' '}
          <span className="text-[var(--text)]/70">
            {composeFullName(
              createForm.nombre,
              createForm.apellido_paterno,
              createForm.apellido_materno
            )}
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Email personal</FieldLabel>
          <Input
            placeholder="correo@dominio.com"
            value={createForm.email}
            onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Teléfono personal</FieldLabel>
          <Input
            placeholder="(878) 000-0000"
            value={createForm.telefono}
            onChange={(e) => setCreateForm((f) => ({ ...f, telefono: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel>Teléfono casa</FieldLabel>
          <Input
            placeholder="(878) 000-0000"
            value={createForm.telefono_casa}
            onChange={(e) => setCreateForm((f) => ({ ...f, telefono_casa: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Fecha de nacimiento</FieldLabel>
          <Input
            type="date"
            value={createForm.fecha_nacimiento}
            onChange={(e) => setCreateForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Lugar de nacimiento</FieldLabel>
          <Input
            placeholder="Piedras Negras, Coahuila"
            value={createForm.lugar_nacimiento}
            onChange={(e) => setCreateForm((f) => ({ ...f, lugar_nacimiento: e.target.value }))}
            onBlur={(e) =>
              setCreateForm((f) => ({ ...f, lugar_nacimiento: titleCase(e.target.value) }))
            }
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel>Nacionalidad</FieldLabel>
          <Input
            value={createForm.nacionalidad}
            onChange={(e) => setCreateForm((f) => ({ ...f, nacionalidad: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Estado civil</FieldLabel>
          <Select
            value={createForm.estado_civil}
            onValueChange={(v) => setCreateForm((f) => ({ ...f, estado_civil: v ?? '' }))}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              {['Soltero/a', 'Casado/a', 'Unión libre', 'Divorciado/a', 'Viudo/a'].map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel>Sexo</FieldLabel>
          <Select
            value={createForm.sexo}
            onValueChange={(v) => setCreateForm((f) => ({ ...f, sexo: v ?? '' }))}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Masculino</SelectItem>
              <SelectItem value="F">Femenino</SelectItem>
              <SelectItem value="X">Otro / No especifica</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel>RFC</FieldLabel>
          <Input
            placeholder="XXXX000000XXX"
            value={createForm.rfc}
            onChange={(e) => setCreateForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
          />
          <p className="mt-1 text-[10px] text-[var(--text)]/40">
            Si ya existe una persona con este RFC, se reutiliza.
          </p>
        </div>
        <div>
          <FieldLabel>CURP</FieldLabel>
          <Input
            placeholder="XXXX000000XXXXXX00"
            value={createForm.curp}
            onChange={(e) => setCreateForm((f) => ({ ...f, curp: e.target.value.toUpperCase() }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
          />
        </div>
        <div>
          <FieldLabel>NSS</FieldLabel>
          <Input
            placeholder="00000000000"
            value={createForm.nss}
            onChange={(e) => setCreateForm((f) => ({ ...f, nss: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] font-mono"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Domicilio</FieldLabel>
        <Input
          placeholder="Calle, número, colonia, C.P., ciudad, estado"
          value={createForm.domicilio}
          onChange={(e) => setCreateForm((f) => ({ ...f, domicilio: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>

      <div className="pt-3 border-t border-[var(--border)]">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/40 mb-2">
          Contacto de emergencia
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel>Nombre</FieldLabel>
            <Input
              placeholder="Nombre completo"
              value={createForm.contacto_emergencia_nombre}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, contacto_emergencia_nombre: e.target.value }))
              }
              onBlur={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  contacto_emergencia_nombre: titleCase(e.target.value),
                }))
              }
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Parentesco</FieldLabel>
            <Input
              placeholder="Esposa, madre…"
              value={createForm.contacto_emergencia_parentesco}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  contacto_emergencia_parentesco: e.target.value,
                }))
              }
              onBlur={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  contacto_emergencia_parentesco: titleCase(e.target.value),
                }))
              }
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Teléfono</FieldLabel>
            <Input
              placeholder="(878) 000-0000"
              value={createForm.contacto_emergencia_telefono}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  contacto_emergencia_telefono: e.target.value,
                }))
              }
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Departamento</FieldLabel>
          <Select
            value={createForm.departamento_id}
            onValueChange={(v) => setCreateForm((f) => ({ ...f, departamento_id: v ?? '' }))}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Sin departamento" />
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
          <FieldLabel>Puesto</FieldLabel>
          <Select
            value={createForm.puesto_id}
            onValueChange={(v) => setCreateForm((f) => ({ ...f, puesto_id: v ?? '' }))}
          >
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Sin puesto" />
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
            placeholder="Ej: EMP-001"
            value={createForm.numero_empleado}
            onChange={(e) => setCreateForm((f) => ({ ...f, numero_empleado: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Fecha de ingreso</FieldLabel>
          <Input
            type="date"
            value={createForm.fecha_ingreso}
            onChange={(e) => setCreateForm((f) => ({ ...f, fecha_ingreso: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Tipo de contrato</FieldLabel>
        <Select
          value={createForm.tipo_contrato}
          onValueChange={(v) => setCreateForm((f) => ({ ...f, tipo_contrato: v ?? 'prueba' }))}
        >
          <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
            <SelectValue placeholder="Seleccionar…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="prueba">Periodo de prueba (default DILESA)</SelectItem>
            <SelectItem value="indefinido">Tiempo indefinido / Planta</SelectItem>
            <SelectItem value="determinado">Tiempo determinado</SelectItem>
            <SelectItem value="obra">Obra determinada</SelectItem>
            <SelectItem value="temporada">Temporada</SelectItem>
            <SelectItem value="capacitacion_inicial">Capacitación inicial</SelectItem>
          </SelectContent>
        </Select>
        {createForm.tipo_contrato === 'prueba' && (
          <p className="mt-1 text-[10px] text-[var(--text)]/40">
            Por defecto 30 días, prueba 1 de 3. Ajusta después en la ficha si es necesario.
          </p>
        )}
      </div>

      <div>
        <FieldLabel>Horario y jornada</FieldLabel>
        <Input
          placeholder="Lun-Vie 8:00-17:00, 1h comida (48 h/sem)"
          value={createForm.horario}
          onChange={(e) => setCreateForm((f) => ({ ...f, horario: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>

      <div>
        <FieldLabel>Lugar(es) de trabajo</FieldLabel>
        <Input
          placeholder="Oficinas DILESA Piedras Negras"
          value={createForm.lugar_trabajo}
          onChange={(e) => setCreateForm((f) => ({ ...f, lugar_trabajo: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>
    </div>
  );

  const CreateActions = (
    <>
      <Button
        variant="outline"
        onClick={() => setShowCreate(false)}
        className="rounded-xl border-[var(--border)] text-[var(--text)]"
      >
        Cancelar
      </Button>
      <Button
        onClick={handleCreate}
        disabled={creating || !createForm.nombre.trim()}
        className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
      >
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Crear
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setLoading(true);
              await fetchAll(empresaIds);
              setLoading(false);
            }}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nuevo empleado
          </Button>
        </div>
      </div>

      {/* Tabs + search + optional depto filter */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 gap-1">
            {(['activos', 'inactivos'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={[
                  'rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition',
                  tab === t
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text)]/60 hover:text-[var(--text)]',
                ].join(' ')}
              >
                {t === 'activos' ? 'Activos' : 'Ex-empleados'}
              </button>
            ))}
          </div>
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
            <Input
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          {showDeptoFilter && (
            <FilterCombobox
              value={filterDepto}
              onChange={setFilterDepto}
              options={departamentos.map((d) => ({ id: d.nombre, label: d.nombre }))}
              placeholder="Departamento"
              searchPlaceholder="Buscar departamento..."
              clearLabel="Todos los deptos"
              className="w-44"
            />
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-28 ml-auto" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <Users className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">
              {empleados.length === 0
                ? 'No hay empleados registrados'
                : 'Sin resultados para los filtros actuales'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead
                  sortKey="nombre"
                  label="Nombre"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                {showNumeroEmpleadoColumn && (
                  <SortableHead
                    sortKey="numero_empleado"
                    label="No. Empleado"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={onSort}
                    className="w-28"
                  />
                )}
                <SortableHead
                  sortKey="departamento_nombre"
                  label="Departamento"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-36"
                />
                <SortableHead
                  sortKey="puesto_nombre"
                  label="Puesto"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-36"
                />
                <SortableHead
                  sortKey="fecha_ingreso"
                  label="Ingreso"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-28"
                />
                {showEstadoColumn && <TableHead className="w-16">Estado</TableHead>}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(
                visible.map((emp) => ({
                  ...emp,
                  nombre: fullName(emp) || null,
                  departamento_nombre: emp.departamento?.nombre ?? null,
                  puesto_nombre: emp.puesto?.nombre ?? null,
                }))
              ).map((emp) => (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer border-[var(--border)] hover:bg-[var(--panel)] transition-colors"
                  onClick={() => router.push(detailHref(empresaSlug, emp.id))}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-xs font-semibold text-[var(--accent)]">
                        {(titleCase(emp.persona?.nombre ?? '').charAt(0) || '?').toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-[var(--text)]">{fullName(emp)}</div>
                        {emp.persona?.email && (
                          <div className="text-xs text-[var(--text)]/50">{emp.persona.email}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  {showNumeroEmpleadoColumn && (
                    <TableCell>
                      <span className="text-sm font-mono text-[var(--text)]/60">
                        {emp.numero_empleado ?? '—'}
                      </span>
                    </TableCell>
                  )}
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70">
                      {emp.departamento?.nombre ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70">
                      {emp.puesto?.nombre ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70">
                      {formatDate(emp.fecha_ingreso)}
                    </span>
                  </TableCell>
                  {showEstadoColumn && (
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${
                          emp.activo
                            ? 'border-green-500/20 bg-green-500/10 text-green-400'
                            : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]/40'
                        }`}
                      >
                        {emp.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </TableCell>
                  )}
                  <TableCell>
                    <RowActions
                      ariaLabel={`Acciones para ${fullName(emp)}`}
                      onEdit={{
                        label: 'Ver / editar',
                        onClick: () => router.push(detailHref(empresaSlug, emp.id)),
                      }}
                      onToggle={{ activo: emp.activo, onClick: () => handleToggleActivo(emp) }}
                      onDelete={{
                        onConfirm: () => handleSoftDelete(emp),
                        confirmTitle: `¿Eliminar a "${fullName(emp)}"?`,
                        confirmDescription:
                          'Esta acción marcará al empleado como eliminado. ' +
                          'Su historial se preserva y podrá restaurarse desde auditoría.',
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && empleados.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">
          {visible.length} de {empleados.length} empleado
          {empleados.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Create form — Sheet or Dialog */}
      {createVariant === 'sheet' ? (
        <Sheet open={showCreate} onOpenChange={setShowCreate}>
          <SheetContent
            side="right"
            className="w-full max-w-lg overflow-y-auto border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <SheetHeader>
              <SheetTitle>Nuevo empleado</SheetTitle>
            </SheetHeader>
            {CreateFormBody}
            <SheetFooter className="gap-2">{CreateActions}</SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
            <DialogHeader>
              <DialogTitle className="text-[var(--text)]">Nuevo empleado</DialogTitle>
            </DialogHeader>
            {CreateFormBody}
            <DialogFooter className="gap-2">{CreateActions}</DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

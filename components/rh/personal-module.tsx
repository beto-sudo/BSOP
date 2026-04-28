'use client';

/**
 * EmpleadosModule — reusable RH › Empleados module.
 *
 * Consolidates the previously duplicated pages under
 * `app/rdb/rh/personal`, `app/dilesa/rh/personal` and `app/rh/personal`
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
 *     empresaSlug=""  // routes to /rh/personal/[id]
 *     title="Empleados"
 *     createVariant="dialog"
 *   />
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus, Search, RefreshCw, Settings, Users } from 'lucide-react';

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
import { DataTable } from '@/components/module-page';
import { FilterCombobox } from '@/components/ui/filter-combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RowActions } from '@/components/shared/row-actions';
import { useToast } from '@/components/ui/toast';
import { EmpleadoAltaWizard } from '@/components/rh/empleado-alta-wizard';
import { useDatosFiscalesEmpresa } from '@/lib/rh/datos-fiscales-empresa';

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
  puestos: {
    puesto_id: string;
    principal: boolean;
    fecha_fin: string | null;
    puesto: { nombre: string } | null;
  }[];
};

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
   *  - 'rdb'    → /rdb/rh/personal/:id
   *  - 'dilesa' → /dilesa/rh/personal/:id
   *  - ''       → /rh/personal/:id (global)
   */
  empresaSlug: string;

  /** Page heading (e.g. "Empleados — DILESA"). */
  title: string;

  /** Optional subtitle. Defaults to "Directorio de personal". */
  subtitle?: string;

  /**
   * Accepted for backwards compatibility with callers that still pass
   * `createVariant`. El wizard de alta siempre usa Sheet porque 3 pasos
   * con archivos no caben en un Dialog.
   */
  createVariant?: 'sheet' | 'dialog';

  /** Show extra "No. Empleado" column (DILESA variant). */
  showNumeroEmpleadoColumn?: boolean;

  /** Show extra "Estado" badge column (DILESA variant). */
  showEstadoColumn?: boolean;

  /** Show an extra "filter by departamento" chip in the toolbar (DILESA variant). */
  showDeptoFilter?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function primaryPuestoNombre(emp: Empleado): string {
  // Toma el primer "principal" vigente; si no hay, cae al primer secundario
  // vigente; si no hay tampoco, usa el legacy `empleados.puesto_id` por
  // backwards-compat (el trigger del Sprint 2 mantiene la sincronía).
  const vigentes = emp.puestos ?? [];
  const principal = vigentes.find((p) => p.principal);
  if (principal?.puesto?.nombre) return principal.puesto.nombre;
  const cualquiera = vigentes.find((p) => p.puesto?.nombre);
  if (cualquiera?.puesto?.nombre) return cualquiera.puesto.nombre;
  return emp.puesto?.nombre ?? '—';
}

function secondaryPuestoCount(emp: Empleado): number {
  const vigentes = emp.puestos ?? [];
  const principalIdx = vigentes.findIndex((p) => p.principal);
  if (principalIdx >= 0) return Math.max(0, vigentes.length - 1);
  // Sin principal explícito: si hay 2+ vigentes uno cuenta como "principal"
  // implícito y los otros como secundarios.
  return Math.max(0, vigentes.length - 1);
}

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
  return `${prefix}/rh/personal/${id}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EmpleadosModule({
  empresaId,
  scope = 'empresa',
  empresaSlug,
  title,
  subtitle = 'Directorio de personal',
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
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'activos' | 'inactivos'>('activos');
  const [search, setSearch] = useState('');
  const [filterDepto, setFilterDepto] = useState('all');

  const [showCreate, setShowCreate] = useState(false);

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
        setDepartamentos([]);
        setPuestos([]);
        return;
      }

      const [empRes, deptRes, puestosRes] = await Promise.all([
        supabase
          .schema('erp')
          .from('empleados')
          .select(
            'id, empresa_id, numero_empleado, fecha_ingreso, fecha_baja, activo, persona:persona_id(nombre, apellido_paterno, apellido_materno, email), departamento:departamento_id(nombre), puesto:puesto_id(nombre), puestos:empleados_puestos!empleado_id(puesto_id, principal, fecha_fin, puesto:puesto_id(nombre))'
          )
          .in('empresa_id', ids)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
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
        puestos: ((e.puestos ?? []) as Record<string, unknown>[])
          .filter((p) => p.fecha_fin == null)
          .map((p) => ({
            puesto_id: p.puesto_id as string,
            principal: Boolean(p.principal),
            fecha_fin: (p.fecha_fin ?? null) as string | null,
            puesto: Array.isArray(p.puesto) ? (p.puesto[0] ?? null) : p.puesto,
          })),
      })) as Empleado[];
      setEmpleados(normalized);
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

  const insertEmpresaId = empresaId ?? empresaIds[0] ?? null;

  // Política (Beto, 2026-04-27): no hay alta de empleado sin que la empresa
  // tenga datos fiscales completos en `core.empresas`. En scope multi-empresa
  // el alta queda bloqueada porque no hay una sola empresa destino — el admin
  // tiene que entrar a la página de la empresa específica.
  const datosFiscalesEmpresa = useDatosFiscalesEmpresa(
    scope === 'empresa' ? insertEmpresaId : null
  );
  const altaBloqueada =
    scope === 'user-empresas' ||
    !insertEmpresaId ||
    (scope === 'empresa' && !datosFiscalesEmpresa.completo);
  const altaTooltip = (() => {
    if (scope === 'user-empresas') {
      return 'Para crear empleados, abre la página de la empresa específica (/dilesa/rh/personal o /rdb/rh/personal).';
    }
    if (datosFiscalesEmpresa.loading) return 'Validando datos fiscales de la empresa…';
    if (!datosFiscalesEmpresa.completo) {
      const f = datosFiscalesEmpresa.faltantes.slice(0, 3).join(', ');
      const more = datosFiscalesEmpresa.faltantes.length > 3 ? '…' : '';
      return `Faltan datos fiscales de la empresa: ${f}${more}. Captúralos en Settings → Empresas.`;
    }
    return '';
  })();

  const handleEmpleadoCreated = async (empleadoId: string) => {
    await fetchAll(empresaIds);
    router.push(detailHref(empresaSlug, empleadoId));
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
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
            disabled={altaBloqueada}
            title={
              altaBloqueada ? altaTooltip : 'Alta nueva (3 pasos: identidad, contrato, expediente)'
            }
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-50 disabled:cursor-not-allowed gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nuevo empleado
          </Button>
        </div>
      </div>

      {/* Aviso de datos fiscales incompletos en modo single-empresa */}
      {scope === 'empresa' &&
        !datosFiscalesEmpresa.loading &&
        !datosFiscalesEmpresa.completo &&
        empresaSlug && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-400 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>
                <strong>No se pueden crear empleados todavía.</strong> La empresa tiene datos
                fiscales incompletos en BSOP. Faltan:{' '}
                <strong>{datosFiscalesEmpresa.faltantes.join(', ')}</strong>.
              </p>
              <a
                href={`/settings/empresas/${empresaSlug}`}
                className="mt-2 inline-flex items-center gap-1 underline underline-offset-2 hover:text-amber-300"
              >
                <Settings className="h-3 w-3" /> Ir a Settings → Empresas
              </a>
            </div>
          </div>
        )}

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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
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
            <p className="text-sm text-[var(--text-muted)]">
              {empleados.length === 0
                ? 'No hay empleados registrados'
                : 'Sin resultados para los filtros actuales'}
            </p>
          </div>
        ) : (
          <DataTable<Empleado>
            data={visible}
            columns={[
              {
                key: 'nombre',
                label: 'Nombre',
                accessor: (emp) => fullName(emp),
                render: (emp) => (
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
                ),
              },
              ...(showNumeroEmpleadoColumn
                ? [
                    {
                      key: 'numero_empleado',
                      label: 'No. Empleado',
                      width: 'w-28',
                      cellClassName: 'text-sm font-mono text-[var(--text)]/60',
                      render: (emp: Empleado) => emp.numero_empleado ?? '—',
                    },
                  ]
                : []),
              {
                key: 'departamento_nombre',
                label: 'Departamento',
                width: 'w-36',
                cellClassName: 'text-sm text-[var(--text)]/70',
                accessor: (emp) => emp.departamento?.nombre ?? '',
                render: (emp) => emp.departamento?.nombre ?? '—',
              },
              {
                key: 'puesto_nombre',
                label: 'Puesto',
                width: 'w-44',
                cellClassName: 'text-sm text-[var(--text)]/70',
                accessor: (emp) => primaryPuestoNombre(emp),
                render: (emp) => {
                  const principal = primaryPuestoNombre(emp);
                  const extras = secondaryPuestoCount(emp);
                  if (principal === '—') return '—';
                  return (
                    <span className="inline-flex items-center gap-1">
                      <span>{principal}</span>
                      {extras > 0 ? (
                        <span
                          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-subtle)]"
                          title={`+${extras} puesto${extras === 1 ? '' : 's'} secundario${extras === 1 ? '' : 's'}`}
                        >
                          +{extras}
                        </span>
                      ) : null}
                    </span>
                  );
                },
              },
              {
                key: 'fecha_ingreso',
                label: 'Ingreso',
                width: 'w-28',
                cellClassName: 'text-sm text-[var(--text)]/70',
                render: (emp) => formatDate(emp.fecha_ingreso),
              },
              ...(showEstadoColumn
                ? [
                    {
                      key: 'activo',
                      label: 'Estado',
                      width: 'w-16',
                      sortable: false,
                      render: (emp: Empleado) => (
                        <span
                          className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${
                            emp.activo
                              ? 'border-green-500/20 bg-green-500/10 text-green-400'
                              : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text-subtle)]'
                          }`}
                        >
                          {emp.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                key: 'acciones',
                label: '',
                sortable: false,
                width: 'w-10',
                render: (emp) => (
                  <DataTable.InteractiveCell>
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
                  </DataTable.InteractiveCell>
                ),
              },
            ]}
            rowKey="id"
            onRowClick={(emp) => router.push(detailHref(empresaSlug, emp.id))}
            initialSort={{ key: 'nombre', dir: 'asc' }}
            emptyTitle="No hay empleados registrados"
            showDensityToggle={false}
          />
        )}
      </div>

      {!loading && empleados.length > 0 && (
        <p className="text-right text-xs text-[var(--text-subtle)]">
          {visible.length} de {empleados.length} empleado
          {empleados.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Alta wizard — el alta completa (persona + empleado + compensación +
          beneficiarios + archivos) vive en un componente aparte. Sólo se
          monta cuando hay insertEmpresaId resuelto para evitar crear sin
          empresa destino. */}
      {insertEmpresaId && (
        <EmpleadoAltaWizard
          open={showCreate}
          onOpenChange={setShowCreate}
          empresaId={insertEmpresaId}
          departamentos={departamentos}
          puestos={puestos}
          onCreated={handleEmpleadoCreated}
        />
      )}
    </div>
  );
}

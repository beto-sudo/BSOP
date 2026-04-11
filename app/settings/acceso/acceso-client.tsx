'use client';

import { type ReactNode, useState, useTransition } from 'react';
import { Building2, ShieldCheck, Users, Plus, X, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type {
  Empresa,
  ExcepcionUsuario,
  Modulo,
  PermisoRol,
  RolRecord,
  UsuarioCore,
  UsuarioEmpresa,
} from './actions';
import {
  createEmpresa,
  updateEmpresa,
  createRolRecord,
  updateRolRecord,
  deleteRolRecord,
  upsertPermisoRol,
  createUsuarioCore,
  setUsuarioEmpresaAcceso,
  updateUsuarioEmpresaRol,
  upsertExcepcionUsuario,
  deleteExcepcionUsuario,
  toggleActivo,
  removeUsuario,
} from './actions';

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'empresas' | 'roles' | 'usuarios';

interface TabDef {
  id: Tab;
  label: string;
  icon: ReactNode;
}

interface Props {
  empresas: Empresa[];
  modulos: Modulo[];
  roles: RolRecord[];
  permisosRol: PermisoRol[];
  usuarios: UsuarioCore[];
  usuariosEmpresas: UsuarioEmpresa[];
  excepciones: ExcepcionUsuario[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const TABS: TabDef[] = [
  { id: 'empresas', label: 'Empresas', icon: <Building2 className="h-4 w-4" /> },
  { id: 'roles', label: 'Roles y Permisos', icon: <ShieldCheck className="h-4 w-4" /> },
  { id: 'usuarios', label: 'Usuarios', icon: <Users className="h-4 w-4" /> },
];

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ── Component ──────────────────────────────────────────────────────────────

export function AccesoClient({
  empresas,
  modulos,
  roles,
  permisosRol,
  usuarios,
  usuariosEmpresas,
  excepciones,
}: Props) {
  const [isPending, startTransition] = useTransition();

  // Tab navigation
  const [tab, setTab] = useState<Tab>('usuarios');

  // Roles tab
  const [filterEmpresaId, setFilterEmpresaId] = useState<string>(empresas[0]?.id ?? '');
  const [selectedRolId, setSelectedRolId] = useState<string | null>(null);

  // Usuarios tab + Sheet
  const [selectedUsuario, setSelectedUsuario] = useState<UsuarioCore | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Exception form
  const [addingExcepcion, setAddingExcepcion] = useState(false);
  const [newExcEmpresaId, setNewExcEmpresaId] = useState<string>('');
  const [newExcModuloId, setNewExcModuloId] = useState<string>('');
  const [newExcLectura, setNewExcLectura] = useState(false);
  const [newExcEscritura, setNewExcEscritura] = useState(false);

  // ── Empresa dialog ──
  const [empresaDialog, setEmpresaDialog] = useState<{ open: boolean; editing: Empresa | null }>({
    open: false,
    editing: null,
  });
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [empresaSlug, setEmpresaSlug] = useState('');
  const [empresaSlugManual, setEmpresaSlugManual] = useState(false);

  // ── Rol dialog ──
  const [rolDialog, setRolDialog] = useState<{ open: boolean; editing: RolRecord | null }>({
    open: false,
    editing: null,
  });
  const [rolNombre, setRolNombre] = useState('');

  // ── Usuario dialog ──
  const [usuarioDialogOpen, setUsuarioDialogOpen] = useState(false);
  const [usuarioEmail, setUsuarioEmail] = useState('');
  const [usuarioFirstName, setUsuarioFirstName] = useState('');

  // ── Error state ──
  const [dialogError, setDialogError] = useState<string | null>(null);

  // ── Action helper ──

  function run(
    action: () => Promise<void>,
    onSuccess?: () => void,
  ) {
    setDialogError(null);
    startTransition(async () => {
      try {
        await action();
        onSuccess?.();
      } catch (err) {
        setDialogError(err instanceof Error ? err.message : 'Error desconocido');
      }
    });
  }

  // ── Helpers ──

  function getEmpresaNombre(id: string) {
    return empresas.find((e) => e.id === id)?.nombre ?? id;
  }

  function getModuloNombre(id: string) {
    return modulos.find((m) => m.id === id)?.nombre ?? id;
  }

  function getPermisoRol(rolId: string, moduloId: string): PermisoRol | undefined {
    return permisosRol.find((p) => p.rol_id === rolId && p.modulo_id === moduloId);
  }

  function getUserEmpresas(userId: string): UsuarioEmpresa[] {
    return usuariosEmpresas.filter((ue) => ue.usuario_id === userId);
  }

  function getUserExcepciones(userId: string): ExcepcionUsuario[] {
    return excepciones.filter((ex) => ex.usuario_id === userId);
  }

  function openUserSheet(usuario: UsuarioCore) {
    setSelectedUsuario(usuario);
    setSheetOpen(true);
    setAddingExcepcion(false);
    setNewExcEmpresaId('');
    setNewExcModuloId('');
    setNewExcLectura(false);
    setNewExcEscritura(false);
  }

  function openEmpresaDialog(editing: Empresa | null) {
    setEmpresaDialog({ open: true, editing });
    setEmpresaNombre(editing?.nombre ?? '');
    setEmpresaSlug(editing?.slug ?? '');
    setEmpresaSlugManual(!!editing);
    setDialogError(null);
  }

  function openRolDialog(editing: RolRecord | null) {
    setRolDialog({ open: true, editing });
    setRolNombre(editing?.nombre ?? '');
    setDialogError(null);
  }

  function openUsuarioDialog() {
    setUsuarioEmail('');
    setUsuarioFirstName('');
    setDialogError(null);
    setUsuarioDialogOpen(true);
  }

  const rolesDeEmpresa = roles.filter((r) => r.empresa_id === filterEmpresaId);
  const selectedRol = roles.find((r) => r.id === selectedRolId) ?? null;

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold dark:text-white text-[var(--text)]">
          Configuración de Accesos
        </h1>
        <p className="mt-1 text-sm dark:text-white/55 text-[var(--text)]/55">
          Gestiona empresas, roles, permisos y accesos de usuarios en BSOP.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === id
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'dark:text-white/55 text-[var(--text)]/55 dark:hover:text-white hover:text-[var(--text)] dark:hover:bg-white/5 hover:bg-black/3',
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Empresas ─────────────────────────────────────────────────── */}
      {tab === 'empresas' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm dark:text-white/40 text-[var(--text)]/40">
              {empresas.length} empresa{empresas.length !== 1 ? 's' : ''} registrada{empresas.length !== 1 ? 's' : ''}
            </p>
            <Button
              size="sm"
              onClick={() => openEmpresaDialog(null)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Nueva empresa
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border)] dark:hover:bg-transparent hover:bg-transparent">
                  <TableHead className="dark:text-white/50 text-[var(--text)]/50">Nombre</TableHead>
                  <TableHead className="dark:text-white/50 text-[var(--text)]/50">Slug</TableHead>
                  <TableHead className="dark:text-white/50 text-[var(--text)]/50">
                    Roles configurados
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-16 text-center text-sm dark:text-white/30 text-[var(--text)]/35"
                    >
                      No hay empresas registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  empresas.map((emp) => (
                    <TableRow
                      key={emp.id}
                      className="border-[var(--border)] dark:hover:bg-white/3 hover:bg-black/2"
                    >
                      <TableCell className="font-medium dark:text-white/85 text-[var(--text)]/85">
                        {emp.nombre}
                      </TableCell>
                      <TableCell className="font-mono text-sm dark:text-white/50 text-[var(--text)]/50">
                        {emp.slug}
                      </TableCell>
                      <TableCell className="text-sm dark:text-white/50 text-[var(--text)]/50">
                        {roles.filter((r) => r.empresa_id === emp.id).length} roles
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEmpresaDialog(emp)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── Tab: Roles y Permisos ─────────────────────────────────────────── */}
      {tab === 'roles' && (
        <div className="space-y-4">
          {/* Company selector + new rol button */}
          <div className="flex items-center gap-3">
            <span className="text-sm dark:text-white/55 text-[var(--text)]/55">Empresa:</span>
            <Select
              value={filterEmpresaId}
              onValueChange={(v) => {
                if (v) setFilterEmpresaId(v);
                setSelectedRolId(null);
              }}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Selecciona empresa">
                  {empresas.find((e) => e.id === filterEmpresaId)?.nombre ?? 'Selecciona empresa'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {empresas.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filterEmpresaId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openRolDialog(null)}
                className="ml-auto gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Nuevo rol
              </Button>
            )}
          </div>

          <div className="grid grid-cols-[220px_1fr] gap-4">
            {/* Roles list */}
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide dark:text-white/40 text-[var(--text)]/40">
                  Roles
                </p>
              </div>
              {rolesDeEmpresa.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs dark:text-white/30 text-[var(--text)]/35">
                  Sin roles para esta empresa.
                </p>
              ) : (
                <ul>
                  {rolesDeEmpresa.map((rol) => (
                    <li key={rol.id}>
                      <div
                        className={cn(
                          'group flex items-center gap-1 px-3 py-2 text-sm transition-colors cursor-pointer',
                          selectedRolId === rol.id
                            ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
                            : 'dark:text-white/70 text-[var(--text)]/70 dark:hover:bg-white/5 hover:bg-black/3',
                        )}
                        onClick={() => setSelectedRolId(rol.id)}
                      >
                        <span className="flex-1 truncate">{rol.nombre}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRolDialog(rol);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!confirm(`¿Eliminar el rol "${rol.nombre}"?`)) return;
                            run(() => deleteRolRecord(rol.id), () => {
                              if (selectedRolId === rol.id) setSelectedRolId(null);
                            });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Permissions matrix */}
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              {!selectedRol ? (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm dark:text-white/30 text-[var(--text)]/35">
                    Selecciona un rol para ver sus permisos.
                  </p>
                </div>
              ) : (
                <>
                  <div className="border-b border-[var(--border)] px-4 py-3">
                    <p className="text-sm font-semibold dark:text-white/85 text-[var(--text)]/85">
                      {selectedRol.nombre}
                    </p>
                    <p className="mt-0.5 text-xs dark:text-white/40 text-[var(--text)]/40">
                      Permisos por módulo — haz clic para cambiar
                    </p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-[var(--border)] dark:hover:bg-transparent hover:bg-transparent">
                        <TableHead className="dark:text-white/50 text-[var(--text)]/50">
                          Módulo
                        </TableHead>
                        <TableHead className="w-28 text-center dark:text-white/50 text-[var(--text)]/50">
                          Lectura
                        </TableHead>
                        <TableHead className="w-28 text-center dark:text-white/50 text-[var(--text)]/50">
                          Escritura
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modulos.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="py-8 text-center text-sm dark:text-white/30 text-[var(--text)]/35"
                          >
                            No hay módulos registrados.
                          </TableCell>
                        </TableRow>
                      ) : (
                        modulos.map((mod) => {
                          const perm = getPermisoRol(selectedRol.id, mod.id);
                          return (
                            <TableRow
                              key={mod.id}
                              className="border-[var(--border)] dark:hover:bg-white/3 hover:bg-black/2"
                            >
                              <TableCell className="text-sm dark:text-white/80 text-[var(--text)]/80">
                                {mod.nombre}
                              </TableCell>
                              <TableCell className="text-center">
                                <input
                                  type="checkbox"
                                  disabled={isPending}
                                  checked={perm?.acceso_lectura ?? false}
                                  onChange={(e) => {
                                    run(() =>
                                      upsertPermisoRol(
                                        selectedRol.id,
                                        mod.id,
                                        e.target.checked,
                                        perm?.acceso_escritura ?? false,
                                      ),
                                    );
                                  }}
                                  className="h-4 w-4 cursor-pointer rounded accent-[var(--accent)]"
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <input
                                  type="checkbox"
                                  disabled={isPending}
                                  checked={perm?.acceso_escritura ?? false}
                                  onChange={(e) => {
                                    run(() =>
                                      upsertPermisoRol(
                                        selectedRol.id,
                                        mod.id,
                                        perm?.acceso_lectura ?? false,
                                        e.target.checked,
                                      ),
                                    );
                                  }}
                                  className="h-4 w-4 cursor-pointer rounded accent-[var(--accent)]"
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Usuarios ─────────────────────────────────────────────────── */}
      {tab === 'usuarios' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm dark:text-white/40 text-[var(--text)]/40">
              {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrado{usuarios.length !== 1 ? 's' : ''}
            </p>
            <Button size="sm" onClick={openUsuarioDialog} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border)] dark:hover:bg-transparent hover:bg-transparent">
                  <TableHead className="dark:text-white/50 text-[var(--text)]/50">Correo</TableHead>
                  <TableHead className="dark:text-white/50 text-[var(--text)]/50">Nombre</TableHead>
                  <TableHead className="dark:text-white/50 text-[var(--text)]/50">
                    Empresas con acceso
                  </TableHead>
                  <TableHead className="dark:text-white/50 text-[var(--text)]/50">Estado</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-16 text-center text-sm dark:text-white/30 text-[var(--text)]/35"
                    >
                      No hay usuarios registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  usuarios.map((u) => {
                    const userEmpresas = getUserEmpresas(u.id);
                    return (
                      <TableRow
                        key={u.id}
                        className={cn(
                          'cursor-pointer border-[var(--border)] transition-colors',
                          !u.activo ? 'opacity-50' : 'dark:hover:bg-white/3 hover:bg-black/2',
                        )}
                        onClick={() => openUserSheet(u)}
                      >
                        <TableCell className="font-mono text-sm dark:text-white/85 text-[var(--text)]/85">
                          {u.email}
                        </TableCell>
                        <TableCell className="text-sm dark:text-white/60 text-[var(--text)]/60">
                          {u.first_name ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {userEmpresas.length === 0 ? (
                              <span className="text-xs dark:text-white/28 text-[var(--text)]/30">
                                Sin acceso
                              </span>
                            ) : (
                              userEmpresas.map((ue) => (
                                <span
                                  key={ue.empresa_id}
                                  className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]"
                                >
                                  {getEmpresaNombre(ue.empresa_id)}
                                </span>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.activo ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-500">
                              Inactivo
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="ml-auto h-4 w-4 dark:text-white/25 text-[var(--text)]/25" />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── User Detail Sheet ─────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-2xl flex flex-col p-0" side="right">
          {selectedUsuario && (
            <>
              <SheetHeader className="border-b border-[var(--border)] px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SheetTitle className="dark:text-white text-[var(--text)]">
                      {selectedUsuario.first_name ?? selectedUsuario.email}
                    </SheetTitle>
                    <SheetDescription className="font-mono text-xs">
                      {selectedUsuario.email}
                    </SheetDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => {
                        const nuevoEstado = !selectedUsuario.activo;
                        if (!confirm(nuevoEstado ? '¿Reactivar este usuario?' : '¿Desactivar este usuario? Perderá acceso al sistema.')) return;
                        run(() => toggleActivo(selectedUsuario.id, nuevoEstado));
                      }}
                      className={cn(
                        'gap-1.5 text-xs',
                        selectedUsuario.activo
                          ? 'text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-600'
                          : 'text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-600',
                      )}
                    >
                      {selectedUsuario.activo ? (
                        <><X className="h-3 w-3" /> Desactivar</>
                      ) : (
                        <><ShieldCheck className="h-3 w-3" /> Reactivar</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      className="gap-1.5 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-600"
                      onClick={() => {
                        if (!confirm(`¿Eliminar permanentemente a ${selectedUsuario.email}? Esta acción no se puede deshacer.`)) return;
                        run(() => removeUsuario(selectedUsuario.id), () => setSheetOpen(false));
                      }}
                    >
                      <Trash2 className="h-3 w-3" /> Eliminar
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <ScrollArea className="flex-1">
                <div className="space-y-8 px-6 py-5">
                  {/* ── Empresas section ── */}
                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide dark:text-white/40 text-[var(--text)]/40">
                      Acceso a empresas
                    </h3>
                    <div className="space-y-3">
                      {empresas.length === 0 ? (
                        <p className="text-xs dark:text-white/28 text-[var(--text)]/30">
                          No hay empresas registradas.
                        </p>
                      ) : (
                        empresas.map((emp) => {
                          const ue = usuariosEmpresas.find(
                            (x) =>
                              x.usuario_id === selectedUsuario.id && x.empresa_id === emp.id,
                          );
                          const empRoles = roles.filter((r) => r.empresa_id === emp.id);

                          return (
                            <div
                              key={emp.id}
                              className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
                            >
                              <label className="flex cursor-pointer items-center gap-3">
                                <input
                                  type="checkbox"
                                  disabled={isPending}
                                  checked={!!ue}
                                  onChange={(e) => {
                                    run(() =>
                                      setUsuarioEmpresaAcceso(
                                        selectedUsuario.id,
                                        emp.id,
                                        e.target.checked,
                                      ),
                                    );
                                  }}
                                  className="h-4 w-4 cursor-pointer rounded accent-[var(--accent)]"
                                />
                                <span className="text-sm font-medium dark:text-white/85 text-[var(--text)]/85">
                                  Tiene acceso a {emp.nombre}
                                </span>
                              </label>

                              {ue && (
                                <div className="ml-7 flex items-center gap-2">
                                  <span className="text-xs dark:text-white/50 text-[var(--text)]/50">
                                    Rol base:
                                  </span>
                                  <Select
                                    value={ue.rol_id ?? '__none__'}
                                    disabled={isPending}
                                    onValueChange={(v) => {
                                      run(() =>
                                        updateUsuarioEmpresaRol(
                                          selectedUsuario.id,
                                          emp.id,
                                          v === '__none__' ? null : v,
                                        ),
                                      );
                                    }}
                                  >
                                    <SelectTrigger className="h-7 w-48 text-xs">
                                      <SelectValue placeholder="Sin rol">
                                        {ue.rol_id ? empRoles.find((r) => r.id === ue.rol_id)?.nombre ?? 'Sin rol' : 'Sin rol'}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Sin rol</SelectItem>
                                      {empRoles.map((rol) => (
                                        <SelectItem key={rol.id} value={rol.id}>
                                          {rol.nombre}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>

                  {/* ── Excepciones section ── */}
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide dark:text-white/40 text-[var(--text)]/40">
                        Excepciones de módulo
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAddingExcepcion((v) => !v);
                          setNewExcEmpresaId('');
                          setNewExcModuloId('');
                          setNewExcLectura(false);
                          setNewExcEscritura(false);
                        }}
                        className="h-7 gap-1 rounded-lg text-xs"
                      >
                        {addingExcepcion ? (
                          <>
                            <X className="h-3 w-3" /> Cancelar
                          </>
                        ) : (
                          <>
                            <Plus className="h-3 w-3" /> Excepción
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Add exception form */}
                    {addingExcepcion && (
                      <div className="mb-4 space-y-3 rounded-xl border border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4">
                        <p className="text-xs dark:text-white/55 text-[var(--text)]/55">
                          Sobrescribe un permiso específico para este usuario.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <p className="text-xs dark:text-white/45 text-[var(--text)]/45">
                              Empresa
                            </p>
                            <Select value={newExcEmpresaId} onValueChange={(v) => { if (v) setNewExcEmpresaId(v); }}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Empresa" />
                              </SelectTrigger>
                              <SelectContent>
                                {empresas.map((emp) => (
                                  <SelectItem key={emp.id} value={emp.id}>
                                    {emp.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs dark:text-white/45 text-[var(--text)]/45">
                              Módulo
                            </p>
                            <Select value={newExcModuloId} onValueChange={(v) => { if (v) setNewExcModuloId(v); }}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Módulo" />
                              </SelectTrigger>
                              <SelectContent>
                                {modulos.map((mod) => (
                                  <SelectItem key={mod.id} value={mod.id}>
                                    {mod.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <label className="flex cursor-pointer items-center gap-2 text-xs dark:text-white/65 text-[var(--text)]/65">
                            <input
                              type="checkbox"
                              checked={newExcLectura}
                              onChange={(e) => setNewExcLectura(e.target.checked)}
                              className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
                            />
                            Lectura
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 text-xs dark:text-white/65 text-[var(--text)]/65">
                            <input
                              type="checkbox"
                              checked={newExcEscritura}
                              onChange={(e) => setNewExcEscritura(e.target.checked)}
                              className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
                            />
                            Escritura
                          </label>
                        </div>
                        <Button
                          size="sm"
                          className="w-full rounded-lg text-xs"
                          disabled={!newExcEmpresaId || !newExcModuloId || isPending}
                          onClick={() => {
                            run(
                              () =>
                                upsertExcepcionUsuario({
                                  usuario_id: selectedUsuario.id,
                                  empresa_id: newExcEmpresaId,
                                  modulo_id: newExcModuloId,
                                  acceso_lectura: newExcLectura,
                                  acceso_escritura: newExcEscritura,
                                }),
                              () => {
                                setAddingExcepcion(false);
                                setNewExcEmpresaId('');
                                setNewExcModuloId('');
                                setNewExcLectura(false);
                                setNewExcEscritura(false);
                              },
                            );
                          }}
                        >
                          Guardar excepción
                        </Button>
                      </div>
                    )}

                    {/* Existing exceptions list */}
                    {(() => {
                      const userExcs = getUserExcepciones(selectedUsuario.id);
                      if (userExcs.length === 0) {
                        return (
                          <p className="text-xs dark:text-white/28 text-[var(--text)]/30">
                            Sin excepciones configuradas.
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-2">
                          {userExcs.map((ex) => (
                            <div
                              key={`${ex.empresa_id}-${ex.modulo_id}`}
                              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs"
                            >
                              <div>
                                <span className="font-medium dark:text-white/80 text-[var(--text)]/80">
                                  {getModuloNombre(ex.modulo_id)}
                                </span>
                                <span className="ml-1.5 dark:text-white/40 text-[var(--text)]/40">
                                  en {getEmpresaNombre(ex.empresa_id)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {ex.acceso_lectura && (
                                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
                                    Lectura
                                  </span>
                                )}
                                {ex.acceso_escritura && (
                                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-400">
                                    Escritura
                                  </span>
                                )}
                                {!ex.acceso_lectura && !ex.acceso_escritura && (
                                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-500">
                                    Denegado
                                  </span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={isPending}
                                  className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                  onClick={() => {
                                    run(() =>
                                      deleteExcepcionUsuario(
                                        ex.usuario_id,
                                        ex.empresa_id,
                                        ex.modulo_id,
                                      ),
                                    );
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </section>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Empresa Dialog ────────────────────────────────────────────────── */}
      <Dialog
        open={empresaDialog.open}
        onOpenChange={(open) => {
          if (!open) setEmpresaDialog({ open: false, editing: null });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {empresaDialog.editing ? 'Editar empresa' : 'Nueva empresa'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <p className="text-sm dark:text-white/60 text-[var(--text)]/60">Nombre</p>
              <Input
                value={empresaNombre}
                onChange={(e) => {
                  setEmpresaNombre(e.target.value);
                  if (!empresaSlugManual) setEmpresaSlug(slugify(e.target.value));
                }}
                placeholder="Ej. Distribuidora Norte"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm dark:text-white/60 text-[var(--text)]/60">Slug</p>
              <Input
                value={empresaSlug}
                onChange={(e) => {
                  setEmpresaSlug(e.target.value);
                  setEmpresaSlugManual(true);
                }}
                placeholder="ej. distribuidora-norte"
                className="font-mono"
              />
              <p className="text-xs dark:text-white/35 text-[var(--text)]/35">
                Identificador único, solo letras minúsculas, números y guiones.
              </p>
            </div>
            {dialogError && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {dialogError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmpresaDialog({ open: false, editing: null })}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              disabled={!empresaNombre.trim() || !empresaSlug.trim() || isPending}
              onClick={() => {
                const editing = empresaDialog.editing;
                run(
                  () =>
                    editing
                      ? updateEmpresa(editing.id, empresaNombre, empresaSlug)
                      : createEmpresa(empresaNombre, empresaSlug),
                  () => setEmpresaDialog({ open: false, editing: null }),
                );
              }}
            >
              {isPending ? 'Guardando…' : empresaDialog.editing ? 'Guardar cambios' : 'Crear empresa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rol Dialog ────────────────────────────────────────────────────── */}
      <Dialog
        open={rolDialog.open}
        onOpenChange={(open) => {
          if (!open) setRolDialog({ open: false, editing: null });
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {rolDialog.editing ? 'Editar rol' : 'Nuevo rol'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!rolDialog.editing && (
              <div className="space-y-1.5">
                <p className="text-sm dark:text-white/60 text-[var(--text)]/60">Empresa</p>
                <p className="text-sm font-medium dark:text-white/85 text-[var(--text)]/85">
                  {getEmpresaNombre(filterEmpresaId)}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-sm dark:text-white/60 text-[var(--text)]/60">Nombre del rol</p>
              <Input
                value={rolNombre}
                onChange={(e) => setRolNombre(e.target.value)}
                placeholder="Ej. Vendedor, Supervisor"
                autoFocus
              />
            </div>
            {dialogError && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {dialogError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRolDialog({ open: false, editing: null })}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              disabled={!rolNombre.trim() || isPending}
              onClick={() => {
                const editing = rolDialog.editing;
                run(
                  () =>
                    editing
                      ? updateRolRecord(editing.id, rolNombre)
                      : createRolRecord(rolNombre, filterEmpresaId),
                  () => setRolDialog({ open: false, editing: null }),
                );
              }}
            >
              {isPending ? 'Guardando…' : rolDialog.editing ? 'Guardar cambios' : 'Crear rol'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Usuario Dialog ────────────────────────────────────────────────── */}
      <Dialog open={usuarioDialogOpen} onOpenChange={setUsuarioDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <p className="text-sm dark:text-white/60 text-[var(--text)]/60">Correo electrónico</p>
              <Input
                type="email"
                value={usuarioEmail}
                onChange={(e) => setUsuarioEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm dark:text-white/60 text-[var(--text)]/60">
                Nombre <span className="dark:text-white/35 text-[var(--text)]/35">(opcional)</span>
              </p>
              <Input
                value={usuarioFirstName}
                onChange={(e) => setUsuarioFirstName(e.target.value)}
                placeholder="Ej. Juan"
              />
            </div>
            {dialogError && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {dialogError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUsuarioDialogOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              disabled={!usuarioEmail.trim() || isPending}
              onClick={() => {
                run(
                  () => createUsuarioCore(usuarioEmail, usuarioFirstName),
                  () => setUsuarioDialogOpen(false),
                );
              }}
            >
              {isPending ? 'Guardando…' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

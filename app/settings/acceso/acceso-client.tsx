'use client';

import { type ReactNode, useState } from 'react';
import { Building2, ShieldCheck, Users, Plus, X, ChevronRight } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] dark:hover:bg-transparent hover:bg-transparent">
                <TableHead className="dark:text-white/50 text-[var(--text)]/50">Nombre</TableHead>
                <TableHead className="dark:text-white/50 text-[var(--text)]/50">Slug</TableHead>
                <TableHead className="dark:text-white/50 text-[var(--text)]/50">
                  Roles configurados
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {empresas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Tab: Roles y Permisos ─────────────────────────────────────────── */}
      {tab === 'roles' && (
        <div className="space-y-4">
          {/* Company selector */}
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
                <SelectValue placeholder="Selecciona empresa" />
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
                      <button
                        type="button"
                        onClick={() => setSelectedRolId(rol.id)}
                        className={cn(
                          'w-full px-4 py-2.5 text-left text-sm transition-colors',
                          selectedRolId === rol.id
                            ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
                            : 'dark:text-white/70 text-[var(--text)]/70 dark:hover:bg-white/5 hover:bg-black/3',
                        )}
                      >
                        {rol.nombre}
                      </button>
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
                      Permisos por módulo
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
                                  readOnly
                                  checked={perm?.acceso_lectura ?? false}
                                  className="h-4 w-4 cursor-default rounded accent-[var(--accent)]"
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={perm?.acceso_escritura ?? false}
                                  className="h-4 w-4 cursor-default rounded accent-[var(--accent)]"
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
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] dark:hover:bg-transparent hover:bg-transparent">
                <TableHead className="dark:text-white/50 text-[var(--text)]/50">Correo</TableHead>
                <TableHead className="dark:text-white/50 text-[var(--text)]/50">Nombre</TableHead>
                <TableHead className="dark:text-white/50 text-[var(--text)]/50">
                  Empresas con acceso
                </TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
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
                      className="cursor-pointer border-[var(--border)] transition-colors dark:hover:bg-white/3 hover:bg-black/2"
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
                        <ChevronRight className="ml-auto h-4 w-4 dark:text-white/25 text-[var(--text)]/25" />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── User Detail Sheet ─────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-2xl flex flex-col p-0" side="right">
          {selectedUsuario && (
            <>
              <SheetHeader className="border-b border-[var(--border)] px-6 py-4">
                <SheetTitle className="dark:text-white text-[var(--text)]">
                  {selectedUsuario.first_name ?? selectedUsuario.email}
                </SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {selectedUsuario.email}
                </SheetDescription>
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
                                  readOnly
                                  checked={!!ue}
                                  className="h-4 w-4 cursor-default rounded accent-[var(--accent)]"
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
                                  {ue.rol_id ? (
                                    <Select value={ue.rol_id} disabled>
                                      <SelectTrigger className="h-7 w-48 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {empRoles.map((rol) => (
                                          <SelectItem key={rol.id} value={rol.id}>
                                            {rol.nombre}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-xs dark:text-white/35 text-[var(--text)]/40">
                                      Sin rol asignado
                                    </span>
                                  )}
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
                          disabled={!newExcEmpresaId || !newExcModuloId}
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
                              <div className="flex gap-1.5">
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
    </div>
  );
}

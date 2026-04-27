'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Truck,
  RefreshCw,
  Search,
  Phone,
  Mail,
  FileText,
  Save,
  Pencil,
  Ban,
  RotateCcw,
  Upload,
  Sparkles,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import type { CsfExtraccion } from '@/lib/proveedores/extract-csf';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// ─── Types ────────────────────────────────────────────────────────────────────

type Proveedor = {
  id: string;
  persona_id: string | null;
  nombre: string;
  nombre_raw: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  rfc: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string | null;
  updated_at: string | null;
};

const proveedorColumns: Column<Proveedor>[] = [
  {
    key: 'nombre',
    label: 'Nombre',
    render: (p) => (
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{p.nombre}</span>
      </div>
    ),
  },
  {
    key: 'contacto',
    label: 'Contacto',
    cellClassName: 'text-sm text-muted-foreground',
    render: (p) => p.contacto ?? '—',
  },
  {
    key: 'telefono',
    label: 'Teléfono',
    cellClassName: 'font-mono text-sm text-muted-foreground',
    render: (p) => p.telefono ?? '—',
  },
  {
    key: 'rfc',
    label: 'RFC',
    cellClassName: 'font-mono text-xs text-muted-foreground',
    render: (p) => p.rfc ?? '—',
  },
  {
    key: 'activo',
    label: 'Estado',
    render: (p) => (
      <Badge variant={p.activo ? 'default' : 'secondary'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
    ),
  },
];

// ─── Provider Detail Drawer ───────────────────────────────────────────────────

function ProveedorDetail({
  proveedor,
  open,
  onClose,
  onEdit,
  onToggleActivo,
  saving,
}: {
  proveedor: Proveedor | null;
  open: boolean;
  onClose: () => void;
  onEdit: (p: Proveedor) => void;
  onToggleActivo: (p: Proveedor) => void;
  saving: boolean;
}) {
  if (!proveedor) return null;

  const rows = [
    { label: 'Contacto', value: proveedor.contacto, icon: null },
    { label: 'Teléfono', value: proveedor.telefono, icon: Phone },
    { label: 'Email', value: proveedor.email, icon: Mail },
    { label: 'RFC', value: proveedor.rfc, icon: FileText },
    { label: 'Dirección', value: proveedor.direccion, icon: null },
  ].filter((r) => r.value);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="sm:max-w-[600px]">
        {/* Membrete solo para impresión */}
        <img
          src="/membrete-rdb.jpg"
          alt="Membrete Rincón del Bosque"
          className="hidden print:block w-full object-contain mb-6"
        />
        <SheetHeader>
          <SheetTitle>{proveedor.nombre}</SheetTitle>
          <div className="absolute right-12 top-4 hidden sm:flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => onEdit(proveedor)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleActivo(proveedor)}
              disabled={saving}
            >
              {proveedor.activo ? (
                <Ban className="mr-2 h-4 w-4" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              {proveedor.activo ? 'Inactivar' : 'Reactivar'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto">
          <div className="mt-6 space-y-6 pb-6">
            <Badge variant={proveedor.activo ? 'default' : 'secondary'}>
              {proveedor.activo ? 'Activo' : 'Inactivo'}
            </Badge>

            <Separator />

            {rows.length > 0 ? (
              <div className="space-y-4">
                {rows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label}>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {Icon && <Icon className="h-3 w-3" />}
                        {row.label}
                      </div>
                      <div className="mt-1 text-sm">{row.value}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin información de contacto</p>
            )}

            {proveedor.notas && (
              <>
                <Separator />
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Notas
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{proveedor.notas}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProveedoresPage() {
  const router = useRouter();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);
  const [selected, setSelected] = useState<Proveedor | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form State
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newApellidoPaterno, setNewApellidoPaterno] = useState('');
  const [newApellidoMaterno, setNewApellidoMaterno] = useState('');
  const [newContacto, setNewContacto] = useState('');
  const [newTelefono, setNewTelefono] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRFC, setNewRFC] = useState('');
  const [newDireccion, setNewDireccion] = useState('');
  const [newNotas, setNewNotas] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editApellidoPaterno, setEditApellidoPaterno] = useState('');
  const [editApellidoMaterno, setEditApellidoMaterno] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRFC, setEditRFC] = useState('');

  // ─── CSF flow state (Sprint 2.B) ────────────────────────────────────────────
  const [csfFile, setCsfFile] = useState<File | null>(null);
  const [csfProcessing, setCsfProcessing] = useState(false);
  const [csfError, setCsfError] = useState<string | null>(null);
  const [csfExtraccion, setCsfExtraccion] = useState<CsfExtraccion | null>(null);

  // Campos adicionales del modelo CSF (ADR-007), editables tras la extracción
  const [newTipoPersona, setNewTipoPersona] = useState<'fisica' | 'moral'>('fisica');
  const [newRazonSocial, setNewRazonSocial] = useState('');
  const [newNombreComercial, setNewNombreComercial] = useState('');
  const [newCurp, setNewCurp] = useState('');
  const [newRegimenCodigo, setNewRegimenCodigo] = useState('');
  const [newRegimenNombre, setNewRegimenNombre] = useState('');
  const [newDomCalle, setNewDomCalle] = useState('');
  const [newDomNumExt, setNewDomNumExt] = useState('');
  const [newDomNumInt, setNewDomNumInt] = useState('');
  const [newDomColonia, setNewDomColonia] = useState('');
  const [newDomCp, setNewDomCp] = useState('');
  const [newDomMunicipio, setNewDomMunicipio] = useState('');
  const [newDomEstado, setNewDomEstado] = useState('');

  // Modal de duplicado por RFC
  const [duplicadoOpen, setDuplicadoOpen] = useState(false);
  const [duplicadoInfo, setDuplicadoInfo] = useState<{
    persona_id: string;
    proveedor_id: string | null;
    rfc: string;
  } | null>(null);

  const resetCreateForm = () => {
    setNewNombre('');
    setNewApellidoPaterno('');
    setNewApellidoMaterno('');
    setNewContacto('');
    setNewTelefono('');
    setNewEmail('');
    setNewRFC('');
    setNewDireccion('');
    setNewNotas('');
    setCsfFile(null);
    setCsfProcessing(false);
    setCsfError(null);
    setCsfExtraccion(null);
    setNewTipoPersona('fisica');
    setNewRazonSocial('');
    setNewNombreComercial('');
    setNewCurp('');
    setNewRegimenCodigo('');
    setNewRegimenNombre('');
    setNewDomCalle('');
    setNewDomNumExt('');
    setNewDomNumInt('');
    setNewDomColonia('');
    setNewDomCp('');
    setNewDomMunicipio('');
    setNewDomEstado('');
  };

  const handleProcessCsf = async () => {
    if (!csfFile) return;
    setCsfProcessing(true);
    setCsfError(null);
    try {
      const fd = new FormData();
      fd.append('file', csfFile);
      const res = await fetch('/api/proveedores/extract-csf', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al procesar CSF');
      const e = json.extraccion as CsfExtraccion;
      setCsfExtraccion(e);
      setNewTipoPersona(e.tipo_persona);
      setNewRazonSocial(e.razon_social ?? '');
      setNewNombreComercial(e.nombre_comercial ?? '');
      setNewNombre(e.tipo_persona === 'fisica' ? (e.nombre ?? '') : (e.razon_social ?? ''));
      setNewApellidoPaterno(e.tipo_persona === 'fisica' ? (e.apellido_paterno ?? '') : '');
      setNewApellidoMaterno(e.tipo_persona === 'fisica' ? (e.apellido_materno ?? '') : '');
      setNewRFC(e.rfc);
      setNewCurp(e.curp ?? '');
      setNewRegimenCodigo(e.regimen_fiscal_codigo ?? '');
      setNewRegimenNombre(e.regimen_fiscal_nombre ?? '');
      setNewDomCalle(e.domicilio_calle ?? '');
      setNewDomNumExt(e.domicilio_num_ext ?? '');
      setNewDomNumInt(e.domicilio_num_int ?? '');
      setNewDomColonia(e.domicilio_colonia ?? '');
      setNewDomCp(e.domicilio_cp ?? '');
      setNewDomMunicipio(e.domicilio_municipio ?? '');
      setNewDomEstado(e.domicilio_estado ?? '');
    } catch (err) {
      setCsfError(err instanceof Error ? err.message : String(err));
    } finally {
      setCsfProcessing(false);
    }
  };

  const handleCreate = async () => {
    if (!newNombre.trim()) {
      alert('El nombre es obligatorio');
      return;
    }
    setCreating(true);
    try {
      // ── Flujo con CSF ──────────────────────────────────────────────
      if (csfFile && csfExtraccion) {
        const editedExtraccion: CsfExtraccion = {
          ...csfExtraccion,
          tipo_persona: newTipoPersona,
          razon_social: newTipoPersona === 'moral' ? newRazonSocial.trim() || null : null,
          nombre_comercial: newNombreComercial.trim() || null,
          nombre: newTipoPersona === 'fisica' ? newNombre.trim() || null : null,
          apellido_paterno: newTipoPersona === 'fisica' ? newApellidoPaterno.trim() || null : null,
          apellido_materno: newTipoPersona === 'fisica' ? newApellidoMaterno.trim() || null : null,
          rfc: newRFC.trim().toUpperCase(),
          curp: newCurp.trim() || null,
          regimen_fiscal_codigo: newRegimenCodigo.trim() || null,
          regimen_fiscal_nombre: newRegimenNombre.trim() || null,
          domicilio_calle: newDomCalle.trim() || null,
          domicilio_num_ext: newDomNumExt.trim() || null,
          domicilio_num_int: newDomNumInt.trim() || null,
          domicilio_colonia: newDomColonia.trim() || null,
          domicilio_cp: newDomCp.trim() || null,
          domicilio_municipio: newDomMunicipio.trim() || null,
          domicilio_estado: newDomEstado.trim() || null,
        };

        const fd = new FormData();
        fd.append('file', csfFile);
        fd.append(
          'payload',
          JSON.stringify({
            empresa_id: RDB_EMPRESA_ID,
            extraccion: editedExtraccion,
          })
        );

        const res = await fetch('/api/proveedores/create-with-csf', {
          method: 'POST',
          body: fd,
        });
        const json = await res.json();

        if (res.status === 409 && json.error === 'rfc_duplicado') {
          setDuplicadoInfo({
            persona_id: json.existing_persona_id,
            proveedor_id: json.existing_proveedor_id,
            rfc: editedExtraccion.rfc,
          });
          setDuplicadoOpen(true);
          return;
        }
        if (!res.ok) throw new Error(json.error ?? 'Error al crear proveedor con CSF');

        setCreateDrawerOpen(false);
        resetCreateForm();
        void fetchProveedores();
        return;
      }

      // ── Flujo manual (sin CSF) — preserva el flujo previo ─────────
      const supabase = createSupabaseBrowserClient();
      const { data: persona, error: personaErr } = await supabase
        .schema('erp')
        .from('personas')
        .insert({
          empresa_id: RDB_EMPRESA_ID,
          nombre: newNombre.trim(),
          apellido_paterno: newApellidoPaterno.trim() || null,
          apellido_materno: newApellidoMaterno.trim() || null,
          email: newEmail.trim() || null,
          telefono: newTelefono.trim() || null,
          rfc: newRFC.trim() || null,
          tipo: 'proveedor',
        })
        .select('id')
        .single();

      if (personaErr) throw personaErr;

      const { error: err } = await supabase.schema('erp').from('proveedores').insert({
        empresa_id: RDB_EMPRESA_ID,
        persona_id: persona.id,
        activo: true,
      });

      if (err) throw err;

      setCreateDrawerOpen(false);
      resetCreateForm();
      void fetchProveedores();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Error al crear el proveedor');
    } finally {
      setCreating(false);
    }
  };

  const fetchProveedores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .schema('erp')
        .from('proveedores')
        .select(
          'id, persona_id, activo, created_at, updated_at, personas!persona_id(nombre, apellido_paterno, apellido_materno, email, telefono, rfc)'
        )
        .eq('empresa_id', RDB_EMPRESA_ID);
      if (err) throw err;
      type RawProv = {
        id: string;
        persona_id: string | null;
        activo: boolean;
        created_at: string | null;
        updated_at: string | null;
        personas: unknown;
      };
      const mapped: Proveedor[] = ((data ?? []) as unknown as RawProv[])
        .map((p) => {
          const persona = p.personas as {
            nombre: string;
            apellido_paterno: string | null;
            apellido_materno: string | null;
            email: string | null;
            telefono: string | null;
            rfc: string | null;
          } | null;
          const nombreCompleto = persona
            ? [persona.nombre, persona.apellido_paterno, persona.apellido_materno]
                .filter((s) => s && s.trim())
                .join(' ')
                .trim()
            : '';
          return {
            id: p.id,
            persona_id: p.persona_id,
            nombre: nombreCompleto || '—',
            nombre_raw: persona?.nombre ?? null,
            apellido_paterno: persona?.apellido_paterno ?? null,
            apellido_materno: persona?.apellido_materno ?? null,
            contacto: null,
            telefono: persona?.telefono ?? null,
            email: persona?.email ?? null,
            rfc: persona?.rfc ?? null,
            direccion: null,
            notas: null,
            activo: p.activo,
            created_at: p.created_at ?? null,
            updated_at: p.updated_at ?? null,
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      setProveedores(mapped);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProveedores();
  }, [fetchProveedores]);

  const filtered = proveedores.filter((p) => {
    if (!showInactivos && !p.activo) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(q) ||
      (p.contacto ?? '').toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q) ||
      (p.rfc ?? '').toLowerCase().includes(q)
    );
  });

  const activos = proveedores.filter((p) => p.activo).length;

  const openEdit = (p: Proveedor) => {
    setEditNombre(p.nombre_raw ?? '');
    setEditApellidoPaterno(p.apellido_paterno ?? '');
    setEditApellidoMaterno(p.apellido_materno ?? '');
    setEditTelefono(p.telefono ?? '');
    setEditEmail(p.email ?? '');
    setEditRFC(p.rfc ?? '');
    setEditDrawerOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selected?.persona_id) return;
    if (!editNombre.trim()) {
      alert('El nombre es obligatorio');
      return;
    }
    setSavingEdit(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .schema('erp')
        .from('personas')
        .update({
          nombre: editNombre.trim(),
          apellido_paterno: editApellidoPaterno.trim() || null,
          apellido_materno: editApellidoMaterno.trim() || null,
          telefono: editTelefono.trim() || null,
          email: editEmail.trim() || null,
          rfc: editRFC.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('id', selected.persona_id);
      if (error) throw error;
      setEditDrawerOpen(false);
      await fetchProveedores();
      router.refresh();
    } catch (e) {
      console.error(e);
      alert('Error al guardar cambios del proveedor');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActivo = async (p: Proveedor) => {
    const accion = p.activo ? 'inactivar' : 'reactivar';
    if (!confirm(`¿Seguro que quieres ${accion} este proveedor?`)) return;
    setSavingEdit(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .schema('erp')
        .from('proveedores')
        .update({ activo: !p.activo, updated_at: new Date().toISOString() })
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('id', p.id);
      if (error) throw error;
      if (selected?.id === p.id) {
        setSelected({ ...selected, activo: !p.activo });
      }
      await fetchProveedores();
      router.refresh();
    } catch (e) {
      console.error(e);
      alert(`Error al ${accion} proveedor`);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <RequireAccess empresa="rdb" modulo="rdb.proveedores">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
            <p className="text-sm text-muted-foreground">
              Directorio de proveedores ·{' '}
              <span className="text-foreground font-medium">{activos}</span> activos
            </p>
          </div>
          <div>
            <Button onClick={() => setCreateDrawerOpen(true)}>+ Nuevo Proveedor</Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-52">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, RFC, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Button
            variant={showInactivos ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowInactivos((v) => !v)}
          >
            Mostrar inactivos
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchProveedores()}
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <span className="text-sm text-muted-foreground">
            {loading
              ? 'Cargando…'
              : `${filtered.length} proveedor${filtered.length !== 1 ? 'es' : ''}`}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Table */}
        <DataTable<Proveedor>
          data={filtered}
          columns={proveedorColumns}
          rowKey="id"
          loading={loading}
          onRowClick={(p) => {
            setSelected(p);
            setDrawerOpen(true);
          }}
          initialSort={{ key: 'nombre', dir: 'asc' }}
          emptyTitle="No se encontraron proveedores"
          showDensityToggle={false}
        />

        {/* Detail drawer */}
        <ProveedorDetail
          proveedor={selected}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onEdit={openEdit}
          onToggleActivo={handleToggleActivo}
          saving={savingEdit}
        />

        <Sheet open={editDrawerOpen} onOpenChange={setEditDrawerOpen}>
          <SheetContent className="sm:max-w-[600px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Editar Proveedor</SheetTitle>
            </SheetHeader>
            <div className="mt-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">
                    Nombre / Razón Social <span className="text-destructive">*</span>
                  </label>
                  <Input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Persona física: sólo el nombre de pila. Persona moral: razón social completa
                    (apellidos vacíos).
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Apellido paterno</label>
                    <Input
                      value={editApellidoPaterno}
                      onChange={(e) => setEditApellidoPaterno(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Apellido materno</label>
                    <Input
                      value={editApellidoMaterno}
                      onChange={(e) => setEditApellidoMaterno(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Teléfono</label>
                    <Input value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Email</label>
                    <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">RFC</label>
                  <Input
                    value={editRFC}
                    onChange={(e) => setEditRFC(e.target.value)}
                    className="uppercase"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-6 border-t">
                <Button onClick={handleSaveEdit} disabled={savingEdit} className="gap-2">
                  {savingEdit ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar cambios
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Create Proveedor Drawer */}
        <Sheet
          open={createDrawerOpen}
          onOpenChange={(v) => {
            setCreateDrawerOpen(v);
            if (!v) resetCreateForm();
          }}
        >
          <SheetContent className="sm:max-w-[640px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Nuevo Proveedor</SheetTitle>
            </SheetHeader>

            <div className="mt-8 space-y-6">
              {/* ── Sección CSF (Sprint 2.B) ────────────────────────── */}
              <div className="rounded-lg border border-emerald-300/40 bg-emerald-50/40 p-4 dark:bg-emerald-950/20">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="text-sm font-medium">Sube CSF (recomendado)</h3>
                      <p className="text-xs text-muted-foreground">
                        Auto-llena el formulario con los datos extraídos de la Constancia de
                        Situación Fiscal del SAT. Soporta personas físicas y morales.
                      </p>
                    </div>

                    {!csfExtraccion && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            setCsfFile(f);
                            setCsfError(null);
                          }}
                          className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-emerald-700"
                          disabled={csfProcessing}
                        />
                        <Button
                          size="sm"
                          variant="default"
                          onClick={handleProcessCsf}
                          disabled={!csfFile || csfProcessing}
                          className="gap-1.5"
                        >
                          {csfProcessing ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {csfProcessing ? 'Procesando…' : 'Procesar CSF'}
                        </Button>
                      </div>
                    )}

                    {csfProcessing && (
                      <p className="text-xs text-muted-foreground">
                        Claude está leyendo el PDF — puede tardar 30-90 segundos.
                      </p>
                    )}

                    {csfError && (
                      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <div>
                          <strong>Error al procesar:</strong> {csfError}
                          <div className="mt-1 text-muted-foreground">
                            Puedes reintentar o capturar manualmente abajo.
                          </div>
                        </div>
                      </div>
                    )}

                    {csfExtraccion && (
                      <div className="flex items-center justify-between rounded-md border border-emerald-300/60 bg-white/60 p-2 text-xs dark:bg-emerald-900/20">
                        <span className="text-emerald-700 dark:text-emerald-400">
                          ✓ CSF procesada — {csfFile?.name}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCsfFile(null);
                            setCsfExtraccion(null);
                            setCsfError(null);
                          }}
                          className="h-6 px-2 text-xs"
                        >
                          Cambiar PDF
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Form ────────────────────────────────────────────── */}
              <div className="space-y-4">
                {/* Tipo de persona */}
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Tipo de persona</label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={newTipoPersona === 'fisica' ? 'default' : 'outline'}
                      onClick={() => setNewTipoPersona('fisica')}
                    >
                      Física
                    </Button>
                    <Button
                      size="sm"
                      variant={newTipoPersona === 'moral' ? 'default' : 'outline'}
                      onClick={() => setNewTipoPersona('moral')}
                    >
                      Moral
                    </Button>
                  </div>
                </div>

                {/* Identidad: depende de tipo_persona */}
                {newTipoPersona === 'moral' ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">
                        Razón social <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={newRazonSocial}
                        onChange={(e) => {
                          setNewRazonSocial(e.target.value);
                          setNewNombre(e.target.value); // morales: nombre = razón social
                        }}
                        placeholder="EJEMPLO SA DE CV"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Nombre comercial</label>
                      <Input
                        value={newNombreComercial}
                        onChange={(e) => setNewNombreComercial(e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">
                        Nombre <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={newNombre}
                        onChange={(e) => setNewNombre(e.target.value)}
                        placeholder="Nombre de pila"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">Apellido paterno</label>
                        <Input
                          value={newApellidoPaterno}
                          onChange={(e) => setNewApellidoPaterno(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">Apellido materno</label>
                        <Input
                          value={newApellidoMaterno}
                          onChange={(e) => setNewApellidoMaterno(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Identificadores fiscales */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">RFC</label>
                    <Input
                      value={newRFC}
                      onChange={(e) => setNewRFC(e.target.value)}
                      placeholder={newTipoPersona === 'moral' ? '12 caracteres' : '13 caracteres'}
                      className="uppercase font-mono"
                    />
                  </div>
                  {newTipoPersona === 'fisica' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">CURP</label>
                      <Input
                        value={newCurp}
                        onChange={(e) => setNewCurp(e.target.value)}
                        className="uppercase font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* Régimen fiscal — solo si hubo CSF */}
                {csfExtraccion && (
                  <>
                    <Separator />
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Régimen fiscal
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[100px_1fr]">
                      <div className="space-y-2">
                        <label className="text-xs font-medium leading-none">Código</label>
                        <Input
                          value={newRegimenCodigo}
                          onChange={(e) => setNewRegimenCodigo(e.target.value)}
                          placeholder="601"
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium leading-none">Descripción</label>
                        <Input
                          value={newRegimenNombre}
                          onChange={(e) => setNewRegimenNombre(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Domicilio fiscal
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[1fr_120px_120px]">
                      <div className="space-y-2">
                        <label className="text-xs font-medium leading-none">Calle</label>
                        <Input
                          value={newDomCalle}
                          onChange={(e) => setNewDomCalle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium leading-none">Núm. ext.</label>
                        <Input
                          value={newDomNumExt}
                          onChange={(e) => setNewDomNumExt(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium leading-none">Núm. int.</label>
                        <Input
                          value={newDomNumInt}
                          onChange={(e) => setNewDomNumInt(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
                      <div className="space-y-2">
                        <label className="text-xs font-medium leading-none">Colonia</label>
                        <Input
                          value={newDomColonia}
                          onChange={(e) => setNewDomColonia(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium leading-none">CP</label>
                        <Input
                          value={newDomCp}
                          onChange={(e) => setNewDomCp(e.target.value)}
                          className="font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-medium leading-none">Municipio</label>
                        <Input
                          value={newDomMunicipio}
                          onChange={(e) => setNewDomMunicipio(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium leading-none">Estado</label>
                        <Input
                          value={newDomEstado}
                          onChange={(e) => setNewDomEstado(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Contacto (común a ambos flujos) */}
                <Separator />
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Contacto
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Teléfono</label>
                    <Input value={newTelefono} onChange={(e) => setNewTelefono(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Email</label>
                    <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  </div>
                </div>

                {/* Solo flujo manual: contacto + dirección legacy + notas */}
                {!csfExtraccion && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Contacto</label>
                      <Input
                        value={newContacto}
                        onChange={(e) => setNewContacto(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Dirección</label>
                      <Input
                        value={newDireccion}
                        onChange={(e) => setNewDireccion(e.target.value)}
                        placeholder="Calle, número, colonia, ciudad…"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">
                        Notas / Detalles adicionales
                      </label>
                      <Input
                        value={newNotas}
                        onChange={(e) => setNewNotas(e.target.value)}
                        placeholder="Ej. Días de entrega, condiciones de crédito…"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end pt-6 border-t">
                <Button onClick={handleCreate} disabled={creating} className="gap-2">
                  {creating ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Crear Proveedor
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Modal: RFC duplicado */}
        <Sheet open={duplicadoOpen} onOpenChange={setDuplicadoOpen}>
          <SheetContent className="sm:max-w-[480px]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                RFC ya registrado
              </SheetTitle>
            </SheetHeader>
            <div className="mt-8 space-y-6">
              <p className="text-sm">
                El RFC{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {duplicadoInfo?.rfc}
                </code>{' '}
                ya está registrado como proveedor activo en RDB. Para evitar duplicados, elige una
                acción:
              </p>
              <div className="space-y-2">
                <Button
                  className="w-full justify-start gap-2"
                  variant="outline"
                  onClick={() => {
                    setDuplicadoOpen(false);
                    setCreateDrawerOpen(false);
                    if (duplicadoInfo) {
                      const target = proveedores.find(
                        (p) => p.persona_id === duplicadoInfo.persona_id
                      );
                      if (target) {
                        setSelected(target);
                        setDrawerOpen(true);
                      } else {
                        void fetchProveedores();
                      }
                    }
                  }}
                  disabled={!duplicadoInfo?.proveedor_id}
                >
                  <ExternalLink className="h-4 w-4" />
                  Ir al proveedor existente
                </Button>
                <Button
                  className="w-full justify-start gap-2"
                  variant="ghost"
                  onClick={() => setDuplicadoOpen(false)}
                >
                  Volver al formulario y editar RFC
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Si necesitas actualizar la CSF del proveedor existente, usa el botón &ldquo;Cargar /
                Actualizar CSF&rdquo; en su detalle (Sprint 3 — próximamente).
              </p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </RequireAccess>
  );
}

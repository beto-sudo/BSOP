'use client';

/**
 * ProveedoresModule — módulo cross-empresa de Proveedores.
 *
 * Convención SM1-SM5 (ADR-011): el page de cada empresa es un wrapper
 * de ~30 líneas que delega aquí. Las diferencias entre empresas
 * (empresa_id, logo, etiqueta) viven como props.
 *
 * Usado por:
 *   - app/rdb/proveedores/page.tsx
 *   - app/dilesa/proveedores/page.tsx
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTriggerPrint } from '@/components/print';
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

// ─── CSF diff helpers (Sprint 3.B) ───────────────────────────────────────────

const CSF_DIFF_FIELDS = [
  'tipo_persona',
  'rfc',
  'curp',
  'nombre',
  'apellido_paterno',
  'apellido_materno',
  'razon_social',
  'nombre_comercial',
  'regimen_fiscal_codigo',
  'regimen_fiscal_nombre',
  'regimenes_adicionales',
  'domicilio_calle',
  'domicilio_num_ext',
  'domicilio_num_int',
  'domicilio_colonia',
  'domicilio_cp',
  'domicilio_municipio',
  'domicilio_estado',
  'obligaciones',
  'fecha_inicio_operaciones',
  'fecha_emision',
] as const;

const FIELD_LABELS: Record<(typeof CSF_DIFF_FIELDS)[number], string> = {
  tipo_persona: 'Tipo de persona',
  rfc: 'RFC',
  curp: 'CURP',
  nombre: 'Nombre',
  apellido_paterno: 'Apellido paterno',
  apellido_materno: 'Apellido materno',
  razon_social: 'Razón social',
  nombre_comercial: 'Nombre comercial',
  regimen_fiscal_codigo: 'Régimen — código',
  regimen_fiscal_nombre: 'Régimen — descripción',
  regimenes_adicionales: 'Regímenes adicionales',
  domicilio_calle: 'Domicilio — calle',
  domicilio_num_ext: 'Domicilio — núm. ext.',
  domicilio_num_int: 'Domicilio — núm. int.',
  domicilio_colonia: 'Domicilio — colonia',
  domicilio_cp: 'Domicilio — CP',
  domicilio_municipio: 'Domicilio — municipio',
  domicilio_estado: 'Domicilio — estado',
  obligaciones: 'Obligaciones',
  fecha_inicio_operaciones: 'Fecha inicio operaciones',
  fecha_emision: 'Fecha emisión CSF',
};

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) {
    // Trata "" y null como equivalentes (común en datos de SAT).
    if (a === '' && b == null) return true;
    if (b === '' && a == null) return true;
    return false;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function formatDiffValue(v: unknown): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) {
    if (v.length === 0) return '— (vacío)';
    return v
      .map((item: unknown) => {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          if ('codigo' in obj && 'nombre' in obj) return `${obj.codigo} · ${obj.nombre}`;
          if ('descripcion' in obj) return String(obj.descripcion);
        }
        return String(item);
      })
      .join('\n');
  }
  return String(v);
}

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
  onUpdateCsf,
  saving,
  logoPath,
  membreteAlt,
}: {
  proveedor: Proveedor | null;
  open: boolean;
  onClose: () => void;
  onEdit: (p: Proveedor) => void;
  onToggleActivo: (p: Proveedor) => void;
  onUpdateCsf: (p: Proveedor) => void;
  saving: boolean;
  logoPath: string;
  membreteAlt: string;
}) {
  const triggerPrint = useTriggerPrint();
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
          src={logoPath}
          alt={membreteAlt}
          className="hidden print:block w-full object-contain mb-6"
        />
        <SheetHeader>
          <SheetTitle>{proveedor.nombre}</SheetTitle>
          <div className="absolute right-12 top-4 hidden sm:flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => onUpdateCsf(proveedor)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Cargar / Actualizar CSF
            </Button>
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
            <Button variant="outline" size="sm" onClick={triggerPrint}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 pr-1 print:h-auto">
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

// ─── Module ──────────────────────────────────────────────────────────────────

export type ProveedoresModuleProps = {
  /** UUID de `core.empresas.id` que filtra todas las queries y sirve de `empresa_id` en inserts. */
  empresaId: string;
  /**
   * Slug en URL (`'rdb' | 'dilesa'`). Se usa como display label en el modal de
   * RFC duplicado (uppercase) y deja la prop disponible para futura
   * resolución de permisos.
   */
  empresaSlug: 'rdb' | 'dilesa';
  /** Path absoluto al membrete que aparece solo al imprimir el detalle. */
  logoPath: string;
  /** Texto alt del membrete. */
  membreteAlt: string;
};

export function ProveedoresModule({
  empresaId,
  empresaSlug,
  logoPath,
  membreteAlt,
}: ProveedoresModuleProps) {
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

  // ─── Update CSF flow state (Sprint 3.B) ─────────────────────────────────────
  const [updateCsfTarget, setUpdateCsfTarget] = useState<Proveedor | null>(null);
  const [updateCsfFile, setUpdateCsfFile] = useState<File | null>(null);
  const [updateCsfProcessing, setUpdateCsfProcessing] = useState(false);
  const [updateCsfError, setUpdateCsfError] = useState<string | null>(null);
  const [updateCsfExtraccion, setUpdateCsfExtraccion] = useState<CsfExtraccion | null>(null);
  const [currentDatos, setCurrentDatos] = useState<Partial<CsfExtraccion> | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());
  const [applyingDiff, setApplyingDiff] = useState(false);

  const empresaLabel = empresaSlug.toUpperCase();

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
        .eq('empresa_id', empresaId);
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
  }, [empresaId]);

  // ─── Update CSF handlers (Sprint 3.B) ──────────────────────────────────────

  const fetchCurrentDatos = async (personaId: string): Promise<Partial<CsfExtraccion>> => {
    const supabase = createSupabaseBrowserClient();
    const [pRes, dfRes] = await Promise.all([
      supabase
        .schema('erp')
        .from('personas')
        .select('tipo_persona, rfc, curp, nombre, apellido_paterno, apellido_materno')
        .eq('id', personaId)
        .single(),
      supabase
        .schema('erp')
        .from('personas_datos_fiscales')
        .select(
          'razon_social, nombre_comercial, regimen_fiscal_codigo, regimen_fiscal_nombre, regimenes_adicionales, domicilio_calle, domicilio_num_ext, domicilio_num_int, domicilio_colonia, domicilio_cp, domicilio_municipio, domicilio_estado, obligaciones, fecha_inicio_operaciones, csf_fecha_emision'
        )
        .eq('persona_id', personaId)
        .maybeSingle(),
    ]);
    const p = (pRes.data ?? {}) as Record<string, unknown>;
    const df = (dfRes.data ?? {}) as Record<string, unknown>;
    return {
      tipo_persona: (p.tipo_persona as 'fisica' | 'moral' | undefined) ?? 'fisica',
      rfc: (p.rfc as string | null) ?? '',
      curp: (p.curp as string | null) ?? null,
      nombre: (p.nombre as string | null) ?? null,
      apellido_paterno: (p.apellido_paterno as string | null) ?? null,
      apellido_materno: (p.apellido_materno as string | null) ?? null,
      razon_social: (df.razon_social as string | null) ?? null,
      nombre_comercial: (df.nombre_comercial as string | null) ?? null,
      regimen_fiscal_codigo: (df.regimen_fiscal_codigo as string | null) ?? null,
      regimen_fiscal_nombre: (df.regimen_fiscal_nombre as string | null) ?? null,
      regimenes_adicionales:
        (df.regimenes_adicionales as CsfExtraccion['regimenes_adicionales'] | null) ?? [],
      domicilio_calle: (df.domicilio_calle as string | null) ?? null,
      domicilio_num_ext: (df.domicilio_num_ext as string | null) ?? null,
      domicilio_num_int: (df.domicilio_num_int as string | null) ?? null,
      domicilio_colonia: (df.domicilio_colonia as string | null) ?? null,
      domicilio_cp: (df.domicilio_cp as string | null) ?? null,
      domicilio_municipio: (df.domicilio_municipio as string | null) ?? null,
      domicilio_estado: (df.domicilio_estado as string | null) ?? null,
      obligaciones: (df.obligaciones as CsfExtraccion['obligaciones'] | null) ?? [],
      fecha_inicio_operaciones: (df.fecha_inicio_operaciones as string | null) ?? null,
      fecha_emision: (df.csf_fecha_emision as string | null) ?? null,
    };
  };

  const handleStartUpdateCsf = (p: Proveedor) => {
    setUpdateCsfTarget(p);
    setUpdateCsfFile(null);
    setUpdateCsfExtraccion(null);
    setUpdateCsfError(null);
    setCurrentDatos(null);
    setAcceptedFields(new Set());
    // Trigger file picker via hidden input
    document.getElementById('update-csf-file-input')?.click();
  };

  const handleUpdateCsfFileChosen = async (file: File | null) => {
    if (!file || !updateCsfTarget?.persona_id) return;
    setUpdateCsfFile(file);
    setUpdateCsfProcessing(true);
    setUpdateCsfError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const [extractRes, current] = await Promise.all([
        fetch('/api/proveedores/extract-csf', { method: 'POST', body: fd }),
        fetchCurrentDatos(updateCsfTarget.persona_id),
      ]);
      const extractJson = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractJson.error ?? 'Error al procesar CSF');

      const ex = extractJson.extraccion as CsfExtraccion;
      setUpdateCsfExtraccion(ex);
      setCurrentDatos(current);

      // Pre-marca todos los campos que difieren.
      const initial = new Set<string>();
      for (const key of CSF_DIFF_FIELDS) {
        const cur = (current as Record<string, unknown>)[key];
        const nu = (ex as Record<string, unknown>)[key];
        if (!valuesEqual(cur, nu)) initial.add(key);
      }
      setAcceptedFields(initial);
      setDiffOpen(true);
    } catch (err) {
      setUpdateCsfError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdateCsfProcessing(false);
    }
  };

  const handleApplyDiff = async () => {
    if (!updateCsfFile || !updateCsfExtraccion || !updateCsfTarget?.persona_id) return;
    setApplyingDiff(true);
    try {
      const fd = new FormData();
      fd.append('file', updateCsfFile);
      fd.append(
        'payload',
        JSON.stringify({
          empresa_id: empresaId,
          extraccion: updateCsfExtraccion,
          accepted_fields: Array.from(acceptedFields),
        })
      );
      const res = await fetch(`/api/proveedores/${updateCsfTarget.persona_id}/update-csf`, {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al aplicar cambios');
      setDiffOpen(false);
      setUpdateCsfFile(null);
      setUpdateCsfExtraccion(null);
      setCurrentDatos(null);
      setUpdateCsfTarget(null);
      void fetchProveedores();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al aplicar cambios');
    } finally {
      setApplyingDiff(false);
    }
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
            empresa_id: empresaId,
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
          empresa_id: empresaId,
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
        empresa_id: empresaId,
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
        .eq('empresa_id', empresaId)
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
        .eq('empresa_id', empresaId)
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

      {/* Hidden file input for the "Cargar / Actualizar CSF" flow */}
      <input
        id="update-csf-file-input"
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          void handleUpdateCsfFileChosen(f);
          e.target.value = ''; // permite re-elegir el mismo archivo después
        }}
      />

      {/* Detail drawer */}
      <ProveedorDetail
        proveedor={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={openEdit}
        onToggleActivo={handleToggleActivo}
        onUpdateCsf={handleStartUpdateCsf}
        saving={savingEdit}
        logoPath={logoPath}
        membreteAlt={membreteAlt}
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
                      Auto-llena el formulario con los datos extraídos de la Constancia de Situación
                      Fiscal del SAT. Soporta personas físicas y morales.
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
                      <Input value={newDomCalle} onChange={(e) => setNewDomCalle(e.target.value)} />
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

      {/* Update CSF — overlay de procesamiento (mientras Claude lee el PDF) */}
      {updateCsfProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg bg-background p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 animate-spin text-emerald-600" />
              <div>
                <div className="text-sm font-medium">Procesando CSF…</div>
                <div className="text-xs text-muted-foreground">
                  Claude está leyendo el PDF (30-90 segundos).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update CSF — banner de error */}
      {updateCsfError && !diffOpen && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong>Error al procesar CSF:</strong> {updateCsfError}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2 -mt-1 h-6 px-2"
              onClick={() => setUpdateCsfError(null)}
            >
              ✕
            </Button>
          </div>
        </div>
      )}

      {/* Modal: diff campo-por-campo (Sprint 3.B) */}
      <Sheet
        open={diffOpen}
        onOpenChange={(v) => {
          if (!v) {
            setDiffOpen(false);
            // No limpiamos el target ni file aquí — usuario puede cancelar y
            // re-abrir si decide aplicar después. Limpieza completa pasa al
            // aplicar exitosamente o al iniciar un nuevo update.
          }
        }}
      >
        <SheetContent className="sm:max-w-[800px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              Revisar cambios de la CSF
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              {updateCsfTarget?.nombre} — marca los campos que quieras aplicar. La CSF nueva queda
              archivada como histórico aunque rechaces todos los cambios.
            </p>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Toolbar de selección */}
            <div className="flex flex-wrap items-center gap-2 border-b pb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!updateCsfExtraccion || !currentDatos) return;
                  const all = new Set<string>();
                  for (const k of CSF_DIFF_FIELDS) {
                    const cur = (currentDatos as Record<string, unknown>)[k];
                    const nu = (updateCsfExtraccion as Record<string, unknown>)[k];
                    if (!valuesEqual(cur, nu)) all.add(k);
                  }
                  setAcceptedFields(all);
                }}
              >
                Seleccionar todos los cambios
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAcceptedFields(new Set())}>
                Limpiar selección
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {acceptedFields.size} de {CSF_DIFF_FIELDS.length} campos seleccionados
              </span>
            </div>

            {/* Lista de cambios */}
            {updateCsfExtraccion && currentDatos && (
              <div className="space-y-2">
                {(() => {
                  const changes = CSF_DIFF_FIELDS.filter((k) => {
                    const cur = (currentDatos as Record<string, unknown>)[k];
                    const nu = (updateCsfExtraccion as Record<string, unknown>)[k];
                    return !valuesEqual(cur, nu);
                  });

                  if (changes.length === 0) {
                    return (
                      <div className="rounded-md border border-emerald-300/40 bg-emerald-50/40 p-4 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                        ✓ La CSF nueva no trae cambios respecto a los datos actuales. Si la aplicas
                        (o la cancelas), el PDF queda archivado igual como histórico.
                      </div>
                    );
                  }

                  return changes.map((k) => {
                    const checked = acceptedFields.has(k);
                    const cur = (currentDatos as Record<string, unknown>)[k];
                    const nu = (updateCsfExtraccion as Record<string, unknown>)[k];
                    return (
                      <label
                        key={k}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                          checked
                            ? 'border-emerald-400/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                            : 'border-border'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(acceptedFields);
                            if (e.target.checked) next.add(k);
                            else next.delete(k);
                            setAcceptedFields(next);
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="text-sm font-medium">{FIELD_LABELS[k]}</div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Actual
                              </div>
                              <div className="rounded bg-muted/50 px-2 py-1 text-xs font-mono whitespace-pre-wrap">
                                {formatDiffValue(cur)}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                Nuevo
                              </div>
                              <div className="rounded bg-emerald-100/50 px-2 py-1 text-xs font-mono whitespace-pre-wrap dark:bg-emerald-950/30">
                                {formatDiffValue(nu)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  });
                })()}
              </div>
            )}

            {/* Footer de acciones */}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setDiffOpen(false)} disabled={applyingDiff}>
                Cancelar
              </Button>
              <Button onClick={handleApplyDiff} disabled={applyingDiff} className="gap-2">
                {applyingDiff ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {acceptedFields.size === 0
                  ? 'Solo archivar PDF'
                  : `Aplicar ${acceptedFields.size} cambio${acceptedFields.size === 1 ? '' : 's'}`}
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
              ya está registrado como proveedor activo en {empresaLabel}. Para evitar duplicados,
              elige una acción:
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
              Actualizar CSF&rdquo; en su detalle.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

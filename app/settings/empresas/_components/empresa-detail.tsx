'use client';

import { useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

import type { CsfExtraccion } from '@/lib/proveedores/extract-csf';
import { DocumentosLegalesPanel } from './documentos-legales-panel';
import { ImageUploader } from './image-uploader';

export type ActividadEconomica = {
  orden: number;
  actividad: string;
  porcentaje: string;
  fecha_inicio: string;
  fecha_fin: string | null;
};

export type ObligacionFiscal = {
  descripcion: string;
  vencimiento: string;
  fecha_inicio: string;
  fecha_fin: string | null;
};

/**
 * Forma de `core.empresas.escritura_constitutiva` y `escritura_poder` (jsonb).
 * Validado por `lib/rh/datos-fiscales-empresa.ts` para alta de empleados.
 */
export type EscrituraJsonb = {
  numero?: string | null;
  fecha?: string | null;
  fecha_texto?: string | null;
  notario?: string | null;
  notaria_numero?: string | null;
  distrito?: string | null;
};

export type Empresa = {
  id: string;
  nombre: string;
  slug: string;
  activa: boolean;
  logo_url: string | null;
  header_url: string | null;
  rfc: string | null;
  razon_social: string | null;
  regimen_capital: string | null;
  nombre_comercial: string | null;
  fecha_inicio_operaciones: string | null;
  estatus_sat: string | null;
  id_cif: string | null;
  regimen_fiscal: string | null;
  domicilio_cp: string | null;
  domicilio_calle: string | null;
  domicilio_numero_ext: string | null;
  domicilio_numero_int: string | null;
  domicilio_colonia: string | null;
  domicilio_localidad: string | null;
  domicilio_municipio: string | null;
  domicilio_estado: string | null;
  actividades_economicas: ActividadEconomica[] | null;
  obligaciones_fiscales: ObligacionFiscal[] | null;
  csf_fecha_emision: string | null;
  csf_url: string | null;
  tipo_contribuyente: 'persona_moral' | 'persona_fisica' | null;
  curp: string | null;
  registro_patronal_imss: string | null;
  representante_legal: string | null;
  escritura_constitutiva: EscrituraJsonb | null;
  escritura_poder: EscrituraJsonb | null;
};

const ESCRITURA_FIELD_KEYS = [
  'numero',
  'fecha_texto',
  'notario',
  'notaria_numero',
  'distrito',
] as const;
type EscrituraFieldKey = (typeof ESCRITURA_FIELD_KEYS)[number];

const ESCRITURA_LABELS: Record<EscrituraFieldKey, string> = {
  numero: 'Número de escritura',
  fecha_texto: 'Fecha (texto legible)',
  notario: 'Notario',
  notaria_numero: 'Número de notaría',
  distrito: 'Distrito notarial',
};

const ESCRITURA_PLACEHOLDERS: Record<EscrituraFieldKey, string> = {
  numero: '12345',
  fecha_texto: 'quince de mayo del dos mil diez',
  notario: 'JUAN PÉREZ',
  notaria_numero: '5',
  distrito: 'PIEDRAS NEGRAS',
};

// ─── Diff helpers (espejados del patrón de proveedores) ───────────────────

type DiffKey =
  | 'rfc'
  | 'curp'
  | 'razon_social'
  | 'nombre_comercial'
  | 'regimen_fiscal'
  | 'regimen_capital'
  | 'id_cif'
  | 'estatus_sat'
  | 'domicilio_calle'
  | 'domicilio_numero_ext'
  | 'domicilio_numero_int'
  | 'domicilio_colonia'
  | 'domicilio_cp'
  | 'domicilio_municipio'
  | 'domicilio_estado'
  | 'fecha_inicio_operaciones'
  | 'csf_fecha_emision'
  | 'obligaciones_fiscales'
  | 'actividades_economicas';

const DIFF_FIELDS: ReadonlyArray<DiffKey> = [
  'rfc',
  'curp',
  'razon_social',
  'nombre_comercial',
  'regimen_fiscal',
  'regimen_capital',
  'id_cif',
  'estatus_sat',
  'domicilio_calle',
  'domicilio_numero_ext',
  'domicilio_numero_int',
  'domicilio_colonia',
  'domicilio_cp',
  'domicilio_municipio',
  'domicilio_estado',
  'fecha_inicio_operaciones',
  'csf_fecha_emision',
  'obligaciones_fiscales',
  'actividades_economicas',
];

const FIELD_LABELS: Record<DiffKey, string> = {
  rfc: 'RFC',
  curp: 'CURP',
  razon_social: 'Razón social',
  nombre_comercial: 'Nombre comercial',
  regimen_fiscal: 'Régimen fiscal',
  regimen_capital: 'Régimen de capital',
  id_cif: 'idCIF',
  estatus_sat: 'Estatus SAT',
  domicilio_calle: 'Domicilio — calle',
  domicilio_numero_ext: 'Domicilio — núm. ext.',
  domicilio_numero_int: 'Domicilio — núm. int.',
  domicilio_colonia: 'Domicilio — colonia',
  domicilio_cp: 'Domicilio — CP',
  domicilio_municipio: 'Domicilio — municipio',
  domicilio_estado: 'Domicilio — estado',
  fecha_inicio_operaciones: 'Fecha inicio operaciones',
  csf_fecha_emision: 'Fecha emisión CSF',
  obligaciones_fiscales: 'Obligaciones fiscales',
  actividades_economicas: 'Actividades económicas',
};

// El backend recibe keys del extractor neutro + extras. Mapeo display→backend.
const DIFF_KEY_TO_API_KEY: Record<DiffKey, string> = {
  rfc: 'rfc',
  curp: 'curp',
  razon_social: 'razon_social',
  nombre_comercial: 'nombre_comercial',
  regimen_fiscal: 'regimen_fiscal_nombre',
  regimen_capital: 'regimen_capital',
  id_cif: 'id_cif',
  estatus_sat: 'estatus_sat',
  domicilio_calle: 'domicilio_calle',
  domicilio_numero_ext: 'domicilio_num_ext',
  domicilio_numero_int: 'domicilio_num_int',
  domicilio_colonia: 'domicilio_colonia',
  domicilio_cp: 'domicilio_cp',
  domicilio_municipio: 'domicilio_municipio',
  domicilio_estado: 'domicilio_estado',
  fecha_inicio_operaciones: 'fecha_inicio_operaciones',
  csf_fecha_emision: 'fecha_emision',
  obligaciones_fiscales: 'obligaciones',
  actividades_economicas: 'actividades_economicas',
};

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) {
    if (a === '' && b == null) return true;
    if (b === '' && a == null) return true;
    return false;
  }
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  if (typeof a === 'object' && typeof b === 'object')
    return JSON.stringify(a) === JSON.stringify(b);
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
          if ('actividad' in obj) {
            const pct = obj.porcentaje ? ` (${obj.porcentaje})` : '';
            return `${obj.orden ?? '?'}. ${obj.actividad}${pct}`;
          }
          if ('descripcion' in obj) return String(obj.descripcion);
          if ('codigo' in obj && 'nombre' in obj) return `${obj.codigo} · ${obj.nombre}`;
        }
        return String(item);
      })
      .join('\n');
  }
  return String(v);
}

/**
 * Para un `DiffKey`, lee el valor "actual" desde la empresa y el valor "nuevo"
 * desde el extractor. Maneja los renames de columna y la transformación de
 * arrays con shape distinto.
 */
function getActualAndNew(
  key: DiffKey,
  empresa: Empresa,
  extraccion: CsfExtraccion
): { actual: unknown; nuevo: unknown } {
  switch (key) {
    case 'rfc':
      return { actual: empresa.rfc, nuevo: extraccion.rfc };
    case 'curp':
      return { actual: empresa.curp, nuevo: extraccion.curp };
    case 'razon_social':
      return { actual: empresa.razon_social, nuevo: extraccion.razon_social };
    case 'nombre_comercial':
      return { actual: empresa.nombre_comercial, nuevo: extraccion.nombre_comercial };
    case 'regimen_fiscal':
      return { actual: empresa.regimen_fiscal, nuevo: extraccion.regimen_fiscal_nombre };
    case 'regimen_capital':
      return { actual: empresa.regimen_capital, nuevo: extraccion.regimen_capital };
    case 'id_cif':
      return { actual: empresa.id_cif, nuevo: extraccion.id_cif };
    case 'estatus_sat':
      return { actual: empresa.estatus_sat, nuevo: extraccion.estatus_sat };
    case 'domicilio_calle':
      return { actual: empresa.domicilio_calle, nuevo: extraccion.domicilio_calle };
    case 'domicilio_numero_ext':
      return { actual: empresa.domicilio_numero_ext, nuevo: extraccion.domicilio_num_ext };
    case 'domicilio_numero_int':
      return { actual: empresa.domicilio_numero_int, nuevo: extraccion.domicilio_num_int };
    case 'domicilio_colonia':
      return { actual: empresa.domicilio_colonia, nuevo: extraccion.domicilio_colonia };
    case 'domicilio_cp':
      return { actual: empresa.domicilio_cp, nuevo: extraccion.domicilio_cp };
    case 'domicilio_municipio':
      return { actual: empresa.domicilio_municipio, nuevo: extraccion.domicilio_municipio };
    case 'domicilio_estado':
      return { actual: empresa.domicilio_estado, nuevo: extraccion.domicilio_estado };
    case 'fecha_inicio_operaciones':
      return {
        actual: empresa.fecha_inicio_operaciones,
        nuevo: extraccion.fecha_inicio_operaciones,
      };
    case 'csf_fecha_emision':
      return { actual: empresa.csf_fecha_emision, nuevo: extraccion.fecha_emision };
    case 'obligaciones_fiscales':
      return {
        actual: empresa.obligaciones_fiscales ?? [],
        nuevo: extraccion.obligaciones,
      };
    case 'actividades_economicas':
      return {
        actual: empresa.actividades_economicas ?? [],
        nuevo: extraccion.actividades_economicas,
      };
  }
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-sm font-semibold text-[var(--text)]/80 uppercase tracking-wider border-b border-[var(--border)] pb-2 mb-4">
      {children}
    </h4>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 px-3 py-2 text-sm text-[var(--text)] min-h-[36px] flex items-center">
        {value ? <span>{value}</span> : <span className="text-[var(--text)]/30">—</span>}
      </div>
    </div>
  );
}

// ─── Campos editables ──────────────────────────────────────────────────────

/**
 * Subset de columnas de `core.empresas` editables a mano via PATCH /api/empresas/[id].
 * Excluye `actividades_economicas` y `obligaciones_fiscales` (jsonb arrays —
 * sólo se sobrescriben vía CSF en v1).
 */
const EDITABLE_FIELDS = [
  'rfc',
  'curp',
  'razon_social',
  'regimen_capital',
  'nombre_comercial',
  'fecha_inicio_operaciones',
  'estatus_sat',
  'id_cif',
  'regimen_fiscal',
  'csf_fecha_emision',
  'domicilio_calle',
  'domicilio_numero_ext',
  'domicilio_numero_int',
  'domicilio_colonia',
  'domicilio_localidad',
  'domicilio_municipio',
  'domicilio_estado',
  'domicilio_cp',
  'registro_patronal_imss',
  'representante_legal',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

type EditableValues = Record<EditableField, string> & {
  escritura_constitutiva: Record<EscrituraFieldKey, string>;
  escritura_poder: Record<EscrituraFieldKey, string>;
};

function buildEscrituraEditValues(src: EscrituraJsonb | null): Record<EscrituraFieldKey, string> {
  return {
    numero: src?.numero ?? '',
    fecha_texto: src?.fecha_texto ?? src?.fecha ?? '',
    notario: src?.notario ?? '',
    notaria_numero: src?.notaria_numero ?? '',
    distrito: src?.distrito ?? '',
  };
}

function buildInitialEditValues(empresa: Empresa): EditableValues {
  return {
    rfc: empresa.rfc ?? '',
    curp: empresa.curp ?? '',
    razon_social: empresa.razon_social ?? '',
    regimen_capital: empresa.regimen_capital ?? '',
    nombre_comercial: empresa.nombre_comercial ?? '',
    fecha_inicio_operaciones: empresa.fecha_inicio_operaciones ?? '',
    estatus_sat: empresa.estatus_sat ?? '',
    id_cif: empresa.id_cif ?? '',
    regimen_fiscal: empresa.regimen_fiscal ?? '',
    csf_fecha_emision: empresa.csf_fecha_emision ?? '',
    domicilio_calle: empresa.domicilio_calle ?? '',
    domicilio_numero_ext: empresa.domicilio_numero_ext ?? '',
    domicilio_numero_int: empresa.domicilio_numero_int ?? '',
    domicilio_colonia: empresa.domicilio_colonia ?? '',
    domicilio_localidad: empresa.domicilio_localidad ?? '',
    domicilio_municipio: empresa.domicilio_municipio ?? '',
    domicilio_estado: empresa.domicilio_estado ?? '',
    domicilio_cp: empresa.domicilio_cp ?? '',
    registro_patronal_imss: empresa.registro_patronal_imss ?? '',
    representante_legal: empresa.representante_legal ?? '',
    escritura_constitutiva: buildEscrituraEditValues(empresa.escritura_constitutiva),
    escritura_poder: buildEscrituraEditValues(empresa.escritura_poder),
  };
}

function EscrituraCard({
  title,
  values,
  editing,
  onChange,
  original,
}: {
  title: string;
  values: Record<EscrituraFieldKey, string>;
  editing: boolean;
  onChange: (field: EscrituraFieldKey, value: string) => void;
  original: EscrituraJsonb | null;
}) {
  const isEmpty = !original || Object.values(original).every((v) => v == null || v === '');
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-sm font-semibold text-[var(--text)]">{title}</h5>
        {!editing && isEmpty && (
          <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5">
            Sin capturar
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ESCRITURA_FIELD_KEYS.map((field) => (
          <div key={field} className={field === 'fecha_texto' ? 'sm:col-span-2' : ''}>
            <EditableTextField
              label={ESCRITURA_LABELS[field]}
              value={values[field]}
              editing={editing}
              onChange={(v) => onChange(field, v)}
              placeholder={ESCRITURA_PLACEHOLDERS[field]}
              monospace={field === 'numero' || field === 'notaria_numero'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableTextField({
  label,
  value,
  editing,
  onChange,
  placeholder,
  monospace,
  type = 'text',
  uppercase,
  maxLength,
  errorMessage,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  monospace?: boolean;
  type?: 'text' | 'date';
  uppercase?: boolean;
  maxLength?: number;
  errorMessage?: string | null;
}) {
  if (!editing) {
    return (
      <ReadOnlyField
        label={label}
        value={
          type === 'date' && value
            ? // Read-only date display: dd/mm/yyyy.
              (() => {
                const parts = value.split('-');
                return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
              })()
            : value || null
        }
      />
    );
  }
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`rounded-xl border-[var(--border)] bg-[var(--panel)] text-sm ${
          monospace ? 'font-mono' : ''
        } ${uppercase ? 'uppercase' : ''}`}
      />
      {errorMessage && <p className="text-xs text-red-400">{errorMessage}</p>}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export function EmpresaDetail({ empresa, onSaved }: { empresa: Empresa; onSaved: () => void }) {
  const supabase = createSupabaseBrowserClient();

  // Logos legacy (se mantienen editables — no son CSF).
  const [logoUrl, setLogoUrl] = useState(empresa.logo_url ?? '');
  const [headerUrl, setHeaderUrl] = useState(empresa.header_url ?? '');
  const [savingLegacyLogos, setSavingLegacyLogos] = useState(false);

  // Edición manual (PATCH /api/empresas/[id]). Cubre todos los campos de
  // `EDITABLE_FIELDS` — incluido `registro_patronal_imss`. Save unificado.
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<EditableValues>(() =>
    buildInitialEditValues(empresa)
  );
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaved, setEditSaved] = useState(false);

  // Drawer "Actualizar CSF": estados A=drop, B=processing, C=diff, D=applied.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [csfFile, setCsfFile] = useState<File | null>(null);
  const [csfProcessing, setCsfProcessing] = useState(false);
  const [csfError, setCsfError] = useState<string | null>(null);
  const [csfExtraccion, setCsfExtraccion] = useState<CsfExtraccion | null>(null);
  const [acceptedFields, setAcceptedFields] = useState<Set<DiffKey>>(new Set());
  const [applyingDiff, setApplyingDiff] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Derivados ──────────────────────────────────────────────────────────
  const actividades = empresa.actividades_economicas ?? [];
  const obligaciones = empresa.obligaciones_fiscales ?? [];

  const changes = useMemo<DiffKey[]>(() => {
    if (!csfExtraccion) return [];
    return DIFF_FIELDS.filter((k) => {
      const { actual, nuevo } = getActualAndNew(k, empresa, csfExtraccion);
      return !valuesEqual(actual, nuevo);
    });
  }, [empresa, csfExtraccion]);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleSaveLegacyLogos = async () => {
    setSavingLegacyLogos(true);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { error } = await (supabase.schema('core') as any)
      .from('empresas')
      .update({
        logo_url: logoUrl.trim() || null,
        header_url: headerUrl.trim() || null,
      })
      .eq('id', empresa.id);
    setSavingLegacyLogos(false);
    if (error) {
      alert(`Error al guardar logos: ${error.message}`);
      return;
    }
    onSaved();
  };

  const setEditField = (key: EditableField, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  };

  const setEscrituraField = (
    which: 'escritura_constitutiva' | 'escritura_poder',
    field: EscrituraFieldKey,
    value: string
  ) => {
    setEditValues((prev) => ({
      ...prev,
      [which]: { ...prev[which], [field]: value },
    }));
  };

  const handleStartEdit = () => {
    setEditValues(buildInitialEditValues(empresa));
    setEditError(null);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditValues(buildInitialEditValues(empresa));
    setEditError(null);
  };

  // Diff entre edición y empresa original. Solo manda al server lo que cambió.
  // Para los jsonb de escrituras, comparamos los 5 campos contra el original
  // y mandamos el objeto entero si algo cambió (más simple y suficiente para
  // este uso — son metadatos pequeños).
  const editPatch = useMemo<Record<string, string | null | Record<string, string | null>>>(() => {
    const patch: Record<string, string | null | Record<string, string | null>> = {};
    for (const key of EDITABLE_FIELDS) {
      const current = (empresa[key as keyof Empresa] ?? '') as string;
      const next = editValues[key];
      if ((current ?? '') !== next) {
        patch[key] = next.trim() === '' ? null : next.trim();
      }
    }

    const escriturasFromEmpresa = {
      escritura_constitutiva: buildEscrituraEditValues(empresa.escritura_constitutiva),
      escritura_poder: buildEscrituraEditValues(empresa.escritura_poder),
    } as const;

    for (const which of ['escritura_constitutiva', 'escritura_poder'] as const) {
      const original = escriturasFromEmpresa[which];
      const edited = editValues[which];
      const changed = ESCRITURA_FIELD_KEYS.some((f) => (original[f] ?? '') !== (edited[f] ?? ''));
      if (changed) {
        const obj: Record<string, string | null> = {};
        for (const f of ESCRITURA_FIELD_KEYS) {
          obj[f] = edited[f].trim() === '' ? null : edited[f].trim();
        }
        patch[which] = obj;
      }
    }

    return patch;
  }, [editValues, empresa]);

  const editIsDirty = Object.keys(editPatch).length > 0;

  // Validación cliente del registro patronal antes de guardar (regex SAT/IMSS).
  const rpInputValue = editValues.registro_patronal_imss.trim();
  const rpInputInvalid = rpInputValue !== '' && !/^[A-Z]\d{10}$/.test(rpInputValue);

  const handleSaveEdit = async () => {
    if (!editIsDirty) return;
    if (rpInputInvalid) {
      setEditError('Registro patronal IMSS inválido. Formato: 1 letra + 10 dígitos.');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(editPatch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar');
      setEditing(false);
      setEditSaved(true);
      setTimeout(() => setEditSaved(false), 3000);
      onSaved();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const resetDrawer = () => {
    setCsfFile(null);
    setCsfExtraccion(null);
    setCsfError(null);
    setAcceptedFields(new Set());
    setDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCsfFileChosen = async (file: File | null) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') {
      setCsfError(`Tipo de archivo no soportado: ${file.type}. Solo .pdf.`);
      return;
    }
    setCsfFile(file);
    setCsfProcessing(true);
    setCsfError(null);
    setCsfExtraccion(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/empresas/extract-csf', { method: 'POST', body: fd });
      const text = await res.text();
      let json: { ok?: boolean; extraccion?: CsfExtraccion; error?: string } | null = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // Server devolvió HTML/texto plano (típico de timeout, 502, login redirect).
        const preview = text.slice(0, 160);
        throw new Error(
          `Respuesta no-JSON del servidor (${res.status}): ${preview || 'cuerpo vacío'}`
        );
      }
      if (!res.ok) {
        throw new Error(json?.error ?? `Error ${res.status} al procesar CSF`);
      }
      if (!json?.extraccion) {
        throw new Error('Respuesta del servidor sin campo "extraccion".');
      }
      setCsfExtraccion(json.extraccion);
    } catch (err) {
      setCsfError(err instanceof Error ? err.message : String(err));
      // Si la extracción falla, soltamos el file para que el botón vuelva a la
      // zona de drop (estado A) y el usuario pueda reintentar sin re-abrir.
      setCsfFile(null);
    } finally {
      setCsfProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    void handleCsfFileChosen(file);
  };

  const handleApplyDiff = async () => {
    if (!csfFile || !csfExtraccion) return;
    setApplyingDiff(true);
    try {
      const apiKeys = Array.from(acceptedFields).map((k) => DIFF_KEY_TO_API_KEY[k]);
      const fd = new FormData();
      fd.append('file', csfFile);
      fd.append(
        'payload',
        JSON.stringify({
          extraccion: csfExtraccion,
          accepted_fields: apiKeys,
        })
      );
      const res = await fetch(`/api/empresas/${empresa.id}/update-csf`, {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al aplicar cambios');
      setDrawerOpen(false);
      resetDrawer();
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al aplicar cambios');
    } finally {
      setApplyingDiff(false);
    }
  };

  const isDirtyLegacyLogos = () =>
    logoUrl !== (empresa.logo_url ?? '') || headerUrl !== (empresa.header_url ?? '');

  return (
    <div className="space-y-6">
      <ImageUploader
        label="Logo (legacy)"
        currentUrl={logoUrl || null}
        bucket="branding"
        storagePath={`${empresa.slug}/logo`}
        onUploaded={(url) => setLogoUrl(url)}
      />
      <ImageUploader
        label="Encabezado para impresión (header_url)"
        currentUrl={headerUrl || null}
        bucket="branding"
        storagePath={`${empresa.slug}/header`}
        onUploaded={(url) => setHeaderUrl(url)}
      />

      {isDirtyLegacyLogos() && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <span className="flex-1 text-xs text-[var(--text-muted)]">
            Cambios pendientes en logos legacy.
          </span>
          <Button
            size="sm"
            onClick={handleSaveLegacyLogos}
            disabled={savingLegacyLogos}
            className="gap-1.5 rounded-xl"
          >
            {savingLegacyLogos ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar logos legacy
          </Button>
        </div>
      )}

      {/* Datos fiscales — read-only por default, editables vía botón "Editar" */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SectionTitle>Datos fiscales</SectionTitle>
          <div className="flex items-center gap-2">
            {!editing ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleStartEdit}
                  className="gap-1.5 rounded-xl"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDrawerOpen(true)}
                  className="gap-1.5 rounded-xl"
                >
                  <Sparkles className="h-4 w-4" />
                  Actualizar CSF
                </Button>
                {editSaved && (
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    Guardado
                  </span>
                )}
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={savingEdit}
                  className="gap-1.5 rounded-xl"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={!editIsDirty || savingEdit || rpInputInvalid}
                  className="gap-1.5 rounded-xl"
                >
                  {savingEdit ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar cambios
                </Button>
              </>
            )}
          </div>
        </div>

        {editing && (
          <p className="text-xs text-[var(--text-muted)] -mt-2">
            Modo edición manual. Para refrescar campos del CSF desde un PDF nuevo, cancela y usa{' '}
            <strong>Actualizar CSF</strong>. Solo se guardan los campos que cambien.
          </p>
        )}

        {editError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {editError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <EditableTextField
            label="RFC"
            value={editValues.rfc}
            editing={editing}
            onChange={(v) => setEditField('rfc', v)}
            placeholder="ABC123456XX0"
            monospace
            uppercase
            maxLength={13}
          />
          <EditableTextField
            label="Razón Social"
            value={editValues.razon_social}
            editing={editing}
            onChange={(v) => setEditField('razon_social', v)}
          />
          <EditableTextField
            label="Régimen Capital"
            value={editValues.regimen_capital}
            editing={editing}
            onChange={(v) => setEditField('regimen_capital', v)}
            placeholder="SA de CV"
          />
          <EditableTextField
            label="Nombre Comercial"
            value={editValues.nombre_comercial}
            editing={editing}
            onChange={(v) => setEditField('nombre_comercial', v)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <EditableTextField
            label="Fecha Inicio Operaciones"
            value={editValues.fecha_inicio_operaciones}
            editing={editing}
            onChange={(v) => setEditField('fecha_inicio_operaciones', v)}
            type="date"
          />
          <EditableTextField
            label="Estatus SAT"
            value={editValues.estatus_sat}
            editing={editing}
            onChange={(v) => setEditField('estatus_sat', v)}
            placeholder="ACTIVO"
            uppercase
          />
          <EditableTextField
            label="idCIF"
            value={editValues.id_cif}
            editing={editing}
            onChange={(v) => setEditField('id_cif', v)}
            monospace
          />
          <EditableTextField
            label="Régimen Fiscal"
            value={editValues.regimen_fiscal}
            editing={editing}
            onChange={(v) => setEditField('regimen_fiscal', v)}
          />
        </div>
        {(editing || empresa.tipo_contribuyente === 'persona_fisica') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <EditableTextField
              label="CURP"
              value={editValues.curp}
              editing={editing}
              onChange={(v) => setEditField('curp', v)}
              monospace
              uppercase
              maxLength={18}
            />
            <EditableTextField
              label="Registro Patronal IMSS"
              value={editValues.registro_patronal_imss}
              editing={editing}
              onChange={(v) => setEditField('registro_patronal_imss', v)}
              placeholder="A0000000000"
              monospace
              uppercase
              maxLength={11}
              errorMessage={rpInputInvalid ? 'Formato: 1 letra + 10 dígitos.' : null}
            />
            <div className="sm:col-span-2">
              <EditableTextField
                label="Representante Legal"
                value={editValues.representante_legal}
                editing={editing}
                onChange={(v) => setEditField('representante_legal', v)}
                placeholder="Nombre completo del representante legal"
              />
            </div>
          </div>
        )}
        {/* Si solo hay registro_patronal o representante_legal en read-only sin
            CURP (caso típico para personas morales del grupo), mostrarlos. */}
        {!editing && empresa.tipo_contribuyente !== 'persona_fisica' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <EditableTextField
              label="Registro Patronal IMSS"
              value={editValues.registro_patronal_imss}
              editing={false}
              onChange={() => undefined}
            />
            <div className="sm:col-span-2">
              <EditableTextField
                label="Representante Legal"
                value={editValues.representante_legal}
                editing={false}
                onChange={() => undefined}
              />
            </div>
          </div>
        )}
      </div>

      {/* Domicilio Fiscal */}
      <div className="space-y-4">
        <SectionTitle>Domicilio Fiscal</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <EditableTextField
              label="Calle"
              value={editValues.domicilio_calle}
              editing={editing}
              onChange={(v) => setEditField('domicilio_calle', v)}
            />
          </div>
          <EditableTextField
            label="Número Exterior"
            value={editValues.domicilio_numero_ext}
            editing={editing}
            onChange={(v) => setEditField('domicilio_numero_ext', v)}
          />
          <EditableTextField
            label="Número Interior"
            value={editValues.domicilio_numero_int}
            editing={editing}
            onChange={(v) => setEditField('domicilio_numero_int', v)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <EditableTextField
            label="Colonia"
            value={editValues.domicilio_colonia}
            editing={editing}
            onChange={(v) => setEditField('domicilio_colonia', v)}
          />
          <EditableTextField
            label="Localidad"
            value={editValues.domicilio_localidad}
            editing={editing}
            onChange={(v) => setEditField('domicilio_localidad', v)}
          />
          <EditableTextField
            label="Municipio"
            value={editValues.domicilio_municipio}
            editing={editing}
            onChange={(v) => setEditField('domicilio_municipio', v)}
          />
          <EditableTextField
            label="Estado"
            value={editValues.domicilio_estado}
            editing={editing}
            onChange={(v) => setEditField('domicilio_estado', v)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <EditableTextField
            label="Código Postal"
            value={editValues.domicilio_cp}
            editing={editing}
            onChange={(v) => setEditField('domicilio_cp', v)}
            placeholder="00000"
            monospace
            maxLength={5}
          />
        </div>
      </div>

      {/* Documentos legales — alta de empleados (Sprint 4 empresa-documentos-legales) */}
      <div className="space-y-4">
        <SectionTitle>Documentos legales — alta de empleados</SectionTitle>
        <DocumentosLegalesPanel empresaId={empresa.id} empresaSlug={empresa.slug} />

        {/* Editor manual legacy (jsonb) — fallback hasta que todas las empresas
            estén migradas al panel de arriba. Sprint 6 lo deprecará. */}
        {editing && (
          <details className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)]/10 p-3">
            <summary className="cursor-pointer text-xs text-[var(--text-muted)] select-none">
              Edición manual de jsonb (legacy — preferir panel de arriba)
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Este editor escribe directo a <code>core.empresas.escritura_constitutiva</code> y{' '}
                <code>escritura_poder</code>. Solo úsalo si no puedes subir el documento al módulo
                Documentos. Cuando asignes desde el panel de arriba, el caché se sincroniza
                automáticamente y estos campos quedan obsoletos.
              </p>
              <EscrituraCard
                title="Escritura constitutiva (legacy)"
                values={editValues.escritura_constitutiva}
                editing={editing}
                onChange={(field, v) => setEscrituraField('escritura_constitutiva', field, v)}
                original={empresa.escritura_constitutiva}
              />
              <EscrituraCard
                title="Poder del representante (legacy)"
                values={editValues.escritura_poder}
                editing={editing}
                onChange={(field, v) => setEscrituraField('escritura_poder', field, v)}
                original={empresa.escritura_poder}
              />
            </div>
          </details>
        )}
      </div>

      {/* Actividades económicas */}
      {actividades.length > 0 && (
        <div className="space-y-4">
          <SectionTitle>Actividades Económicas</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Actividad
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    %
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Fecha Inicio
                  </th>
                </tr>
              </thead>
              <tbody>
                {actividades.map((a, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text)]/60 tabular-nums">{a.orden}</td>
                    <td className="px-3 py-2 text-[var(--text)]">{a.actividad}</td>
                    <td className="px-3 py-2 text-right text-[var(--text)]/70 tabular-nums">
                      {a.porcentaje}
                    </td>
                    <td className="px-3 py-2 text-[var(--text)]/60 tabular-nums whitespace-nowrap">
                      {a.fecha_inicio}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Obligaciones fiscales */}
      {obligaciones.length > 0 && (
        <div className="space-y-4">
          <SectionTitle>Obligaciones Fiscales</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Descripción
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Vencimiento
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Fecha Inicio
                  </th>
                </tr>
              </thead>
              <tbody>
                {obligaciones.map((o, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text)]">{o.descripcion}</td>
                    <td className="px-3 py-2 text-[var(--text)]/70 text-xs">{o.vencimiento}</td>
                    <td className="px-3 py-2 text-[var(--text)]/60 tabular-nums whitespace-nowrap">
                      {o.fecha_inicio}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CSF actual */}
      <div className="space-y-4">
        <SectionTitle>Constancia de Situación Fiscal vigente</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <ReadOnlyField label="Fecha de Emisión" value={formatDate(empresa.csf_fecha_emision)} />
          {empresa.csf_url && (
            <div className="flex items-end pb-0.5">
              <button
                type="button"
                onClick={async () => {
                  const url = empresa.csf_url!;
                  if (url.startsWith('http')) {
                    window.open(url, '_blank');
                    return;
                  }
                  const bucket = url.split('/')[0];
                  const path = url.split('/').slice(1).join('/');
                  const isAdjuntosPath = !['branding', 'logos'].includes(bucket);
                  // Convención: paths nuevos viven en bucket `adjuntos` con
                  // subpath `empresas/{id}/csf-...pdf`. Paths legacy traen el
                  // bucket como primer segmento.
                  const targetBucket = isAdjuntosPath ? 'adjuntos' : bucket;
                  const targetPath = isAdjuntosPath ? url : path;
                  const { data, error } = await supabase.storage
                    .from(targetBucket)
                    .createSignedUrl(targetPath, 3600);
                  if (error || !data?.signedUrl) {
                    alert(`Error al generar enlace: ${error?.message ?? 'unknown'}`);
                    return;
                  }
                  window.open(data.signedUrl, '_blank');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--accent)] transition hover:bg-[var(--card)] cursor-pointer"
              >
                <FileText className="h-4 w-4" />
                Ver CSF
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Drawer: Actualizar CSF */}
      <DetailDrawer
        open={drawerOpen}
        onOpenChange={(v) => {
          if (!v) {
            // Reset completo al cerrar para que la próxima apertura siempre
            // arranque limpia en el estado A (drop). Si el usuario está a
            // medio aplicar (applyingDiff), no cerramos.
            if (applyingDiff) return;
            setDrawerOpen(false);
            resetDrawer();
          }
        }}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            Actualizar CSF — {empresa.nombre}
          </span>
        }
        description="Sube el PDF de la CSF más reciente. El sistema extrae los campos y te muestra qué cambia. Puedes aplicar todo, parcial, o solo archivar el PDF como histórico."
      >
        <DetailDrawerContent>
          <div className="space-y-4">
            {/* ── Estado A: drop PDF ──────────────────────────────────────────── */}
            {!csfFile && !csfProcessing && !csfExtraccion && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    void handleCsfFileChosen(f);
                  }}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full rounded-xl border-2 border-dashed px-6 py-12 text-center transition cursor-pointer ${
                    dragActive
                      ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-[var(--border)] bg-[var(--panel)]/30 hover:bg-[var(--panel)]/60'
                  }`}
                >
                  <Upload className="mx-auto h-10 w-10 text-[var(--text)]/40 pointer-events-none" />
                  <p className="mt-3 text-sm font-medium text-[var(--text)] pointer-events-none">
                    {dragActive ? 'Suelta el PDF aquí' : 'Arrastra el PDF o haz click para subirlo'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)] pointer-events-none">
                    Solo archivos .pdf, máximo 50 MB.
                  </p>
                </div>
                {csfError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    {csfError}
                  </div>
                )}
              </div>
            )}

            {/* ── Estado B: procesando ───────────────────────────────────────── */}
            {csfProcessing && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
                <p className="mt-4 text-sm font-medium text-[var(--text)]">
                  Procesando con Claude...
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Tarda 30-90 segundos. No cierres este drawer.
                </p>
              </div>
            )}

            {/* ── Estado C: diff ──────────────────────────────────────────────── */}
            {csfExtraccion && !csfProcessing && (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAcceptedFields(new Set(changes))}
                  >
                    Seleccionar todos los cambios
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAcceptedFields(new Set())}>
                    Limpiar selección
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resetDrawer}
                    className="ml-auto text-xs"
                  >
                    Cambiar PDF
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {acceptedFields.size} de {changes.length} cambios
                  </span>
                </div>

                {changes.length === 0 ? (
                  <div className="rounded-md border border-emerald-300/40 bg-emerald-50/40 p-4 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                    ✓ La CSF nueva no trae cambios respecto a los datos actuales. Si la aplicas (o
                    la cancelas), el PDF queda archivado igual como histórico.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {changes.map((k) => {
                      const checked = acceptedFields.has(k);
                      const { actual, nuevo } = getActualAndNew(k, empresa, csfExtraccion);
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
                                  {formatDiffValue(actual)}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                  Nuevo
                                </div>
                                <div className="rounded bg-emerald-100/50 px-2 py-1 text-xs font-mono whitespace-pre-wrap dark:bg-emerald-950/30">
                                  {formatDiffValue(nuevo)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setDrawerOpen(false)}
                    disabled={applyingDiff}
                  >
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
              </>
            )}
          </div>
        </DetailDrawerContent>
      </DetailDrawer>
    </div>
  );
}

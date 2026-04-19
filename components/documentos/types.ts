/* eslint-disable @typescript-eslint/no-explicit-any --
 * The `subtipo_meta` shape is intentionally loose (Record<string, any>) to
 * match the original pages. It crosses Supabase JSON boundaries and is
 * typed as `jsonb` on the DB side. Tightening requires a schema-wide
 * refactor and is out of scope for this consolidation PR.
 */

/**
 * Shared types for the DocumentosModule feature.
 */

export type Documento = {
  id: string;
  empresa_id: string;
  titulo: string;
  numero_documento: string | null;
  tipo: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  notaria: string | null;
  notario_proveedor_id: string | null;
  notas: string | null;
  archivo_url: string | null;
  subtipo_meta: Record<string, any> | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

export type Adjunto = {
  id: string;
  nombre: string;
  url: string;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  rol: string;
  created_at: string;
};

export type NotariaOption = { id: string; nombre: string; empresa_id: string };

export type DocForm = {
  titulo: string;
  numero_documento: string;
  tipo: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  notario_proveedor_id: string;
  notaria: string;
  notas: string;
  subtipo_meta: Record<string, any>;
};

export type AdjuntoRol = 'documento_principal' | 'imagen_referencia' | 'anexo';

export const TIPOS_DOCUMENTO = [
  { value: 'Escritura', label: 'Escritura', icon: '📜' },
  { value: 'Contrato', label: 'Contrato', icon: '📋' },
  { value: 'Seguro', label: 'Seguro', icon: '🛡️' },
  { value: 'Acta Constitutiva', label: 'Acta Constitutiva', icon: '🏛️' },
  { value: 'Poder', label: 'Poder', icon: '⚖️' },
  { value: 'Otro', label: 'Otro', icon: '📄' },
] as const;

export const META_LABELS: Record<string, string> = {
  numero_escritura: 'No. Escritura',
  fecha_escritura: 'Fecha Escritura',
  volumen: 'Volumen',
  parte_a: 'Parte A',
  parte_b: 'Parte B',
  vigencia_meses: 'Vigencia (meses)',
  monto: 'Monto',
  numero_poliza: 'No. Póliza',
  aseguradora: 'Aseguradora',
  cobertura: 'Cobertura',
  prima_anual: 'Prima Anual',
  numero_acta: 'No. Acta',
  fecha_acta: 'Fecha Acta',
  entidad: 'Entidad Constituida',
  objeto_social: 'Objeto Social',
  tipo_poder: 'Tipo de Poder',
  fecha_poder: 'Fecha del Poder',
  otorgante: 'Otorgante',
  apoderado: 'Apoderado',
};

/**
 * Pure helpers for the DocumentosModule feature — date parsing/formatting,
 * status badges, upload-threshold constants, and form<->record conversion.
 *
 * Formatters genéricos viven en `@/lib/format`. Este archivo re-exporta los
 * que se usaban localmente (deprecados) y mantiene los específicos del
 * dominio de documentos (parseLocalDate, getVencStatus, etc.).
 */

import * as tus from 'tus-js-client';
import type { SupabaseClient } from '@supabase/supabase-js';

import { formatBytes, formatCurrency, formatDate as formatDateFromLib } from '@/lib/format';
import type { DocForm, Documento } from './types';

/** @deprecated Use `formatDate` from `@/lib/format`. */
export const formatDate = formatDateFromLib;

/** @deprecated Use `formatBytes` from `@/lib/format`. */
export const fmtBytes = formatBytes;

/** @deprecated Use `formatSuperficie` from `@/lib/format`. */
export { formatSuperficie, formatPrecioM2 } from '@/lib/format';

/**
 * Currency formatter para Documentos: max 0 decimales (a diferencia del
 * default 2). Acepta moneda variable.
 *
 * @deprecated Use `formatCurrency(monto, { decimals: 0, currency: moneda })`
 * de `@/lib/format` directamente.
 */
export function formatMonto(monto: number | null, moneda: string | null = 'MXN') {
  if (monto == null) return '—';
  return formatCurrency(monto, { decimals: 0, currency: moneda || 'MXN' });
}

export function parseLocalDate(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getVencStatus(s: string | null): 'expired' | 'soon' | 'ok' | null {
  if (!s) return null;
  const d = parseLocalDate(s);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'expired';
  if (diff <= 60) return 'soon';
  return 'ok';
}

export function emptyForm(): DocForm {
  return {
    titulo: '',
    numero_documento: '',
    tipo: '',
    fecha_emision: '',
    fecha_vencimiento: '',
    notario_proveedor_id: '',
    notaria: '',
    descripcion: '',
    notas: '',
    subtipo_meta: {},
  };
}

export function docToForm(doc: Documento): DocForm {
  return {
    titulo: doc.titulo ?? '',
    numero_documento: doc.numero_documento ?? '',
    tipo: doc.tipo ?? '',
    fecha_emision: doc.fecha_emision ?? '',
    fecha_vencimiento: doc.fecha_vencimiento ?? '',
    notario_proveedor_id: doc.notario_proveedor_id ?? '',
    notaria: doc.notaria ?? '',
    descripcion: doc.descripcion ?? '',
    notas: doc.notas ?? '',
    subtipo_meta: doc.subtipo_meta ?? {},
  };
}

export function autoTituloEscritura(form: DocForm): string {
  const num = form.subtipo_meta.numero_escritura || form.numero_documento;
  const parts: string[] = ['Escritura'];
  if (num) parts.push(`No. ${num}`);
  if (form.notaria) parts.push(`— ${form.notaria}`);
  return parts.join(' ');
}

// ─── Upload helpers ──────────────────────────────────────────────────────────

export const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;
export const RESUMABLE_CHUNK = 5 * 1024 * 1024;

export function getResumableEndpoint() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL');
  const u = new URL(base);
  u.hostname = u.hostname.replace('.supabase.co', '.storage.supabase.co');
  u.pathname = '/storage/v1/upload/resumable';
  u.search = '';
  u.hash = '';
  return u.toString();
}

export async function uploadResumable(
  supabase: SupabaseClient,
  file: File,
  path: string,
  onProgress?: (pct: number) => void
) {
  const { data: sd } = await supabase.auth.getSession();
  const token = sd.session?.access_token;
  if (!token) throw new Error('Sin sesión activa.');
  const endpoint = getResumableEndpoint();
  await new Promise<void>((resolve, reject) => {
    const up = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      chunkSize: RESUMABLE_CHUNK,
      metadata: {
        bucketName: 'adjuntos',
        objectName: path,
        contentType: file.type || 'application/octet-stream',
      },
      onError: reject,
      onProgress: (uploaded, total) => {
        if (total) onProgress?.(Math.round((uploaded / total) * 100));
      },
      onSuccess: () => resolve(),
    });
    up.findPreviousUploads()
      .then((prev) => {
        if (prev.length > 0) up.resumeFromPreviousUpload(prev[0]);
        up.start();
      })
      .catch(reject);
  });
}

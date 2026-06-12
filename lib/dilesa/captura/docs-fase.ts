/**
 * Captura colaborativa de documentos de fase (iniciativa
 * `dilesa-ventas-captura-colaborativa`, Sprint 1).
 *
 * A diferencia de `marcarFase` (que sube los documentos hasta que el usuario
 * logra cerrar la fase), aquí cada documento persiste AL MOMENTO de subirse —
 * storage + `erp.adjuntos` con `uploaded_by` — para que varias personas
 * aporten al expediente en momentos distintos sin perder trabajo (flujo real
 * de Contabilidad en Fase 13: una persona sube la factura, otra el Aviso PLD,
 * y una tercera revisa y cierra).
 *
 * "Cambiar" NO borra: inserta una versión nueva y conserva la anterior
 * (audit trail). El vigente por rol es el adjunto más reciente.
 *
 * La lectura va por `GET /api/dilesa/ventas/[ventaId]/docs` porque
 * `core.usuarios` es RLS self-only: el "subido por" de terceros solo se
 * resuelve server-side con el admin client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export type DocFase = {
  id: string;
  rol: string;
  nombre: string;
  /** Object path dentro del bucket `adjuntos` (ver `getAdjuntoProxyUrl`). */
  url: string;
  tipoMime: string | null;
  tamanoBytes: number | null;
  subidoPor: string | null;
  /** Nombre completo (o email) del que subió; resuelto server-side. */
  subidoPorNombre: string | null;
  /** ISO timestamp (UTC) de `erp.adjuntos.created_at`. */
  subidoAt: string;
};

export type DocRolEstado = { vigente: DocFase; versiones: number };

/** Mapa rol → vigente + número de versiones. Roles sin documento no aparecen. */
export type DocsPorRol = Record<string, DocRolEstado | undefined>;

/**
 * Agrupa los adjuntos por rol: vigente = el de `subidoAt` más reciente,
 * `versiones` = cuántos archivos se han subido para ese rol.
 * Función pura — la usa el cliente sobre la respuesta del GET.
 */
export function resolverVigentes(docs: DocFase[]): DocsPorRol {
  const porRol: Record<string, DocRolEstado> = {};
  for (const doc of docs) {
    const actual = porRol[doc.rol];
    if (!actual) {
      porRol[doc.rol] = { vigente: doc, versiones: 1 };
      continue;
    }
    actual.versiones += 1;
    if (doc.subidoAt > actual.vigente.subidoAt) actual.vigente = doc;
  }
  return porRol;
}

/** Roles requeridos que aún no tienen documento vigente en el expediente. */
export function faltantesParaCerrar(vigentes: DocsPorRol, requeridos: string[]): string[] {
  return requeridos.filter((rol) => !vigentes[rol]);
}

export type SubirDocFaseInput = {
  ventaId: string;
  /** Rol del adjunto (ej. 'factura', 'nota_credito', 'aviso_pld'). */
  rol: string;
  archivo: File;
  /** Usuario autenticado — queda como `uploaded_by` (autor real del documento). */
  userId: string | null;
};

export type SubirDocFaseResult = { ok: true } | { ok: false; error: string };

/**
 * Sube UN documento de fase y lo persiste de inmediato:
 * storage (`adjuntos`) + fila en `erp.adjuntos` con `uploaded_by`.
 * Corre client-side (mismo patrón probado de `marcarFase` / recibos de caja).
 */
export async function subirDocFase(
  sb: SupabaseClient,
  input: SubirDocFaseInput
): Promise<SubirDocFaseResult> {
  const { ventaId, rol, archivo, userId } = input;

  const path = buildAdjuntoPath({
    empresa: 'dilesa',
    entidad: 'ventas',
    entidadId: ventaId,
    filename: archivo.name,
  });
  const { error: upErr } = await sb.storage.from('adjuntos').upload(path, archivo, {
    contentType: archivo.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) {
    return { ok: false, error: `No se pudo subir "${archivo.name}": ${upErr.message}` };
  }

  const { error: insErr } = await sb
    .schema('erp')
    .from('adjuntos')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      entidad_tipo: 'venta',
      entidad_id: ventaId,
      rol,
      nombre: archivo.name,
      url: path,
      tipo_mime: archivo.type || null,
      tamano_bytes: archivo.size,
      uploaded_by: userId,
    });
  if (insErr) {
    return { ok: false, error: `El archivo subió pero no se registró: ${insErr.message}` };
  }
  return { ok: true };
}

/**
 * Trae los documentos de la venta para los roles dados, con `subidoPorNombre`
 * resuelto (vía la API — admin client server-side).
 */
export async function fetchDocsFase(
  ventaId: string,
  roles: string[]
): Promise<{ ok: true; docs: DocsPorRol } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `/api/dilesa/ventas/${ventaId}/docs?roles=${encodeURIComponent(roles.join(','))}`
    );
    const json = (await res.json()) as { ok: boolean; docs?: DocFase[]; error?: string };
    if (!res.ok || !json.ok || !json.docs) {
      return { ok: false, error: json.error ?? 'No se pudieron cargar los documentos.' };
    }
    return { ok: true, docs: resolverVigentes(json.docs) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Error de red.' };
  }
}

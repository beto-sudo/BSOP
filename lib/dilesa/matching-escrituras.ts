/**
 * Matching asistido de escrituras del archivo legal (erp.documentos) a
 * predios del portafolio (iniciativa `dilesa-portafolio-predios` · S8).
 *
 * Dos pasos:
 *   1. Heurística determinista: `activos.numero_escritura` ==
 *      `documentos.numero_documento` (normalizados) → confianza alta.
 *   2. IA (`lib/ai`, uso `dilesa-matching-escrituras`): cruza el TEXTO de
 *      las escrituras (título + descripción + meta notarial) contra el
 *      catálogo compacto de predios (nombre/zona/clave/superficie) y
 *      propone ligas con confianza y razón.
 *
 * SIEMPRE son PROPUESTAS: el operador confirma cada liga una por una en el
 * dialog (usa la action `ligarDocumentoActivo` existente). Nada se liga
 * automáticamente.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runGenerateObject } from '@/lib/ai';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export type SugerenciaEscritura = {
  documentoId: string;
  documentoTitulo: string;
  numeroDocumento: string | null;
  fechaEmision: string | null;
  activoId: string;
  activoNombre: string;
  confianza: 'alta' | 'media' | 'baja';
  razon: string;
};

const MatchSchema = z.object({
  matches: z.array(
    z.object({
      documento_id: z.string(),
      activo_id: z.string(),
      confianza: z.enum(['alta', 'media', 'baja']),
      razon: z.string(),
    })
  ),
});

type DocRow = {
  id: string;
  titulo: string | null;
  numero_documento: string | null;
  fecha_emision: string | null;
  descripcion: string | null;
  subtipo_meta: Record<string, unknown> | null;
};

type ActivoRow = {
  id: string;
  nombre: string;
  tipo: string;
  zona: string | null;
  municipio: string | null;
  clave_catastral: string | null;
  numero_escritura: string | null;
  area_m2: number | null;
};

function normNum(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/\D+/g, '').replace(/^0+/, '');
  return digits || null;
}

/**
 * Calcula las sugerencias. `sb` = client con la sesión del usuario (RLS).
 * `conIA=false` limita al paso heurístico (para tests o cuando no hay
 * ANTHROPIC_API_KEY).
 */
export async function sugerirLigadoEscrituras(
  sb: SupabaseClient,
  opts: { conIA?: boolean } = {}
): Promise<{ sugerencias: SugerenciaEscritura[]; sinMatch: number } | { error: string }> {
  // Escrituras del archivo legal aún NO ligadas a ningún activo.
  const { data: docs, error: dErr } = await sb
    .schema('erp')
    .from('documentos')
    .select('id, titulo, numero_documento, fecha_emision, descripcion, subtipo_meta')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .ilike('tipo', '%escritura%')
    .is('deleted_at', null);
  if (dErr) return { error: dErr.message };

  const { data: ligas, error: lErr } = await sb
    .schema('dilesa')
    .from('activo_documentos')
    .select('documento_id')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .is('deleted_at', null);
  if (lErr) return { error: lErr.message };
  const yaLigados = new Set((ligas ?? []).map((l) => l.documento_id as string));
  const pendientes = ((docs ?? []) as DocRow[]).filter((d) => !yaLigados.has(d.id));
  if (pendientes.length === 0) return { sugerencias: [], sinMatch: 0 };

  const { data: activos, error: aErr } = await sb
    .schema('dilesa')
    .from('activos')
    .select('id, nombre, tipo, zona, municipio, clave_catastral, numero_escritura, area_m2')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .is('deleted_at', null)
    .neq('estado', 'descartado');
  if (aErr) return { error: aErr.message };
  const catalogo = (activos ?? []) as ActivoRow[];

  const porId = new Map(catalogo.map((a) => [a.id, a] as const));
  const sugerencias: SugerenciaEscritura[] = [];
  const matcheados = new Set<string>();

  // Paso 1 — heurística: número de escritura del activo == número del documento.
  const porNumero = new Map<string, ActivoRow[]>();
  for (const a of catalogo) {
    const n = normNum(a.numero_escritura);
    if (!n) continue;
    porNumero.set(n, [...(porNumero.get(n) ?? []), a]);
  }
  for (const d of pendientes) {
    const n = normNum(d.numero_documento);
    const candidatos = n ? (porNumero.get(n) ?? []) : [];
    if (candidatos.length === 1) {
      sugerencias.push({
        documentoId: d.id,
        documentoTitulo: d.titulo ?? d.numero_documento ?? d.id,
        numeroDocumento: d.numero_documento,
        fechaEmision: d.fecha_emision,
        activoId: candidatos[0].id,
        activoNombre: candidatos[0].nombre,
        confianza: 'alta',
        razon: `El predio tiene registrado el número de escritura ${d.numero_documento}.`,
      });
      matcheados.add(d.id);
    }
  }

  // Paso 2 — IA sobre el texto de las escrituras restantes.
  const restantes = pendientes.filter((d) => !matcheados.has(d.id));
  if (opts.conIA !== false && restantes.length > 0 && process.env.ANTHROPIC_API_KEY) {
    const docsTxt = restantes
      .map((d) => {
        const meta = d.subtipo_meta ? JSON.stringify(d.subtipo_meta) : '';
        return `- id=${d.id} | número=${d.numero_documento ?? '?'} | fecha=${d.fecha_emision ?? '?'} | título=${d.titulo ?? ''} | descripción=${(d.descripcion ?? '').slice(0, 400)} | meta=${meta.slice(0, 200)}`;
      })
      .join('\n');
    const activosTxt = catalogo
      .map(
        (a) =>
          `- id=${a.id} | ${a.nombre} | tipo=${a.tipo} | zona=${a.zona ?? '?'} | municipio=${a.municipio ?? '?'} | clave_catastral=${a.clave_catastral ?? '?'} | superficie_m2=${a.area_m2 ?? '?'}`
      )
      .join('\n');

    try {
      const out = await runGenerateObject({
        usoId: 'dilesa-matching-escrituras',
        schema: MatchSchema,
        maxRetries: 2,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `Eres el archivista legal de una desarrolladora inmobiliaria en Coahuila, México. ` +
                  `Te doy (A) escrituras públicas de compra de inmuebles sin ligar y (B) el catálogo de predios de la empresa.\n` +
                  `Propón qué escritura ampara qué predio usando las pistas del texto: número de parcela ` +
                  `(ej. "parcela 116" ↔ clave 47-116-1 del Ejido Villa de Fuente), nombre de rancho o fraccionamiento, ` +
                  `superficie (ojo: "190-36-83 hectáreas" = 1,903,683 m²; tolera ±5%), ubicación y claves catastrales.\n` +
                  `REGLAS: solo propone pares con evidencia concreta en el texto (la razón debe citarla); un documento puede no tener match ` +
                  `(omítelo); una escritura puede amparar varios predios (varios pares con el mismo documento_id); ` +
                  `usa confianza alta solo con 2+ pistas coincidentes, media con 1 fuerte, baja si es indicio.\n\n` +
                  `(A) ESCRITURAS SIN LIGAR:\n${docsTxt}\n\n(B) PREDIOS:\n${activosTxt}`,
              },
            ],
          },
        ],
      });
      for (const m of out.matches) {
        const doc = restantes.find((d) => d.id === m.documento_id);
        const act = porId.get(m.activo_id);
        if (!doc || !act) continue; // el modelo alucinó un id — se descarta
        sugerencias.push({
          documentoId: doc.id,
          documentoTitulo: doc.titulo ?? doc.numero_documento ?? doc.id,
          numeroDocumento: doc.numero_documento,
          fechaEmision: doc.fecha_emision,
          activoId: act.id,
          activoNombre: act.nombre,
          confianza: m.confianza,
          razon: m.razon,
        });
        matcheados.add(doc.id);
      }
    } catch (e) {
      // La IA es best-effort: sin ella igual se devuelven las heurísticas.
      console.warn('[matching-escrituras] IA falló:', (e as Error).message);
    }
  }

  return { sugerencias, sinMatch: pendientes.length - matcheados.size };
}

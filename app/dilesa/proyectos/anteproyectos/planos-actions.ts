'use server';

/**
 * Server actions del Sprint 4D — versiones del plano del anteproyecto.
 *
 * Las acciones manejan SOLO los metadatos (rows de
 * `dilesa.proyecto_planos`). El archivo físico se sube vía
 * `<FileAttachments>` que escribe a `erp.adjuntos` con
 * `entidad_tipo='proyecto_plano'` y `entidad_id=<plano.id>` — patrón
 * canónico ADR-022.
 *
 * Flujo de creación de versión:
 *   1) `crearPlanoVersion(proyectoId, descripcion)` → INSERT row,
 *      retorna `planoId`. Esto incrementa version.
 *   2) Cliente usa `<FileAttachments entidad="proyecto_planos"
 *      entidadId={planoId}>` para subir el archivo.
 *   3) Opcional: `marcarPlanoVigente(planoId)` para hacerlo el
 *      vigente del proyecto.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

type SimpleResult = { ok: true } | { ok: false; error: string };
type IdResult = { ok: true; id: string; version: number } | { ok: false; error: string };

async function makeServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // no-op
        },
      },
    }
  );
}

function revalidateAnteproyectosPaths() {
  revalidatePath('/dilesa/proyectos/anteproyectos');
  revalidatePath('/dilesa/proyectos');
}

/**
 * Crea una nueva versión del plano. Calcula el siguiente número de
 * versión leyendo el MAX actual (la constraint `UNIQUE
 * (proyecto_id, version)` protege contra duplicados si dos clientes
 * intentan crear la misma versión simultáneamente — el segundo
 * recibe error y debe reintentar).
 *
 * NO marca vigente. El cliente decide cuándo hacerlo (típicamente
 * después de subir el archivo).
 */
export async function crearPlanoVersion(
  proyectoId: string,
  descripcion: string | null
): Promise<IdResult> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };

  const supabase = await makeServerClient();

  // Necesitamos el empresa_id del proyecto + el max(version) actual.
  const { data: proyecto, error: pErr } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .select('id, empresa_id')
    .eq('id', proyectoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!proyecto) return { ok: false, error: 'Proyecto no encontrado' };

  const { data: maxRow, error: mErr } = await supabase
    .schema('dilesa')
    .from('proyecto_planos')
    .select('version')
    .eq('proyecto_id', proyectoId)
    .is('deleted_at', null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mErr) return { ok: false, error: mErr.message };
  const nextVersion = (maxRow?.version ?? 0) + 1;

  // user para subido_por.
  const { data: userRes } = await supabase.auth.getUser();
  const email = userRes?.user?.email?.toLowerCase() ?? null;
  let subidoPor: string | null = null;
  if (email) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: u } = await (supabase.schema('core') as any)
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    subidoPor = u?.id ?? null;
  }

  const trimmed = (descripcion ?? '').trim();
  const { data: ins, error: iErr } = await supabase
    .schema('dilesa')
    .from('proyecto_planos')
    .insert({
      empresa_id: proyecto.empresa_id,
      proyecto_id: proyectoId,
      version: nextVersion,
      descripcion: trimmed.length > 0 ? trimmed.slice(0, 500) : null,
      vigente: false,
      subido_por: subidoPor,
    })
    .select('id, version')
    .single();
  if (iErr) {
    return { ok: false, error: iErr.message };
  }

  revalidateAnteproyectosPaths();
  return { ok: true, id: ins.id as string, version: ins.version as number };
}

/**
 * Marca una versión como vigente del proyecto. La RPC
 * `fn_marcar_plano_vigente` apaga la vieja + enciende la nueva
 * atómicamente para no chocar con el unique parcial.
 */
export async function marcarPlanoVigente(planoId: string): Promise<SimpleResult> {
  if (!planoId) return { ok: false, error: 'planoId requerido' };
  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .rpc('fn_marcar_plano_vigente', { p_plano_id: planoId });
  if (error) return { ok: false, error: error.message };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Editar la descripción de una versión. Acepta null para limpiar.
 */
export async function actualizarPlanoDescripcion(
  planoId: string,
  descripcion: string | null
): Promise<SimpleResult> {
  if (!planoId) return { ok: false, error: 'planoId requerido' };
  const trimmed = (descripcion ?? '').trim();
  const next = trimmed.length > 0 ? trimmed.slice(0, 500) : null;
  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyecto_planos')
    .update({ descripcion: next, updated_at: new Date().toISOString() })
    .eq('id', planoId);
  if (error) return { ok: false, error: error.message };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Soft-delete de una versión. RLS de DELETE limita a admin
 * globalmente, pero soft-delete (UPDATE deleted_at) sigue la policy
 * de UPDATE que permite a la empresa. Esto es intencional — el
 * dueño del proyecto puede archivar sus iteraciones; solo admin
 * puede borrar permanentemente.
 *
 * Si la versión soft-deleted era la vigente, se queda sin vigente
 * hasta que el usuario marque otra. UI debe advertir.
 *
 * NO limpia adjuntos vinculados — quedan disponibles para audit. Si
 * en el futuro queremos cleanup, vive en un job batch separado.
 */
export async function eliminarPlanoVersion(planoId: string): Promise<SimpleResult> {
  if (!planoId) return { ok: false, error: 'planoId requerido' };
  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyecto_planos')
    .update({
      deleted_at: new Date().toISOString(),
      vigente: false, // si era vigente, sacarlo del flag para liberar el unique
      updated_at: new Date().toISOString(),
    })
    .eq('id', planoId);
  if (error) return { ok: false, error: error.message };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// Sprint 4E — aplicar análisis AI al análisis financiero del proyecto
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Toma el `ai_analisis` del plano y pre-llena los campos del análisis
 * financiero del proyecto (área total, vendible, verdes, vialidades,
 * lotes, lote promedio). NO machaca valores ya capturados — solo
 * llena los que están en NULL.
 *
 * Si `overwrite=true`, sí pisa los existentes (admin opcionalmente).
 *
 * El AI puede equivocarse. Después de aplicar, el usuario revisa en
 * el componente del análisis financiero y edita lo que necesite.
 */
export async function aplicarAiAlAnalisisFinanciero(
  planoId: string,
  options: { overwrite?: boolean } = {}
): Promise<{ ok: true; aplicados: string[] } | { ok: false; error: string }> {
  if (!planoId) return { ok: false, error: 'planoId requerido' };
  const supabase = await makeServerClient();

  // Cargar análisis del plano + proyecto_id.
  const { data: plano, error: pErr } = await supabase
    .schema('dilesa')
    .from('proyecto_planos')
    .select('id, proyecto_id, ai_analisis')
    .eq('id', planoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!plano) return { ok: false, error: 'Plano no encontrado' };
  if (!plano.ai_analisis) {
    return { ok: false, error: 'Esta versión no tiene análisis AI todavía' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ai = plano.ai_analisis as any;

  // Mapeo AI → columnas del proyecto.
  const candidatos: Array<{ col: string; value: number | null }> = [
    { col: 'area_m2', value: ai.area_total_m2 ?? null },
    { col: 'area_vendible_m2', value: ai.area_vendible_m2 ?? null },
    { col: 'areas_verdes_m2', value: ai.areas_verdes_m2 ?? null },
    { col: 'area_vialidades_m2', value: ai.area_vialidades_m2 ?? null },
    { col: 'lotes_proyectados', value: ai.lotes_proyectados ?? null },
    { col: 'tamano_lote_promedio', value: ai.tamano_lote_promedio_m2 ?? null },
  ];

  // Cargar el proyecto para no machacar valores existentes (unless overwrite).
  const { data: proy, error: pyErr } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .select(
      'area_m2, area_vendible_m2, areas_verdes_m2, area_vialidades_m2, lotes_proyectados, tamano_lote_promedio'
    )
    .eq('id', plano.proyecto_id)
    .maybeSingle();
  if (pyErr) return { ok: false, error: pyErr.message };
  if (!proy) return { ok: false, error: 'Proyecto no encontrado' };

  const patch: Record<string, number> = {};
  const aplicados: string[] = [];
  for (const c of candidatos) {
    if (c.value == null) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (proy as any)[c.col] as number | null;
    if (options.overwrite || current == null) {
      patch[c.col] = c.value;
      aplicados.push(c.col);
    }
  }

  if (aplicados.length === 0) {
    return {
      ok: true,
      aplicados: [],
    };
  }

  const { error: upErr } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .update(patch)
    .eq('id', plano.proyecto_id);
  if (upErr) return { ok: false, error: upErr.message };

  revalidateAnteproyectosPaths();
  return { ok: true, aplicados };
}

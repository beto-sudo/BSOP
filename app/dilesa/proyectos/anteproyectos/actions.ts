'use server';

/**
 * Server actions de Anteproyectos DILESA.
 *
 * Iniciativa `dilesa-proyectos-anteproyectos` Sprint 3.
 *
 * `populatePlantilla(proyectoId, fechaArranqueIso)` — instancia las
 * tareas del catálogo canónico (`dilesa.plantilla_proyecto_tareas`)
 * filtradas por `aplicacion` según el tipo del proyecto, calcula
 * fechas objetivo en cascada con calendario hábil MX, y crea las
 * dependencias entre las instancias.
 *
 * Idempotente: si el proyecto ya tiene tareas con `plantilla_tarea_id`
 * set, la acción falla con error claro (el operador debe limpiar
 * primero o usar tareas ad-hoc).
 *
 * RLS protege la escritura: el usuario debe tener acceso a la empresa
 * del proyecto.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  calcularFechasObjetivo,
  filtrarPlantillaPorTipoProyecto,
  type PlantillaTareaInput,
} from '@/lib/dilesa/instanciar-plantilla';

type Result = { ok: true; tareasCreadas: number } | { ok: false; error: string };

export async function populatePlantilla(
  proyectoId: string,
  fechaArranqueIso: string
): Promise<Result> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaArranqueIso)) {
    return { ok: false, error: 'fechaArranque debe ser YYYY-MM-DD' };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
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

  // 1) Leer proyecto (obtiene tipo + empresa_id; RLS valida acceso).
  const { data: proyecto, error: errProyecto } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .select('id, tipo, empresa_id')
    .eq('id', proyectoId)
    .is('deleted_at', null)
    .single();
  if (errProyecto || !proyecto) {
    return { ok: false, error: errProyecto?.message ?? 'Proyecto no encontrado' };
  }

  // 2) Verificar que NO ya tenga tareas con plantilla_tarea_id (idempotencia).
  const { count, error: errCount } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .select('id', { count: 'exact', head: true })
    .eq('proyecto_id', proyectoId)
    .not('plantilla_tarea_id', 'is', null)
    .is('deleted_at', null);
  if (errCount) return { ok: false, error: errCount.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `El proyecto ya tiene ${count} tareas vinculadas a la plantilla. Elimínalas primero si quieres re-poblarlo.`,
    };
  }

  // 3) Leer catálogo completo + filtrar por tipo del proyecto.
  const { data: catalogo, error: errCatalogo } = await supabase
    .schema('dilesa')
    .from('plantilla_proyecto_tareas')
    .select(
      'id, nombre, descripcion, aplicacion, tipo, subtipo, duracion_dias_habiles, orden_default, entidad_responsable, obligatoriedad, se_entrega_a, requiere_archivo, formato_archivo'
    )
    .is('deleted_at', null)
    .eq('activa', true)
    .order('orden_default');
  if (errCatalogo || !catalogo) {
    return { ok: false, error: errCatalogo?.message ?? 'No se pudo cargar el catálogo' };
  }

  const aplicables = filtrarPlantillaPorTipoProyecto(catalogo, proyecto.tipo);
  if (aplicables.length === 0) {
    return { ok: false, error: 'No hay tareas en la plantilla para este tipo de proyecto' };
  }
  const aplicablesIds = new Set(aplicables.map((p) => p.id));

  // 4) Leer dependencias del catálogo filtradas a las aplicables.
  const { data: depsCatalogo, error: errDeps } = await supabase
    .schema('dilesa')
    .from('plantilla_proyecto_tareas_dependencias')
    .select('plantilla_tarea_id, depende_de_plantilla_tarea_id');
  if (errDeps || !depsCatalogo) {
    return { ok: false, error: errDeps?.message ?? 'No se pudieron cargar dependencias' };
  }
  const depsFiltradas = depsCatalogo.filter(
    (d) =>
      aplicablesIds.has(d.plantilla_tarea_id) && aplicablesIds.has(d.depende_de_plantilla_tarea_id)
  );

  // 5) Calcular fechas objetivo en cascada.
  const tareasGrafo: PlantillaTareaInput[] = aplicables.map((cat) => ({
    id: cat.id,
    duracion_dias_habiles: cat.duracion_dias_habiles,
    depende_de: depsFiltradas
      .filter((d) => d.plantilla_tarea_id === cat.id)
      .map((d) => d.depende_de_plantilla_tarea_id),
  }));

  let fechas;
  try {
    fechas = calcularFechasObjetivo(tareasGrafo, fechaArranqueIso);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Error calculando fechas objetivo',
    };
  }

  // 6) INSERT en proyecto_tareas — bulk.
  const inserts = aplicables.map((cat) => {
    const f = fechas.get(cat.id)!;
    return {
      empresa_id: proyecto.empresa_id,
      proyecto_id: proyectoId,
      plantilla_tarea_id: cat.id,
      titulo: cat.nombre,
      descripcion: cat.descripcion,
      estado: 'pendiente',
      prioridad:
        cat.obligatoriedad === 'obligatoria'
          ? 'alta'
          : cat.obligatoriedad === 'opcional'
            ? 'baja'
            : 'media',
      orden: cat.orden_default,
      tipo_snapshot: cat.tipo,
      subtipo_snapshot: cat.subtipo,
      entidad_responsable_snapshot: cat.entidad_responsable,
      aplicacion_snapshot: cat.aplicacion,
      obligatoriedad_snapshot: cat.obligatoriedad,
      se_entrega_a_snapshot: cat.se_entrega_a,
      requiere_archivo_snapshot: cat.requiere_archivo,
      formato_archivo_snapshot: cat.formato_archivo,
      duracion_dias_habiles_snapshot: cat.duracion_dias_habiles,
      fecha_objetivo_inicio: f.fecha_objetivo_inicio,
      fecha_objetivo_fin: f.fecha_objetivo_fin,
    };
  });

  const { data: insertados, error: errInsert } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .insert(inserts)
    .select('id, plantilla_tarea_id');
  if (errInsert || !insertados) {
    return { ok: false, error: errInsert?.message ?? 'No se pudieron insertar las tareas' };
  }

  // 7) INSERT dependencias entre instancias.
  const catToInstancia = new Map<string, string>();
  for (const row of insertados) {
    if (row.plantilla_tarea_id) catToInstancia.set(row.plantilla_tarea_id, row.id);
  }
  const depsInsert = depsFiltradas
    .map((d) => ({
      tarea_id: catToInstancia.get(d.plantilla_tarea_id)!,
      depende_de_tarea_id: catToInstancia.get(d.depende_de_plantilla_tarea_id)!,
    }))
    .filter((d) => d.tarea_id && d.depende_de_tarea_id);

  if (depsInsert.length > 0) {
    const { error: errDepsInsert } = await supabase
      .schema('dilesa')
      .from('proyecto_tareas_dependencias')
      .insert(depsInsert);
    if (errDepsInsert) {
      return { ok: false, error: errDepsInsert.message };
    }
  }

  revalidatePath('/dilesa/proyectos/anteproyectos');
  return { ok: true, tareasCreadas: insertados.length };
}

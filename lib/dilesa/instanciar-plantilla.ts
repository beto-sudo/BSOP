/**
 * Lógica pura para instanciar tareas desde la plantilla canónica
 * `dilesa.plantilla_proyecto_tareas` hacia las instancias en
 * `dilesa.proyecto_tareas`.
 *
 * Iniciativa `dilesa-proyectos-anteproyectos` Sprint 3.
 *
 * Separado de la server action para que sea testeable sin DB:
 * - `calcularFechasObjetivo` recibe el grafo + duraciones y devuelve
 *   las fechas objetivo en cascada respetando dependencias y
 *   calendario hábil MX.
 *
 * El algoritmo es topological sort + relaxation:
 *   1. Detectar nodos sin dependencias entrantes (raíces).
 *   2. Para cada nodo, su fecha de arranque = max(fin_de_sus_deps) +
 *      siguiente día hábil. Si no tiene deps, arranca en `fechaArranque`.
 *   3. Su fecha de fin = sumarDiasHabiles(inicio, duracion).
 *   4. Procesar en orden topológico.
 *
 * Detecta ciclos: si tras procesar todo lo procesable quedan nodos
 * sin asignar, hay ciclo → lanza error.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  esDiaHabil,
  fromIsoDate,
  sumarDiasHabiles,
  siguienteDiaHabil,
  toIsoDate,
} from './calendario-habil';

export type PlantillaTareaInput = {
  /** ID de la tarea en el catálogo (o equivalente único en el grafo). */
  id: string;
  /** Días hábiles que dura ejecutar la tarea. */
  duracion_dias_habiles: number;
  /** IDs de tareas que deben terminar antes que ésta. */
  depende_de: readonly string[];
};

export type FechasCalculadas = {
  fecha_objetivo_inicio: string; // YYYY-MM-DD
  fecha_objetivo_fin: string; // YYYY-MM-DD
};

/**
 * Calcula las fechas objetivo en cascada. Recibe el grafo completo y
 * la fecha de arranque del proyecto. Devuelve un mapa
 * `id → {inicio, fin}` en formato ISO.
 *
 * Lanza error si:
 * - Algún `depende_de` apunta a un id no presente en el input.
 * - El grafo tiene un ciclo.
 */
export function calcularFechasObjetivo(
  tareas: readonly PlantillaTareaInput[],
  fechaArranqueIso: string
): Map<string, FechasCalculadas> {
  const byId = new Map<string, PlantillaTareaInput>();
  for (const t of tareas) byId.set(t.id, t);

  // Validar referencias
  for (const t of tareas) {
    for (const dep of t.depende_de) {
      if (!byId.has(dep)) {
        throw new Error(`Tarea ${t.id} depende de ${dep} pero ese id no existe en el grafo`);
      }
    }
  }

  const fechaArranque = fromIsoDate(fechaArranqueIso);
  const resultado = new Map<string, FechasCalculadas>();
  // Cola de procesables (los que tienen todas sus deps resueltas).
  // Procesamos iterativamente. Si en una iteración nada se procesa →
  // ciclo o referencia rota.
  let pendientes = tareas.slice();
  while (pendientes.length > 0) {
    const procesablesAhora = pendientes.filter((t) => t.depende_de.every((d) => resultado.has(d)));
    if (procesablesAhora.length === 0) {
      throw new Error(
        `Ciclo o dependencia irresoluble en el grafo de tareas. Pendientes: ${pendientes
          .map((t) => t.id)
          .join(', ')}`
      );
    }
    for (const t of procesablesAhora) {
      // Inicio: si tiene deps → max(fin) + siguiente hábil; sino → fechaArranque
      // ajustada al primer día hábil >= fechaArranque (si fechaArranque cae
      // en festivo o fin de semana).
      let inicio: Date;
      if (t.depende_de.length === 0) {
        inicio = new Date(fechaArranque.getTime());
        while (!esDiaHabil(inicio)) {
          inicio = siguienteDiaHabil(inicio);
        }
      } else {
        const finsDeps = t.depende_de.map((d) => fromIsoDate(resultado.get(d)!.fecha_objetivo_fin));
        const maxFin = finsDeps.reduce(
          (acc, d) => (d.getTime() > acc.getTime() ? d : acc),
          finsDeps[0]!
        );
        inicio = siguienteDiaHabil(maxFin);
      }
      const fin = sumarDiasHabiles(inicio, t.duracion_dias_habiles);
      resultado.set(t.id, {
        fecha_objetivo_inicio: toIsoDate(inicio),
        fecha_objetivo_fin: toIsoDate(fin),
      });
    }
    pendientes = pendientes.filter((t) => !resultado.has(t.id));
  }

  return resultado;
}

export type InstanciarResult = { ok: true; tareasCreadas: number } | { ok: false; error: string };

/**
 * Orquesta la instanciación end-to-end: lee el proyecto, lee el catálogo,
 * filtra por aplicacion, calcula fechas, hace INSERT bulk en
 * `dilesa.proyecto_tareas` y la cascada de dependencias.
 *
 * Reusable desde server action (con cookies-based client) y desde
 * scripts (con service-role client). El caller controla el cliente y
 * por ende la auth/RLS.
 *
 * Idempotente: si el proyecto ya tiene tareas con `plantilla_tarea_id`
 * set, retorna error claro.
 */
export async function instanciarPlantillaParaProyecto(
  supabase: SupabaseClient,
  proyectoId: string,
  fechaArranqueIso: string
): Promise<InstanciarResult> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaArranqueIso)) {
    return { ok: false, error: 'fechaArranque debe ser YYYY-MM-DD' };
  }

  const sb = supabase.schema('dilesa');

  // 1) Leer proyecto.
  const { data: proyecto, error: errProyecto } = await sb
    .from('proyectos')
    .select('id, tipo, empresa_id')
    .eq('id', proyectoId)
    .is('deleted_at', null)
    .single();
  if (errProyecto || !proyecto) {
    return { ok: false, error: errProyecto?.message ?? 'Proyecto no encontrado' };
  }

  // 2) Idempotencia: no re-poblar.
  const { count, error: errCount } = await sb
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

  // 3) Leer catálogo + filtrar.
  const { data: catalogo, error: errCatalogo } = await sb
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
  const aplicables = filtrarPlantillaPorTipoProyecto(
    catalogo as Array<{ aplicacion: string } & Record<string, unknown>>,
    proyecto.tipo as string
  );
  if (aplicables.length === 0) {
    return { ok: false, error: 'No hay tareas en la plantilla para este tipo de proyecto' };
  }
  const aplicablesIds = new Set(aplicables.map((p) => p.id as string));

  // 4) Leer dependencias del catálogo.
  const { data: depsCatalogo, error: errDeps } = await sb
    .from('plantilla_proyecto_tareas_dependencias')
    .select('plantilla_tarea_id, depende_de_plantilla_tarea_id');
  if (errDeps || !depsCatalogo) {
    return { ok: false, error: errDeps?.message ?? 'No se pudieron cargar dependencias' };
  }
  const depsFiltradas = (
    depsCatalogo as Array<{ plantilla_tarea_id: string; depende_de_plantilla_tarea_id: string }>
  ).filter(
    (d) =>
      aplicablesIds.has(d.plantilla_tarea_id) && aplicablesIds.has(d.depende_de_plantilla_tarea_id)
  );

  // 5) Calcular fechas objetivo en cascada.
  const tareasGrafo: PlantillaTareaInput[] = aplicables.map((cat) => ({
    id: cat.id as string,
    duracion_dias_habiles: cat.duracion_dias_habiles as number,
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

  // 6) INSERT bulk de las tareas.
  const inserts = aplicables.map((cat) => {
    const f = fechas.get(cat.id as string)!;
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

  const { data: insertados, error: errInsert } = await sb
    .from('proyecto_tareas')
    .insert(inserts)
    .select('id, plantilla_tarea_id');
  if (errInsert || !insertados) {
    return { ok: false, error: errInsert?.message ?? 'No se pudieron insertar las tareas' };
  }

  // 7) INSERT dependencias entre instancias.
  const catToInstancia = new Map<string, string>();
  for (const row of insertados as Array<{ id: string; plantilla_tarea_id: string | null }>) {
    if (row.plantilla_tarea_id) catToInstancia.set(row.plantilla_tarea_id, row.id);
  }
  const depsInsert = depsFiltradas
    .map((d) => ({
      tarea_id: catToInstancia.get(d.plantilla_tarea_id)!,
      depende_de_tarea_id: catToInstancia.get(d.depende_de_plantilla_tarea_id)!,
    }))
    .filter((d) => d.tarea_id && d.depende_de_tarea_id);

  if (depsInsert.length > 0) {
    const { error: errDepsInsert } = await sb
      .from('proyecto_tareas_dependencias')
      .insert(depsInsert);
    if (errDepsInsert) {
      return { ok: false, error: errDepsInsert.message };
    }
  }

  return { ok: true, tareasCreadas: insertados.length };
}

/**
 * Filtra las tareas del catálogo según el `tipo` del proyecto.
 *
 * - anteproyecto: aplicacion IN ('anteproyecto', 'ambas')
 * - desarrollo / remodelacion / etc: aplicacion IN ('desarrollo', 'ambas')
 *
 * Esto significa que un anteproyecto NO instancia tareas de
 * 'desarrollo' al inicio — esas se agregan al promover (Sprint 4).
 */
export function filtrarPlantillaPorTipoProyecto<T extends { aplicacion: string }>(
  plantillas: readonly T[],
  tipoProyecto: string
): readonly T[] {
  if (tipoProyecto === 'anteproyecto') {
    return plantillas.filter((p) => p.aplicacion === 'anteproyecto' || p.aplicacion === 'ambas');
  }
  // Cualquier otro tipo = desarrollo o equivalente
  return plantillas.filter((p) => p.aplicacion === 'desarrollo' || p.aplicacion === 'ambas');
}

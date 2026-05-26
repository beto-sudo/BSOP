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

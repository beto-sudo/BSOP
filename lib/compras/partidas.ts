/**
 * Indexación compartida de partidas de presupuesto para los módulos de Compras
 * (constructora-first, DILESA). Iniciativa `dilesa-compras` · Sprint 2.
 *
 * Centraliza (D4) la lógica que Órdenes, Recepciones y Requisiciones repetían:
 * de las filas de `erp.presupuesto_partidas` + el catálogo `erp.conceptos_compra`,
 * derivar de una sola pasada:
 *   - `partidaLabel`     id → concepto_texto (etiqueta de la línea)
 *   - `partidaProyecto`  id → proyecto_id   (la OC/requisición infiere su
 *                                            proyecto de la partida de su 1ª línea)
 *   - `gruposByProyecto` proyecto_id → optgroups «Etapa › Capítulo» (selector de
 *                                       alta), partidas sin clasificar al final
 *
 * Helper PURO (sin React ni Supabase) para test unitario. El catálogo es
 * opcional: sin él toda partida cae al grupo "Sin clasificar" (los módulos que
 * no dan de alta líneas —Recepciones— solo consumen `partidaLabel`/`Proyecto`).
 */

import {
  buildCatalogoConceptos,
  type ConceptoCompraRaw,
  type ConceptoResuelto,
} from '@/lib/dilesa/conceptos-catalogo';

/** Clave del grupo de partidas sin concepto clasificado (ordena al final). */
export const SIN_CLASIFICAR = '__sin__';

/** Partida elegible en el selector de líneas (un proyecto a la vez). */
export type PartidaOption = {
  id: string;
  proyectoId: string;
  label: string;
  capituloKey: string;
};

/** Optgroup de partidas por etapa › capítulo (para el `<optgroup>` del selector). */
export type PartidaGrupo = {
  key: string;
  label: string;
  partidas: PartidaOption[];
};

/** Fila cruda de `erp.presupuesto_partidas` (los campos que el índice usa). */
export type PartidaIndexRow = {
  id: string;
  proyecto_id: string | null;
  concepto_id?: string | null;
  concepto_texto: string | null;
};

export type PartidaIndex = {
  /** id de partida → etiqueta (concepto_texto). Todas las partidas, con o sin proyecto. */
  partidaLabel: Map<string, string>;
  /** id de partida → proyecto_id. Solo partidas con proyecto. */
  partidaProyecto: Map<string, string>;
  /** proyecto_id → optgroups ordenados (etapa›capítulo, "Sin clasificar" al final). */
  gruposByProyecto: Map<string, PartidaGrupo[]>;
};

/**
 * Construye el índice de partidas. `catalogoRows` resuelve la jerarquía
 * etapa›capítulo de cada partida clasificada; omitirlo deja todo "Sin clasificar".
 */
export function buildPartidaIndex(
  partidas: readonly PartidaIndexRow[],
  catalogoRows: readonly ConceptoCompraRaw[] = []
): PartidaIndex {
  const catalogo = buildCatalogoConceptos(catalogoRows);
  const partidaLabel = new Map<string, string>();
  const partidaProyecto = new Map<string, string>();
  const gruposByProyecto = new Map<string, Map<string, PartidaGrupo>>();

  for (const p of partidas) {
    const label = p.concepto_texto ?? '(sin concepto)';
    partidaLabel.set(p.id, label);
    if (!p.proyecto_id) continue;
    partidaProyecto.set(p.id, p.proyecto_id);

    const res: ConceptoResuelto | undefined = p.concepto_id
      ? catalogo.byConcepto.get(p.concepto_id)
      : undefined;
    const capKey = res ? res.capituloCodigo : SIN_CLASIFICAR;
    const grupoLabel = res ? `${res.etapaNombre} › ${res.capituloNombre}` : 'Sin clasificar';
    let grupos = gruposByProyecto.get(p.proyecto_id);
    if (!grupos) {
      grupos = new Map();
      gruposByProyecto.set(p.proyecto_id, grupos);
    }
    let g = grupos.get(capKey);
    if (!g) {
      g = { key: capKey, label: grupoLabel, partidas: [] };
      grupos.set(capKey, g);
    }
    g.partidas.push({ id: p.id, proyectoId: p.proyecto_id, label, capituloKey: capKey });
  }

  const out = new Map<string, PartidaGrupo[]>();
  for (const [pid, grupos] of gruposByProyecto) {
    // Por código de capítulo; "Sin clasificar" siempre al final (su clave lleva
    // '_', que localeCompare ordenaría primero — lo forzamos al fondo).
    const arr = [...grupos.values()].sort((a, b) => {
      if (a.key === SIN_CLASIFICAR) return 1;
      if (b.key === SIN_CLASIFICAR) return -1;
      return a.key.localeCompare(b.key);
    });
    for (const g of arr) g.partidas.sort((a, b) => a.label.localeCompare(b.label));
    out.set(pid, arr);
  }
  return { partidaLabel, partidaProyecto, gruposByProyecto: out };
}

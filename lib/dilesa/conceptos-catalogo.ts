/**
 * Catálogo jerárquico de conceptos de compra (`erp.conceptos_compra`, ADR-040).
 *
 * 3 niveles vía `padre_id` self-FK: etapa → capítulo → concepto. Helpers puros
 * (testeables) para:
 *   (a) resolver la jerarquía completa de un concepto hoja, y
 *   (b) armar los `<optgroup>` ordenados del selector de clasificación del form
 *       de Costeo (un grupo por capítulo, label "Etapa › Capítulo").
 *
 * El `codigo` lleva padding 2-díg ('2.03.01'), así que el orden lexicográfico
 * coincide con el orden natural del catálogo — ordenamos por `codigo`.
 *
 * Reusable más allá de Costeo (la iniciativa `dilesa-compras` consume el mismo
 * catálogo para clasificar líneas de compra).
 */

/** Fila cruda del catálogo (los 4 campos que necesita el árbol). */
export type ConceptoCompraRaw = {
  id: string;
  padre_id: string | null;
  nivel: string; // 'etapa' | 'capitulo' | 'concepto'
  codigo: string;
  nombre: string;
};

/** Jerarquía resuelta de un concepto hoja (nivel = 'concepto'). */
export type ConceptoResuelto = {
  id: string;
  codigo: string;
  nombre: string;
  capituloCodigo: string;
  capituloNombre: string;
  etapaCodigo: string;
  etapaNombre: string;
};

/** Un capítulo con sus conceptos hoja, para el `<optgroup>` del selector. */
export type CatalogoOptgroup = {
  etapaCodigo: string;
  etapaNombre: string;
  capituloCodigo: string;
  capituloNombre: string;
  /** Label compuesto del optgroup: "Urbanización › Agua potable". */
  label: string;
  conceptos: { id: string; codigo: string; nombre: string }[];
};

export type CatalogoConceptos = {
  /** conceptoId → jerarquía resuelta. Solo conceptos hoja resolubles. */
  byConcepto: Map<string, ConceptoResuelto>;
  /** Optgroups ordenados (etapa→capítulo) para el `<select>` del form. */
  optgroups: CatalogoOptgroup[];
};

/**
 * Construye el índice del catálogo a partir de las filas crudas.
 * Tolerante a datos parciales: un concepto cuyo capítulo o etapa no esté en el
 * set simplemente se omite del índice (queda como "sin clasificar" aguas abajo).
 */
export function buildCatalogoConceptos(rows: readonly ConceptoCompraRaw[]): CatalogoConceptos {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byConcepto = new Map<string, ConceptoResuelto>();

  for (const concepto of rows) {
    if (concepto.nivel !== 'concepto') continue;
    const capitulo = concepto.padre_id ? byId.get(concepto.padre_id) : undefined;
    const etapa = capitulo?.padre_id ? byId.get(capitulo.padre_id) : undefined;
    if (!capitulo || !etapa) continue;
    byConcepto.set(concepto.id, {
      id: concepto.id,
      codigo: concepto.codigo,
      nombre: concepto.nombre,
      capituloCodigo: capitulo.codigo,
      capituloNombre: capitulo.nombre,
      etapaCodigo: etapa.codigo,
      etapaNombre: etapa.nombre,
    });
  }

  // Agrupar conceptos por capítulo → optgroups ordenados por código.
  const grupos = new Map<string, CatalogoOptgroup>();
  for (const res of byConcepto.values()) {
    let g = grupos.get(res.capituloCodigo);
    if (!g) {
      g = {
        etapaCodigo: res.etapaCodigo,
        etapaNombre: res.etapaNombre,
        capituloCodigo: res.capituloCodigo,
        capituloNombre: res.capituloNombre,
        label: `${res.etapaNombre} › ${res.capituloNombre}`,
        conceptos: [],
      };
      grupos.set(res.capituloCodigo, g);
    }
    g.conceptos.push({ id: res.id, codigo: res.codigo, nombre: res.nombre });
  }

  const optgroups = [...grupos.values()].sort((a, b) =>
    a.capituloCodigo.localeCompare(b.capituloCodigo)
  );
  for (const g of optgroups) {
    g.conceptos.sort((a, b) => a.codigo.localeCompare(b.codigo));
  }

  return { byConcepto, optgroups };
}

/**
 * Avisos de compras para el correo diario — iniciativa `dilesa-compras-flujo`
 * Sprint 2 (D6). Helpers PUROS que arman las dos secciones del correo:
 *
 *  - "Compras por autorizar" (para Dirección): cotizaciones listas para
 *    adjudicar (≥1 proveedor respondió), con solicitante · concepto · monto ·
 *    partida · días desde la solicitud, ordenadas de más vieja a más nueva.
 *  - "Tus solicitudes" (para el solicitante): sus requisiciones y cotizaciones
 *    aún en curso, con estado y antigüedad.
 *
 * El fetch a DB y el render HTML viven fuera (el cron `daily-task-summary` y
 * `lib/task-summary-email.ts`). Aquí solo transformación pura → testeable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type CompraPorAutorizar = {
  cotizacionId: string;
  codigo: string;
  /** Descripción de la RFQ (o el folio si viene vacía). */
  concepto: string;
  /** Nombre de quien la creó (o "—"). */
  solicitante: string;
  /** Mejor total respondido; null si ningún proveedor puso monto. */
  monto: number | null;
  /** Etiqueta de partida: concepto, "N partidas" o "Sin partida". */
  partida: string;
  /** Nombre del proyecto (o "—"). */
  proyecto: string;
  /** Días transcurridos desde que se creó. */
  dias: number;
};

export type SolicitudPropia = {
  id: string;
  codigo: string;
  tipo: 'requisicion' | 'cotizacion';
  concepto: string;
  /** Etiqueta de estado: "Solicitada" | "En cotización". */
  estado: string;
  dias: number;
};

/** Días enteros (≥0) entre `iso` y `nowMs`. 0 si la fecha falta o es futura. */
export function diasTranscurridos(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

/** ¿Al menos un proveedor respondió (o fue elegido)? */
export function tieneRespuesta(proveedores: ReadonlyArray<{ estado: string | null }>): boolean {
  return proveedores.some((p) => p.estado === 'respondida' || p.estado === 'elegida');
}

/** Mejor (menor) total entre los proveedores que respondieron; null si ninguno. */
export function montoMejorRespondido(
  proveedores: ReadonlyArray<{ estado: string | null; monto_total: number | null }>
): number | null {
  const montos = proveedores
    .filter((p) => (p.estado === 'respondida' || p.estado === 'elegida') && p.monto_total != null)
    .map((p) => Number(p.monto_total));
  return montos.length ? Math.min(...montos) : null;
}

export type RawCotizacionAviso = {
  id: string;
  codigo: string;
  descripcion: string | null;
  creado_por: string | null;
  created_at: string | null;
  lineas: ReadonlyArray<{ partida_id: string | null }>;
  proveedores: ReadonlyArray<{ estado: string | null; monto_total: number | null }>;
};

export type AvisoLookups = {
  /** partida_id → { conceptoTexto, proyectoId } */
  partida: ReadonlyMap<string, { conceptoTexto: string | null; proyectoId: string | null }>;
  /** proyecto_id → nombre */
  proyecto: ReadonlyMap<string, string>;
  /** usuario_id → nombre para mostrar */
  usuario: ReadonlyMap<string, string>;
};

/**
 * Cotizaciones listas para adjudicar → filas de "Compras por autorizar",
 * ordenadas de más vieja a más nueva (la más rezagada arriba). Descarta las
 * que aún no tienen ninguna respuesta de proveedor.
 */
export function buildComprasPorAutorizar(
  cotizaciones: ReadonlyArray<RawCotizacionAviso>,
  lookups: AvisoLookups,
  nowMs: number
): CompraPorAutorizar[] {
  const out: CompraPorAutorizar[] = [];
  for (const c of cotizaciones) {
    if (!tieneRespuesta(c.proveedores)) continue;
    const partidaIds = c.lineas.map((l) => l.partida_id).filter((x): x is string => Boolean(x));
    const distintas = new Set(partidaIds);
    const primera = partidaIds.length ? lookups.partida.get(partidaIds[0]) : undefined;
    const proyectoId = primera?.proyectoId ?? null;
    const partida =
      distintas.size === 0
        ? 'Sin partida'
        : distintas.size === 1
          ? primera?.conceptoTexto?.trim() || '—'
          : `${distintas.size} partidas`;
    out.push({
      cotizacionId: c.id,
      codigo: c.codigo,
      concepto: (c.descripcion ?? '').trim() || c.codigo,
      solicitante: (c.creado_por && lookups.usuario.get(c.creado_por)) || '—',
      monto: montoMejorRespondido(c.proveedores),
      partida,
      proyecto: (proyectoId && lookups.proyecto.get(proyectoId)) || '—',
      dias: diasTranscurridos(c.created_at, nowMs),
    });
  }
  out.sort((a, b) => b.dias - a.dias || a.codigo.localeCompare(b.codigo));
  return out;
}

export type RawRequisicionAviso = {
  id: string;
  codigo: string;
  justificacion: string | null;
  solicitante_id: string | null;
  created_at: string | null;
  /** ¿Ya tiene una OC viva ligada? (si sí, ya no está "en su cancha"). */
  conOc: boolean;
};

export type RawCotizacionPropia = {
  id: string;
  codigo: string;
  descripcion: string | null;
  creado_por: string | null;
  created_at: string | null;
  estado: string | null;
};

/**
 * Agrupa por usuario las solicitudes aún en curso (su "pipeline"): requisiciones
 * sin OC y cotizaciones abiertas/comparadas. Devuelve `usuario_id → items`
 * ordenados de más viejo a más nuevo. Las canceladas se filtran antes (el caller
 * ya excluye `cancelada_at`/`deleted_at` en la query).
 */
export function buildSolicitudesPorUsuario(
  requisiciones: ReadonlyArray<RawRequisicionAviso>,
  cotizaciones: ReadonlyArray<RawCotizacionPropia>,
  nowMs: number
): Map<string, SolicitudPropia[]> {
  const map = new Map<string, SolicitudPropia[]>();
  const push = (uid: string | null, item: SolicitudPropia) => {
    if (!uid) return;
    const arr = map.get(uid);
    if (arr) arr.push(item);
    else map.set(uid, [item]);
  };
  for (const r of requisiciones) {
    if (r.conOc) continue;
    push(r.solicitante_id, {
      id: r.id,
      codigo: r.codigo,
      tipo: 'requisicion',
      concepto: (r.justificacion ?? '').trim() || r.codigo,
      estado: 'Solicitada',
      dias: diasTranscurridos(r.created_at, nowMs),
    });
  }
  for (const c of cotizaciones) {
    if (c.estado !== 'abierta' && c.estado !== 'comparada') continue;
    push(c.creado_por, {
      id: c.id,
      codigo: c.codigo,
      tipo: 'cotizacion',
      concepto: (c.descripcion ?? '').trim() || c.codigo,
      estado: 'En cotización',
      dias: diasTranscurridos(c.created_at, nowMs),
    });
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => b.dias - a.dias || a.codigo.localeCompare(b.codigo));
  }
  return map;
}

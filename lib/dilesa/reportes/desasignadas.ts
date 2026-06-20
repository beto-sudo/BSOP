/**
 * Motor del reporte «Ventas desasignadas» (DILESA · Ventas) — ADR-047.
 *
 * Lista las ventas desasignadas con su motivo, clasificadas en Reubicación
 * (el cliente se mueve a otra unidad — no es pérdida) vs Baja (cancelación,
 * desperfilado, sin capacidad, ilocalizable — pérdida real). El motivo es
 * texto libre; la clasificación es heurística por palabras clave. Pura y
 * testeable; la comparten la vista y el PDF.
 */
import type { DesasignadaRow } from './desasignadas-data';

export type CategoriaDesasignacion = 'reubicacion' | 'baja';

export type FiltrosDesasignadas = {
  desde: string;
  hasta: string;
  proyecto: string;
  categoria: '' | CategoriaDesasignacion;
};

export const FILTROS_DESASIGNADAS_VACIOS: FiltrosDesasignadas = {
  desde: '',
  hasta: '',
  proyecto: '',
  categoria: '',
};

/** Palabras que marcan que la unidad se liberó para mover al cliente a otra (no es baja). */
const REUBICACION_RE =
  /reasign|reubic|se cambi|se mover|se mueve|se mover[aá]|se le asign|nueva ubicaci[oó]n|otra ubicaci[oó]n|escrituraci[oó]n inmediata|se quedar[aá] con|cambiar[aá] (de )?ubicaci|se asignar[aá]/i;

/** Clasifica un motivo (texto libre) en reubicación vs baja. */
export function clasificarMotivo(motivo: string | null): CategoriaDesasignacion {
  if (motivo && REUBICACION_RE.test(motivo)) return 'reubicacion';
  return 'baja';
}

export type DesasignadaFila = DesasignadaRow & { categoria: CategoriaDesasignacion };

export type DesasignadasResult = {
  /** Filas con categoría, ordenadas por fecha descendente. */
  filas: DesasignadaFila[];
  /** Desglose por mes, ascendente. */
  porMes: Array<{ mes: string; total: number; reubicaciones: number; bajas: number }>;
  total: number;
  reubicaciones: number;
  bajas: number;
};

export function construirDesasignadas(
  rows: readonly DesasignadaRow[],
  filtros: FiltrosDesasignadas
): DesasignadasResult {
  const conCategoria = rows.map((r) => ({ ...r, categoria: clasificarMotivo(r.motivo) }));

  const filtradas = conCategoria.filter((r) => {
    if (filtros.desde && r.fecha < filtros.desde) return false;
    if (filtros.hasta && r.fecha > filtros.hasta) return false;
    if (filtros.proyecto && r.proyectoNombre !== filtros.proyecto) return false;
    if (filtros.categoria && r.categoria !== filtros.categoria) return false;
    return true;
  });

  const filas = [...filtradas].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const mesMap = new Map<string, { total: number; reubicaciones: number; bajas: number }>();
  for (const r of filas) {
    const cur = mesMap.get(r.mes) ?? { total: 0, reubicaciones: 0, bajas: 0 };
    cur.total += 1;
    if (r.categoria === 'reubicacion') cur.reubicaciones += 1;
    else cur.bajas += 1;
    mesMap.set(r.mes, cur);
  }
  const porMes = [...mesMap.entries()]
    .map(([mes, v]) => ({ mes, ...v }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return {
    filas,
    porMes,
    total: filas.length,
    reubicaciones: filas.filter((r) => r.categoria === 'reubicacion').length,
    bajas: filas.filter((r) => r.categoria === 'baja').length,
  };
}

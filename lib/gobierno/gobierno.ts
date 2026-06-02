/**
 * Tipos + helpers puros del tab "Gobierno corporativo".
 *
 * Iniciativa `gobierno-corporativo` · Sprint 2b. Cubre `core.gobierno_config`,
 * `core.gobierno_mayorias` y `core.gobierno_consejeros`. La lógica testeable
 * (formato de mandato, resumen del consejo) vive aquí; el panel la consume.
 */

export type Organo = 'asamblea' | 'consejo' | 'comite_directivo';

export const ORGANO_LABELS: Record<Organo, string> = {
  asamblea: 'Asamblea de Accionistas',
  consejo: 'Consejo de Administración',
  comite_directivo: 'Comité Directivo',
};

export const ORGANOS: readonly Organo[] = ['asamblea', 'consejo', 'comite_directivo'];

export type Cargo =
  | 'presidente'
  | 'secretario'
  | 'propietario'
  | 'suplente'
  | 'independiente'
  | 'miembro';

export const CARGO_LABELS: Record<Cargo, string> = {
  presidente: 'Presidente',
  secretario: 'Secretario',
  propietario: 'Propietario',
  suplente: 'Suplente / respaldo',
  independiente: 'Independiente',
  miembro: 'Miembro',
};

export const CARGOS: readonly Cargo[] = [
  'presidente',
  'secretario',
  'propietario',
  'suplente',
  'independiente',
  'miembro',
];

export type GobiernoConfig = {
  empresa_id: string;
  reglamento_documento_id: string | null;
  reglamento_fecha: string | null;
  mandato_meses_default: number | null;
  consejo_max_miembros: number | null;
  consejo_sesiones_por_anio: number | null;
  dividendo_anual_monto: number | null;
  dividendo_moneda: string;
  tanto_aplica: boolean;
  tanto_plazo_dias: number | null;
  tanto_orden_prelacion: string | null;
  notas: string | null;
};

export type Mayoria = {
  id: string;
  empresa_id: string;
  tipo_decision: string;
  organo: Organo;
  quorum_pct: number | null;
  umbral_pct: number;
  orden: number;
  notas: string | null;
};

export type Consejero = {
  id: string;
  empresa_id: string;
  organo: Organo;
  socio_id: string | null;
  persona_id: string | null;
  nombre: string;
  cargo: Cargo;
  ostenta_voto: boolean;
  vitalicio: boolean;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  activo: boolean;
  notas: string | null;
};

/** Formatea un periodo de mandato en meses a un texto legible ("3 años", "18 meses"). */
export function mandatoLabel(meses: number | null | undefined): string {
  if (meses == null || !Number.isFinite(meses) || meses <= 0) return '—';
  if (meses % 12 === 0) {
    const anios = meses / 12;
    return `${anios} ${anios === 1 ? 'año' : 'años'}`;
  }
  return `${meses} meses`;
}

export type ResumenConsejo = { total: number; conVoto: number; vitalicios: number };

/**
 * Resumen del consejo: cuenta miembros **activos del órgano 'consejo'**, cuántos
 * ostentan voto y cuántos son vitalicios. Útil para el header del tab.
 */
export function resumenConsejo(consejeros: readonly Consejero[]): ResumenConsejo {
  const activos = consejeros.filter((c) => c.activo && c.organo === 'consejo');
  return {
    total: activos.length,
    conVoto: activos.filter((c) => c.ostenta_voto).length,
    vitalicios: activos.filter((c) => c.vitalicio).length,
  };
}

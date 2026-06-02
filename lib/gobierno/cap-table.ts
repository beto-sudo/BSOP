/**
 * Helpers puros del cuadro accionario (`core.empresa_socios`).
 *
 * Iniciativa `gobierno-corporativo` · Sprint 2. La lógica de validación del
 * cap table vive aquí (testeable sin DOM); el panel UI la consume.
 *
 * Por diseño NO se fuerza `Σ% = 100` en DB (durante una reestructura
 * patrimonial puede no sumar) — se valida en UI con un warning. Ver planning.
 */

export type TipoSocio = 'familia' | 'persona' | 'entidad';

export type Socio = {
  id: string;
  empresa_id: string;
  nombre: string;
  familia: string | null;
  tipo: TipoSocio;
  socio_empresa_id: string | null;
  porcentaje: number;
  orden: number;
  activo: boolean;
  notas: string | null;
};

export const TIPO_SOCIO_LABELS: Record<TipoSocio, string> = {
  familia: 'Familia',
  persona: 'Persona',
  entidad: 'Entidad / persona moral',
};

export const TIPOS_SOCIO: readonly TipoSocio[] = ['entidad', 'familia', 'persona'];

type SocioPct = Pick<Socio, 'porcentaje' | 'activo'>;

/** Suma del % de participación de los socios **activos**. */
export function sumaPorcentajes(socios: readonly SocioPct[]): number {
  return socios
    .filter((s) => s.activo)
    .reduce(
      (acc, s) => acc + (Number.isFinite(Number(s.porcentaje)) ? Number(s.porcentaje) : 0),
      0
    );
}

export type CapTableStatus = 'vacio' | 'ok' | 'incompleto' | 'excedido';

/**
 * Estado del cap table según la suma de % de socios activos. Tolerancia de
 * 0.01 para absorber el redondeo de tres tercios (33.3333 × 3 = 99.9999).
 */
export function capTableStatus(socios: readonly SocioPct[]): CapTableStatus {
  const activos = socios.filter((s) => s.activo);
  if (activos.length === 0) return 'vacio';
  const suma = sumaPorcentajes(activos);
  if (Math.abs(suma - 100) <= 0.01) return 'ok';
  return suma < 100 ? 'incompleto' : 'excedido';
}

/** Texto legible del estado para el badge del header. */
export function capTableStatusLabel(status: CapTableStatus, suma: number): string {
  const pct = `${suma.toFixed(suma % 1 === 0 ? 0 : 2)}%`;
  switch (status) {
    case 'vacio':
      return 'Sin socios activos';
    case 'ok':
      return `Σ ${pct} ✓`;
    case 'incompleto':
      return `Σ ${pct} — falta ${(100 - suma).toFixed(2)}%`;
    case 'excedido':
      return `Σ ${pct} — excede ${(suma - 100).toFixed(2)}%`;
  }
}

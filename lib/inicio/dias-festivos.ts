/**
 * Días festivos oficiales de México.
 *
 * MVP: constante estática. Cuando el producto lo justifique, mover a
 * `core.dias_festivos` (con `empresa_id` opcional para festivos de empresa).
 *
 * Fechas según la LFT (Ley Federal del Trabajo) Art. 74 + festivos nacionales
 * comunes en la operación. Algunos se mueven al lunes siguiente (art. 74 fr. II/III/V).
 */

export type DiaFestivo = {
  fecha: string; // ISO: YYYY-MM-DD
  nombre: string;
  tipo: 'oficial' | 'nacional' | 'religioso';
  /** Si aplica como descanso obligatorio por LFT Art. 74. */
  descansoObligatorio: boolean;
};

export const DIAS_FESTIVOS_MX: DiaFestivo[] = [
  // 2026
  { fecha: '2026-01-01', nombre: 'Año Nuevo', tipo: 'oficial', descansoObligatorio: true },
  {
    fecha: '2026-02-02',
    nombre: 'Día de la Constitución',
    tipo: 'oficial',
    descansoObligatorio: true,
  },
  {
    fecha: '2026-03-16',
    nombre: 'Natalicio de Benito Juárez',
    tipo: 'oficial',
    descansoObligatorio: true,
  },
  { fecha: '2026-04-02', nombre: 'Jueves Santo', tipo: 'religioso', descansoObligatorio: false },
  { fecha: '2026-04-03', nombre: 'Viernes Santo', tipo: 'religioso', descansoObligatorio: false },
  { fecha: '2026-05-01', nombre: 'Día del Trabajo', tipo: 'oficial', descansoObligatorio: true },
  {
    fecha: '2026-05-05',
    nombre: 'Batalla de Puebla',
    tipo: 'nacional',
    descansoObligatorio: false,
  },
  {
    fecha: '2026-05-10',
    nombre: 'Día de las Madres',
    tipo: 'nacional',
    descansoObligatorio: false,
  },
  {
    fecha: '2026-09-16',
    nombre: 'Día de la Independencia',
    tipo: 'oficial',
    descansoObligatorio: true,
  },
  { fecha: '2026-11-02', nombre: 'Día de Muertos', tipo: 'nacional', descansoObligatorio: false },
  {
    fecha: '2026-11-16',
    nombre: 'Revolución Mexicana',
    tipo: 'oficial',
    descansoObligatorio: true,
  },
  {
    fecha: '2026-12-12',
    nombre: 'Virgen de Guadalupe',
    tipo: 'religioso',
    descansoObligatorio: false,
  },
  { fecha: '2026-12-25', nombre: 'Navidad', tipo: 'oficial', descansoObligatorio: true },

  // 2027
  { fecha: '2027-01-01', nombre: 'Año Nuevo', tipo: 'oficial', descansoObligatorio: true },
  {
    fecha: '2027-02-01',
    nombre: 'Día de la Constitución',
    tipo: 'oficial',
    descansoObligatorio: true,
  },
  {
    fecha: '2027-03-15',
    nombre: 'Natalicio de Benito Juárez',
    tipo: 'oficial',
    descansoObligatorio: true,
  },
  { fecha: '2027-03-25', nombre: 'Jueves Santo', tipo: 'religioso', descansoObligatorio: false },
  { fecha: '2027-03-26', nombre: 'Viernes Santo', tipo: 'religioso', descansoObligatorio: false },
  { fecha: '2027-05-01', nombre: 'Día del Trabajo', tipo: 'oficial', descansoObligatorio: true },
  {
    fecha: '2027-09-16',
    nombre: 'Día de la Independencia',
    tipo: 'oficial',
    descansoObligatorio: true,
  },
  {
    fecha: '2027-11-15',
    nombre: 'Revolución Mexicana',
    tipo: 'oficial',
    descansoObligatorio: true,
  },
  { fecha: '2027-12-25', nombre: 'Navidad', tipo: 'oficial', descansoObligatorio: true },
];

/**
 * Devuelve los festivos entre `desde` y `hasta` (inclusive), ordenados ascendente.
 * Fechas comparadas por string ISO (YYYY-MM-DD) para evitar problemas de TZ.
 */
export function festivosEnRango(desde: Date, hasta: Date): DiaFestivo[] {
  const desdeIso = toIsoDate(desde);
  const hastaIso = toIsoDate(hasta);
  return DIAS_FESTIVOS_MX.filter((f) => f.fecha >= desdeIso && f.fecha <= hastaIso).sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

import { describe, expect, it } from 'vitest';
import {
  calcularFechasObjetivo,
  filtrarPlantillaPorTipoProyecto,
  type PlantillaTareaInput,
} from './instanciar-plantilla';

describe('calcularFechasObjetivo', () => {
  it('tarea sola sin deps arranca en fechaArranque', () => {
    const r = calcularFechasObjetivo(
      [{ id: 'A', duracion_dias_habiles: 5, depende_de: [] }],
      '2026-05-26' // martes
    );
    expect(r.get('A')).toEqual({
      fecha_objetivo_inicio: '2026-05-26',
      fecha_objetivo_fin: '2026-06-01', // mar 26, mié 27, jue 28, vie 29, lun 1 jun
    });
  });

  it('dos tareas en serie: B arranca el día hábil siguiente al fin de A', () => {
    const tareas: PlantillaTareaInput[] = [
      { id: 'A', duracion_dias_habiles: 3, depende_de: [] },
      { id: 'B', duracion_dias_habiles: 2, depende_de: ['A'] },
    ];
    const r = calcularFechasObjetivo(tareas, '2026-05-26');
    expect(r.get('A')?.fecha_objetivo_inicio).toBe('2026-05-26');
    expect(r.get('A')?.fecha_objetivo_fin).toBe('2026-05-28'); // mar, mié, jue
    expect(r.get('B')?.fecha_objetivo_inicio).toBe('2026-05-29'); // vie (siguiente hábil)
    expect(r.get('B')?.fecha_objetivo_fin).toBe('2026-06-01'); // vie, lun
  });

  it('dos tareas en paralelo desde el mismo arranque', () => {
    const tareas: PlantillaTareaInput[] = [
      { id: 'A', duracion_dias_habiles: 3, depende_de: [] },
      { id: 'B', duracion_dias_habiles: 5, depende_de: [] },
    ];
    const r = calcularFechasObjetivo(tareas, '2026-05-26');
    expect(r.get('A')?.fecha_objetivo_inicio).toBe('2026-05-26');
    expect(r.get('B')?.fecha_objetivo_inicio).toBe('2026-05-26');
  });

  it('join: C depende de A y B, arranca después del fin más tardío', () => {
    const tareas: PlantillaTareaInput[] = [
      { id: 'A', duracion_dias_habiles: 3, depende_de: [] }, // termina mié+jue → jue
      { id: 'B', duracion_dias_habiles: 7, depende_de: [] }, // termina más tarde
      { id: 'C', duracion_dias_habiles: 1, depende_de: ['A', 'B'] },
    ];
    const r = calcularFechasObjetivo(tareas, '2026-05-26'); // mar
    // A: mar, mié, jue → 28 may
    // B: mar 26 mié 27 jue 28 vie 29 lun 1 mar 2 mié 3 → 3 jun
    // C: arranca jue 4 jun (siguiente hábil al 3)
    expect(r.get('A')?.fecha_objetivo_fin).toBe('2026-05-28');
    expect(r.get('B')?.fecha_objetivo_fin).toBe('2026-06-03');
    expect(r.get('C')?.fecha_objetivo_inicio).toBe('2026-06-04');
  });

  it('detecta ciclo y lanza error', () => {
    const tareas: PlantillaTareaInput[] = [
      { id: 'A', duracion_dias_habiles: 1, depende_de: ['B'] },
      { id: 'B', duracion_dias_habiles: 1, depende_de: ['A'] },
    ];
    expect(() => calcularFechasObjetivo(tareas, '2026-05-26')).toThrow(/ciclo/i);
  });

  it('detecta referencia rota y lanza error', () => {
    const tareas: PlantillaTareaInput[] = [
      { id: 'A', duracion_dias_habiles: 1, depende_de: ['INEXISTENTE'] },
    ];
    expect(() => calcularFechasObjetivo(tareas, '2026-05-26')).toThrow(/no existe/i);
  });

  it('respeta festivos al calcular fechas', () => {
    // 1 ene 2026 jueves = festivo; arranque ahí debe saltar a vie 2 ene
    const tareas: PlantillaTareaInput[] = [{ id: 'A', duracion_dias_habiles: 5, depende_de: [] }];
    const r = calcularFechasObjetivo(tareas, '2026-01-01');
    expect(r.get('A')?.fecha_objetivo_inicio).toBe('2026-01-02'); // vie 02 ene (saltó festivo jue 01)
    expect(r.get('A')?.fecha_objetivo_fin).toBe('2026-01-08');
  });

  it('procesa grafo con 35 nodos linealmente sin explotar', () => {
    const tareas: PlantillaTareaInput[] = Array.from({ length: 35 }, (_, i) => ({
      id: `T${i}`,
      duracion_dias_habiles: 1,
      depende_de: i === 0 ? [] : [`T${i - 1}`],
    }));
    const r = calcularFechasObjetivo(tareas, '2026-05-26');
    expect(r.size).toBe(35);
    // Cada tarea avanza 1 día hábil (cuenta cada uno como 1 día hábil completo
    // + el siguiente hábil para la dependiente). En realidad cada tarea
    // ocupa 1 día y la siguiente arranca al día hábil después → cada step
    // avanza 1 día hábil hacia adelante.
    expect(r.get('T0')?.fecha_objetivo_inicio).toBe('2026-05-26');
  });
});

describe('filtrarPlantillaPorTipoProyecto', () => {
  const plantillas = [
    { aplicacion: 'anteproyecto' },
    { aplicacion: 'desarrollo' },
    { aplicacion: 'ambas' },
  ];

  it('para anteproyecto = anteproyecto + ambas (no desarrollo)', () => {
    const r = filtrarPlantillaPorTipoProyecto(plantillas, 'anteproyecto');
    expect(r.map((p) => p.aplicacion).sort()).toEqual(['ambas', 'anteproyecto']);
  });

  it('para desarrollo = desarrollo + ambas (no anteproyecto)', () => {
    const r = filtrarPlantillaPorTipoProyecto(plantillas, 'desarrollo');
    expect(r.map((p) => p.aplicacion).sort()).toEqual(['ambas', 'desarrollo']);
  });

  it('para otros tipos (remodelacion/etc) = desarrollo + ambas', () => {
    const r = filtrarPlantillaPorTipoProyecto(plantillas, 'remodelacion');
    expect(r.map((p) => p.aplicacion).sort()).toEqual(['ambas', 'desarrollo']);
  });
});

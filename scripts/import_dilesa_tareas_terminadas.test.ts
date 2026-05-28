import { describe, expect, it } from 'vitest';
import { splitTareaTerminada } from './import_dilesa_tareas_terminadas';

describe('splitTareaTerminada', () => {
  const etapas = ['INSTALACIÓN HIDRO-SANITARIA', 'CIMENTACIÓN', 'ALBAÑILERÍA', 'ACABADOS'];
  const etapasOrdenadas = [...etapas].sort((a, b) => b.length - a.length);

  it('matchea etapas sin guion (primer guion = separador)', () => {
    expect(splitTareaTerminada('CIMENTACIÓN-Trazo y nivelación', etapasOrdenadas)).toEqual({
      etapa: 'CIMENTACIÓN',
      tarea: 'Trazo y nivelación',
    });
  });

  it('matchea etapas con guion en el nombre via longest-prefix-match', () => {
    expect(
      splitTareaTerminada(
        'INSTALACIÓN HIDRO-SANITARIA-Elaboración de Pruebas Sanitarias',
        etapasOrdenadas
      )
    ).toEqual({
      etapa: 'INSTALACIÓN HIDRO-SANITARIA',
      tarea: 'Elaboración de Pruebas Sanitarias',
    });
  });

  it('preserva guiones en el nombre de la tarea', () => {
    expect(
      splitTareaTerminada(
        'INSTALACIÓN HIDRO-SANITARIA-Pruebas Hidro-Sanitarias Finales',
        etapasOrdenadas
      )
    ).toEqual({
      etapa: 'INSTALACIÓN HIDRO-SANITARIA',
      tarea: 'Pruebas Hidro-Sanitarias Finales',
    });
  });

  it('es case-insensitive en el prefijo de etapa', () => {
    expect(
      splitTareaTerminada('instalación hidro-sanitaria-Elaboración de Pruebas', etapasOrdenadas)
    ).toEqual({
      etapa: 'INSTALACIÓN HIDRO-SANITARIA',
      tarea: 'Elaboración de Pruebas',
    });
  });

  it('cae al fallback (primer guion) si ninguna etapa conocida matchea', () => {
    expect(splitTareaTerminada('ETAPA NUEVA-tarea X', etapasOrdenadas)).toEqual({
      etapa: 'ETAPA NUEVA',
      tarea: 'tarea X',
    });
  });

  it('devuelve null si no hay guion', () => {
    expect(splitTareaTerminada('SinGuion', etapasOrdenadas)).toBeNull();
  });

  it('devuelve null si el guion está en posición 0', () => {
    expect(splitTareaTerminada('-tarea sin etapa', etapasOrdenadas)).toBeNull();
  });
});

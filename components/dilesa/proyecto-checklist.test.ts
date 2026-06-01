import { describe, expect, it } from 'vitest';
import { emptyStateCopy, contarNoTerminales } from './proyecto-checklist';

describe('emptyStateCopy', () => {
  it('da copy específico para anteproyecto', () => {
    const c = emptyStateCopy('anteproyecto');
    expect(c.descripcion).toContain('anteproyecto');
    expect(c.titulo).toBe('Sin tareas instanciadas todavía.');
  });

  it('da copy de desarrollo para tipo desarrollo', () => {
    const c = emptyStateCopy('desarrollo');
    expect(c.descripcion).toContain('desarrollo');
    // menciona las partidas canónicas del desarrollo
    expect(c.descripcion).toContain('urbanización');
  });

  it('cae al copy de desarrollo para cualquier tipo no-anteproyecto', () => {
    // remodelacion / reconversion / etc. comparten la plantilla de desarrollo
    expect(emptyStateCopy('remodelacion').descripcion).toBe(
      emptyStateCopy('desarrollo').descripcion
    );
    expect(emptyStateCopy('comercializacion').descripcion).toBe(
      emptyStateCopy('desarrollo').descripcion
    );
  });
});

describe('contarNoTerminales', () => {
  it('cuenta pendiente, en_curso y bloqueada', () => {
    const tareas = [{ estado: 'pendiente' }, { estado: 'en_curso' }, { estado: 'bloqueada' }];
    expect(contarNoTerminales(tareas)).toBe(3);
  });

  it('ignora completada y cancelada (terminales)', () => {
    const tareas = [{ estado: 'completada' }, { estado: 'cancelada' }, { estado: 'pendiente' }];
    expect(contarNoTerminales(tareas)).toBe(1);
  });

  it('devuelve 0 si todas están cerradas', () => {
    expect(contarNoTerminales([{ estado: 'completada' }, { estado: 'cancelada' }])).toBe(0);
  });

  it('devuelve 0 para lista vacía', () => {
    expect(contarNoTerminales([])).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildProyectoOptions,
  proyectoOptionLabel,
  type ProyectoSelectorRow,
} from './proyectos-selector';

function row(o: Partial<ProyectoSelectorRow> & { id: string }): ProyectoSelectorRow {
  return {
    nombre: o.id,
    tipo: 'desarrollo',
    proyecto_predecesor_id: null,
    ...o,
  };
}

describe('buildProyectoOptions (selector de proyecto DILESA)', () => {
  it('incluye desarrollos sin marcarlos como anteproyecto', () => {
    const out = buildProyectoOptions([
      row({ id: 'a', nombre: 'Lomas del Sol', tipo: 'desarrollo' }),
    ]);
    expect(out).toEqual([{ id: 'a', nombre: 'Lomas del Sol', esAnteproyecto: false }]);
  });

  it('incluye anteproyectos NO convertidos, marcados esAnteproyecto', () => {
    const out = buildProyectoOptions([
      row({ id: 'ap', nombre: 'Loma Escondida', tipo: 'anteproyecto' }),
    ]);
    expect(out).toEqual([{ id: 'ap', nombre: 'Loma Escondida', esAnteproyecto: true }]);
  });

  it('omite el anteproyecto YA convertido (referenciado por un desarrollo)', () => {
    const out = buildProyectoOptions([
      row({ id: 'ap', nombre: 'Ampliación', tipo: 'anteproyecto' }),
      row({ id: 'dev', nombre: 'Ampliación', tipo: 'desarrollo', proyecto_predecesor_id: 'ap' }),
    ]);
    // Solo el desarrollo sobrevive → sin duplicado por nombre.
    expect(out).toEqual([{ id: 'dev', nombre: 'Ampliación', esAnteproyecto: false }]);
  });

  it('mantiene el anteproyecto suelto aunque otro par esté convertido', () => {
    const out = buildProyectoOptions([
      row({ id: 'ap1', nombre: 'Delicias', tipo: 'anteproyecto' }),
      row({ id: 'dev1', nombre: 'Delicias', tipo: 'desarrollo', proyecto_predecesor_id: 'ap1' }),
      row({ id: 'ap2', nombre: 'Bosque', tipo: 'anteproyecto' }),
    ]);
    expect(out.map((o) => o.id)).toEqual(['ap2', 'dev1']); // ap1 omitido; orden por nombre
    expect(out.find((o) => o.id === 'ap2')?.esAnteproyecto).toBe(true);
  });

  it('ordena por nombre', () => {
    const out = buildProyectoOptions([
      row({ id: 'z', nombre: 'Zafiro' }),
      row({ id: 'a', nombre: 'Ámbar' }),
      row({ id: 'm', nombre: 'Mango' }),
    ]);
    expect(out.map((o) => o.nombre)).toEqual(['Ámbar', 'Mango', 'Zafiro']);
  });

  it('tolera nombre null → cadena vacía', () => {
    const out = buildProyectoOptions([row({ id: 'x', nombre: null })]);
    expect(out[0]?.nombre).toBe('');
  });
});

describe('proyectoOptionLabel', () => {
  it('agrega "(anteproyecto)" solo a anteproyectos', () => {
    expect(proyectoOptionLabel({ id: 'a', nombre: 'Loma', esAnteproyecto: true })).toBe(
      'Loma (anteproyecto)'
    );
    expect(proyectoOptionLabel({ id: 'b', nombre: 'Sol', esAnteproyecto: false })).toBe('Sol');
  });
});

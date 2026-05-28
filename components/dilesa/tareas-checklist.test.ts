import { describe, expect, it } from 'vitest';
import {
  computeBloqueadasMap,
  type TareaChecklistRow,
  type TareaDependencia,
} from './tareas-checklist';

function makeTarea(over: Partial<TareaChecklistRow>): TareaChecklistRow {
  return {
    id: 't-' + (over.id ?? Math.random().toString(36).slice(2, 8)),
    titulo: 'Tarea',
    descripcion: null,
    estado: 'pendiente',
    orden: 0,
    tipo_snapshot: null,
    subtipo_snapshot: null,
    entidad_responsable_snapshot: null,
    obligatoriedad_snapshot: null,
    requiere_archivo_snapshot: null,
    fecha_objetivo_inicio: null,
    fecha_objetivo_fin: null,
    fecha_completada: null,
    resultado_monto: null,
    resultado_documento_url: null,
    plantilla_tarea_id: null,
    ...over,
  };
}

describe('computeBloqueadasMap (Sprint 1)', () => {
  it('devuelve map vacío si no hay deps', () => {
    const t = [makeTarea({ id: 'a' })];
    expect(computeBloqueadasMap(t, []).size).toBe(0);
  });

  it('una tarea pendiente cuya dep está pendiente → bloqueada por X', () => {
    const a = makeTarea({ id: 'a', titulo: 'Comité', estado: 'pendiente' });
    const b = makeTarea({ id: 'b', titulo: 'Convertir', estado: 'pendiente' });
    const deps: TareaDependencia[] = [{ tarea_id: 'b', depende_de_tarea_id: 'a' }];
    const map = computeBloqueadasMap([a, b], deps);
    expect(map.get('b')).toEqual(['Comité']);
    expect(map.has('a')).toBe(false);
  });

  it('si la dep está completada, la dependiente NO está bloqueada', () => {
    const a = makeTarea({ id: 'a', titulo: 'Comité', estado: 'completada' });
    const b = makeTarea({ id: 'b', titulo: 'Convertir', estado: 'pendiente' });
    const deps: TareaDependencia[] = [{ tarea_id: 'b', depende_de_tarea_id: 'a' }];
    expect(computeBloqueadasMap([a, b], deps).has('b')).toBe(false);
  });

  it('si la dep está cancelada, la dependiente NO está bloqueada', () => {
    const a = makeTarea({ id: 'a', titulo: 'Cotización', estado: 'cancelada' });
    const b = makeTarea({ id: 'b', titulo: 'Contratar', estado: 'pendiente' });
    const deps: TareaDependencia[] = [{ tarea_id: 'b', depende_de_tarea_id: 'a' }];
    expect(computeBloqueadasMap([a, b], deps).has('b')).toBe(false);
  });

  it('múltiples deps incompletas se concatenan en titulos', () => {
    const a = makeTarea({ id: 'a', titulo: 'Estudio Suelo', estado: 'pendiente' });
    const b = makeTarea({ id: 'b', titulo: 'Manifestación Impacto', estado: 'en_curso' });
    const c = makeTarea({ id: 'c', titulo: 'Solicitar Licencia', estado: 'pendiente' });
    const deps: TareaDependencia[] = [
      { tarea_id: 'c', depende_de_tarea_id: 'a' },
      { tarea_id: 'c', depende_de_tarea_id: 'b' },
    ];
    const bloqueantes = computeBloqueadasMap([a, b, c], deps).get('c');
    expect(bloqueantes).toBeDefined();
    expect(bloqueantes!.sort()).toEqual(['Estudio Suelo', 'Manifestación Impacto']);
  });

  it('una dep a tarea inexistente se ignora silenciosa', () => {
    const a = makeTarea({ id: 'a' });
    const deps: TareaDependencia[] = [{ tarea_id: 'a', depende_de_tarea_id: 'ghost' }];
    expect(computeBloqueadasMap([a], deps).size).toBe(0);
  });
});

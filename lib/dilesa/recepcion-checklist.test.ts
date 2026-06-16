import { describe, it, expect } from 'vitest';

import {
  HITO_RECEPCION_LABEL,
  RECEPCION_CHECKLIST,
  RECEPCION_CHECKLIST_TOTAL_ITEMS,
  RECEPCION_ITEM_ESTADO_LABEL,
} from './recepcion-checklist';

/**
 * El catálogo del checklist de recepción se persiste como snapshot JSONB por
 * `clave`. Una clave duplicada haría que dos puntos del recorrido pisaran la
 * misma respuesta — invariante crítico que este test protege.
 */
describe('RECEPCION_CHECKLIST', () => {
  const allItems = RECEPCION_CHECKLIST.flatMap((s) => s.items);

  it('tiene claves de ítem únicas en todo el catálogo', () => {
    const claves = allItems.map((i) => i.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('tiene claves de sección únicas', () => {
    const claves = RECEPCION_CHECKLIST.map((s) => s.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('cada sección tiene al menos un ítem y cada ítem etiqueta no vacía', () => {
    for (const sec of RECEPCION_CHECKLIST) {
      expect(sec.items.length).toBeGreaterThan(0);
      for (const item of sec.items) expect(item.etiqueta.trim().length).toBeGreaterThan(0);
    }
  });

  it('RECEPCION_CHECKLIST_TOTAL_ITEMS coincide con el conteo real', () => {
    expect(RECEPCION_CHECKLIST_TOTAL_ITEMS).toBe(allItems.length);
  });

  it('solo Planta Alta es opcional (N/A en 1 planta)', () => {
    const opcionales = RECEPCION_CHECKLIST.filter((s) => s.opcional).map((s) => s.clave);
    expect(opcionales).toEqual(['interior_pa']);
  });

  it('los labels canónicos y de estado están completos', () => {
    expect(HITO_RECEPCION_LABEL.checklist).toBeTruthy();
    expect(HITO_RECEPCION_LABEL.recepcion_final).toBeTruthy();
    expect(RECEPCION_ITEM_ESTADO_LABEL.cumple).toBeTruthy();
    expect(RECEPCION_ITEM_ESTADO_LABEL.observacion).toBeTruthy();
    expect(RECEPCION_ITEM_ESTADO_LABEL.na).toBeTruthy();
  });
});

/**
 * El registry de IA está bien-formado y cubre los usos en producción
 * (iniciativa `registro-ia`). Si agregás/quitás un uso, este test documenta el
 * inventario esperado y falla si se desincroniza.
 */

import { describe, expect, it } from 'vitest';
import { AI_USOS, AI_USO_IDS, getUso } from './registry';
import { DEFAULT_CLAUDE_MODEL, DEFAULT_EMBEDDING_MODEL } from './models';

// Inventario esperado. Mantener en sync con el código: agregar un uso aquí
// cuando se registre uno nuevo en registry.ts.
const USOS_ESPERADOS = [
  'documentos-extraccion',
  'documentos-embedding',
  'busqueda-semantica',
  'csf-extraccion',
  'dilesa-plano',
  'dilesa-estado-cuenta',
  'dilesa-notarial-venta',
  'dilesa-pld-informe',
  'dilesa-pld-acuse',
  'sanren-recibo-extraccion',
  'daily-briefing',
] as const;

describe('registro-ia · registry', () => {
  it('contiene exactamente los usos esperados', () => {
    expect([...AI_USO_IDS].sort()).toEqual([...USOS_ESPERADOS].sort());
  });

  it('cada uso está completo y coherente', () => {
    for (const id of AI_USO_IDS) {
      const u = getUso(id);
      expect(u.label, id).toBeTruthy();
      expect(u.descripcion, id).toBeTruthy();
      expect(u.archivo, id).toMatch(/\.(ts|tsx)$/);
      expect(['anthropic', 'openai'], id).toContain(u.proveedor);
      expect(['alta', 'media', 'baja'], id).toContain(u.criticidad);

      // El proveedor amarra el modelo por defecto y la llave.
      if (u.proveedor === 'anthropic') {
        expect(u.modeloDefault, id).toBe(DEFAULT_CLAUDE_MODEL);
        expect(u.envVar, id).toBe('ANTHROPIC_API_KEY');
        expect(['vision-extraccion', 'generacion-texto'], id).toContain(u.modalidad);
      } else {
        expect(u.modeloDefault, id).toBe(DEFAULT_EMBEDDING_MODEL);
        expect(u.envVar, id).toBe('OPENAI_API_KEY');
        expect(u.modalidad, id).toBe('embedding');
      }
    }
  });

  it('los embeddings advierten que cambiar el modelo exige reindexar', () => {
    for (const id of AI_USO_IDS) {
      if (getUso(id).modalidad === 'embedding') {
        expect(getUso(id).nota, id).toMatch(/reindex/i);
      }
    }
  });
});

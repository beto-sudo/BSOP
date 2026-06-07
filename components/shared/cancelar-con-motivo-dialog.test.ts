import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Invariantes source-level del diálogo compartido de cancelación con motivo
 * (iniciativa p2p-cancelaciones). Source-level porque el repo corre env=node
 * sin jsdom (ver cxp-printables.test.ts).
 *
 * Contrato clave (D1: cancelar con motivo para auditoría):
 *  - el motivo es obligatorio por default y bloquea el botón confirmar;
 *  - el confirmar es destructivo;
 *  - si onConfirm lanza, el diálogo NO se cierra (el caller muestra el error).
 */
const src = readFileSync(path.resolve(__dirname, 'cancelar-con-motivo-dialog.tsx'), 'utf8');

describe('CancelarConMotivoDialog (p2p-cancelaciones)', () => {
  it('el motivo es obligatorio por default', () => {
    expect(src).toContain('motivoRequerido = true');
    expect(src).toMatch(/canConfirm\s*=\s*!motivoRequerido \|\| motivo\.trim\(\)\.length/);
  });

  it('el botón confirmar es destructivo y se deshabilita sin motivo', () => {
    expect(src).toContain('variant="destructive"');
    expect(src).toContain('disabled={!canConfirm || submitting}');
  });

  it('mantiene el diálogo abierto si onConfirm lanza (error vía toast del caller)', () => {
    // El try/catch no cierra en el catch; solo onClose() tras un onConfirm exitoso.
    expect(src).toMatch(/await onConfirm\(motivo\.trim\(\)\);\s*onClose\(\);/);
    expect(src).toContain('} catch {');
  });
});

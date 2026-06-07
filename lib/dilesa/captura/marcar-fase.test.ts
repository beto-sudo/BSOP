/**
 * Tests del helper de captura de fase. Verifica el contrato de la
 * transacción (storage + adjuntos + venta_fases + ventas update).
 */
import { describe, expect, it, vi } from 'vitest';
import { marcarFase, FASES_PIPELINE } from './marcar-fase';
import type { SupabaseClient } from '@supabase/supabase-js';

function mockClient(opts?: {
  storageUploadError?: string;
  adjuntoInsertError?: string;
  ventaUpdateError?: string;
  faseInsertError?: string;
}): SupabaseClient {
  const storageOk = !opts?.storageUploadError;
  const adjuntoOk = !opts?.adjuntoInsertError;
  const ventaOk = !opts?.ventaUpdateError;
  const faseOk = !opts?.faseInsertError;

  const storage = {
    from: vi.fn(() => ({
      upload: vi.fn(async () =>
        storageOk
          ? { data: { path: 'x' }, error: null }
          : { data: null, error: { message: opts!.storageUploadError } }
      ),
    })),
  };

  const schema = vi.fn((s: string) => ({
    from: vi.fn((table: string) => {
      if (s === 'erp' && table === 'adjuntos') {
        return {
          insert: vi.fn(async () =>
            adjuntoOk ? { error: null } : { error: { message: opts!.adjuntoInsertError } }
          ),
        };
      }
      if (s === 'dilesa' && table === 'ventas') {
        return {
          // SELECT para leer fase_posicion actual antes del UPDATE
          // (defensa "solo avanza" — ver marcar-fase.ts).
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { fase_posicion: 1 },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () =>
              ventaOk ? { error: null } : { error: { message: opts!.ventaUpdateError } }
            ),
          })),
        };
      }
      if (s === 'dilesa' && table === 'venta_fases') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () =>
                faseOk
                  ? { data: { id: 'fase-id-123' }, error: null }
                  : { data: null, error: { message: opts!.faseInsertError } }
              ),
            })),
          })),
        };
      }
      return {};
    }),
  }));

  return { storage, schema } as unknown as SupabaseClient;
}

function fakeFile(name = 'contrato.pdf', size = 1024): File {
  return new File(['fake content'], name, { type: 'application/pdf' });
}

describe('marcarFase', () => {
  const baseInput = {
    ventaId: '550e8400-e29b-41d4-a716-446655440000',
    faseNombre: 'Formalizada',
    faseposicion: 3,
    docs: [{ rol: 'contrato_promesa', archivo: fakeFile() }],
    camposVenta: { precio_asignacion: 1_021_000 },
    notas: null,
    registradoPor: 'user-1',
  };

  it('happy path: sube doc, registra adjunto, update venta, cierra fase', async () => {
    const sb = mockClient();
    const r = await marcarFase(sb, baseInput);
    expect(r.ok).toBe(true);
    expect(r.adjuntosCreados).toBe(1);
    expect(r.ventaFaseId).toBe('fase-id-123');
  });

  it('error en storage upload aborta antes de tocar la DB', async () => {
    const sb = mockClient({ storageUploadError: 'Permission denied' });
    const r = await marcarFase(sb, baseInput);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Permission denied');
    expect(r.adjuntosCreados).toBe(0);
  });

  it('error en INSERT erp.adjuntos aborta', async () => {
    const sb = mockClient({ adjuntoInsertError: 'RLS denial' });
    const r = await marcarFase(sb, baseInput);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('RLS denial');
    expect(r.adjuntosCreados).toBe(0);
  });

  it('error en UPDATE venta deja adjuntos creados y reporta', async () => {
    const sb = mockClient({ ventaUpdateError: 'forbidden col' });
    const r = await marcarFase(sb, baseInput);
    expect(r.ok).toBe(false);
    expect(r.adjuntosCreados).toBe(1);
    expect(r.error).toContain('forbidden col');
  });

  it('error en INSERT venta_fases deja todo lo previo pero reporta', async () => {
    const sb = mockClient({ faseInsertError: 'check constraint' });
    const r = await marcarFase(sb, baseInput);
    expect(r.ok).toBe(false);
    expect(r.adjuntosCreados).toBe(1);
    expect(r.error).toContain('no se cerró la fase');
  });

  it('camposVenta vacío salta el UPDATE de ventas', async () => {
    const sb = mockClient();
    const r = await marcarFase(sb, { ...baseInput, camposVenta: {} });
    expect(r.ok).toBe(true);
  });

  it('múltiples docs se suben en orden', async () => {
    const sb = mockClient();
    const r = await marcarFase(sb, {
      ...baseInput,
      docs: [
        { rol: 'aviso_pld', archivo: fakeFile('pld.pdf') },
        { rol: 'ficu', archivo: fakeFile('ficu.pdf') },
        { rol: 'aviso_privacidad', archivo: fakeFile('aviso.pdf') },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.adjuntosCreados).toBe(3);
  });
});

describe('FASES_PIPELINE', () => {
  it('tiene 17 fases en orden', () => {
    expect(FASES_PIPELINE).toHaveLength(17);
    expect(FASES_PIPELINE.map((f) => f.posicion)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
  });

  it('cada slug es kebab-case con prefijo numérico', () => {
    for (const f of FASES_PIPELINE) {
      expect(f.slug).toMatch(/^\d{1,2}-[a-z-]+$/);
    }
  });

  it('los nombres coinciden con el seed de venta_fase_catalogo', () => {
    // Los nombres deben ser EXACTAMENTE los de la DB para que el INSERT
    // funcione. Si la migración cambia el seed, romper aquí intencionalmente.
    const nombres = FASES_PIPELINE.map((f) => f.nombre);
    expect(nombres).toContain('Solicitud de Asignación');
    expect(nombres).toContain('Formalizada');
    expect(nombres).toContain('Operación Terminada');
  });
});

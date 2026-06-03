import { describe, it, expect } from 'vitest';
import { loadEmpresaBranding } from './email-branding';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mock minimal Supabase client que solo cubre la cadena
 * `.schema('core').from('empresas').select().eq().maybeSingle()` que usa
 * `loadEmpresaBranding`. Devuelve la fila configurada o `null`.
 */
function mockSupabase(row: Record<string, unknown> | null): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
    from: () => chain,
  };
  return { schema: () => ({ from: () => chain }) } as unknown as SupabaseClient;
}

describe('loadEmpresaBranding', () => {
  it('retorna defaults cuando empresaId es null', async () => {
    const sb = mockSupabase(null);
    const b = await loadEmpresaBranding(sb, null);
    expect(b.empresaId).toBeNull();
    expect(b.nombreComercial).toBe('BSOP');
    expect(b.colorPrimario).toMatch(/^#/);
    expect(b.colorPrimarioDark).toMatch(/^#/);
  });

  it('retorna defaults con empresaId cuando la empresa no existe', async () => {
    const sb = mockSupabase(null);
    const b = await loadEmpresaBranding(sb, 'no-existe');
    expect(b.empresaId).toBe('no-existe');
    expect(b.nombreComercial).toBe('BSOP');
  });

  it('lee colores y nombre comercial de la fila', async () => {
    const sb = mockSupabase({
      id: 'dilesa-id',
      slug: 'dilesa',
      nombre: 'DILESA',
      nombre_comercial: 'DILESA',
      header_url: '/brand/dilesa/header-email.png',
      color_primario: '#7D812E',
      color_primario_dark: '#646725',
      color_secundario: '#4F4C4D',
      color_texto_titulo: '#1F1F1F',
      color_fondo_brand: '#FAF7EE',
      color_inverso: '#FFFFFF',
    });
    const b = await loadEmpresaBranding(sb, 'dilesa-id');
    expect(b.empresaId).toBe('dilesa-id');
    expect(b.nombreComercial).toBe('DILESA');
    expect(b.colorPrimario).toBe('#7D812E');
    expect(b.colorPrimarioDark).toBe('#646725');
    expect(b.colorSecundario).toBe('#4F4C4D');
    expect(b.colorTextoTitulo).toBe('#1F1F1F');
    expect(b.colorFondoBrand).toBe('#FAF7EE');
    expect(b.colorInverso).toBe('#FFFFFF');
  });

  it('hidrata contacto del footer desde el mapping por slug (dilesa)', async () => {
    const sb = mockSupabase({
      id: 'x',
      slug: 'dilesa',
      nombre: 'DILESA',
      nombre_comercial: null,
      header_url: null,
    });
    const b = await loadEmpresaBranding(sb, 'x');
    expect(b.sitioWeb).toBe('dilesa.mx');
    expect(b.telefono).toBe('(878) 791-1818');
  });

  it('rdb tiene contacto distinto a dilesa', async () => {
    const sb = mockSupabase({
      id: 'rdb-id',
      slug: 'rdb',
      nombre: 'Rincón del Bosque',
      nombre_comercial: 'RDB',
    });
    const b = await loadEmpresaBranding(sb, 'rdb-id');
    expect(b.sitioWeb).toBe('deportivorincondelbosque.com');
    expect(b.telefono).toBe('(878) 782-4111');
  });

  it('fallback a nombre cuando nombre_comercial es null', async () => {
    const sb = mockSupabase({
      id: 'x',
      slug: 'dilesa',
      nombre: 'DILESA Inmobiliaria',
      nombre_comercial: null,
    });
    const b = await loadEmpresaBranding(sb, 'x');
    expect(b.nombreComercial).toBe('DILESA Inmobiliaria');
  });

  it('fallback de colores cuando faltan en la fila', async () => {
    const sb = mockSupabase({
      id: 'x',
      slug: 'dilesa',
      nombre: 'X',
      nombre_comercial: null,
      color_primario: null,
      color_secundario: null,
    });
    const b = await loadEmpresaBranding(sb, 'x');
    expect(b.colorPrimario).toMatch(/^#/);
    expect(b.colorSecundario).toMatch(/^#/);
  });

  it('headerUrl como http absoluta se preserva tal cual', async () => {
    const sb = mockSupabase({
      id: 'x',
      slug: 'dilesa',
      nombre: 'DILESA',
      header_url: 'https://cdn.dilesa.mx/header.png',
    });
    const b = await loadEmpresaBranding(sb, 'x');
    expect(b.headerUrl).toBe('https://cdn.dilesa.mx/header.png');
  });

  it('headerUrl relativa se resuelve contra el dominio de prod (Next public/)', async () => {
    const sb = mockSupabase({
      id: 'x',
      slug: 'dilesa',
      nombre: 'DILESA',
      header_url: '/brand/dilesa/header-email.png',
    });
    const b = await loadEmpresaBranding(sb, 'x');
    expect(b.headerUrl).toBe('https://bsop.io/brand/dilesa/header-email.png');
  });

  it('headerUrl sin slash inicial se normaliza con uno', async () => {
    const sb = mockSupabase({
      id: 'x',
      slug: 'dilesa',
      nombre: 'DILESA',
      header_url: 'brand/dilesa/header-email.png',
    });
    const b = await loadEmpresaBranding(sb, 'x');
    expect(b.headerUrl).toBe('https://bsop.io/brand/dilesa/header-email.png');
  });
});

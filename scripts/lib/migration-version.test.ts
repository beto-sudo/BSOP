import { describe, it, expect } from 'vitest';
import {
  formatVersion,
  incrementVersion,
  extractVersion,
  nextMigrationVersion,
} from './migration-version';

// Fecha fija para tests deterministas: 2026-06-07 19:30:00 UTC.
const NOW = new Date(Date.UTC(2026, 5, 7, 19, 30, 0));
const NOW_VERSION = '20260607193000';

describe('formatVersion', () => {
  it('formatea a YYYYMMDDHHMMSS en UTC con padding', () => {
    expect(formatVersion(NOW)).toBe(NOW_VERSION);
    // Padding de meses/días/horas de un dígito.
    expect(formatVersion(new Date(Date.UTC(2026, 0, 3, 4, 5, 6)))).toBe('20260103040506');
  });
});

describe('incrementVersion', () => {
  it('suma 1 manteniendo 14 dígitos', () => {
    expect(incrementVersion('20260607190000')).toBe('20260607190001');
  });
  it('produce una versión única aunque no sea fecha real (segundos > 59)', () => {
    // El orden lexicográfico se preserva, que es lo único que importa.
    expect(incrementVersion('20260607190059') > '20260607190059').toBe(true);
  });
});

describe('extractVersion', () => {
  it('extrae el prefijo de 14 dígitos', () => {
    expect(extractVersion('20260607190000_modulo_dilesa_manual.sql')).toBe('20260607190000');
  });
  it('devuelve null si no hay prefijo de 14 dígitos', () => {
    expect(extractVersion('README.md')).toBeNull();
    expect(extractVersion('2026_corto.sql')).toBeNull();
  });
});

describe('nextMigrationVersion', () => {
  it('usa "ahora" cuando no hay nada posterior', () => {
    expect(nextMigrationVersion([], NOW)).toBe(NOW_VERSION);
    expect(nextMigrationVersion(['20250101000000_vieja.sql'], NOW)).toBe(NOW_VERSION);
  });

  it('bumpea +1 cuando ya existe una versión en el mismo segundo (otra sesión)', () => {
    // Caso real que rompió Supabase Preview: dos sesiones, mismo timestamp.
    expect(nextMigrationVersion([NOW_VERSION + '_otra.sql'], NOW)).toBe('20260607193001');
  });

  it('bumpea por encima del máximo aunque haya timestamps futuros', () => {
    // incrementa el máximo en 1 (entero): ...235959 + 1 = ...235960. No es una
    // hora "real" (segundos=60) pero es único y ordena después — que es lo único
    // que importa para schema_migrations.
    expect(nextMigrationVersion(['20260607190000', '20991231235959'], NOW)).toBe('20991231235960');
  });

  it('es estrictamente mayor que todas las versiones existentes', () => {
    const existing = ['20260607193000', '20260607193000', '20260607192959'];
    const next = nextMigrationVersion(existing, NOW);
    for (const v of existing) expect(next > v).toBe(true);
  });

  it('ignora nombres sin prefijo de 14 dígitos', () => {
    expect(nextMigrationVersion(['README.md', 'no-version.sql'], NOW)).toBe(NOW_VERSION);
  });
});

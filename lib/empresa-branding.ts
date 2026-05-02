/**
 * Branding por empresa — fuente única de verdad para assets visuales
 * (logos, membretes) que se usan en print stylesheets, headers de email,
 * etc.
 *
 * Centralizado en Sprint 2C de `tech-debt-h1-2026` para que las pages
 * `/<empresa>/proveedores/page.tsx` no necesiten pasar `logoPath` /
 * `membreteAlt` hardcoded a los módulos. Los módulos resuelven el
 * branding desde `empresaSlug` directo.
 *
 * Ver `docs/planning/tech-debt-h1-2026.md` para contexto.
 */

export type EmpresaSlug = 'dilesa' | 'rdb';

export type EmpresaBranding = {
  /** Path absoluto al asset del logo/membrete (servido desde `/public`). */
  logoPath: string;
  /** Texto alternativo para `<img alt>` cuando se renderiza el membrete. */
  membreteAlt: string;
};

const BRANDING_BY_SLUG: Record<EmpresaSlug, EmpresaBranding> = {
  dilesa: {
    logoPath: '/brand/dilesa/header-email.png',
    membreteAlt: 'Membrete DILESA',
  },
  rdb: {
    logoPath: '/brand/rdb/header-email.png',
    membreteAlt: 'Membrete Rincón del Bosque',
  },
};

/**
 * Devuelve el branding de la empresa por su slug. Si el slug no está
 * mapeado (caso teórico — el tipo `EmpresaSlug` ya lo previene en
 * compile time), retorna fallback BSOP genérico.
 */
export function getEmpresaBranding(slug: EmpresaSlug): EmpresaBranding {
  return BRANDING_BY_SLUG[slug];
}

/**
 * Branding por empresa para emails transaccionales.
 *
 * Lee `core.empresas` para obtener header_url, colores y datos de
 * contacto. Si la empresa no tiene los campos cargados, devuelve
 * defaults razonables (verde olivo DILESA, sin imagen).
 *
 * Diseño: TODOS los emails del repo deberían usar este helper para
 * mantener consistencia visual entre RDB, DILESA, ANSA, COAGAN.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface EmpresaBranding {
  empresaId: string | null;
  nombreComercial: string;
  /** URL absoluta de la imagen del header (banner top del email). */
  headerUrl: string | null;
  /** Color principal de los acentos (header bottom strip, footer band). */
  colorPrimario: string;
  /** Variante oscura del primario (bordes, acentos). */
  colorPrimarioDark: string;
  /** Color para labels y subtítulos secundarios. */
  colorSecundario: string;
  /** Color del texto principal del body. */
  colorTextoTitulo: string;
  /** Color del fondo de bloques destacados (motivos, callouts). */
  colorFondoBrand: string;
  /** Color para texto sobre fondos oscuros (header/footer). */
  colorInverso: string;
  /** Sitio web visible en el footer (sin protocolo). */
  sitioWeb: string;
  /** Teléfono visible en el footer. */
  telefono: string;
}

/** Defaults para empresas sin branding cargado — verde olivo DILESA. */
const DEFAULT_BRANDING: Omit<EmpresaBranding, 'empresaId' | 'nombreComercial'> = {
  headerUrl: null,
  colorPrimario: '#7D812E',
  colorPrimarioDark: '#646725',
  colorSecundario: '#4F4C4D',
  colorTextoTitulo: '#1F1F1F',
  colorFondoBrand: '#FAF7EE',
  colorInverso: '#FFFFFF',
  sitioWeb: 'bsop.io',
  telefono: '',
};

/** Datos de contacto del footer por empresa slug (mientras no haya columna). */
const FOOTER_DATA_BY_SLUG: Record<string, { sitioWeb: string; telefono: string }> = {
  dilesa: { sitioWeb: 'dilesa.mx', telefono: '(878) 791-1818' },
  rdb: { sitioWeb: 'deportivorincondelbosque.com', telefono: '(878) 782-4111' },
  ansa: { sitioWeb: 'ansa.mx', telefono: '' },
  coagan: { sitioWeb: '', telefono: '' },
};

/**
 * Base pública para servir imágenes de branding subidas al bucket
 * `brand-assets` (mismo patrón que `lib/juntas/email.ts`). Si la URL
 * de la empresa empieza con `http(s)://` o `data:`, se devuelve tal cual.
 */
const ASSET_BASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:|data:)/.test(path)) return path;
  if (!ASSET_BASE_URL) return null;
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return `${ASSET_BASE_URL}/storage/v1/object/public/brand-assets${cleaned}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public` por default; para `core.*`
 * casteamos. Mismo patrón que `lib/empresas/admin-guard.ts`.
 */
export async function loadEmpresaBranding(
  client: SupabaseClient,
  empresaId: string | null
): Promise<EmpresaBranding> {
  if (!empresaId) {
    return { ...DEFAULT_BRANDING, empresaId: null, nombreComercial: 'BSOP' };
  }
  const { data } = await (client.schema('core') as any)
    .from('empresas')
    .select(
      'id, slug, nombre, nombre_comercial, header_url, color_primario, color_primario_dark, color_secundario, color_texto_titulo, color_fondo_brand, color_inverso'
    )
    .eq('id', empresaId)
    .maybeSingle();
  if (!data) {
    return { ...DEFAULT_BRANDING, empresaId, nombreComercial: 'BSOP' };
  }
  const slug = (data.slug as string | undefined) ?? '';
  const footer = FOOTER_DATA_BY_SLUG[slug] ?? {
    sitioWeb: DEFAULT_BRANDING.sitioWeb,
    telefono: DEFAULT_BRANDING.telefono,
  };
  return {
    empresaId: data.id as string,
    nombreComercial:
      (data.nombre_comercial as string | null)?.trim() || (data.nombre as string) || 'BSOP',
    headerUrl: resolveAssetUrl(data.header_url as string | null),
    colorPrimario: (data.color_primario as string | null) ?? DEFAULT_BRANDING.colorPrimario,
    colorPrimarioDark:
      (data.color_primario_dark as string | null) ?? DEFAULT_BRANDING.colorPrimarioDark,
    colorSecundario: (data.color_secundario as string | null) ?? DEFAULT_BRANDING.colorSecundario,
    colorTextoTitulo:
      (data.color_texto_titulo as string | null) ?? DEFAULT_BRANDING.colorTextoTitulo,
    colorFondoBrand: (data.color_fondo_brand as string | null) ?? DEFAULT_BRANDING.colorFondoBrand,
    colorInverso: (data.color_inverso as string | null) ?? DEFAULT_BRANDING.colorInverso,
    sitioWeb: footer.sitioWeb,
    telefono: footer.telefono,
  };
}

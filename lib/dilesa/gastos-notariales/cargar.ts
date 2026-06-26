/**
 * Gastos notariales de DILESA — carga de la config vigente desde la DB.
 *
 * Lee `dilesa.gastos_notariales_config` (la fila activa) + sus tabuladores y los
 * mapea a `GastosNotarialesConfig` para alimentar `calcularGastosNotariales`. El
 * mapeo (`mapearConfig`) se separa de la query para poder testearlo sin DB —
 * supabase-js devuelve los `numeric` como string, así que el mapeo los castea.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { GastosNotarialesConfig, TabuladorFila } from './tipos';

type ConfigRow = {
  id: string;
  anio: number;
  isai_pct: number | string;
  muni_certificacion_planos: number | string;
  muni_copias_fotostaticas: number | string;
  muni_avaluo_previo: number | string;
  muni_valuacion_catastral: number | string;
  muni_derechos: number | string;
  rp_clg: number | string;
  rp_aviso_preventivo: number | string;
  apertura_umbral_cuota_fija: number | string;
  apertura_cuota_fija: number | string;
  otros_cnpr_por_derechohabiente: number | string;
  otros_aviso_definitivo: number | string;
  otros_forma_isai: number | string;
  otros_copia_certificada: number | string;
  otros_plano: number | string;
  otros_kinegrama: number | string;
};

type TabuladorRow = {
  tipo: string;
  orden: number;
  limite_inferior: number | string;
  limite_superior: number | string | null;
  valor_beneficio: number | string;
  valor_particular: number | string;
};

/** Mapea las filas de DB a `GastosNotarialesConfig` (puro; castea numerics). */
export function mapearConfig(cfg: ConfigRow, filas: TabuladorRow[]): GastosNotarialesConfig {
  const aFila = (r: TabuladorRow): TabuladorFila => ({
    orden: r.orden,
    limiteInferior: Number(r.limite_inferior),
    limiteSuperior: r.limite_superior == null ? null : Number(r.limite_superior),
    valorBeneficio: Number(r.valor_beneficio),
    valorParticular: Number(r.valor_particular),
  });
  const porTipo = (tipo: string) =>
    filas
      .filter((f) => f.tipo === tipo)
      .sort((a, b) => a.orden - b.orden)
      .map(aFila);
  return {
    anio: cfg.anio,
    isaiPct: Number(cfg.isai_pct),
    muni: {
      certificacionPlanos: Number(cfg.muni_certificacion_planos),
      copiasFotostaticas: Number(cfg.muni_copias_fotostaticas),
      avaluoPrevio: Number(cfg.muni_avaluo_previo),
      valuacionCatastral: Number(cfg.muni_valuacion_catastral),
      derechos: Number(cfg.muni_derechos),
    },
    registroPublico: {
      clg: Number(cfg.rp_clg),
      avisoPreventivo: Number(cfg.rp_aviso_preventivo),
      aperturaUmbralCuotaFija: Number(cfg.apertura_umbral_cuota_fija),
      aperturaCuotaFija: Number(cfg.apertura_cuota_fija),
    },
    otros: {
      cnprPorDerechohabiente: Number(cfg.otros_cnpr_por_derechohabiente),
      avisoDefinitivo: Number(cfg.otros_aviso_definitivo),
      formaIsai: Number(cfg.otros_forma_isai),
      copiaCertificada: Number(cfg.otros_copia_certificada),
      plano: Number(cfg.otros_plano),
      kinegrama: Number(cfg.otros_kinegrama),
    },
    tabuladorCompraventa: porTipo('compraventa'),
    tabuladorApertura: porTipo('apertura'),
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any --
 * acepta clientes tipados y no tipados (admin); mismo patrón que lib/dilesa/notarios.ts. */

/**
 * Carga la config de gastos notariales vigente (activa) de una empresa + sus
 * tabuladores. Devuelve `null` si no hay config activa (el caller cae al input
 * manual sin precarga).
 */
export async function cargarConfigVigente(
  client: SupabaseClient,
  empresaId: string
): Promise<GastosNotarialesConfig | null> {
  const { data: cfg, error } = await (client.schema('dilesa') as any)
    .from('gastos_notariales_config')
    .select(
      'id, anio, isai_pct, muni_certificacion_planos, muni_copias_fotostaticas, muni_avaluo_previo, muni_valuacion_catastral, muni_derechos, rp_clg, rp_aviso_preventivo, apertura_umbral_cuota_fija, apertura_cuota_fija, otros_cnpr_por_derechohabiente, otros_aviso_definitivo, otros_forma_isai, otros_copia_certificada, otros_plano, otros_kinegrama'
    )
    .eq('empresa_id', empresaId)
    .eq('activa', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !cfg) return null;

  const { data: filas } = await (client.schema('dilesa') as any)
    .from('gastos_notariales_tabulador')
    .select('tipo, orden, limite_inferior, limite_superior, valor_beneficio, valor_particular')
    .eq('config_id', (cfg as ConfigRow).id);

  return mapearConfig(cfg as ConfigRow, (filas ?? []) as TabuladorRow[]);
}

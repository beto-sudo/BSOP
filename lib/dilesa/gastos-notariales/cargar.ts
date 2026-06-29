/**
 * Gastos notariales de DILESA — carga de la config vigente desde la DB (v2).
 *
 * Lee `dilesa.gastos_notariales_config` de la **categoría** dada (interés social
 * / residencial medio) + sus tabuladores y los mapea a `GastosNotarialesConfig`.
 * El mapeo (`mapearConfig`) se separa de la query para poder testearlo sin DB —
 * supabase-js devuelve los `numeric` como string, así que el mapeo los castea.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CategoriaNotarial, GastosNotarialesConfig, TabuladorFila } from './tipos';

type ConfigRow = {
  id: string;
  categoria: string;
  anio: number;
  isai_pct: number | string;
  muni_certificacion_planos: number | string;
  muni_copias_fotostaticas: number | string;
  muni_forma_isai: number | string;
  muni_avaluo_previo: number | string;
  muni_valuacion_catastral_pct: number | string;
  muni_derechos: number | string;
  muni_no_adeudo_simas: number | string;
  rp_clg: number | string;
  rp_aviso_preventivo: number | string;
  apertura_umbral_cuota_fija: number | string;
  apertura_cuota_fija: number | string;
  otros_avaluo: number | string;
  otros_cnpc: number | string;
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

const CONFIG_COLS =
  'id, categoria, anio, isai_pct, muni_certificacion_planos, muni_copias_fotostaticas, muni_forma_isai, muni_avaluo_previo, muni_valuacion_catastral_pct, muni_derechos, muni_no_adeudo_simas, rp_clg, rp_aviso_preventivo, apertura_umbral_cuota_fija, apertura_cuota_fija, otros_avaluo, otros_cnpc, otros_cnpr_por_derechohabiente, otros_aviso_definitivo, otros_forma_isai, otros_copia_certificada, otros_plano, otros_kinegrama';

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
    categoria: cfg.categoria as CategoriaNotarial,
    anio: cfg.anio,
    isaiPct: Number(cfg.isai_pct),
    muni: {
      certificacionPlanos: Number(cfg.muni_certificacion_planos),
      copiasFotostaticas: Number(cfg.muni_copias_fotostaticas),
      formaIsai: Number(cfg.muni_forma_isai),
      avaluoPrevio: Number(cfg.muni_avaluo_previo),
      valuacionCatastralPct: Number(cfg.muni_valuacion_catastral_pct),
      derechos: Number(cfg.muni_derechos),
      noAdeudoSimas: Number(cfg.muni_no_adeudo_simas),
    },
    registroPublico: {
      clg: Number(cfg.rp_clg),
      avisoPreventivo: Number(cfg.rp_aviso_preventivo),
      aperturaUmbralCuotaFija: Number(cfg.apertura_umbral_cuota_fija),
      aperturaCuotaFija: Number(cfg.apertura_cuota_fija),
    },
    otros: {
      avaluo: Number(cfg.otros_avaluo),
      cnpc: Number(cfg.otros_cnpc),
      cnpr: Number(cfg.otros_cnpr_por_derechohabiente),
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
 * Carga la config vigente (activa) de una empresa para la **categoría** dada +
 * sus tabuladores. Devuelve `null` si no hay config activa (el caller cae al
 * input manual sin precarga).
 */
export async function cargarConfigVigente(
  client: SupabaseClient,
  empresaId: string,
  categoria: CategoriaNotarial
): Promise<GastosNotarialesConfig | null> {
  const { data: cfg, error } = await (client.schema('dilesa') as any)
    .from('gastos_notariales_config')
    .select(CONFIG_COLS)
    .eq('empresa_id', empresaId)
    .eq('categoria', categoria)
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

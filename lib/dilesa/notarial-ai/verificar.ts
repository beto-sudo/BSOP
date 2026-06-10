/**
 * Verificaciones cruzadas de la extracción notarial (Fase 8) contra los datos
 * de la venta en BSOP. Lógica pura — el route (`analizar-notarial`) carga el
 * contexto de DB y delega aquí.
 *
 * Convención: true = coincide, false = NO coincide (alerta roja en UI),
 * null = sin datos suficientes para comparar.
 */
import type { NotarialExtraccion } from './extraer';

export type VerificacionesNotarial = {
  nss_coincide: boolean | null;
  nombre_coincide: boolean | null;
  domicilio_coincide: boolean | null;
  clabe_es_dilesa: boolean | null;
  vendedor_es_dilesa: boolean | null;
};

export type ContextoVenta = {
  clienteNombre: string;
  clienteNss: string | null;
  unidadManzana: string | null;
  unidadLote: string | null;
  /** CLABEs (18 dígitos) de las cuentas bancarias activas de la empresa. */
  clabesEmpresa: string[];
  /** Razón social y/o nombre de la empresa. */
  razonesEmpresa: string[];
};

export const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export const soloDigitos = (s: string): string => s.replace(/\D/g, '');

export function verificarNotarial(
  e: NotarialExtraccion,
  ctx: ContextoVenta
): VerificacionesNotarial {
  // Nombre: el orden varía (APELLIDOS NOMBRE vs NOMBRE APELLIDOS) → todos los
  // tokens significativos del cliente deben aparecer en el extraído.
  const nombreCliente = norm(ctx.clienteNombre);
  const nombreExtraido = norm(e.nombre_titular);
  const nombre_coincide =
    nombreExtraido && nombreCliente
      ? nombreCliente
          .split(' ')
          .filter((t) => t.length > 2)
          .every((t) => nombreExtraido.includes(t))
      : null;

  const nssExtraido = soloDigitos(e.nss);
  const nssCliente = soloDigitos(ctx.clienteNss ?? '');
  const nss_coincide = nssExtraido && nssCliente ? nssExtraido === nssCliente : null;

  // Domicilio: los formatos INFONAVIT traen "MZ 10 LT 34" — comparamos manzana
  // y lote de la unidad (tolerando ceros a la izquierda y puntos).
  const domicilioExtraido = norm(e.domicilio_inmueble);
  const mz = (ctx.unidadManzana ?? '').toString().replace(/^0+/, '');
  const lt = (ctx.unidadLote ?? '').toString().replace(/^0+/, '');
  const domicilio_coincide =
    domicilioExtraido && mz && lt
      ? new RegExp(`\\bMZ\\.? ?0*${mz}\\b`).test(domicilioExtraido) &&
        new RegExp(`\\bLT\\.? ?0*${lt}\\b`).test(domicilioExtraido)
      : null;

  // CLABE: anti-fraude — el depósito de la detonación debe caer en una cuenta
  // bancaria registrada de la empresa.
  const clabeExtraida = soloDigitos(e.clabe_beneficiario);
  const clabes = new Set(
    ctx.clabesEmpresa.map((c) => soloDigitos(c)).filter((c) => c.length === 18)
  );
  const clabe_es_dilesa =
    clabeExtraida.length === 18 && clabes.size > 0 ? clabes.has(clabeExtraida) : null;

  // Vendedor: fuzzy contra razón social/nombre (los docs truncan o varían
  // "S.A. DE C.V." vs "S.A DE C.V").
  const vendedorExtraido = norm(e.vendedor);
  const razones = ctx.razonesEmpresa.filter(Boolean).map((r) => norm(r));
  const vendedor_es_dilesa = vendedorExtraido
    ? razones.some(
        (r) =>
          r.includes(vendedorExtraido.slice(0, 25)) || vendedorExtraido.includes(r.slice(0, 25))
      )
    : null;

  return { nss_coincide, nombre_coincide, domicilio_coincide, clabe_es_dilesa, vendedor_es_dilesa };
}

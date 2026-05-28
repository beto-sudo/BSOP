/**
 * Conversión de monto numérico a letra en español MX para documentos
 * legales (contratos, escrituras, recibos).
 *
 * Formato canónico DILESA (replica el "Pesos 00/100 M.N." que se usa en
 * las promesas de compraventa de Coda):
 *
 *   formatMontoEnLetras(3405530)
 *   → "Tres Millones Cuatrocientos Cinco Mil Quinientos Treinta Pesos 00/100 M.N."
 *
 *   formatMontoEnLetras(1234.56)
 *   → "Un Mil Doscientos Treinta y Cuatro Pesos 56/100 M.N."
 *
 *   formatMontoEnLetras(0)
 *   → "Cero Pesos 00/100 M.N."
 *
 * Convenciones:
 * - Title Case: cada palabra inicia en mayúscula (estilo notarial mexicano).
 * - Centavos en 2 dígitos sufijo "/100 M.N." (Moneda Nacional).
 * - "Un Mil" en vez de "Mil" para arrancar (más legal-friendly).
 * - "Veintiún Mil" (no "Veintiun Mil"), "Veintiún Pesos" sin tilde en
 *   formas compuestas estándar.
 * - Soporta hasta 999,999,999.99. Más allá lanza Error explícito.
 */

const UNIDADES = ['', 'Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve'];

const ESPECIALES = [
  'Diez',
  'Once',
  'Doce',
  'Trece',
  'Catorce',
  'Quince',
  'Dieciséis',
  'Diecisiete',
  'Dieciocho',
  'Diecinueve',
];

const VEINTES = [
  'Veinte',
  'Veintiuno',
  'Veintidós',
  'Veintitrés',
  'Veinticuatro',
  'Veinticinco',
  'Veintiséis',
  'Veintisiete',
  'Veintiocho',
  'Veintinueve',
];

const DECENAS = [
  '',
  '',
  'Veinte',
  'Treinta',
  'Cuarenta',
  'Cincuenta',
  'Sesenta',
  'Setenta',
  'Ochenta',
  'Noventa',
];

const CENTENAS = [
  '',
  'Ciento',
  'Doscientos',
  'Trescientos',
  'Cuatrocientos',
  'Quinientos',
  'Seiscientos',
  'Setecientos',
  'Ochocientos',
  'Novecientos',
];

function letrasDeCentenas(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'Cien';
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES[n - 10];
  if (n < 30) return VEINTES[n - 20];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`;
  }
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return resto === 0 ? CENTENAS[c] : `${CENTENAS[c]} ${letrasDeCentenas(resto)}`;
}

function letrasDeMiles(n: number): string {
  if (n === 0) return '';
  if (n < 1000) return letrasDeCentenas(n);
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  // "Un Mil" en vez de "Uno Mil" — para arranque legal estándar.
  const prefijoMiles =
    miles === 1 ? 'Un' : miles < 1000 ? letrasDeCentenas(miles) : letrasDeMiles(miles);
  const sufijo = resto === 0 ? '' : ` ${letrasDeCentenas(resto)}`;
  return `${prefijoMiles} Mil${sufijo}`;
}

function letrasDeMillones(n: number): string {
  if (n < 1_000_000) return letrasDeMiles(n);
  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const prefijoMillones = millones === 1 ? 'Un Millón' : `${letrasDeCentenas(millones)} Millones`;
  const sufijo = resto === 0 ? '' : ` ${letrasDeMiles(resto)}`;
  return `${prefijoMillones}${sufijo}`;
}

/**
 * Convierte un monto a letras en español MX con sufijo "Pesos NN/100 M.N."
 *
 * @param monto Cantidad en pesos (puede tener decimales). Si es NaN/Infinity,
 *   retorna `'Cero Pesos 00/100 M.N.'`.
 * @throws Error si `monto < 0` o `monto >= 1_000_000_000`. No silenciamos:
 *   un contrato con monto fuera de rango debe fallar visible, no escribir
 *   una letra mal.
 */
export function formatMontoEnLetras(monto: number): string {
  if (!Number.isFinite(monto)) return 'Cero Pesos 00/100 M.N.';
  if (monto < 0) throw new Error(`formatMontoEnLetras: monto negativo no soportado (${monto})`);
  if (monto >= 1_000_000_000) {
    throw new Error(`formatMontoEnLetras: monto >= mil millones no soportado (${monto})`);
  }
  // Redondear a 2 decimales para evitar artefactos de punto flotante.
  const redondeado = Math.round(monto * 100) / 100;
  const enteros = Math.floor(redondeado);
  const centavos = Math.round((redondeado - enteros) * 100);
  const centavosStr = String(centavos).padStart(2, '0');
  const letrasEnteros = enteros === 0 ? 'Cero' : letrasDeMillones(enteros);
  return `${letrasEnteros} Pesos ${centavosStr}/100 M.N.`;
}

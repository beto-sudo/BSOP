/**
 * Revisión asistida del Aviso PLD (Informe de Avisos de Actividades
 * Vulnerables del SPPLD) — iniciativa `dilesa-ventas-captura-colaborativa`,
 * Sprint 3.
 *
 * Dos capas:
 *   1. Extracción IA (visión sobre el PDF — el informe no tiene formato
 *      estructurado): schema zod abajo, convención del repo para schemas
 *      Anthropic — cero nullable, strings ausentes = "", números = 0, sin
 *      `.int()`.
 *   2. CRUCE DETERMINISTA contra el expediente (este archivo, funciones
 *      puras y testeables): los 10 checks del planning doc con severidad
 *      error/warning y detalle "esperado vs encontrado".
 *
 * Veredicto: rojo (algún error falla) | advertencias (solo warnings
 * fallan) | verde (todo ok). El gate de cierre exige verde u override de
 * Dirección.
 */

import { z } from 'zod';
import type { CfdiCheck } from './cfdi-validacion';

/** Mismo shape que los checks de CFDI — un solo lenguaje de semáforo. */
export type RevisionCheck = CfdiCheck;

export const ExtraccionPldSchema = z.object({
  rfcSujetoObligado: z.string().describe('RFC del sujeto obligado (encabezado). "" si no aparece.'),
  sujetoObligado: z.string().describe('Nombre del sujeto obligado. "" si no aparece.'),
  mesReportado: z
    .string()
    .describe('MES REPORTADO en formato YYYYMM tal como aparece (ej. "202606"). "" si no aparece.'),
  referenciaAviso: z.string().describe('Referencia del aviso. "" si no aparece.'),
  tipoAlerta: z
    .string()
    .describe('Tipo de alerta de la sección "Alerta del aviso" (ej. "SIN ALERTA").'),
  personaNombre: z.string().describe('Nombre(s) de la persona objeto del aviso.'),
  personaApellidoPaterno: z.string().describe('Apellido paterno de la persona objeto.'),
  personaApellidoMaterno: z.string().describe('Apellido materno de la persona objeto.'),
  personaRfc: z.string().describe('RFC de la persona objeto del aviso. "" si no aparece.'),
  fechaOperacion: z
    .string()
    .describe('Fecha de la operación en formato YYYY-MM-DD (el PDF la trae DD/MM/YYYY).'),
  tipoOperacion: z.string().describe('Tipo de operación (ej. "COMPRA VENTA DE INMUEBLES").'),
  figuraCliente: z.string().describe('Figura del cliente reportado en el aviso (ej. "COMPRADOR").'),
  valorPactado: z.number().describe('Valor pactado del inmueble (número, sin separadores).'),
  inmuebleCalle: z.string().describe('Calle/avenida del inmueble. "" si no aparece.'),
  inmuebleNumeroExterior: z.string().describe('Número exterior del inmueble. "" si no aparece.'),
  inmuebleM2Terreno: z
    .number()
    .describe('Dimensión del inmueble en m² de terreno. 0 si no aparece.'),
  inmuebleM2Construidos: z.number().describe('Dimensión en m² construidos. 0 si no aparece.'),
  folioReal: z.string().describe('Folio real del inmueble. "" si no aparece.'),
  numeroInstrumento: z
    .string()
    .describe('Número del instrumento público (sección Escrituración). "" si no aparece.'),
  fechaInstrumento: z
    .string()
    .describe('Fecha del instrumento público en formato YYYY-MM-DD. "" si no aparece.'),
  numeroNotario: z
    .string()
    .describe('Número del notario del instrumento público. "" si no aparece.'),
  valorAvaluo: z.number().describe('Valor avalúo o valor catastral. 0 si no aparece.'),
  liquidaciones: z
    .array(
      z.object({
        fecha: z.string().describe('Fecha de pago en formato YYYY-MM-DD.'),
        monto: z.number().describe('Monto de la operación.'),
      })
    )
    .describe('Todas las filas de DATOS DE LIQUIDACIÓN (puede haber varias).'),
});

export type ExtraccionPld = z.infer<typeof ExtraccionPldSchema>;

export const PROMPT_EXTRACCION_PLD =
  `Eres un oficial de cumplimiento PLD (LFPIORPI) de una desarrolladora inmobiliaria mexicana. ` +
  `El PDF es un "Informe de avisos de actividades vulnerables" del portal SPPLD de Hacienda ` +
  `(actividad: transmisión de derechos sobre bienes inmuebles). Extrae los campos EXACTAMENTE ` +
  `como aparecen.` +
  `\n\nReglas:` +
  `\n- Fechas: el PDF las trae DD/MM/YYYY — conviértelas a YYYY-MM-DD.` +
  `\n- Montos como números con sus decimales exactos, sin separadores de miles.` +
  `\n- "DATOS DE LIQUIDACIÓN" puede tener varias filas de pago — extrae TODAS.` +
  `\n- Campos string ausentes = "" y números ausentes = 0 (NO inventes valores).`;

/** Snapshot del expediente de la venta contra el que se cruza el PLD. */
export type ExpedientePld = {
  empresaRfc: string;
  clienteNombre: string | null;
  clienteApellidoPaterno: string | null;
  clienteApellidoMaterno: string | null;
  clienteRfc: string | null;
  valorEscrituracion: number | null;
  montoAvaluo: number | null;
  numeroEscritura: string | null;
  /** YYYY-MM-DD. */
  fechaEscritura: string | null;
  numeroNotaria: string | null;
  unidadCalle: string | null;
  unidadNumeroOficial: string | null;
  unidadM2Terreno: number | null;
  unidadM2Construccion: number | null;
  /** Montos de los depósitos registrados (erp.cxc_pagos de la venta). El techo de
   *  la banda de liquidaciones del aviso (crédito + enganche = todo lo recibido). */
  depositos: number[];
  /**
   * Descuento "perdonado" (no cobrado) = descuento aplicado − cheque a notaría
   * girado, ≥ 0 (del motor de cuadratura). Las liquidaciones del aviso quedan
   * por debajo del valor pactado EXACTAMENTE en este monto — es el descuento
   * que no entró como pago (el cheque a notaría sí entró y luego salió). Sin
   * esto, una operación con descuento marca un falso descuadre por el monto del
   * descuento perdonado. 0 cuando no hay descuento. Es el hueco del lado GASTOS.
   */
  descuentoPerdonado: number;
  /**
   * Saldo del PRECIO que DILESA absorbe con una nota de crédito (`saldoPrecio-
   * PorCubrir` de la cuadratura cuando Dirección lo resuelve como `absorber` en
   * la dictaminación). Cuando el crédito + enganche no alcanzan el valor de
   * escrituración y DILESA come la diferencia (NC autorizada por Dirección), esa
   * diferencia NUNCA entra como liquidación — el aviso reporta solo lo que se
   * recibió (crédito + enganche). Sin restarlo, el piso de liquidaciones marca un
   * falso descuadre por el monto de la NC. Es el hueco del lado PRECIO, distinto
   * de `descuentoPerdonado` (gastos); no se doble-cuentan. 0 cuando el precio se
   * cubre completo o el residual se resuelve como `cobrar` (pagaré: el cliente sí
   * lo paga). Ver [[reference_dilesa_pld_liquidaciones_banda]].
   */
  saldoPrecioAbsorbidoDilesa: number;
};

// ── Normalización ───────────────────────────────────────────────────────

/**
 * Mayúsculas, sin diacríticos (acentos Y virgulilla: ñ → n, a propósito —
 * el SPPLD suele capturar sin ñ), espacios colapsados. Para comparar textos.
 */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Solo dígitos (números de instrumento/notario llegan como "25" o "No. 25"). */
function soloDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

function montosIguales(a: number, b: number, tolerancia = 0.5): boolean {
  return Math.abs(a - b) <= tolerancia;
}

const ok = (
  clave: string,
  label: string,
  severidad: RevisionCheck['severidad']
): RevisionCheck => ({
  clave,
  label,
  ok: true,
  severidad,
});
const falla = (
  clave: string,
  label: string,
  severidad: RevisionCheck['severidad'],
  detalle: string
): RevisionCheck => ({ clave, label, ok: false, severidad, detalle });

const fmtMx = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const money = (n: number | null | undefined): string => (n == null ? '—' : fmtMx.format(n));

// ── Cruce determinista (los 10 checks del planning doc) ────────────────

export function cruzarPldConExpediente(ext: ExtraccionPld, exp: ExpedientePld): RevisionCheck[] {
  const checks: RevisionCheck[] = [];

  // 1. RFC del sujeto obligado = la empresa.
  const rfcSujeto = normalizarTexto(ext.rfcSujetoObligado);
  checks.push(
    rfcSujeto === normalizarTexto(exp.empresaRfc)
      ? ok('sujeto_obligado', 'Sujeto obligado = DILESA', 'error')
      : falla(
          'sujeto_obligado',
          'Sujeto obligado = DILESA',
          'error',
          `El aviso es del RFC ${ext.rfcSujetoObligado || '—'}; se esperaba ${exp.empresaRfc}.`
        )
  );

  // 2a. RFC de la persona objeto = cliente de la venta.
  if (exp.clienteRfc) {
    const rfcPersona = normalizarTexto(ext.personaRfc);
    checks.push(
      rfcPersona === normalizarTexto(exp.clienteRfc)
        ? ok('persona_rfc', 'RFC de la persona objeto = cliente', 'error')
        : falla(
            'persona_rfc',
            'RFC de la persona objeto = cliente',
            'error',
            `El aviso reporta a ${ext.personaRfc || '—'}; el cliente de la venta es ${exp.clienteRfc}.`
          )
    );
  } else {
    checks.push(
      falla(
        'persona_rfc',
        'RFC de la persona objeto = cliente',
        'warning',
        'El cliente de la venta no tiene RFC capturado — no se pudo validar.'
      )
    );
  }

  // 2b. Nombre completo (warning — formatos varían).
  const nombrePld = normalizarTexto(
    `${ext.personaNombre} ${ext.personaApellidoPaterno} ${ext.personaApellidoMaterno}`
  );
  const nombreVenta = normalizarTexto(
    `${exp.clienteNombre ?? ''} ${exp.clienteApellidoPaterno ?? ''} ${exp.clienteApellidoMaterno ?? ''}`
  );
  checks.push(
    nombreVenta && nombrePld === nombreVenta
      ? ok('persona_nombre', 'Nombre de la persona objeto = cliente', 'warning')
      : falla(
          'persona_nombre',
          'Nombre de la persona objeto = cliente',
          'warning',
          `El aviso dice "${nombrePld || '—'}"; la venta tiene "${nombreVenta || '—'}".`
        )
  );

  // 3. Figura y tipo de operación.
  const figuraOk = normalizarTexto(ext.figuraCliente).includes('COMPRADOR');
  const tipoOk = normalizarTexto(ext.tipoOperacion).includes('COMPRA');
  checks.push(
    figuraOk && tipoOk
      ? ok('operacion_tipo', 'Compra-venta con cliente COMPRADOR', 'error')
      : falla(
          'operacion_tipo',
          'Compra-venta con cliente COMPRADOR',
          'error',
          `Figura "${ext.figuraCliente || '—'}", tipo "${ext.tipoOperacion || '—'}".`
        )
  );

  // 4. Valor pactado = valor de escrituración.
  if (exp.valorEscrituracion != null) {
    checks.push(
      montosIguales(ext.valorPactado, exp.valorEscrituracion)
        ? ok('valor_pactado', 'Valor pactado = valor de escrituración', 'error')
        : falla(
            'valor_pactado',
            'Valor pactado = valor de escrituración',
            'error',
            `El aviso declara ${money(ext.valorPactado)}; la venta escrituró por ${money(exp.valorEscrituracion)}.`
          )
    );
  } else {
    checks.push(
      falla(
        'valor_pactado',
        'Valor pactado = valor de escrituración',
        'warning',
        'La venta no tiene valor de escrituración capturado (Fase 8).'
      )
    );
  }

  // 5. Domicilio + superficies del inmueble (warnings — formatos varían).
  const callePld = normalizarTexto(ext.inmuebleCalle);
  const calleVenta = normalizarTexto(exp.unidadCalle);
  const numOk =
    soloDigitos(ext.inmuebleNumeroExterior) === soloDigitos(exp.unidadNumeroOficial) &&
    soloDigitos(exp.unidadNumeroOficial) !== '';
  const calleOk =
    !!calleVenta && (callePld.includes(calleVenta) || calleVenta.includes(callePld)) && !!callePld;
  checks.push(
    calleOk && numOk
      ? ok('inmueble_domicilio', 'Domicilio del inmueble = unidad', 'warning')
      : falla(
          'inmueble_domicilio',
          'Domicilio del inmueble = unidad',
          'warning',
          `El aviso dice "${ext.inmuebleCalle} ${ext.inmuebleNumeroExterior}"; la unidad es "${exp.unidadCalle ?? '—'} ${exp.unidadNumeroOficial ?? ''}".`
        )
  );

  const m2TerrenoOk =
    exp.unidadM2Terreno == null || montosIguales(ext.inmuebleM2Terreno, exp.unidadM2Terreno, 1);
  const m2ConstrOk =
    exp.unidadM2Construccion == null ||
    montosIguales(ext.inmuebleM2Construidos, exp.unidadM2Construccion, 1);
  checks.push(
    m2TerrenoOk && m2ConstrOk
      ? ok('inmueble_superficies', 'Superficies (m² terreno / construidos)', 'warning')
      : falla(
          'inmueble_superficies',
          'Superficies (m² terreno / construidos)',
          'warning',
          `El aviso dice ${ext.inmuebleM2Terreno} / ${ext.inmuebleM2Construidos} m²; la unidad tiene ${exp.unidadM2Terreno ?? '—'} / ${exp.unidadM2Construccion ?? '—'} m².`
        )
  );

  // 6. Escrituración: instrumento (error) + fecha y notario (warnings).
  if (exp.numeroEscritura) {
    checks.push(
      soloDigitos(ext.numeroInstrumento) === soloDigitos(exp.numeroEscritura)
        ? ok('instrumento', 'Número de instrumento = escritura (F11)', 'error')
        : falla(
            'instrumento',
            'Número de instrumento = escritura (F11)',
            'error',
            `El aviso dice instrumento ${ext.numeroInstrumento || '—'}; la venta escrituró con el ${exp.numeroEscritura}.`
          )
    );
  } else {
    checks.push(
      falla(
        'instrumento',
        'Número de instrumento = escritura (F11)',
        'warning',
        'La venta no tiene número de escritura capturado (Fase 11).'
      )
    );
  }

  checks.push(
    exp.fechaEscritura && ext.fechaInstrumento === exp.fechaEscritura
      ? ok('instrumento_fecha', 'Fecha del instrumento = escritura', 'warning')
      : falla(
          'instrumento_fecha',
          'Fecha del instrumento = escritura',
          'warning',
          `El aviso dice ${ext.fechaInstrumento || '—'}; la venta registra ${exp.fechaEscritura ?? '—'}.`
        )
  );

  checks.push(
    exp.numeroNotaria && soloDigitos(ext.numeroNotario) === soloDigitos(exp.numeroNotaria)
      ? ok('notario', 'Número de notario = notaría de la venta', 'warning')
      : falla(
          'notario',
          'Número de notario = notaría de la venta',
          'warning',
          `El aviso dice notario ${ext.numeroNotario || '—'}; la venta usó la notaría ${exp.numeroNotaria ?? '—'}.`
        )
  );

  // 7. Valor avalúo (warning).
  checks.push(
    exp.montoAvaluo != null && montosIguales(ext.valorAvaluo, exp.montoAvaluo)
      ? ok('avaluo', 'Valor avalúo = avalúo de la venta (F5)', 'warning')
      : falla(
          'avaluo',
          'Valor avalúo = avalúo de la venta (F5)',
          'warning',
          `El aviso dice ${money(ext.valorAvaluo)}; la venta registra ${money(exp.montoAvaluo)}.`
        )
  );

  // 8. Liquidaciones del aviso dentro de la BANDA esperada (warnings). El oficial
  //    de cumplimiento captura las liquidaciones de dos formas igualmente válidas:
  //    solo el PRECIO (el crédito que liquida el inmueble) o el precio MÁS el
  //    enganche que el cliente aportó (parte del cual fondea gastos notariales). Por
  //    eso no se exige igualdad exacta sino una banda [piso, techo]:
  //      - piso  = valor pactado − descuento perdonado (gastos) − saldo del precio
  //                absorbido por DILESA vía NC (precio): el precio que REALMENTE
  //                liquidó el inmueble, neto de lo que DILESA no cobra. Por debajo
  //                = sub-declaración.
  //      - techo = total de depósitos recibidos (crédito + enganche): todo el dinero
  //                que entró. Por arriba = el aviso declara más de lo que se recibió.
  //    El ancho de la banda = el enganche que excede el precio (lo que fondea gastos)
  //    — exactamente la ambigüedad legítima de captura. Casos reales: Christopher
  //    M3-L16 (reportó solo el precio → cae en el piso) y Nancy M22-L1 (reportó todos
  //    los depósitos → cae en el techo); ambos cuadran. Julio Cesar M11-L4: el crédito
  //    + enganche NO alcanzan el valor de escrituración y DILESA absorbe el residual
  //    ($4,689) con una NC → sin restarlo el piso marcaba un falso descuadre (#1160+).
  const totalLiquidaciones = ext.liquidaciones.reduce((s, l) => s + (l.monto || 0), 0);
  const perdonado = Math.max(0, exp.descuentoPerdonado);
  const absorbidoPrecio = Math.max(0, exp.saldoPrecioAbsorbidoDilesa);
  const totalDepositos = exp.depositos.reduce((s, m) => s + (m || 0), 0);
  const piso = ext.valorPactado - perdonado - absorbidoPrecio;
  const techo = Math.max(totalDepositos, piso); // si los depósitos no alcanzan el piso, la banda colapsa al precio

  // Piso: el aviso no declara MENOS que el precio liquidado (neto de lo que DILESA
  // no cobra: descuento perdonado del lado gastos + residual del precio absorbido
  // con nota de crédito).
  const deducciones: string[] = [];
  if (perdonado > 0) deducciones.push(`descuento perdonado ${money(perdonado)}`);
  if (absorbidoPrecio > 0)
    deducciones.push(
      `saldo del precio absorbido por DILESA (nota de crédito) ${money(absorbidoPrecio)}`
    );
  checks.push(
    totalLiquidaciones >= piso - 1
      ? ok('liq_vs_pactado', 'Σ liquidaciones ≥ precio (neto de descuento)', 'warning')
      : falla(
          'liq_vs_pactado',
          'Σ liquidaciones ≥ precio (neto de descuento)',
          'warning',
          deducciones.length > 0
            ? `Las liquidaciones del aviso suman ${money(totalLiquidaciones)}; el precio neto (valor pactado ${money(ext.valorPactado)} − ${deducciones.join(' − ')}) es ${money(piso)}. Faltan ${money(piso - totalLiquidaciones)}.`
            : `Las liquidaciones del aviso suman ${money(totalLiquidaciones)}; el valor pactado es ${money(ext.valorPactado)} (faltan ${money(piso - totalLiquidaciones)}).`
        )
  );

  // Techo: el aviso no declara MÁS dinero del que efectivamente entró (depósitos).
  checks.push(
    totalLiquidaciones <= techo + 1
      ? ok('liq_vs_depositos', 'Σ liquidaciones ≤ depósitos recibidos', 'warning')
      : falla(
          'liq_vs_depositos',
          'Σ liquidaciones ≤ depósitos recibidos',
          'warning',
          `Las liquidaciones del aviso suman ${money(totalLiquidaciones)}; los depósitos registrados en la venta suman ${money(totalDepositos)} (el aviso declara ${money(totalLiquidaciones - techo)} de más).`
        )
  );

  // 9. Mes reportado: mes de la operación o el siguiente (plazo LFPIORPI:
  //    el aviso se presenta a más tardar el día 17 del mes siguiente).
  const mesOperacion = ext.fechaOperacion.slice(0, 7).replace('-', ''); // YYYYMM
  const mesSiguiente = (() => {
    const y = Number(ext.fechaOperacion.slice(0, 4));
    const m = Number(ext.fechaOperacion.slice(5, 7));
    if (!y || !m) return '';
    const next = m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, '0')}`;
    return next;
  })();
  checks.push(
    !!ext.mesReportado && (ext.mesReportado === mesOperacion || ext.mesReportado === mesSiguiente)
      ? ok('mes_reportado', 'Mes reportado dentro del plazo del aviso', 'warning')
      : falla(
          'mes_reportado',
          'Mes reportado dentro del plazo del aviso',
          'warning',
          `Mes reportado ${ext.mesReportado || '—'} con operación del ${ext.fechaOperacion || '—'} — se esperaba ${mesOperacion} o ${mesSiguiente}.`
        )
  );

  // 10. Sin alerta.
  const alerta = normalizarTexto(ext.tipoAlerta);
  checks.push(
    alerta === '' || alerta === 'SIN ALERTA'
      ? ok('alerta', 'Aviso sin alerta', 'error')
      : falla(
          'alerta',
          'Aviso sin alerta',
          'error',
          `El aviso trae alerta "${ext.tipoAlerta}" — revisar con Dirección antes de avanzar.`
        )
  );

  return checks;
}

// ── Facturación: nota de crédito que exige la cuadratura ────────────────

/**
 * Umbral (MXN) para considerar que la operación REQUIERE nota de crédito.
 * El motor de cuadratura redondea `valorFacturado` y `valorRealVentaDilesa`
 * por separado, así que su diferencia (`montoNotaCredito`) puede traer ruido
 * de centavos en operaciones sin descuento. Una NC real es del orden del
 * descuento / cheque a notaría (cientos a miles). 1 peso filtra el ruido sin
 * dejar pasar NCs legítimas. Ajustable si Beto quiere otra política.
 */
export const UMBRAL_NOTA_CREDITO = 1;

/** Insumos del check de NC: el monto que exige la cuadratura + presencia y
 *  monto de los documentos de NC vigentes en el expediente. */
export type ExpedienteFacturacion = {
  /** `montoNotaCredito` del motor (valorFacturado − valorRealVentaDilesa). */
  montoNotaCreditoEsperado: number;
  /** Total del XML de NC vigente; null si no hay XML de NC. */
  ncXmlTotal: number | null;
  ncXmlPresente: boolean;
  ncPdfPresente: boolean;
};

export function requiereNotaCredito(montoNotaCreditoEsperado: number): boolean {
  return montoNotaCreditoEsperado > UMBRAL_NOTA_CREDITO;
}

/**
 * Checks DETERMINISTAS de facturación (sin IA — la cuadratura ya sabe el
 * monto exacto). Cuando la operación factura más de lo que DILESA realmente
 * recibe (cheque a notaría / descuento), debe expedirse una nota de crédito
 * por la diferencia; este grupo exige su XML y PDF en el expediente y los
 * pone en rojo si faltan. Clave prefijo `fact_` → bloque propio en la UI y
 * en `separarChecks` (no estorba al flujo PLD informe→acuse).
 */
export function checksFacturacion(f: ExpedienteFacturacion): RevisionCheck[] {
  if (!requiereNotaCredito(f.montoNotaCreditoEsperado)) {
    return [ok('fact_nc', 'No se requiere nota de crédito (facturado = valor real)', 'error')];
  }

  const checks: RevisionCheck[] = [];
  const esperado = money(f.montoNotaCreditoEsperado);

  checks.push(
    f.ncXmlPresente
      ? ok('fact_nc_xml', 'XML de la nota de crédito capturado', 'error')
      : falla(
          'fact_nc_xml',
          'XML de la nota de crédito capturado',
          'error',
          `La cuadratura exige nota de crédito por ${esperado} (facturado − valor real venta DILESA). Sube el XML de la NC en Documentos y re-ejecuta la revisión.`
        )
  );

  checks.push(
    f.ncPdfPresente
      ? ok('fact_nc_pdf', 'PDF de la nota de crédito capturado', 'error')
      : falla(
          'fact_nc_pdf',
          'PDF de la nota de crédito capturado',
          'error',
          'Falta el PDF de la nota de crédito (la representación impresa del CFDI). Súbelo en Documentos y re-ejecuta la revisión.'
        )
  );

  // Monto: el XML de la NC debe cuadrar con lo que calcula el motor.
  if (f.ncXmlPresente && f.ncXmlTotal != null) {
    checks.push(
      montosIguales(f.ncXmlTotal, f.montoNotaCreditoEsperado, 1)
        ? ok('fact_nc_monto', 'Monto de la NC coincide con la cuadratura', 'warning')
        : falla(
            'fact_nc_monto',
            'Monto de la NC coincide con la cuadratura',
            'warning',
            `El XML de la NC es por ${money(f.ncXmlTotal)}; la cuadratura esperaba ${esperado} (diferencia ${money(f.ncXmlTotal - f.montoNotaCreditoEsperado)}).`
          )
    );
  }

  return checks;
}

export type VeredictoRevision = 'verde' | 'advertencias' | 'rojo';

export function veredictoDe(checks: RevisionCheck[]): VeredictoRevision {
  if (checks.some((c) => !c.ok && c.severidad === 'error')) return 'rojo';
  if (checks.some((c) => !c.ok)) return 'advertencias';
  return 'verde';
}

// ── Acuse de envío SPPLD (cierre del ciclo — decisión Beto 2026-06-12) ──

export const ExtraccionAcuseSchema = z.object({
  folioAcuse: z
    .string()
    .describe('FOLIO del acuse (esquina superior, ej. "18825514"). "" si no aparece.'),
  rfcSujetoObligado: z.string().describe('RFC del sujeto obligado (sección I). "" si no aparece.'),
  fechaPresentacion: z
    .string()
    .describe(
      'FECHA DE ENVÍO de la tabla "Avisos Reportados" en formato YYYY-MM-DD (el PDF la trae DD/MM/YYYY con hora — solo la fecha).'
    ),
  estatusEnvio: z
    .string()
    .describe('ESTATUS DEL ENVÍO de la tabla (ej. "ACEPTADO"). "" si no aparece.'),
  actividadVulnerable: z
    .string()
    .describe(
      'ACTIVIDAD VULNERABLE REALIZADA de la tabla (ej. "TRANSMISION DE DERECHOS SOBRE BIENES INMUEBLES"). "" si no aparece.'
    ),
  tipoEnvio: z.string().describe('TIPO DE ENVÍO de la tabla (ej. "PORTAL"). "" si no aparece.'),
  numeroAvisos: z.number().describe('NÚMERO DE AVISOS que ampara el acuse. 0 si no aparece.'),
  referenciaAviso: z
    .string()
    .describe(
      'Referencia individual del aviso SOLO si el acuse la lista explícitamente (el formato estándar NO la trae). "" si no aparece.'
    ),
});

export type ExtraccionAcuse = z.infer<typeof ExtraccionAcuseSchema>;

export const PROMPT_EXTRACCION_ACUSE =
  `Eres un oficial de cumplimiento PLD (LFPIORPI). El PDF es el ACUSE "Presentación de Avisos" ` +
  `de la Secretaría de Hacienda (SPPLD) — el comprobante de que los avisos de actividades ` +
  `vulnerables SE ENVIARON. Estructura típica: FOLIO arriba; sección "I. Sujeto Obligado" (RFC, ` +
  `denominación); sección "II. Avisos Reportados" con una tabla: ACTIVIDAD VULNERABLE REALIZADA, ` +
  `TIPO DE ENVÍO, FECHA DE ENVÍO, NÚMERO DE AVISOS y ESTATUS DEL ENVÍO; al pie los sellos ` +
  `digitales (FIEL/SAT) y la cadena original.` +
  `\n\nReglas:` +
  `\n- Fechas en formato YYYY-MM-DD (el PDF las trae DD/MM/YYYY, a veces con hora — solo la fecha).` +
  `\n- Campos string ausentes = "" y números ausentes = 0 (NO inventes valores).`;

/**
 * Checks del acuse contra el informe revisado y la empresa. El acuse cierra
 * el ciclo: comprueba que el aviso (el informe ya cruzado) efectivamente se
 * PRESENTÓ ante Hacienda.
 */
export function cruzarAcuseConInforme(
  acuse: ExtraccionAcuse,
  informe: ExtraccionPld,
  empresaRfc: string
): RevisionCheck[] {
  const checks: RevisionCheck[] = [];

  // RFC del sujeto obligado.
  if (acuse.rfcSujetoObligado) {
    checks.push(
      normalizarTexto(acuse.rfcSujetoObligado) === normalizarTexto(empresaRfc)
        ? ok('acuse_rfc', 'Acuse a nombre de DILESA', 'error')
        : falla(
            'acuse_rfc',
            'Acuse a nombre de DILESA',
            'error',
            `El acuse es del RFC ${acuse.rfcSujetoObligado}; se esperaba ${empresaRfc}.`
          )
    );
  } else {
    checks.push(
      falla(
        'acuse_rfc',
        'Acuse a nombre de DILESA',
        'warning',
        'El acuse no trae RFC legible — verificar manualmente.'
      )
    );
  }

  // Estatus del envío: el check central del acuse — ACEPTADO o no cuenta.
  const estatus = normalizarTexto(acuse.estatusEnvio);
  if (estatus) {
    checks.push(
      estatus === 'ACEPTADO'
        ? ok('acuse_estatus', 'Envío ACEPTADO por Hacienda', 'error')
        : falla(
            'acuse_estatus',
            'Envío ACEPTADO por Hacienda',
            'error',
            `El acuse reporta estatus "${acuse.estatusEnvio}" — el aviso no quedó aceptado.`
          )
    );
  } else {
    checks.push(
      falla(
        'acuse_estatus',
        'Envío ACEPTADO por Hacienda',
        'warning',
        'No se pudo leer el estatus del envío — verificar manualmente que diga ACEPTADO.'
      )
    );
  }

  // Actividad vulnerable: debe ser la misma del informe (inmuebles).
  const actAcuse = normalizarTexto(acuse.actividadVulnerable);
  const actInforme = normalizarTexto(informe.tipoOperacion);
  checks.push(
    actAcuse && (actAcuse.includes('INMUEBLE') || actAcuse === actInforme)
      ? ok('acuse_actividad', 'Actividad: transmisión de derechos sobre inmuebles', 'warning')
      : falla(
          'acuse_actividad',
          'Actividad: transmisión de derechos sobre inmuebles',
          'warning',
          `El acuse ampara "${acuse.actividadVulnerable || '—'}".`
        )
  );

  // Correspondencia acuse ↔ informe. El formato estándar NO trae referencia
  // individual: si ambos la traen se exige exacta; si no, la FECHA DE ENVÍO
  // debe caer en la ventana de presentación de la operación del informe
  // (del día de la operación al día 17 del mes siguiente). Acuse de lote
  // (numeroAvisos > 1, esquema masivo histórico) queda señalado.
  const limite = (() => {
    const y = Number(informe.fechaOperacion.slice(0, 4));
    const m = Number(informe.fechaOperacion.slice(5, 7));
    if (!y || !m) return '';
    return m === 12 ? `${y + 1}-01-17` : `${y}-${String(m + 1).padStart(2, '0')}-17`;
  })();

  if (acuse.referenciaAviso && informe.referenciaAviso) {
    checks.push(
      normalizarTexto(acuse.referenciaAviso) === normalizarTexto(informe.referenciaAviso)
        ? ok('acuse_correspondencia', 'Acuse corresponde al aviso del informe', 'error')
        : falla(
            'acuse_correspondencia',
            'Acuse corresponde al aviso del informe',
            'error',
            `El acuse ampara la referencia ${acuse.referenciaAviso}; el informe es la ${informe.referenciaAviso}.`
          )
    );
  } else if (acuse.fechaPresentacion && informe.fechaOperacion && limite) {
    const enVentana =
      acuse.fechaPresentacion >= informe.fechaOperacion && acuse.fechaPresentacion <= limite;
    const sufijoLote =
      acuse.numeroAvisos > 1
        ? ` El acuse ampara ${acuse.numeroAvisos} avisos (envío de lote).`
        : '';
    checks.push(
      enVentana
        ? ok('acuse_correspondencia', 'Fecha de envío en la ventana de la operación', 'warning')
        : falla(
            'acuse_correspondencia',
            'Fecha de envío en la ventana de la operación',
            'warning',
            `El acuse se envió el ${acuse.fechaPresentacion}; la operación del ${informe.fechaOperacion} debía presentarse entre esa fecha y el ${limite}.${sufijoLote}`
          )
    );
  } else {
    checks.push(
      falla(
        'acuse_correspondencia',
        'Acuse corresponde al aviso del informe',
        'warning',
        'No se pudo ligar el acuse al informe (sin referencia ni fechas legibles) — verificar manualmente.'
      )
    );
  }

  // Plazo LFPIORPI (día 17 del mes siguiente a la operación).
  if (acuse.fechaPresentacion && limite) {
    checks.push(
      acuse.fechaPresentacion <= limite
        ? ok('acuse_plazo', 'Presentado dentro del plazo (día 17 del mes siguiente)', 'warning')
        : falla(
            'acuse_plazo',
            'Presentado dentro del plazo (día 17 del mes siguiente)',
            'warning',
            `El acuse es del ${acuse.fechaPresentacion}; el plazo para la operación del ${informe.fechaOperacion} vencía el ${limite}.`
          )
    );
  } else {
    checks.push(
      falla(
        'acuse_plazo',
        'Presentado dentro del plazo (día 17 del mes siguiente)',
        'warning',
        'Sin fecha de envío legible en el acuse — verificar manualmente.'
      )
    );
  }

  return checks;
}

/**
 * Separa los checks de una revisión por grupo: acuse (`acuse_*`), facturación
 * (`fact_*`, la nota de crédito que exige la cuadratura) e informe (el resto:
 * el aviso PLD vs el expediente). La UI los pinta en bloques separados y el
 * flujo PLD informe→acuse (decisión Beto 2026-06-12) no se mezcla con la NC:
 * `informe` excluye facturación, así la NC no bloquea la presentación del
 * aviso pero sí el cierre (entra al veredicto general).
 */
export function separarChecks(checks: RevisionCheck[]): {
  informe: RevisionCheck[];
  acuse: RevisionCheck[];
  facturacion: RevisionCheck[];
} {
  return {
    informe: checks.filter((c) => !c.clave.startsWith('acuse_') && !c.clave.startsWith('fact_')),
    acuse: checks.filter((c) => c.clave.startsWith('acuse_')),
    facturacion: checks.filter((c) => c.clave.startsWith('fact_')),
  };
}

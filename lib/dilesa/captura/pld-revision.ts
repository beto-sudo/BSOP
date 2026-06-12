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
  /** Montos de los depósitos registrados (erp.cxc_pagos de la venta). */
  depositos: number[];
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

  // 8. Liquidaciones vs valor pactado y vs depósitos registrados (warnings).
  const totalLiquidaciones = ext.liquidaciones.reduce((s, l) => s + (l.monto || 0), 0);
  checks.push(
    montosIguales(totalLiquidaciones, ext.valorPactado, 1)
      ? ok('liq_vs_pactado', 'Σ liquidaciones = valor pactado', 'warning')
      : falla(
          'liq_vs_pactado',
          'Σ liquidaciones = valor pactado',
          'warning',
          `Las liquidaciones del aviso suman ${money(totalLiquidaciones)}; el valor pactado es ${money(ext.valorPactado)} (diferencia ${money(totalLiquidaciones - ext.valorPactado)}).`
        )
  );
  const totalDepositos = exp.depositos.reduce((s, m) => s + (m || 0), 0);
  checks.push(
    montosIguales(totalLiquidaciones, totalDepositos, 1)
      ? ok('liq_vs_depositos', 'Σ liquidaciones = depósitos registrados', 'warning')
      : falla(
          'liq_vs_depositos',
          'Σ liquidaciones = depósitos registrados',
          'warning',
          `Las liquidaciones suman ${money(totalLiquidaciones)}; los depósitos registrados en la venta suman ${money(totalDepositos)}.`
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

export type VeredictoRevision = 'verde' | 'advertencias' | 'rojo';

export function veredictoDe(checks: RevisionCheck[]): VeredictoRevision {
  if (checks.some((c) => !c.ok && c.severidad === 'error')) return 'rojo';
  if (checks.some((c) => !c.ok)) return 'advertencias';
  return 'verde';
}

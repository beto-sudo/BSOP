import { describe, expect, it } from 'vitest';
import {
  checksFacturacion,
  cruzarPldConExpediente,
  normalizarTexto,
  veredictoDe,
  type ExpedientePld,
  type ExtraccionPld,
  type RevisionCheck,
} from './pld-revision';

/**
 * Fixture basado en un Informe de Avisos SPPLD real (anonimizable): venta
 * de casa en Nava por $899,000, escritura 188 ante notario 25, avalúo
 * $1,021,000, liquidada en dos transferencias que suman $897,378. La
 * diferencia de $1,622 vs el pactado es el descuento PERDONADO (no cobrado):
 * descuento aplicado $15,000 − cheque a notaría $13,378. Con eso el aviso
 * cuadra (caso real de Beto).
 */
function extraccion(partial: Partial<ExtraccionPld> = {}): ExtraccionPld {
  return {
    rfcSujetoObligado: 'DIE030904866',
    sujetoObligado: 'DESARROLLO INMOBILIARIO LOS ENCINOS',
    mesReportado: '202606',
    referenciaAviso: '20260602',
    tipoAlerta: 'SIN ALERTA',
    personaNombre: 'JOSUE DANIEL',
    personaApellidoPaterno: 'CRUZ',
    personaApellidoMaterno: 'VALVERDE',
    personaRfc: 'CUVJ0102087M1',
    fechaOperacion: '2026-06-01',
    tipoOperacion: 'COMPRA VENTA DE INMUEBLES',
    figuraCliente: 'COMPRADOR',
    valorPactado: 899000,
    inmuebleCalle: 'PASEO DE LA GAVIOTA',
    inmuebleNumeroExterior: '169',
    inmuebleM2Terreno: 105,
    inmuebleM2Construidos: 56.58,
    folioReal: '38987',
    numeroInstrumento: '188',
    fechaInstrumento: '2026-05-12',
    numeroNotario: '25',
    valorAvaluo: 1021000,
    liquidaciones: [
      { fecha: '2026-05-09', monto: 261049.55 },
      { fecha: '2026-06-01', monto: 636328.45 },
    ],
    ...partial,
  };
}

function expediente(partial: Partial<ExpedientePld> = {}): ExpedientePld {
  return {
    empresaRfc: 'DIE030904866',
    clienteNombre: 'Josué Daniel',
    clienteApellidoPaterno: 'Cruz',
    clienteApellidoMaterno: 'Valverde',
    clienteRfc: 'CUVJ0102087M1',
    valorEscrituracion: 899000,
    montoAvaluo: 1021000,
    numeroEscritura: '188',
    fechaEscritura: '2026-05-12',
    numeroNotaria: '25',
    unidadCalle: 'Paseo de la Gaviota',
    unidadNumeroOficial: '169',
    unidadM2Terreno: 105,
    unidadM2Construccion: 56.58,
    depositos: [261049.55, 636328.45],
    // Descuento $15,000 (gastos escrituración), $13,378 girados a notaría →
    // $1,622 perdonados = el hueco exacto entre liquidaciones y pactado.
    descuentoPerdonado: 1622,
    ...partial,
  };
}

const porClave = (checks: RevisionCheck[], clave: string) => checks.find((c) => c.clave === clave);

describe('normalizarTexto', () => {
  it('quita acentos y virgulillas, colapsa espacios y sube a mayúsculas', () => {
    expect(normalizarTexto('  Josué   Daniel  ')).toBe('JOSUE DANIEL');
    // ñ → n a propósito: el SPPLD suele capturar sin ñ ("NUNEZ" vs "Núñez").
    expect(normalizarTexto('NÚÑEZ peña')).toBe('NUNEZ PENA');
  });
});

describe('cruzarPldConExpediente — caso real cuadrado', () => {
  const checks = cruzarPldConExpediente(extraccion(), expediente());

  it('los checks de identidad y operación pasan (acentos/mayúsculas no estorban)', () => {
    for (const clave of [
      'sujeto_obligado',
      'persona_rfc',
      'persona_nombre',
      'operacion_tipo',
      'valor_pactado',
      'inmueble_domicilio',
      'inmueble_superficies',
      'instrumento',
      'instrumento_fecha',
      'notario',
      'avaluo',
      'mes_reportado',
      'alerta',
      'liq_vs_depositos',
    ]) {
      expect(porClave(checks, clave)?.ok, clave).toBe(true);
    }
  });

  it('liq_vs_pactado pasa: el descuento perdonado ($1,622) explica el hueco', () => {
    expect(porClave(checks, 'liq_vs_pactado')?.ok).toBe(true);
  });

  it('un hueco SIN descuento que lo explique sí queda como warning', () => {
    const sinDesc = cruzarPldConExpediente(extraccion(), expediente({ descuentoPerdonado: 0 }));
    const c = porClave(sinDesc, 'liq_vs_pactado');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('warning');
    expect(c?.detalle).toContain('897,378');
  });

  it('veredicto: verde (el caso real cuadra con el descuento)', () => {
    expect(veredictoDe(checks)).toBe('verde');
  });
});

describe('cruzarPldConExpediente — liquidaciones dentro de la banda [precio, depósitos]', () => {
  // Dos formas válidas de capturar las liquidaciones del aviso; ambas cuadran porque
  // caen dentro de la banda [precio neto de descuento, total de depósitos recibidos].
  // El ancho de la banda = el enganche que excede el precio (lo que fondea gastos).

  it('Christopher M3-L16: reporta SOLO el precio → cae en el piso, pasa', () => {
    // Aviso = crédito 1,021,000 (sin enganche). Banda [1,021,000, 1,036,640].
    const checks = cruzarPldConExpediente(
      extraccion({
        valorPactado: 1021000,
        liquidaciones: [{ fecha: '2026-06-01', monto: 1021000 }],
      }),
      expediente({
        valorEscrituracion: 1021000,
        depositos: [1021000, 15640], // crédito + enganche
        descuentoPerdonado: 0,
      })
    );
    expect(porClave(checks, 'liq_vs_pactado')?.ok).toBe(true); // ≥ piso 1,021,000
    expect(porClave(checks, 'liq_vs_depositos')?.ok).toBe(true); // ≤ techo 1,036,640
  });

  it('Nancy M22-L1: reporta TODOS los depósitos → cae en el techo, pasa', () => {
    // Aviso = crédito + enganche completo = 1,428,126.01 (incluye enganche a gastos).
    // Banda [1,392,050, 1,428,127]. Antes (neteo) marcaba descuadre por +36,076.
    const checks = cruzarPldConExpediente(
      extraccion({
        valorPactado: 1392050,
        liquidaciones: [{ fecha: '2026-06-01', monto: 1428126.01 }],
      }),
      expediente({
        valorEscrituracion: 1392050,
        depositos: [1331887, 96240], // crédito + enganche (= 1,428,127)
        descuentoPerdonado: 0,
      })
    );
    expect(porClave(checks, 'liq_vs_pactado')?.ok).toBe(true); // ≥ piso 1,392,050
    expect(porClave(checks, 'liq_vs_depositos')?.ok).toBe(true); // ≤ techo 1,428,127
  });

  it('sub-declaración (por debajo del piso): liq_vs_pactado en warning', () => {
    const checks = cruzarPldConExpediente(
      extraccion({
        valorPactado: 1392050,
        liquidaciones: [{ fecha: '2026-06-01', monto: 1000000 }],
      }),
      expediente({
        valorEscrituracion: 1392050,
        depositos: [1331887, 96240],
        descuentoPerdonado: 0,
      })
    );
    const c = porClave(checks, 'liq_vs_pactado');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('warning');
    expect(c?.detalle).toContain('1,392,050');
  });

  it('declara más dinero del recibido (por arriba del techo): liq_vs_depositos en warning', () => {
    const checks = cruzarPldConExpediente(
      extraccion({
        valorPactado: 1392050,
        liquidaciones: [{ fecha: '2026-06-01', monto: 1500000 }],
      }),
      expediente({
        valorEscrituracion: 1392050,
        depositos: [1331887, 96240],
        descuentoPerdonado: 0,
      })
    );
    const c = porClave(checks, 'liq_vs_depositos');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('warning');
    expect(c?.detalle).toContain('de más');
  });
});

describe('cruzarPldConExpediente — errores duros', () => {
  it('rojo si el aviso es de otra persona', () => {
    const checks = cruzarPldConExpediente(
      extraccion({ personaRfc: 'XAXX010101000' }),
      expediente()
    );
    expect(porClave(checks, 'persona_rfc')?.ok).toBe(false);
    expect(veredictoDe(checks)).toBe('rojo');
  });

  it('rojo si el valor pactado no es el de escrituración', () => {
    const checks = cruzarPldConExpediente(extraccion({ valorPactado: 850000 }), expediente());
    const c = porClave(checks, 'valor_pactado');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('error');
    expect(veredictoDe(checks)).toBe('rojo');
  });

  it('rojo si el instrumento público no coincide con la escritura', () => {
    const checks = cruzarPldConExpediente(extraccion({ numeroInstrumento: '999' }), expediente());
    expect(porClave(checks, 'instrumento')?.ok).toBe(false);
    expect(veredictoDe(checks)).toBe('rojo');
  });

  it('rojo si el aviso trae alerta', () => {
    const checks = cruzarPldConExpediente(
      extraccion({ tipoAlerta: 'ALERTA POR MONTO INUSUAL' }),
      expediente()
    );
    expect(porClave(checks, 'alerta')?.ok).toBe(false);
    expect(veredictoDe(checks)).toBe('rojo');
  });
});

describe('cruzarPldConExpediente — degradaciones a warning', () => {
  it('cliente sin RFC capturado: warning, no error', () => {
    const checks = cruzarPldConExpediente(extraccion(), expediente({ clienteRfc: null }));
    const c = porClave(checks, 'persona_rfc');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('warning');
  });

  it('venta sin número de escritura (F11 incompleta): warning', () => {
    const checks = cruzarPldConExpediente(extraccion(), expediente({ numeroEscritura: null }));
    const c = porClave(checks, 'instrumento');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('warning');
  });

  it('mes reportado fuera de plazo: warning con esperados', () => {
    const checks = cruzarPldConExpediente(extraccion({ mesReportado: '202608' }), expediente());
    const c = porClave(checks, 'mes_reportado');
    expect(c?.ok).toBe(false);
    expect(c?.detalle).toContain('202606');
    expect(c?.detalle).toContain('202607');
  });

  it('mes reportado = mes siguiente a la operación: ok (plazo legal)', () => {
    const checks = cruzarPldConExpediente(extraccion({ mesReportado: '202607' }), expediente());
    expect(porClave(checks, 'mes_reportado')?.ok).toBe(true);
  });
});

describe('veredictoDe', () => {
  it('verde cuando todo pasa', () => {
    const checks = cruzarPldConExpediente(
      extraccion({ valorPactado: 897378 }),
      expediente({ valorEscrituracion: 897378, descuentoPerdonado: 0 })
    );
    expect(veredictoDe(checks)).toBe('verde');
  });
});

// ── Facturación: nota de crédito que exige la cuadratura ─────────────────

describe('checksFacturacion', () => {
  it('no requiere NC cuando facturado = valor real: un check ok, veredicto verde', () => {
    const checks = checksFacturacion({
      montoNotaCreditoEsperado: 0,
      ncXmlTotal: null,
      ncXmlPresente: false,
      ncPdfPresente: false,
    });
    expect(checks).toHaveLength(1);
    expect(checks[0].clave).toBe('fact_nc');
    expect(checks[0].ok).toBe(true);
    expect(veredictoDe(checks)).toBe('verde');
  });

  it('diferencia sub-peso (ruido de redondeo) no exige NC', () => {
    const checks = checksFacturacion({
      montoNotaCreditoEsperado: 0.11,
      ncXmlTotal: null,
      ncXmlPresente: false,
      ncPdfPresente: false,
    });
    expect(veredictoDe(checks)).toBe('verde');
  });

  it('NC requerida y faltante (XML+PDF): dos errores con el monto, veredicto rojo', () => {
    const checks = checksFacturacion({
      montoNotaCreditoEsperado: 13378.11,
      ncXmlTotal: null,
      ncXmlPresente: false,
      ncPdfPresente: false,
    });
    const xml = checks.find((c) => c.clave === 'fact_nc_xml');
    const pdf = checks.find((c) => c.clave === 'fact_nc_pdf');
    expect(xml?.ok).toBe(false);
    expect(xml?.severidad).toBe('error');
    expect(xml?.detalle).toContain('13,378.11');
    expect(pdf?.ok).toBe(false);
    expect(pdf?.severidad).toBe('error');
    expect(veredictoDe(checks)).toBe('rojo');
  });

  it('NC requerida, XML+PDF presentes y monto cuadra: verde', () => {
    const checks = checksFacturacion({
      montoNotaCreditoEsperado: 13378.11,
      ncXmlTotal: 13378.11,
      ncXmlPresente: true,
      ncPdfPresente: true,
    });
    expect(veredictoDe(checks)).toBe('verde');
  });

  it('NC presente pero monto distinto al esperado: warning visible, no bloquea', () => {
    const checks = checksFacturacion({
      montoNotaCreditoEsperado: 13378.11,
      ncXmlTotal: 10000,
      ncXmlPresente: true,
      ncPdfPresente: true,
    });
    const c = checks.find((x) => x.clave === 'fact_nc_monto');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('warning');
    expect(veredictoDe(checks)).toBe('advertencias');
  });

  it('solo falta el PDF: rojo por el PDF, XML ok', () => {
    const checks = checksFacturacion({
      montoNotaCreditoEsperado: 13378.11,
      ncXmlTotal: 13378.11,
      ncXmlPresente: true,
      ncPdfPresente: false,
    });
    expect(checks.find((c) => c.clave === 'fact_nc_xml')?.ok).toBe(true);
    expect(checks.find((c) => c.clave === 'fact_nc_pdf')?.ok).toBe(false);
    expect(veredictoDe(checks)).toBe('rojo');
  });
});

// ── Acuse de envío (ciclo completo) ─────────────────────────────────────

import { cruzarAcuseConInforme, separarChecks, type ExtraccionAcuse } from './pld-revision';

/**
 * Fixture del formato real "Presentación de Avisos" (acuse SPPLD): folio,
 * sujeto obligado, tabla de avisos reportados con fecha de envío, número de
 * avisos y ESTATUS (calibrado con un acuse real de DILESA: folio 18825514,
 * 14 avisos del envío masivo, ACEPTADO).
 */
function acuse(partial: Partial<ExtraccionAcuse> = {}): ExtraccionAcuse {
  return {
    folioAcuse: '18825514',
    rfcSujetoObligado: 'DIE030904866',
    fechaPresentacion: '2026-06-10',
    estatusEnvio: 'ACEPTADO',
    actividadVulnerable: 'TRANSMISION DE DERECHOS SOBRE BIENES INMUEBLES',
    tipoEnvio: 'PORTAL',
    numeroAvisos: 1,
    referenciaAviso: '',
    ...partial,
  };
}

describe('cruzarAcuseConInforme — formato real Presentación de Avisos', () => {
  const informe = extraccion(); // operación 2026-06-01

  it('todo verde: DILESA, ACEPTADO, actividad de inmuebles, fecha en ventana', () => {
    const checks = cruzarAcuseConInforme(acuse(), informe, 'DIE030904866');
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(veredictoDe(checks)).toBe('verde');
  });

  it('rojo si el estatus del envío no es ACEPTADO', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ estatusEnvio: 'RECHAZADO' }),
      informe,
      'DIE030904866'
    );
    const c = checks.find((x) => x.clave === 'acuse_estatus');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('error');
    expect(veredictoDe(checks)).toBe('rojo');
  });

  it('estatus ilegible degrada a warning (verificación manual), no bloquea', () => {
    const checks = cruzarAcuseConInforme(acuse({ estatusEnvio: '' }), informe, 'DIE030904866');
    const c = checks.find((x) => x.clave === 'acuse_estatus');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('warning');
    expect(veredictoDe(checks)).toBe('advertencias');
  });

  it('rojo si el acuse es de otro RFC', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ rfcSujetoObligado: 'XAXX010101000' }),
      informe,
      'DIE030904866'
    );
    expect(veredictoDe(checks)).toBe('rojo');
  });

  it('fecha de envío fuera de la ventana de la operación: warning con el plazo', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ fechaPresentacion: '2026-07-20' }),
      informe,
      'DIE030904866'
    );
    const corr = checks.find((x) => x.clave === 'acuse_correspondencia');
    const plazo = checks.find((x) => x.clave === 'acuse_plazo');
    expect(corr?.ok).toBe(false);
    expect(plazo?.ok).toBe(false);
    expect(plazo?.detalle).toContain('2026-07-17');
    expect(veredictoDe(checks)).toBe('advertencias');
  });

  it('el día límite exacto (17 del mes siguiente) cuenta como dentro de plazo', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ fechaPresentacion: '2026-07-17' }),
      informe,
      'DIE030904866'
    );
    expect(checks.find((x) => x.clave === 'acuse_plazo')?.ok).toBe(true);
  });

  it('acuse de lote (14 avisos, esquema masivo): la correspondencia es por ventana y lo señala', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ numeroAvisos: 14, fechaPresentacion: '2026-07-20' }),
      informe,
      'DIE030904866'
    );
    const c = checks.find((x) => x.clave === 'acuse_correspondencia');
    expect(c?.severidad).toBe('warning');
    expect(c?.detalle).toContain('14 avisos');
  });

  it('referencia exacta se exige solo si ambos documentos la traen', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ referenciaAviso: '20260699' }),
      informe, // informe.referenciaAviso = '20260602'
      'DIE030904866'
    );
    const c = checks.find((x) => x.clave === 'acuse_correspondencia');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('error');
  });
});

describe('separarChecks (flujo en dos pasos)', () => {
  it('separa informe vs acuse por clave y los veredictos parciales son independientes', () => {
    const informeChecks = cruzarPldConExpediente(extraccion(), expediente());
    const acuseChecks = cruzarAcuseConInforme(
      acuse({ rfcSujetoObligado: 'XAXX010101000' }), // acuse de otro RFC → rojo
      extraccion(),
      'DIE030904866'
    );
    const { informe, acuse: soloAcuse } = separarChecks([...informeChecks, ...acuseChecks]);
    expect(informe).toHaveLength(informeChecks.length);
    expect(soloAcuse).toHaveLength(acuseChecks.length);
    expect(soloAcuse.every((c) => c.clave.startsWith('acuse_'))).toBe(true);
    // El informe puede estar en verde mientras el acuse está en rojo.
    expect(veredictoDe(informe)).toBe('verde');
    expect(veredictoDe(soloAcuse)).toBe('rojo');
  });

  it('aísla los checks de facturación (fact_) del informe y del acuse', () => {
    const informeChecks = cruzarPldConExpediente(extraccion(), expediente());
    const factChecks = checksFacturacion({
      montoNotaCreditoEsperado: 13378.11,
      ncXmlTotal: null,
      ncXmlPresente: false,
      ncPdfPresente: false,
    });
    const { informe, acuse, facturacion } = separarChecks([...informeChecks, ...factChecks]);
    expect(facturacion).toHaveLength(factChecks.length);
    expect(facturacion.every((c) => c.clave.startsWith('fact_'))).toBe(true);
    expect(informe).toHaveLength(informeChecks.length);
    expect(acuse).toHaveLength(0);
    // El veredicto general incluye la NC (rojo) aunque el informe no.
    expect(veredictoDe([...informeChecks, ...factChecks])).toBe('rojo');
  });
});

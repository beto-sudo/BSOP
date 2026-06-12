import { describe, expect, it } from 'vitest';
import {
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
 * $1,021,000, liquidada en dos transferencias que suman $897,378 (la
 * diferencia de $1,622 vs el pactado es un caso real — warning, no error).
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

  it('la diferencia liquidaciones vs pactado ($1,622) queda como warning visible', () => {
    const c = porClave(checks, 'liq_vs_pactado');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('warning');
    expect(c?.detalle).toContain('897,378');
  });

  it('veredicto: advertencias (ningún error, un warning)', () => {
    expect(veredictoDe(checks)).toBe('advertencias');
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
      expediente({ valorEscrituracion: 897378 })
    );
    expect(veredictoDe(checks)).toBe('verde');
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
    // El informe puede estar en advertencias mientras el acuse está en rojo.
    expect(veredictoDe(informe)).toBe('advertencias');
    expect(veredictoDe(soloAcuse)).toBe('rojo');
  });
});

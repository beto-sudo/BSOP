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

import { checkAcuseFaltante, cruzarAcuseConInforme, type ExtraccionAcuse } from './pld-revision';

function acuse(partial: Partial<ExtraccionAcuse> = {}): ExtraccionAcuse {
  return {
    folioAcuse: 'AV-2026-000123',
    rfcSujetoObligado: 'DIE030904866',
    fechaPresentacion: '2026-06-10',
    mesReportado: '202606',
    referenciaAviso: '20260602',
    numeroAvisos: 1,
    ...partial,
  };
}

describe('cruzarAcuseConInforme', () => {
  const informe = extraccion(); // operación 2026-06-01, referencia 20260602

  it('todo verde con acuse de DILESA, misma referencia y dentro de plazo', () => {
    const checks = cruzarAcuseConInforme(acuse(), informe, 'DIE030904866');
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(veredictoDe(checks)).toBe('verde');
  });

  it('rojo si el acuse ampara otra referencia de aviso', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ referenciaAviso: '20260699' }),
      informe,
      'DIE030904866'
    );
    const c = checks.find((x) => x.clave === 'acuse_referencia');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('error');
  });

  it('rojo si el acuse es de otro RFC', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ rfcSujetoObligado: 'XAXX010101000' }),
      informe,
      'DIE030904866'
    );
    expect(veredictoDe(checks)).toBe('rojo');
  });

  it('cae a periodo (warning) si el acuse no trae referencia', () => {
    const checks = cruzarAcuseConInforme(acuse({ referenciaAviso: '' }), informe, 'DIE030904866');
    const c = checks.find((x) => x.clave === 'acuse_referencia');
    expect(c?.ok).toBe(true);
    expect(c?.severidad).toBe('warning');
  });

  it('warning si se presentó fuera del plazo (después del día 17 del mes siguiente)', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ fechaPresentacion: '2026-07-20' }),
      informe,
      'DIE030904866'
    );
    const c = checks.find((x) => x.clave === 'acuse_plazo');
    expect(c?.ok).toBe(false);
    expect(c?.severidad).toBe('warning');
    expect(c?.detalle).toContain('2026-07-17');
  });

  it('presentado el día límite exacto cuenta como dentro de plazo', () => {
    const checks = cruzarAcuseConInforme(
      acuse({ fechaPresentacion: '2026-07-17' }),
      informe,
      'DIE030904866'
    );
    expect(checks.find((x) => x.clave === 'acuse_plazo')?.ok).toBe(true);
  });
});

describe('checkAcuseFaltante', () => {
  it('es un error duro: sin acuse el ciclo no cierra', () => {
    const c = checkAcuseFaltante();
    expect(c.ok).toBe(false);
    expect(c.severidad).toBe('error');
    expect(veredictoDe([c])).toBe('rojo');
  });
});

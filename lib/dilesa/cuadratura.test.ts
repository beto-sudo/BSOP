import { describe, it, expect } from 'vitest';
import { calcularCuadratura, topeDescuentoAutorizado, partirDescuento } from './cuadratura';

describe('calcularCuadratura', () => {
  // Ejemplo real de Beto (pantalla de Coda):
  //   Valor de Escrituración = 899,000
  //   Depósitos: 261,049.55 (Directo Cliente, con recibo de caja)
  //              636,328.45 (Pago Infonavit, sin recibo) — su crédito = mismo monto
  //   Valor Facturado = 1,160,049.55 · Valor Real Venta Dilesa = 884,000
  //   Monto Nota de Crédito = 276,049.55
  it('reproduce el ejemplo de Coda', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 899000,
      montoCreditoTitular: 636328.45, // crédito Infonavit (= el Pago Infonavit)
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: 13378, // 897,378 − 13,378 = 884,000
      gastosEscrituracion: null,
      precioAsignacion: 920000,
      depositos: [
        { monto: 261049.55, directoCliente: true, tieneRecibo: true },
        { monto: 636328.45, directoCliente: false, tieneRecibo: false },
      ],
      proyectoNombre: 'Lomas del Sol',
    });

    expect(c.depositosRecibidos).toBe(897378);
    expect(c.montoDisponible).toBe(897378); // 261,049.55 directo + 636,328.45 crédito
    expect(c.saldoCobranza).toBe(1622); // 899,000 − 897,378 (cobranza cruda)
    // Sin descuento registrado pero con un cheque de 13,378 girado: el saldo
    // efectivo EXPONE el descuento no documentado (1,622 sin cobrar + 13,378 de
    // cheque = 15,000). No cubierta hasta capturar el descuento en los buckets.
    expect(c.saldoCliente).toBe(15000); // 1,622 − 0 + 13,378
    expect(c.cubierta).toBe(false);
    expect(c.valorFacturado).toBe(1160049.55); // 899,000 + 261,049.55 (con recibo)
    expect(c.valorRealVentaDilesa).toBe(884000); // 897,378 − 13,378 + 0
    expect(c.montoNotaCredito).toBe(276049.55); // 1,160,049.55 − 884,000
    expect(c.descuentoReal).toBe(15000); // 899,000 − 884,000
    expect(c.comisionGerencia).toBe(4420); // 884,000 (valor real) × 0.5% — ADR-050
    expect(c.comisionVendedor).toBe(8840); // 884,000 (valor real) × 1.0% (no Loma Verde) — ADR-050
  });

  // ADR-050 (iniciativa dilesa-comision-valor-real): la base de comisión es el
  // Valor Real Venta DILESA en AMBOS modelos. Antes el legacy comisionaba sobre el
  // valor de ESCRITURACIÓN, que sobre-pagaba en ventas con descuento (la escritura
  // es mayor que lo que DILESA realiza). Aquí valor real (884,000) < escrituración
  // (899,000) por el descuento de 15,000 → la comisión baja en consecuencia.
  it('legacy comisiona sobre el valor real, no la escrituración (ADR-050)', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 899000,
      montoCreditoTitular: 636328.45,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: 13378,
      gastosEscrituracion: null,
      depositos: [
        { monto: 261049.55, directoCliente: true, tieneRecibo: true },
        { monto: 636328.45, directoCliente: false, tieneRecibo: false },
      ],
      proyectoNombre: 'Lomas del Sol',
    });
    expect(c.tieneDesglose).toBe(false); // legacy
    expect(c.valorRealVentaDilesa).toBe(884000);
    // Base = valor real (884,000), NO la escrituración (899,000).
    expect(c.comisionVendedor).toBe(8840);
    expect(c.comisionGerencia).toBe(4420);
  });

  // ADR-050: el valor real usa el crédito de la VENTA + enganche del cliente, NO la
  // suma de cxc_pagos. Robusto a ventas migradas de Coda cuyo crédito nunca se
  // registró en cxc_pagos (solo el enganche): antes daban valor real ≈ enganche
  // (basura) y comisión absurda. Caso real M14-L4-LDV (crédito 2.24M no en cxc).
  it('legacy sin el crédito en los depósitos usa el crédito de la venta (ADR-050)', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 2242867,
      montoCreditoTitular: 2242867, // el crédito vive en la venta…
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: null,
      gastosEscrituracion: null,
      // …pero en cxc_pagos solo está el enganche (el crédito de Coda no se migró).
      depositos: [{ monto: 22429, directoCliente: true, tieneRecibo: false }],
      proyectoNombre: 'Lomas del Valle',
    });
    expect(c.tieneDesglose).toBe(false);
    // Valor real = crédito 2,242,867 + enganche 22,429 − cheque 0 + pagaré 0; NO el
    // enganche solo (22,429 era el valor basura del bug).
    expect(c.valorRealVentaDilesa).toBe(2265296);
    expect(c.comisionVendedor).toBe(22652.96); // 2,265,296 × 1.0%
  });

  // Modelo confirmado por Beto 2026-06-15: el enganche se factura con su propio
  // recibo-CFDI y la operación se factura por la escrituración → el Valor
  // Facturado SUMA ambos. La factura de escrituración usa el total del CFDI real
  // cuando difiere del valor de escrituración; el estimado (con el valor de
  // escrituración) queda como *Sugerido.
  it('suma la factura de escrituración (CFDI) + el recibo-CFDI del enganche', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 899000,
      montoCreditoTitular: 636328.45,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: 13378,
      gastosEscrituracion: null,
      valorFacturadoReal: 900000, // CFDI de escrituración (≠ valor escritura, para probar que se usa)
      depositos: [
        { monto: 261049.55, directoCliente: true, tieneRecibo: true }, // enganche con recibo-CFDI
        { monto: 636328.45, directoCliente: false, tieneRecibo: false }, // crédito: no factura
      ],
      proyectoNombre: 'Lomas del Sol',
    });
    expect(c.valorFacturado).toBe(1161049.55); // 900,000 (CFDI) + 261,049.55 (enganche)
    expect(c.valorFacturadoSugerido).toBe(1160049.55); // 899,000 (escritura) + 261,049.55
    expect(c.valorRealVentaDilesa).toBe(884000); // 897,378 − 13,378
    expect(c.montoNotaCredito).toBe(277049.55); // 1,161,049.55 − 884,000
    expect(c.montoNotaCreditoSugerido).toBe(276049.55); // 1,160,049.55 − 884,000
  });

  // Caso real Beto (Josue): el CFDI de escrituración coincide con la escritura,
  // así que el facturado = escrituración + enganche = 1,160,049.55 y la NC =
  // 276,049.55 (= enganche 261,049.55 + descuento 15,000).
  it('caso Josue: NC = enganche + descuento cuando el CFDI coincide con la escritura', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 899000,
      montoCreditoTitular: 636328.45,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: 13378,
      gastosEscrituracion: null,
      valorFacturadoReal: 899000, // el CFDI coincide con la escritura
      depositos: [
        { monto: 261049.55, directoCliente: true, tieneRecibo: true },
        { monto: 636328.45, directoCliente: false, tieneRecibo: false },
      ],
    });
    expect(c.valorFacturado).toBe(1160049.55);
    expect(c.montoNotaCredito).toBe(276049.55); // 261,049.55 enganche + 15,000 descuento
  });

  // Sin `valorFacturadoReal`, el efectivo == el sugerido (estimado de la fórmula).
  it('el efectivo iguala al sugerido cuando aún no hay factura', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 899000,
      montoCreditoTitular: 636328.45,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: 13378,
      gastosEscrituracion: null,
      depositos: [
        { monto: 261049.55, directoCliente: true, tieneRecibo: true },
        { monto: 636328.45, directoCliente: false, tieneRecibo: false },
      ],
    });
    expect(c.valorFacturado).toBe(c.valorFacturadoSugerido);
    expect(c.montoNotaCredito).toBe(c.montoNotaCreditoSugerido);
    expect(c.valorFacturado).toBe(1160049.55);
  });

  // Regresión (caso Ahumada, 2026-06-13): la disposición del crédito de
  // institución traía un recibo de caja importado de Coda. La fórmula NO debe
  // facturarlo — solo los depósitos del cliente con recibo suman al Valor
  // Facturado. Antes del fix, escrituración 940,000 mostraba 1,880,000.
  it('el respaldo no factura la disposición del crédito (recibo importado de Coda)', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 940000,
      montoCreditoTitular: 940000,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: null,
      gastosEscrituracion: null,
      depositos: [{ monto: 940000, directoCliente: false, tieneRecibo: true }],
    });
    // El recibo es de institución (directoCliente=false) → no factura.
    expect(c.valorFacturado).toBe(940000); // 940,000 escrituración + 0
  });

  it('marca cubierta cuando el disponible cubre la escrituración', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 500000,
      montoCreditoTitular: 400000,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 50000,
      montoChequeNotaria: null,
      gastosEscrituracion: null,
      depositos: [{ monto: 60000, directoCliente: true, tieneRecibo: true }],
    });
    // disponible = 60,000 + 400,000 + 50,000 = 510,000 ≥ 500,000
    expect(c.montoDisponible).toBe(510000);
    expect(c.saldoCliente).toBe(-10000);
    expect(c.cubierta).toBe(true);
  });

  it('aplica 1.5% de comisión de vendedor en Loma Verde', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 1000000,
      montoCreditoTitular: null,
      montoCreditoCotitular: null,
      montoCreditoDirecto: null,
      montoChequeNotaria: null,
      gastosEscrituracion: null,
      depositos: [],
      proyectoNombre: 'Loma Verde 2',
    });
    expect(c.comisionVendedor).toBe(15000); // 1,000,000 × 1.5%
  });

  it('cheque a notaría = min(gastos − apoyo, disponible − escrituración + descuento)', () => {
    const c = calcularCuadratura({
      valorEscrituracion: 800000,
      montoCreditoTitular: 850000,
      montoCreditoCotitular: 0,
      montoCreditoDirecto: 0,
      montoChequeNotaria: null,
      gastosEscrituracion: 30000,
      apoyoInfonavit: 5000,
      descuentoOtorgadoTotal: 0,
      depositos: [],
    });
    // gastos − apoyo = 25,000 ; disponible − escrituración + desc = 850,000 − 800,000 = 50,000
    // min(25,000, 50,000) = 25,000
    expect(c.chequeNotariaCalculado).toBe(25000);
  });

  describe('posibleDobleConteo', () => {
    // Caso real 2026-06-12: la disposición del crédito Infonavit se capturó
    // como abono fuente='cliente', así que el mismo dinero entra dos veces
    // (depósito directo + crédito de la venta) y el disponible se infla.
    it('detecta la disposición etiquetada como depósito del cliente', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 899000,
        montoCreditoTitular: 636328.45,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: null,
        depositos: [
          { monto: 261049.55, directoCliente: true },
          // Disposición mal etiquetada: debió ser fuente='institucion'.
          { monto: 636328.45, directoCliente: true },
        ],
      });
      // disponible = 897,378 depósitos + 636,328.45 crédito = 1,533,706.45
      expect(c.montoDisponible).toBe(1533706.45);
      expect(c.posibleDobleConteo).toBe(true);
    });

    it('no marca la operación bien etiquetada (ejemplo de Coda)', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 899000,
        montoCreditoTitular: 636328.45,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: null,
        depositos: [
          { monto: 261049.55, directoCliente: true },
          { monto: 636328.45, directoCliente: false },
        ],
      });
      expect(c.posibleDobleConteo).toBe(false);
    });

    it('tolera el excedente legítimo de gastos de escrituración', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 800000,
        montoCreditoTitular: 750000,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: 30000,
        // depósitos cliente = 80,000 (50,000 enganche + 30,000 para gastos)
        depositos: [{ monto: 80000, directoCliente: true }],
      });
      // 80,000 + 750,000 − 800,000 − 30,000 = 0 ≤ 5% de 800,000
      expect(c.posibleDobleConteo).toBe(false);
    });

    it('no marca ventas sin crédito de institución (contado / crédito directo)', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 500000,
        montoCreditoTitular: 0,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: null,
        depositos: [{ monto: 600000, directoCliente: true }],
      });
      expect(c.posibleDobleConteo).toBe(false);
    });
  });

  // Saldo efectivo (decisión Beto 2026-06-15): el descuento autorizado y el
  // cheque a notaría girado entran al saldo. Antes el saldo era ciego al
  // descuento y un descuento perdonado se veía como deuda.
  describe('saldo efectivo (descuento + cheque)', () => {
    // Caso real Beto (JOSUE DANIEL CRUZ VALVERDE): descuento de 15,000 otorgado,
    // 13,378 girados como cheque a notaría, 1,622 perdonados ⇒ operación saldada.
    it('cuadra a ~0 cuando el descuento cubre el faltante (caso Beto)', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 899000,
        montoCreditoTitular: 636328, // campo de crédito (prod = 636,328.00)
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: 13378,
        gastosEscrituracion: 43378,
        apoyoInfonavit: 30000,
        descuentoOtorgadoTotal: 15000,
        depositos: [{ monto: 261049.55, directoCliente: true, tieneRecibo: true }],
      });
      expect(c.montoDisponible).toBe(897377.55); // 261,049.55 + 636,328
      expect(c.saldoCobranza).toBe(1622.45); // cobranza cruda
      expect(c.descuentoOtorgado).toBe(15000);
      expect(c.chequePagado).toBe(13378);
      expect(c.saldoCliente).toBe(0.45); // 1,622.45 − 15,000 + 13,378 (residual de campo)
      expect(c.cubierta).toBe(true); // ≤ tolerancia
    });

    // Un cheque a notaría girado por encima del (excedente + descuento) deja un
    // saldo positivo real: descuento no documentado o cheque excedido a revisar.
    it('marca pendiente cuando el cheque excede el descuento autorizado', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 890000,
        montoCreditoTitular: 900719, // disponible cubre la cobranza (saldo cobranza −10,719)
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: 25720, // cheque grande SIN descuento registrado
        gastosEscrituracion: 55720,
        descuentoOtorgadoTotal: 0,
        depositos: [],
      });
      expect(c.saldoCobranza).toBe(-10719); // cobranza cubierta
      expect(c.saldoCliente).toBe(15001); // −10,719 − 0 + 25,720 → faltante real
      expect(c.cubierta).toBe(false);
    });

    // Sin descuento ni cheque, el saldo efectivo == la cobranza cruda.
    it('iguala la cobranza cruda cuando no hay descuento ni cheque', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 800000,
        montoCreditoTitular: 700000,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: null,
        depositos: [{ monto: 50000, directoCliente: true }],
      });
      expect(c.saldoCobranza).toBe(50000);
      expect(c.chequePagado).toBe(0);
      expect(c.saldoCliente).toBe(50000);
      expect(c.saldoCliente).toBe(c.saldoCobranza);
      expect(c.cubierta).toBe(false);
    });

    // Tope a lo autorizado (regla Beto 2026-06-15): si se otorga más que el
    // máximo confiable (promo), solo el autorizado entra al saldo; el exceso
    // queda como pendiente a revisar, no reduce el saldo.
    it('topa el descuento aplicado al máximo autorizado confiable', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 899000,
        montoCreditoTitular: 636328,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: 13378,
        gastosEscrituracion: 43378,
        apoyoInfonavit: 30000,
        descuentoOtorgadoTotal: 30000, // se otorgó de más
        descuentoMaximoAutorizado: 15000, // pero solo 15,000 autorizados
        depositos: [{ monto: 261049.55, directoCliente: true, tieneRecibo: true }],
      });
      expect(c.descuentoOtorgado).toBe(30000);
      expect(c.descuentoAplicado).toBe(15000); // topado
      expect(c.saldoCliente).toBe(0.45); // 1,622.45 − 15,000 + 13,378 (no 30,000)
      expect(c.cubierta).toBe(true);
    });

    // Sin tope confiable (legacy), el descuento aplicado == el otorgado.
    it('aplica el descuento completo cuando no hay tope confiable (legacy)', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 899000,
        montoCreditoTitular: 636328,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: 13378,
        gastosEscrituracion: 43378,
        descuentoOtorgadoTotal: 15000,
        // descuentoMaximoAutorizado ausente ⇒ sin tope
        depositos: [{ monto: 261049.55, directoCliente: true, tieneRecibo: true }],
      });
      expect(c.descuentoAplicado).toBe(15000);
      expect(c.saldoCliente).toBe(0.45);
    });

    // La tolerancia absorbe el residual de centavos de captura (≤ 5 pesos).
    it('marca cubierta un residual de pocos pesos por redondeo de captura', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 890000,
        montoCreditoTitular: 890522, // saldo cobranza = −522
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: 15524,
        gastosEscrituracion: 45524,
        descuentoOtorgadoTotal: 15000,
        depositos: [],
      });
      expect(c.saldoCliente).toBe(2); // −522 − 15,000 + 15,524
      expect(c.cubierta).toBe(true); // ≤ tolerancia
    });
  });

  // Tope estricto (Sprint 3): la autorización del descuento es por catálogo.
  describe('topeDescuentoAutorizado', () => {
    it('con promo → el monto de la promo (nativa o legacy)', () => {
      expect(topeDescuentoAutorizado(15000, false)).toBe(15000);
      expect(topeDescuentoAutorizado(15000, true)).toBe(15000);
    });
    it('nativa de BSOP sin promo → 0 (descuento solo vía catálogo)', () => {
      expect(topeDescuentoAutorizado(null, false)).toBe(0);
      expect(topeDescuentoAutorizado(undefined, false)).toBe(0);
    });
    it('legacy de Coda sin promo → null (sin tope, no inventar pendientes)', () => {
      expect(topeDescuentoAutorizado(null, true)).toBe(null);
    });
  });

  describe('tope estricto en el saldo (Sprint 3)', () => {
    // Venta nativa sin promo (max=0): un descuento capturado NO se acredita al
    // saldo — queda como pendiente hasta dar de alta la promo que lo respalde.
    it('nativa sin promo: el descuento otorgado no reduce el saldo', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 899000,
        montoCreditoTitular: 636328,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: 13378,
        gastosEscrituracion: 43378,
        apoyoInfonavit: 30000,
        descuentoOtorgadoTotal: 15000,
        descuentoMaximoAutorizado: 0, // nativa sin promo
        depositos: [{ monto: 261049.55, directoCliente: true, tieneRecibo: true }],
      });
      expect(c.descuentoOtorgado).toBe(15000);
      expect(c.descuentoAplicado).toBe(0); // topado a 0 — no autorizado
      expect(c.saldoCliente).toBe(15000.45); // 1,622.45 − 0 + 13,378
      expect(c.cubierta).toBe(false); // pendiente a revisar
    });
  });

  // ADR-045: modelo desglosado (venta nueva o en proceso). El "descuento" que
  // reduce el saldo = promoción + sobreprecio; el desglose de cobertura de
  // gastos sale en `coberturaGastos`. Caso MAYRA (FOVISSSTE, apoyo 0).
  describe('modelo desglosado (ADR-045)', () => {
    const mayra = (over = {}) =>
      calcularCuadratura({
        valorEscrituracion: 979070,
        montoCreditoTitular: 979070,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 9387, // pagaré
        montoChequeNotaria: 84038, // gastos completos (FOVISSSTE sin apoyo)
        gastosEscrituracion: 84038,
        apoyoInfonavit: 0,
        precioBase: 899000,
        incrementoCredito: 55419,
        sobreprecioGastos: 24651,
        promocionGastos: 15000,
        depositos: [{ monto: 35000, directoCliente: true, tieneRecibo: true }],
        proyectoNombre: 'Lomas de la Loma Este',
        ...over,
      });

    it('MAYRA cuadra en 0 con el desglose (promoción + sobreprecio = descuento aplicado)', () => {
      const c = mayra();
      expect(c.tieneDesglose).toBe(true);
      expect(c.descuentoAplicado).toBe(39651); // 15,000 promo + 24,651 sobreprecio
      expect(c.montoDisponible).toBe(1023457); // 35,000 + 979,070 + 9,387
      expect(c.saldoCobranza).toBe(-44387); // 979,070 − 1,023,457
      expect(c.saldoCliente).toBe(0); // −44,387 − 39,651 + 84,038
      expect(c.cubierta).toBe(true);
      // Saldo del precio (lo que header/panel muestran, NO el saldoCliente): el
      // crédito cubre el precio al 100%. El saldo de gastos = pagaré (9,387).
      expect(c.saldoPrecioEscrituracion).toBe(0);
      expect(c.saldoPrecioPorCubrir).toBe(0); // crédito cubre el precio → nada por cubrir
      expect(c.requiereResolucionSaldoResidual).toBe(false); // sin residual → nada que resolver
    });

    it('desglosa el presupuesto notarial completo y cuadra en 0 — MAYRA', () => {
      // Gastos brutos 84,038 = subsidio 0 + promoción 15,000 + enganche 35,000 +
      // sobreprecio 24,651 + pagaré 9,387. El lado DILESA (promoción + sobreprecio)
      // = gastosNetos − enganche − pagaré = 39,651, partido en 15,000 + 24,651.
      const c = mayra();
      expect(c.coberturaGastos).toEqual({
        gastosBrutos: 84038, // sin subsidio (FOVISSSTE) → bruto = neto
        gastosNetos: 84038,
        apoyoInfonavit: 0,
        promocion: 15000, // autorizada (tope)
        aportacionPromocion: 15000, // usada para cubrir gastos
        engancheCliente: 35000, // FOVISSSTE: crédito cubre el precio → enganche completo a gastos
        engancheAlPrecio: 0, // nada del enganche se consume en el precio
        sobreprecio: 24651, // productos capturados
        sobreprecioCobertura: 24651, // el que cubre el presupuesto
        pagareNecesario: 9387, // faltante si DILESA solo aporta la promo autorizada
        pagareGastos: 9387, // todo el pagaré fondea gastos (= faltante)
        pagarePrecio: 0, // nada del pagaré financia precio
        saldoCobertura: 0, // las fuentes cubren el presupuesto bruto
      });
    });

    it('cobertura con subsidio Infonavit: gastos brutos, subsidio aparte, sobreprecio desglosado — Arizpe', () => {
      // Gastos brutos 48,313 = subsidio Infonavit 30,000 + promoción 15,000 +
      // enganche 0 + sobreprecio 3,313 + pagaré 0. El subsidio se pinta como línea
      // propia; el lado DILESA (18,313) se parte en promoción topada + sobreprecio.
      const c = calcularCuadratura({
        valorEscrituracion: 909000,
        montoCreditoTitular: 909000,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoDetonado: 908999.71,
        montoChequeNotaria: 18313,
        gastosEscrituracion: 48313,
        apoyoInfonavit: 30000,
        precioBase: 909000,
        sobreprecioGastos: 0,
        promocionGastos: 15000,
        depositos: [],
      });
      const cob = c.coberturaGastos!;
      // Gastos brutos 48,313 con subsidio Infonavit 30,000 como línea propia; el
      // lado DILESA (18,313) se parte en promoción topada 15,000 + sobreprecio 3,313.
      expect(cob.gastosBrutos).toBe(48313);
      expect(cob.gastosNetos).toBe(18313);
      expect(cob.apoyoInfonavit).toBe(30000);
      expect(cob.aportacionPromocion).toBe(15000);
      expect(cob.sobreprecioCobertura).toBe(3313);
      expect(cob.saldoCobertura).toBe(0); // las 5 fuentes cubren los gastos brutos
      // Descuento real (escritura − valor real) = 18,313.29; la card "Descuento" lo
      // parte en promoción 15,000 + sobreprecio 3,313.29 (.29 = escritura redonda
      // 909,000 vs detonación 908,999.71; se fija al formalizar Máx. Aportación).
      expect(c.descuentoReal).toBe(18313.29);
      const split = partirDescuento(c.descuentoReal, cob.promocion);
      expect(split.promocion).toBe(15000);
      expect(split.sobreprecio).toBe(3313.29);
    });

    // Infonavit con crédito < precio: el enganche del cliente cubre el saldo del
    // precio, NO los gastos. Antes el motor lo restaba de los gastos (doble conteo)
    // → saldo de cobertura negativo absurdo y un "descuento por sobreprecio"
    // fantasma. Caso real corregido M3-L9 (Juan Antonio).
    it('Infonavit crédito < precio: el enganche va al PRECIO, no a gastos — Juan Antonio (M3-L9)', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 920000,
        montoCreditoTitular: 762265, // crédito Infonavit: NO cubre el precio
        montoCreditoCotitular: 0,
        montoCreditoDirecto: null,
        montoChequeNotaria: null,
        gastosEscrituracion: 42569.42, // Anexo B: titulación 12,569.42 + impuestos 30,000
        apoyoInfonavit: 30000,
        precioBase: 920000,
        incrementoCredito: 0,
        sobreprecioGastos: 0, // SIN sobreprecio
        promocionGastos: 15000,
        depositos: [{ monto: 156943, directoCliente: true, tieneRecibo: false }],
        proyectoNombre: 'Lomas de los Encinos',
      });
      const cob = c.coberturaGastos!;
      expect(cob.gastosBrutos).toBe(42569.42);
      expect(cob.apoyoInfonavit).toBe(30000);
      expect(cob.engancheAlPrecio).toBe(156943); // el enganche cubre el saldo del precio
      expect(cob.engancheCliente).toBe(0); // nada del enganche fondea gastos
      expect(cob.aportacionPromocion).toBe(12569.42); // DILESA solo aporta del bono (< 15k)
      // `dilesa-descuento-perdonado-motor`: descuentoAplicado usa la promo CONSUMIDA
      // (12,569.42), NO el tope del bono (15,000). Antes daba 15,000 → 2,430.58 de
      // "descuento perdonado" fantasma en la revisión PLD.
      expect(c.descuentoAplicado).toBe(12569.42);
      expect(cob.sobreprecioCobertura).toBe(0); // NO se deriva sobreprecio fantasma
      expect(cob.pagareNecesario).toBe(0);
      expect(cob.saldoCobertura).toBe(0); // cuadra
      expect(c.saldoPrecioEscrituracion).toBe(157735); // crédito no cubre; lo cubre el enganche
      expect(c.saldoPrecioPorCubrir).toBe(792); // 157,735 − 156,943 enganche (lo que ve el cliente)
      expect(c.requiereResolucionSaldoResidual).toBe(true); // 792 > tolerancia → Dirección lo resuelve
      // Descuento real = 13,361.42 < 15,000 → todo bono (promoción), sin sobreprecio.
      // El "$17,953 de sobreprecio fantasma" del reporte original venía solo de los
      // gastos inflados (62,161); con los gastos correctos del Anexo B (42,569.42) se va.
      expect(c.descuentoReal).toBe(13361.42);
      const split = partirDescuento(c.descuentoReal, cob.promocion);
      expect(split.promocion).toBe(13361.42);
      expect(split.sobreprecio).toBe(0);
    });

    // `dilesa-descuento-perdonado-motor`: bono parcialmente consumido CON sobreprecio
    // — el caso que disparaba el warning PLD de Aracely (M10-L32). El tope del bono
    // (15,000) no se consume completo (13,380); con sobreprecio 20,000 el motor daba
    // descuentoAplicado 35,000 y `descuentoAplicado − cheque` = 1,620 de perdón
    // fantasma. Con el fix usa la promo consumida → 33,380 = cheque → perdón 0.
    it('bono parcialmente consumido + sobreprecio: descuentoAplicado = promo consumida, sin perdón fantasma (Aracely M10-L32)', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 940000,
        montoCreditoTitular: 940000, // el crédito cubre el precio → el enganche fondea gastos
        montoCreditoCotitular: 0,
        montoCreditoDirecto: null,
        montoChequeNotaria: 33380, // cheque a notaría girado (Fase 11)
        gastosEscrituracion: 63380,
        apoyoInfonavit: 0,
        precioBase: 920000,
        incrementoCredito: 0,
        sobreprecioGastos: 20000, // 920k → 940k escriturado (hecho)
        promocionGastos: 15000, // TOPE del bono del catálogo
        depositos: [{ monto: 30000, directoCliente: true, tieneRecibo: false }],
        proyectoNombre: 'Lomas de los Encinos',
      });
      const cob = c.coberturaGastos!;
      expect(cob.aportacionPromocion).toBe(13380); // bono CONSUMIDO < tope 15,000
      expect(cob.sobreprecioCobertura).toBe(20000);
      expect(cob.saldoCobertura).toBe(0); // los gastos cuadran
      // FIX: promo consumida (13,380) + sobreprecio (20,000) = 33,380, NO el tope
      // (15,000 + 20,000 = 35,000).
      expect(c.descuentoAplicado).toBe(33380);
      expect(c.chequePagado).toBe(33380);
      // "Descuento perdonado" de la revisión PLD = descuentoAplicado − cheque.
      expect(c.descuentoAplicado - c.chequePagado).toBe(0); // sin fantasma → sin warning
    });

    // `dilesa-descuento-perdonado-motor`: sobreprecio capturado >> el que cubre los
    // gastos — el caso que disparaba el warning PLD de Christopher (M3-L16). El precio
    // se subió 101,000 (920k → 1,021k) pero solo 15,000 de ese sobreprecio cubre los
    // gastos (el resto es venta real que DILESA conserva). El motor sumaba el CAPTURADO
    // (101,000) a descuentoAplicado → `descuentoAplicado − cheque` = 70,360 de perdón
    // fantasma. Con el efectivo (sobreprecioCobertura 15,000) → descuentoAplicado =
    // 15,000 = descuentoReal, sin fantasma.
    it('sobreprecio capturado >> el que cubre gastos: descuentoAplicado usa el efectivo, sin perdón fantasma (Christopher M3-L16)', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 1021000,
        montoCreditoTitular: 1021000, // crédito cubre el precio → el enganche fondea gastos
        montoCreditoCotitular: 0,
        montoCreditoDirecto: null,
        montoChequeNotaria: 30640, // cheque a notaría girado (Fase 11)
        gastosEscrituracion: 60640,
        apoyoInfonavit: 30000,
        precioBase: 920000,
        incrementoCredito: 0,
        sobreprecioGastos: 101000, // 920k → 1,021k escriturado (hecho); solo 15k cubre gastos
        promocionGastos: 0, // sin bono
        depositos: [{ monto: 15640, directoCliente: true, tieneRecibo: true }],
        proyectoNombre: 'Lomas de los Encinos',
      });
      const cob = c.coberturaGastos!;
      expect(cob.aportacionPromocion).toBe(0); // sin bono
      expect(cob.sobreprecioCobertura).toBe(15000); // efectivo: lo que cubre los gastos
      expect(cob.saldoCobertura).toBe(0); // los gastos cuadran
      // FIX: el efectivo (15,000), NO el capturado (101,000).
      expect(c.descuentoAplicado).toBe(15000);
      expect(c.descuentoReal).toBe(15000); // descuentoAplicado == descuentoReal
      expect(c.chequePagado).toBe(30640);
      // "Descuento perdonado" de la revisión PLD = descuentoAplicado − cheque.
      expect(Math.max(0, c.descuentoAplicado - c.chequePagado)).toBe(0); // sin fantasma → sin warning
      // El saldoCliente legacy (no mostrado en desglose) también queda sano.
      expect(c.saldoCliente).toBe(0); // antes: −86,000
    });

    // Camino "Cobrar" del residual de precio (iniciativa dilesa-saldos-residuales S2):
    // el cliente firma un pagaré por los $792. El pagaré NO sobre-fondea los gastos
    // (ya cuadran): se asigna al PRECIO, sube el Valor Real y baja la NC en $792.
    it('Juan Antonio cobra el residual con pagaré: el pagaré va al precio, no a gastos', () => {
      const base = {
        valorEscrituracion: 920000,
        montoCreditoTitular: 762265,
        montoCreditoCotitular: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: 42569.42,
        apoyoInfonavit: 30000,
        precioBase: 920000,
        incrementoCredito: 0,
        sobreprecioGastos: 0,
        promocionGastos: 15000,
        depositos: [{ monto: 156943, directoCliente: true, tieneRecibo: false }],
        proyectoNombre: 'Lomas de los Encinos',
      };
      const sinPagare = calcularCuadratura({ ...base, montoCreditoDirecto: null });
      const conPagare = calcularCuadratura({ ...base, montoCreditoDirecto: 792 });
      const cob = conPagare.coberturaGastos!;
      expect(cob.pagareGastos).toBe(0); // gastos ya cuadran (pagareNecesario 0)
      expect(cob.pagarePrecio).toBe(792); // todo el pagaré financia el precio
      expect(cob.saldoCobertura).toBe(0); // gastos siguen cuadrando, sin sobre-fondeo
      expect(conPagare.valorRealVentaDilesa - sinPagare.valorRealVentaDilesa).toBe(792);
      expect(sinPagare.montoNotaCredito - conPagare.montoNotaCredito).toBe(792);
      expect(conPagare.montoNotaCredito).toBe(12569.42);
      // El motor sigue señalando el residual (la decisión "cobrar" vive en la venta,
      // no en el motor); la fase 8 la combina con la resolución persistida.
      expect(conPagare.requiereResolucionSaldoResidual).toBe(true);
    });

    // Regresión (caso Ruben M3-L17-LDLE, reportado 2026-06-25): la cabecera mostraba
    // `saldoPrecioEscrituracion` crudo (158,551) mientras el panel ya restaba el
    // enganche y mostraba 1. `saldoPrecioPorCubrir` unifica ambos: crédito 761,449 +
    // enganche 158,550 cubren el precio salvo 1 peso de redondeo (lo absorbe el bono).
    // (Los gastos no afectan este derivado: depende solo de precio − crédito − enganche.)
    it('Ruben (M3-L17): saldoPrecioPorCubrir resta el enganche pagado del saldo del precio', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 920000,
        montoCreditoTitular: 761449,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: 42569.42,
        apoyoInfonavit: 30000,
        precioBase: 920000,
        sobreprecioGastos: 0,
        promocionGastos: 14209,
        depositos: [{ monto: 158550, directoCliente: true, tieneRecibo: false }],
        proyectoNombre: 'Lomas de los Encinos',
      });
      expect(c.saldoPrecioEscrituracion).toBe(158551); // crudo (lo que mostraba la cabecera)
      expect(c.coberturaGastos?.engancheAlPrecio).toBe(158550); // enganche aplicado al precio
      expect(c.saldoPrecioPorCubrir).toBe(1); // ← lo que el panel ya mostraba ("Saldo por cubrir")
      expect(c.requiereResolucionSaldoResidual).toBe(false); // 1 ≤ tolerancia → ruido, no exige resolución
    });

    // Infonavit con enganche MAYOR que el saldo del precio: el excedente sí fondea
    // los gastos. Caso real M20-L34 (cuadra en 0 con enganche 42,500 + bono 15,000).
    it('Infonavit con enganche > saldo del precio: el excedente fondea los gastos — M20-L34', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 1332652,
        montoCreditoTitular: 1309247,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: 87500, // bruto; apoyo 30,000 → neto 57,500
        apoyoInfonavit: 30000,
        precioBase: 1332652,
        sobreprecioGastos: 0,
        promocionGastos: 15000,
        depositos: [{ monto: 65905, directoCliente: true, tieneRecibo: false }],
      });
      const cob = c.coberturaGastos!;
      expect(cob.engancheAlPrecio).toBe(23405); // cubre el saldo del precio (1,332,652 − 1,309,247)
      expect(cob.engancheCliente).toBe(42500); // el excedente (65,905 − 23,405) va a gastos
      expect(cob.aportacionPromocion).toBe(15000); // DILESA aporta el bono completo
      expect(cob.sobreprecioCobertura).toBe(0);
      expect(cob.saldoCobertura).toBe(0); // 87,500 − 30,000 − 15,000 − 42,500
    });

    it('calcula el pagaré necesario aunque aún no se capture el crédito directo', () => {
      // Antes de capturar el pagaré (CD=0) y el cheque: el faltante sigue siendo 9,387.
      const c = mayra({ montoCreditoDirecto: 0, montoChequeNotaria: 0 });
      expect(c.coberturaGastos?.pagareNecesario).toBe(9387);
    });

    // Raquel (M3-L6-LDLE, Infonavit Tradicional): venta legacy a la que se subió la
    // escrituración 920,000 → 930,000 con un sobreprecio de 10,000 (margen del crédito
    // para absorber gastos). Con el dato corregido (precio_base 920k + sobreprecio 10k),
    // el split de cobertura respeta el sobreprecio capturado: sobreprecio 10,000 + bono
    // 10,461 — NO el bono-primero (15,000 + sobreprecio 5,461). El descuento real, el
    // valor real y el saldo NO cambian: solo se reparte distinto el mismo total.
    it('Raquel (M3-L6): el sobreprecio capturado manda el split, no el bono-primero', () => {
      const c = calcularCuadratura({
        valorEscrituracion: 930000,
        montoCreditoTitular: 930000,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: null,
        montoChequeNotaria: null,
        gastosEscrituracion: 50461,
        apoyoInfonavit: 30000,
        precioBase: 920000,
        incrementoCredito: 0,
        sobreprecioGastos: 10000,
        promocionGastos: 15000,
        depositos: [],
        proyectoNombre: 'Lomas de los Encinos',
      });
      const cob = c.coberturaGastos!;
      // Formación del precio: base 920k + sobreprecio 10k = escrituración 930k.
      expect(c.formacionPrecio?.precioBase).toBe(920000);
      expect(c.formacionPrecio?.sobreprecioGastos).toBe(10000);
      expect(c.formacionPrecio?.valorEscrituracion).toBe(930000);
      // Cobertura del presupuesto notarial: el sobreprecio capturado (10k) manda; el
      // bono es el residual (10,461). El subsidio Infonavit (30k) aparte. Cuadra en 0.
      expect(cob.gastosBrutos).toBe(50461);
      expect(cob.apoyoInfonavit).toBe(30000);
      expect(cob.aportacionPromocion).toBe(10461);
      expect(cob.sobreprecioCobertura).toBe(10000);
      expect(cob.pagareNecesario).toBe(0); // 20,461 − 15,000 − 0 − 10,000 < 0 → 0
      expect(cob.saldoCobertura).toBe(0);
      // Invariantes que NO cambian con el split: descuento real (= a pagar notaría),
      // valor real y comisión sobre el valor real menos el sobreprecio (no comisiona).
      expect(c.descuentoReal).toBe(20461);
      expect(c.valorRealVentaDilesa).toBe(909539);
      expect(c.comisionVendedor).toBe(8995.39); // (909,539 − 10,000) × 1%
    });

    it('operacionCubierta es model-aware y el saldoCliente legacy ya no es fantasma — Arizpe', () => {
      // El crédito cubre el precio (909,000) y las fuentes cubren los gastos.
      // `dilesa-descuento-perdonado-motor`: con `descuentoAplicado` usando el
      // sobreprecio EFECTIVO (15,000 promo + 3,313 sobreprecio = 18,313 = cheque), el
      // `saldoCliente` legacy queda en 0 (antes daba 3,313 fantasma usando el descuento
      // sin el sobreprecio). `operacionCubierta` sigue siendo la fuente canónica para
      // copiloto/gates. saldoOperacion = 0 (nada pendiente).
      const c = calcularCuadratura({
        valorEscrituracion: 909000,
        montoCreditoTitular: 909000,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoDetonado: 908999.71,
        montoChequeNotaria: 18313,
        gastosEscrituracion: 48313,
        apoyoInfonavit: 30000,
        precioBase: 909000,
        sobreprecioGastos: 0,
        promocionGastos: 15000,
        depositos: [],
      });
      expect(c.descuentoAplicado).toBe(18313); // promo 15,000 + sobreprecio efectivo 3,313
      expect(c.saldoCliente).toBe(0); // ya no fantasma (antes 3,313)
      expect(c.cubierta).toBe(true); // legacy ya coincide con operacionCubierta
      expect(c.operacionCubierta).toBe(true); // ← model-aware: SÍ cubierta
      expect(c.saldoOperacion).toBe(0); // nada pendiente
    });

    it('expone la formación del precio (cadena base → incremento → interno → productos + sobreprecio)', () => {
      const c = mayra();
      expect(c.formacionPrecio).toEqual({
        precioBase: 899000,
        valorExcedenteTerreno: 0,
        valorFrenteVerde: 0,
        valorEsquina: 0,
        valorVentaFuturo: 0,
        geometria: 0,
        incrementoCredito: 55419,
        precioInterno: 954419, // 899,000 + 0 geom + 55,419
        productos: 0, // sin productos reales en MAYRA
        sobreprecioGastos: 24651, // el sobreprecio para gastos
        valorEscrituracion: 979070, // 954,419 + 0 productos + 24,651 sobreprecio
      });
    });

    it('desglosa la geometría del lote en la cadena de precio (excedente/esquina + IMSS)', () => {
      // Caso real M10-L1-LDS: base 2,094,000 + excedente 36,700 + esquina 67,008
      // + IMSS +6% 131,862.48 = escrituración 2,329,570.48 (cuadra al centavo).
      const c = calcularCuadratura({
        valorEscrituracion: 2329570.48,
        montoCreditoTitular: 2329570.48,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoChequeNotaria: null,
        gastosEscrituracion: 0,
        precioBase: 2094000,
        valorExcedenteTerreno: 36700,
        valorEsquina: 67008,
        incrementoCredito: 131862.48,
        sobreprecioGastos: 0,
        promocionGastos: 15000,
        depositos: [],
      });
      expect(c.formacionPrecio?.geometria).toBe(103708); // 36,700 + 67,008
      expect(c.formacionPrecio?.precioInterno).toBe(2329570.48); // base + geom + incremento
      // base + geometría + incremento + productos + sobreprecio = escrituración (cuadra)
      const fp = c.formacionPrecio!;
      expect(
        fp.precioBase + fp.geometria + fp.incrementoCredito + fp.productos + fp.sobreprecioGastos
      ).toBeCloseTo(fp.valorEscrituracion, 2);
    });

    it('deriva el cierre con el valor real neto del cheque (fórmula Michelle/Ale)', () => {
      const c = mayra();
      expect(c.chequeNotariaCalculado).toBe(84038); // gastos netos completos, no el min() viejo
      // Valor real = crédito + enganche − cheque + pagaré = 979,070 + 35,000 − 84,038 + 9,387.
      expect(c.valorRealVentaDilesa).toBe(939419);
      // Descuento real = escritura − valor real = 979,070 − 939,419 = promoción
      // 15,000 + sobreprecio 24,651 (todo lo que DILESA cede; fórmula Michelle).
      expect(c.descuentoReal).toBe(39651);
    });

    it('NC = facturado − valor real (incluye el cheque a notaría)', () => {
      const c = mayra();
      expect(c.desgloseFacturacion).toEqual({
        facturaVenta: 979070, // escrituración
        facturaEnganche: 35000, // enganche con recibo CFDI
        totalFacturado: 1014070,
        notaCredito: 74651, // acredita el enganche + el cheque a notaría − pagaré
        netoFacturado: 939419, // = valor real venta DILESA (neto del cheque) ✓
      });
      // NC = 1,014,070 − 939,419 (Michelle: facturado − valor real).
      expect(c.montoNotaCredito).toBe(74651);
    });

    it('comisiones sobre el valor real − sobreprecio para gastos (base Michelle/Ale)', () => {
      const c = mayra();
      // base = valor real 939,419 − sobreprecio 24,651 = 914,768. El sobreprecio
      // para gastos NO comisiona; los productos reales (0 aquí) SÍ comisionarían.
      expect(c.comisionVendedor).toBe(9147.68); // 914,768 × 1.0%
      expect(c.comisionGerencia).toBe(4573.84); // 914,768 × 0.5%
    });

    it('productos reales SÍ comisionan; el sobreprecio para gastos NO (separación 20260623)', () => {
      // MAYRA + 30,000 de productos reales (closets), con el crédito subido para
      // cubrirlos. valorReal = 1,009,070 + 35,000 − 84,038 + 9,387 = 969,419.
      // base = valorReal − sobreprecio 24,651 = 944,768 (los 30,000 de productos
      // NO se restan → comisionan; +300 vs el caso sin productos).
      const c = mayra({
        productosAdicionales: 30000,
        valorEscrituracion: 1009070,
        montoCreditoTitular: 1009070,
      });
      expect(c.comisionVendedor).toBe(9447.68); // 944,768 × 1.0% (= 9,147.68 + 300)
      expect(c.formacionPrecio?.productos).toBe(30000); // se muestran en la cadena
      expect(c.formacionPrecio?.sobreprecioGastos).toBe(24651); // separado de los productos
    });

    it('usa el monto detonado real (no el crédito) para el valor real — caso Arizpe', () => {
      // INFONAVIT detonada: monto_detonado 908,999.71 (≠ crédito 909,000), cheque
      // 18,313, sin enganche/pagaré. NC = 909,000 − 890,686.71 = 18,313.29
      // (igual al peso al archivo de Michelle).
      const c = calcularCuadratura({
        valorEscrituracion: 909000,
        montoCreditoTitular: 909000,
        montoCreditoCotitular: 0,
        montoCreditoDirecto: 0,
        montoDetonado: 908999.71,
        montoChequeNotaria: 18313,
        gastosEscrituracion: 48313,
        apoyoInfonavit: 30000,
        precioBase: 909000,
        sobreprecioGastos: 0,
        promocionGastos: 15000,
        depositos: [],
      });
      expect(c.valorRealVentaDilesa).toBe(890686.71); // detonado − cheque
      expect(c.montoNotaCredito).toBe(18313.29); // facturado 909,000 − valor real
    });

    it('FALLBACK: el cierre NO se toca sin desglose (formacionPrecio null, fórmula vieja)', () => {
      const c = mayra({ promocionGastos: null, precioBase: null, incrementoCredito: null });
      expect(c.formacionPrecio).toBe(null);
      expect(c.saldoPrecioEscrituracion).toBe(null); // legacy usa saldoCliente, no este
      expect(c.saldoPrecioPorCubrir).toBe(null); // sin desglose, no aplica
      // Con la fórmula vieja: depósitos 35,000 − cheque calc + CD.
      expect(c.valorRealVentaDilesa).not.toBe(954419);
    });

    it('FALLBACK: sin desglose, el mismo escenario usa descuento_total (idéntico al modelo viejo)', () => {
      // Cerradas/legacy: sin promocionGastos/sobreprecioAdicionales, con el
      // descuento mezclado en descuento_total. Debe dar el mismo saldo y NO
      // exponer coberturaGastos.
      const c = mayra({
        promocionGastos: null,
        sobreprecioGastos: null,
        precioBase: null,
        incrementoCredito: null,
        descuentoOtorgadoTotal: 39651, // promoción + sobreprecio mezclados (modelo viejo)
      });
      expect(c.tieneDesglose).toBe(false);
      expect(c.coberturaGastos).toBe(null);
      expect(c.descuentoAplicado).toBe(39651);
      expect(c.saldoCliente).toBe(0); // mismo resultado que el desglosado
    });

    // Blindaje: el sobreprecio para gastos (→ sobreprecioGastos) quedó poblado en
    // las 56 ventas que tenían productos_adicionales (legacy/cerradas incluidas)
    // tras el backfill 20260623. Por sí solo NO debe activar el modelo desglosado
    // — si lo hiciera, le movería el saldo a esas ventas históricas.
    it('NO activa el desglose si solo viene sobreprecioGastos (sin promoción/base)', () => {
      const c = mayra({
        promocionGastos: null,
        precioBase: null,
        incrementoCredito: null,
        sobreprecioGastos: 24651, // poblado (sobreprecio movido en el backfill)
        descuentoOtorgadoTotal: 0,
        descuentoMaximoAutorizado: null,
      });
      expect(c.tieneDesglose).toBe(false); // ← clave: NO se activa
      expect(c.coberturaGastos).toBe(null);
      expect(c.descuentoAplicado).toBe(0); // usa descuento_total (0), no el sobreprecio
    });
  });
});

describe('partirDescuento', () => {
  it('parte un descuento mayor que la promo en promoción topada + sobreprecio (resto)', () => {
    // Arizpe: descuento real 18,313 → promo 15,000 (topada) + sobreprecio 3,313.
    expect(partirDescuento(18313, 15000)).toEqual({ promocion: 15000, sobreprecio: 3313 });
    // MAYRA: 39,651 → 15,000 + 24,651.
    expect(partirDescuento(39651, 15000)).toEqual({ promocion: 15000, sobreprecio: 24651 });
  });

  it('si el descuento no llega a la promo, toda la promoción y 0 de sobreprecio', () => {
    expect(partirDescuento(10000, 15000)).toEqual({ promocion: 10000, sobreprecio: 0 });
  });

  it('descuento 0 o negativo → 0 y 0 (no inventa promoción)', () => {
    expect(partirDescuento(0, 15000)).toEqual({ promocion: 0, sobreprecio: 0 });
    expect(partirDescuento(-500, 15000)).toEqual({ promocion: 0, sobreprecio: 0 });
  });

  it('sin promoción autorizada (0/null) todo el descuento es sobreprecio', () => {
    expect(partirDescuento(8000, 0)).toEqual({ promocion: 0, sobreprecio: 8000 });
    expect(partirDescuento(8000, null)).toEqual({ promocion: 0, sobreprecio: 8000 });
  });

  it('conserva centavos (escritura − valor real puede no ser entero)', () => {
    expect(partirDescuento(18313.29, 15000)).toEqual({ promocion: 15000, sobreprecio: 3313.29 });
  });

  // El sobreprecio CAPTURADO es piso del split: cuando se subió el precio para que
  // el crédito absorbiera gastos, ese monto es sobreprecio aunque el bono no se
  // haya agotado. Caso Raquel (M3-L6): descuento real 20,461, bono 15,000,
  // sobreprecio capturado 10,000 → sobreprecio 10,000 (no 5,461) + bono 10,461.
  it('el sobreprecio capturado es piso del split (Raquel M3-L6)', () => {
    expect(partirDescuento(20461, 15000, 10000)).toEqual({ promocion: 10461, sobreprecio: 10000 });
  });

  it('piso ≤ residual no cambia nada (idéntico a 2 args)', () => {
    // Residual sobre el bono = 18,313 − 15,000 = 3,313; un piso menor no manda.
    expect(partirDescuento(18313, 15000, 3000)).toEqual({ promocion: 15000, sobreprecio: 3313 });
    expect(partirDescuento(18313, 15000, 0)).toEqual({ promocion: 15000, sobreprecio: 3313 });
    // MAYRA: el piso capturado coincide con el residual.
    expect(partirDescuento(39651, 15000, 24651)).toEqual({ promocion: 15000, sobreprecio: 24651 });
  });

  it('el piso nunca inventa bono por encima del autorizado', () => {
    // Sin piso, residual 5,461 + bono 15,000; con piso 10,000 el bono BAJA a 10,461
    // (nunca sube de 15,000). El sobreprecio capturado solo puede mover bono→sobreprecio.
    expect(partirDescuento(20461, 15000)).toEqual({ promocion: 15000, sobreprecio: 5461 });
    expect(partirDescuento(20461, 15000, 10000).promocion).toBeLessThanOrEqual(15000);
  });

  it('el piso se topa al total (no genera bono negativo)', () => {
    // Sobreprecio capturado mayor que el descuento real → todo sobreprecio, bono 0.
    expect(partirDescuento(20461, 15000, 25000)).toEqual({ promocion: 0, sobreprecio: 20461 });
  });
});

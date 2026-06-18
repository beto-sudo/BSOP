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
    expect(c.comisionGerencia).toBe(4495); // 899,000 × 0.5%
    expect(c.comisionVendedor).toBe(8990); // 899,000 × 1.0% (no Loma Verde)
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
        sobreprecioAdicionales: 24651,
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
        engancheCliente: 35000,
        sobreprecio: 24651, // productos capturados
        sobreprecioCobertura: 24651, // el que cubre el presupuesto
        pagareNecesario: 9387, // faltante si DILESA solo aporta la promo autorizada
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
        sobreprecioAdicionales: 0,
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

    it('calcula el pagaré necesario aunque aún no se capture el crédito directo', () => {
      // Antes de capturar el pagaré (CD=0) y el cheque: el faltante sigue siendo 9,387.
      const c = mayra({ montoCreditoDirecto: 0, montoChequeNotaria: 0 });
      expect(c.coberturaGastos?.pagareNecesario).toBe(9387);
    });

    it('expone la formación del precio (cadena base → incremento → interno → adicionales)', () => {
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
        adicionales: 24651,
        valorEscrituracion: 979070, // 954,419 + 24,651
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
        sobreprecioAdicionales: 0,
        promocionGastos: 15000,
        depositos: [],
      });
      expect(c.formacionPrecio?.geometria).toBe(103708); // 36,700 + 67,008
      expect(c.formacionPrecio?.precioInterno).toBe(2329570.48); // base + geom + incremento
      // base + geometría + incremento + sobreprecio = escrituración (cuadra)
      const fp = c.formacionPrecio!;
      expect(fp.precioBase + fp.geometria + fp.incrementoCredito + fp.adicionales).toBeCloseTo(
        fp.valorEscrituracion,
        2
      );
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

    it('comisiones sobre el valor real − productos adicionales (base Michelle/Ale)', () => {
      const c = mayra();
      // base = valor real 939,419 − PA 24,651 = 914,768.
      expect(c.comisionVendedor).toBe(9147.68); // 914,768 × 1.0%
      expect(c.comisionGerencia).toBe(4573.84); // 914,768 × 0.5%
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
        sobreprecioAdicionales: 0,
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
      // Con la fórmula vieja: depósitos 35,000 − cheque calc + CD.
      expect(c.valorRealVentaDilesa).not.toBe(954419);
    });

    it('FALLBACK: sin desglose, el mismo escenario usa descuento_total (idéntico al modelo viejo)', () => {
      // Cerradas/legacy: sin promocionGastos/sobreprecioAdicionales, con el
      // descuento mezclado en descuento_total. Debe dar el mismo saldo y NO
      // exponer coberturaGastos.
      const c = mayra({
        promocionGastos: null,
        sobreprecioAdicionales: null,
        precioBase: null,
        incrementoCredito: null,
        descuentoOtorgadoTotal: 39651, // promoción + sobreprecio mezclados (modelo viejo)
      });
      expect(c.tieneDesglose).toBe(false);
      expect(c.coberturaGastos).toBe(null);
      expect(c.descuentoAplicado).toBe(39651);
      expect(c.saldoCliente).toBe(0); // mismo resultado que el desglosado
    });

    // Blindaje: `productos_adicionales` (→ sobreprecioAdicionales) está poblado
    // en TODAS las ventas (legacy incluido). Por sí solo NO debe activar el
    // modelo desglosado — si lo hiciera, le movería el saldo a todo el histórico.
    it('NO activa el desglose si solo viene sobreprecioAdicionales (sin promoción/base)', () => {
      const c = mayra({
        promocionGastos: null,
        precioBase: null,
        incrementoCredito: null,
        sobreprecioAdicionales: 24651, // poblado (productos_adicionales legacy)
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
});

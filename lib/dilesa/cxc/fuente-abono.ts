/**
 * Fuente de un abono CxC vs lo que va a cubrir.
 *
 * `erp.cxc_pago_registrar` aplica el abono FIFO a TODOS los cargos abiertos
 * (la fuente NO filtra esa aplicación), pero la etiqueta `fuente` SÍ pesa en
 * la cuadratura (lib/dilesa/cuadratura.ts): los abonos fuente='cliente' suman
 * al Monto Disponible como "depósito directo cliente", mientras el crédito de
 * institución ya entra por los campos de crédito de la venta. Etiquetar la
 * disposición del crédito como 'cliente' duplica ese dinero en el disponible
 * (bug operativo detectado 2026-06-12).
 *
 * Estos helpers asumen los cargos ya en el orden FIFO del RPC
 * (`fecha_vencimiento ASC NULLS LAST, numero ASC`) para sugerir la etiqueta
 * correcta al capturar y avisar cuando no cuadra con lo que va a cubrir.
 */

export type CargoAbiertoFuente = {
  /** Saldo pendiente del cargo (> 0 = abierto). */
  saldo: number;
  fuente_esperada: string;
};

export type RepartoFifo = {
  /** Monto que aplicaría a cargos con fuente_esperada='cliente'. */
  cliente: number;
  /** Monto que aplicaría a cargos con fuente_esperada='institucion'. */
  institucion: number;
  /** Excedente que no aplica a ningún cargo (queda como saldo a favor). */
  sinAplicar: number;
};

/** Fuente sugerida para un abono nuevo: la que espera el primer cargo abierto. */
export function sugerirFuenteAbono(cargos: CargoAbiertoFuente[]): 'cliente' | 'institucion' {
  const primero = cargos.find((c) => c.saldo > 0);
  return primero?.fuente_esperada === 'institucion' ? 'institucion' : 'cliente';
}

/** Simula la aplicación FIFO del RPC y reparte el monto por fuente esperada. */
export function repartirAbonoFifo(cargos: CargoAbiertoFuente[], monto: number): RepartoFifo {
  const reparto: RepartoFifo = { cliente: 0, institucion: 0, sinAplicar: 0 };
  let restante = monto > 0 ? monto : 0;
  for (const c of cargos) {
    if (restante <= 0) break;
    const aplica = Math.min(restante, Math.max(c.saldo, 0));
    if (aplica <= 0) continue;
    if (c.fuente_esperada === 'institucion') reparto.institucion += aplica;
    else reparto.cliente += aplica;
    restante -= aplica;
  }
  reparto.sinAplicar = restante;
  return reparto;
}

/** ¿El abono aplicaría mayormente a cargos que esperan pago de institución? */
export function abonoCubreMayormenteInstitucion(
  cargos: CargoAbiertoFuente[],
  monto: number
): boolean {
  if (!(monto > 0)) return false;
  const r = repartirAbonoFifo(cargos, monto);
  return r.institucion > r.cliente;
}

/**
 * ¿El abono quedaría 100% sin aplicar (saldo a favor = monto total)? Pasa
 * cuando la venta no tiene ningún cargo abierto que el FIFO del RPC pueda
 * cubrir: el dinero queda flotando sin bajar saldo y sin disparar el trigger
 * de detonación de fase. El caso más común es una venta SIN plan de pagos
 * (cero cargos), donde un abono se captura sin efecto y se puede duplicar en
 * silencio (incidente Arizpe Luna 2026-06-17). Espejo del FIFO del RPC.
 */
export function abonoQuedariaSinAplicar(cargos: CargoAbiertoFuente[], monto: number): boolean {
  if (!(monto > 0)) return false;
  const r = repartirAbonoFifo(cargos, monto);
  return r.cliente + r.institucion <= 0;
}

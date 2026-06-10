/**
 * Resumen "qué se capturó" por fase del pipeline de ventas — pares
 * label/valor que cada fase dejó en `dilesa.ventas`, para verlos en el
 * expediente sin entrar a la página de captura (Beto, 2026-06-10: "falta
 * poder ver lo que está capturado en cada fase").
 *
 * Pura: recibe el subset de campos de la venta y la posición; devuelve solo
 * los pares con valor. Los montos llegan formateados por el formateador que
 * inyecte el caller (la página usa su `fmtMoney`).
 */

export type VentaCamposFase = {
  tipo_credito: string | null;
  precio_asignacion: number | null;
  enganche_requerido: number | null;
  descuento_total: number | null;
  fecha_solicitud_avaluo: string | null;
  casa_valuadora: string | null;
  monto_avaluo: number | null;
  fecha_avaluo_cerrado: string | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  credito_titular_ref: string | null;
  credito_cotitular_ref: string | null;
  fecha_solicitud_dictamen: string | null;
  fecha_dictaminada: string | null;
  valor_escrituracion: number | null;
  gastos_escrituracion: number | null;
  fecha_validacion_patronal: string | null;
  fecha_firma_programada: string | null;
  monto_credito_directo: number | null;
  numero_escritura: string | null;
  fecha_escritura: string | null;
  numero_cheque_notaria: string | null;
  monto_cheque_notaria: number | null;
  fecha_detonacion: string | null;
  monto_detonado: number | null;
  valor_facturado: number | null;
  valor_real_venta_dilesa: number | null;
  monto_nota_credito: number | null;
};

export function camposCapturadosPorFase(
  pos: number,
  v: VentaCamposFase,
  money: (n: number | null) => string | null
): Array<[string, string]> {
  const pares: Array<[string, string | null]> = (() => {
    switch (pos) {
      case 1:
        return [
          ['Tipo de crédito', v.tipo_credito],
          ['Precio de asignación', money(v.precio_asignacion)],
        ];
      case 3:
        return [
          ['Precio de asignación', money(v.precio_asignacion)],
          ['Enganche requerido', money(v.enganche_requerido)],
          ['Descuento total', money(v.descuento_total)],
        ];
      case 4:
        return [
          ['Fecha solicitud', v.fecha_solicitud_avaluo],
          ['Casa valuadora', v.casa_valuadora],
        ];
      case 5:
        return [
          ['Monto del avalúo', money(v.monto_avaluo)],
          ['Fecha avalúo cerrado', v.fecha_avaluo_cerrado],
        ];
      case 6:
        return [
          ['Crédito titular', money(v.monto_credito_titular)],
          ['Crédito co-titular', money(v.monto_credito_cotitular)],
          ['Ref. titular', v.credito_titular_ref],
          ['Ref. co-titular', v.credito_cotitular_ref],
        ];
      case 7:
        return [['Fecha solicitud', v.fecha_solicitud_dictamen]];
      case 8:
        return [
          ['Fecha dictamen', v.fecha_dictaminada],
          ['Valor de escrituración', money(v.valor_escrituracion)],
          ['Gastos de escrituración', money(v.gastos_escrituracion)],
          ['Crédito titular', money(v.monto_credito_titular)],
          ['Ref. titular', v.credito_titular_ref],
        ];
      case 9:
        return [['Fecha validación', v.fecha_validacion_patronal]];
      case 10:
        return [
          ['Fecha de firma', v.fecha_firma_programada],
          ['Crédito directo (pagaré)', money(v.monto_credito_directo)],
        ];
      case 11:
        return [
          ['Escritura #', v.numero_escritura],
          ['Fecha escritura', v.fecha_escritura],
          ['Cheque notaría #', v.numero_cheque_notaria],
          ['Monto cheque', money(v.monto_cheque_notaria)],
        ];
      case 12:
        return [
          ['Fecha detonación', v.fecha_detonacion],
          ['Monto detonado', money(v.monto_detonado)],
        ];
      case 13:
        return [
          ['Valor de escrituración', money(v.valor_escrituracion)],
          ['Valor facturado', money(v.valor_facturado)],
          ['Valor real venta', money(v.valor_real_venta_dilesa)],
          ['Nota de crédito', money(v.monto_nota_credito)],
        ];
      default:
        return [];
    }
  })();
  return pares.filter((p): p is [string, string] => p[1] != null && p[1] !== '');
}

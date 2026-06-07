/**
 * Template PDF: Solicitud de Asignación (Sprint 7b).
 * Replica el export de Coda para que el vendedor pueda imprimir, firmar
 * con cliente y subir al expediente.
 *
 * Layout: 1 página
 * - Header band con isotipo + título "SOLICITUD DE ASIGNACIÓN"
 * - Datos de la vivienda (fraccionamiento, manzana, lote, prototipo,
 *   domicilio, identificador, terreno excedente, frente verde, esquina,
 *   precio por m² excedente)
 * - Asesor de ventas (derecha)
 * - Detalle de operación: valor comercial + adicionales
 * - Precio de venta + enganche 1% + ISAI 2% + gastos notariales 6%
 * - Forma de pago: tipo de crédito + pago directo + crédito titular
 *   + cotitular + total pagos
 * - Texto legal de pie + firma cliente
 * - Footer band con marca
 */
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Folio, Watermark } from './header-footer';

export type SolicitudData = {
  fechaTexto: string; // "24 de Mayo del 2026"
  fraccionamiento: string;
  manzana: string;
  lote: string;
  prototipo: string;
  domicilioOficial: string;
  identificacionInventario: string; // M3-L9-LDLE-ISC
  terrenoExcedente: number;
  frenteVerde: boolean;
  esquina: boolean;
  precioM2Excedente: number;
  asesorVentas: string;
  // detalle
  valorComercial: number;
  valorExcedenteTerreno: number;
  valorFrenteVerde: number;
  valorEsquina: number;
  valorVentaFuturo: number;
  costoCreditoAdicional: number; // IMSS/Fovissste etc.
  productosAdicionales: number; // monto $ extras declarados por vendedor (paridad Coda)
  // precio + cargos
  precioVenta: number;
  enganche1pct: number;
  isai2pct: number;
  gastosNotariales6pct: number;
  // forma de pago
  tipoCredito: string;
  pagoDirecto: number;
  montoCreditoTitular: number;
  montoCreditoCotitular: number;
  totalPagosDisponibles: number;
  // firma
  clienteNombre: string;
  folio: string; // ej. JHM-M3-L9-LDLE-ISC-5/24/2026 9:34:28 AM
  /** Si la venta está desasignada/expirada, texto a estampar como watermark. */
  watermark?: string | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number) => moneyFmt.format(Number(n) || 0);
const yesNo = (b: boolean) => (b ? 'SÍ' : 'NO');

export function SolicitudAsignacionPDF({ data }: { data: SolicitudData }) {
  return (
    <Document title={`Solicitud de Asignación — ${data.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="SOLICITUD DE ASIGNACIÓN" fecha={data.fechaTexto} />
        {data.watermark ? <Watermark text={data.watermark} /> : null}

        {/* ── Datos de la vivienda ── */}
        <Text style={styles.sectionTitle}>DATOS DE LA VIVIENDA</Text>
        <DataRow label="FRACCIONAMIENTO:" value={data.fraccionamiento} />
        <View style={styles.row}>
          <DataInline label="MANZANA:" value={data.manzana} />
          <View style={{ width: 20 }} />
          <DataInline label="LOTE:" value={data.lote} />
          <View style={{ width: 20 }} />
          <DataInline label="PROTOTIPO:" value={data.prototipo} />
        </View>
        <DataRow label="DOMICILIO OFICIAL:" value={data.domicilioOficial} />
        <DataRow label="IDENTIFICACIÓN INVENTARIO:" value={data.identificacionInventario} />
        <View style={styles.row}>
          <DataInline label="TERRENO EXCEDENTE:" value={`${data.terrenoExcedente} m²`} />
          <View style={{ width: 20 }} />
          <DataInline label="FRENTE VERDE:" value={yesNo(data.frenteVerde)} />
          <View style={{ width: 20 }} />
          <DataInline label="ESQUINA:" value={yesNo(data.esquina)} />
        </View>
        <DataRow label="PRECIO POR M² EXCEDENTE:" value={money(data.precioM2Excedente)} />

        <View style={styles.rightCol}>
          <Text style={styles.label}>
            <Text>ASESOR DE VENTAS: </Text>
            <Text style={styles.labelStrong}>{data.asesorVentas}</Text>
          </Text>
        </View>

        {/* ── Detalle de Operación ── */}
        <Text style={styles.sectionTitle}>DETALLE DE OPERACIÓN</Text>
        <DataRow label="VALOR COMERCIAL ACTUAL:" value={money(data.valorComercial)} />
        <DataRow label="VALOR EXCEDENTE DE TERRENO:" value={money(data.valorExcedenteTerreno)} />
        <DataRow label="VALOR FRENTE VERDE:" value={money(data.valorFrenteVerde)} />
        <DataRow label="VALOR ESQUINA:" value={money(data.valorEsquina)} />
        <DataRow label="VALOR VENTA FUTURO:" value={money(data.valorVentaFuturo)} />
        <DataRow label="IMSS/FOVISSSTE:" value={money(data.costoCreditoAdicional)} />
        <DataRow label="PRODUCTOS ADICIONALES:" value={money(data.productosAdicionales)} />

        <View style={styles.divider} />

        {/* ── Precio + cargos ── */}
        <View style={styles.rightCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.precioVenta]}>PRECIO DE VENTA: </Text>
            <Text style={styles.precioVenta}>{money(data.precioVenta)}</Text>
          </View>
          <PrecioBreakdownRow
            label="ENGANCHE REQUERIDO PARA ASIGNACIÓN 1%:"
            value={money(data.enganche1pct)}
          />
          <PrecioBreakdownRow
            label="ISAI 2% (AL MOMENTO DE ESCRITURACIÓN):"
            value={money(data.isai2pct)}
          />
          <PrecioBreakdownRow
            label="GASTOS NOTARIALES APROXIMADOS 6% (AL MOMENTO DE ESCRITURACIÓN):"
            value={money(data.gastosNotariales6pct)}
          />
        </View>

        {/* ── Forma de pago ── */}
        <Text style={styles.sectionTitle}>FORMA DE PAGO</Text>
        <Text style={styles.labelStrong}>{data.tipoCredito.toUpperCase()}</Text>
        <View style={{ height: 4 }} />
        <DataRow label="PAGO DIRECTO:" value={money(data.pagoDirecto)} />
        <DataRow label="MONTO CREDITO TITULAR:" value={money(data.montoCreditoTitular)} />
        <DataRow label="MONTO CREDITO CO-TITULAR:" value={money(data.montoCreditoCotitular)} />
        <DataRow
          label="TOTAL PAGOS DISPONIBLES:"
          value={money(data.totalPagosDisponibles)}
          strong
        />

        {/* ── Texto legal ── */}
        <Text style={styles.legalText}>
          <Text>*</Text>He sido informado que si utilizó alguna institución financiera y el crédito
          no cubre el total del precio de venta, la diferencia tendrá que ser cubierta con recursos
          de mi propio peculio.
        </Text>
        <Text style={styles.legalText}>
          <Text>*</Text>Comprendo que el contrato de promesa de compraventa que se generará una vez
          entregado el enganche y la documentación requerida, así como la presente solicitud,
          <Text style={styles.legalTextBold}>
            {' '}
            tendrá que ser firmado dentro del mismo mes y en un plazo máximo de 2 días naturales
          </Text>{' '}
          a partir de la fecha de emisión de este documento, de lo contrario esta solicitud quedará
          sin validez y sujeta a cambio de precios y disponibilidad de inventario.
        </Text>

        {/* ── Firma cliente ── */}
        <View style={styles.firmaWrap}>
          <Text style={styles.firmaCliente}>Firma del Cliente</Text>
          <Text style={styles.firmaNombre}>{data.clienteNombre}</Text>
        </View>

        <View style={styles.firmaRow}>
          <Text style={styles.firmaLabel}>ASESOR</Text>
          <Text style={styles.firmaLabel}>COMITÉ</Text>
        </View>

        <Folio value={data.folio} />
        <FooterBand />
      </Page>
    </Document>
  );
}

function DataRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label} </Text>
      <Text style={strong ? styles.labelStrong : styles.labelStrong}>{value}</Text>
    </View>
  );
}

function DataInline({ label, value }: { label: string; value: string }) {
  return (
    <Text>
      <Text style={styles.label}>{label} </Text>
      <Text style={styles.labelStrong}>{value}</Text>
    </Text>
  );
}

function PrecioBreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
      <Text style={styles.precioBreakdownLabel}>{label}</Text>
      <Text style={[styles.precioBreakdownValue, { color: colors.primary }]}>{value}</Text>
    </View>
  );
}

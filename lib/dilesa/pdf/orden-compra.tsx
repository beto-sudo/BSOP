/**
 * Template PDF: Orden de Compra (OC) — iniciativa `dilesa-compras-operacion` S2b.
 *
 * El documento formal que DILESA entrega/envía al proveedor para comprometer una
 * compra. A diferencia de la Solicitud de Cotización (solo lista conceptos), la OC
 * lleva precios, total e instrucciones de entrega — es el compromiso.
 *
 * Reusa el branding DILESA (HeaderBand/FooterBand/styles). Los montos llegan ya
 * formateados (el endpoint los arma con formatCurrency). Los campos opcionales
 * (RFC/domicilio del proveedor, condiciones, entrega) se omiten si faltan.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Folio } from './header-footer';

export type OrdenCompraPdfData = {
  folio: string;
  fechaTexto: string;
  estadoLabel: string;
  proyecto: string;
  proveedorNombre: string;
  proveedorRfc: string | null;
  proveedorDomicilio: string | null;
  condicionesPago: string | null;
  fechaEntregaTexto: string | null;
  direccionEntrega: string | null;
  lineas: Array<{
    concepto: string;
    descripcion: string;
    cantidad: string;
    unidad: string;
    precioUnitario: string;
    importe: string;
  }>;
  totalTexto: string;
};

const t = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgSoft,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 4,
    marginTop: 3,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
    paddingVertical: 3,
  },
  totalRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 4,
    marginTop: 1,
  },
  cell: { fontSize: 8, paddingHorizontal: 4 },
  cellHead: { fontSize: 8, fontFamily: 'Helvetica-Bold', paddingHorizontal: 4 },
  colNum: { width: 18, textAlign: 'right' },
  colConcepto: { flex: 2 },
  colDesc: { flex: 2 },
  colCant: { width: 38, textAlign: 'right' },
  colUnidad: { width: 38 },
  colPrecio: { width: 56, textAlign: 'right' },
  colImporte: { width: 60, textAlign: 'right' },
});

export function OrdenCompraPDF({ data }: { data: OrdenCompraPdfData }) {
  return (
    <Document title={`Orden de Compra — ${data.folio}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="ORDEN DE COMPRA" fecha={data.fechaTexto} />

        <Text style={styles.sectionTitle}>DATOS DE LA ORDEN</Text>
        <DataRow label="FOLIO:" value={data.folio} />
        <DataRow label="PROYECTO:" value={data.proyecto} />
        <DataRow label="ESTADO:" value={data.estadoLabel} />
        {data.condicionesPago ? (
          <DataRow label="CONDICIONES DE PAGO:" value={data.condicionesPago} />
        ) : null}
        {data.fechaEntregaTexto ? (
          <DataRow label="FECHA DE ENTREGA:" value={data.fechaEntregaTexto} />
        ) : null}
        {data.direccionEntrega ? (
          <DataRow label="DIRECCIÓN DE ENTREGA:" value={data.direccionEntrega} />
        ) : null}

        <Text style={styles.sectionTitle}>PROVEEDOR</Text>
        <DataRow label="NOMBRE:" value={data.proveedorNombre} />
        {data.proveedorRfc ? <DataRow label="RFC:" value={data.proveedorRfc} /> : null}
        {data.proveedorDomicilio ? (
          <DataRow label="DOMICILIO:" value={data.proveedorDomicilio} />
        ) : null}

        <Text style={styles.sectionTitle}>CONCEPTOS</Text>
        <View style={t.headerRow}>
          <Text style={[t.cellHead, t.colNum]}>#</Text>
          <Text style={[t.cellHead, t.colConcepto]}>Concepto</Text>
          <Text style={[t.cellHead, t.colDesc]}>Descripción</Text>
          <Text style={[t.cellHead, t.colCant]}>Cant.</Text>
          <Text style={[t.cellHead, t.colUnidad]}>Unidad</Text>
          <Text style={[t.cellHead, t.colPrecio]}>P. Unit.</Text>
          <Text style={[t.cellHead, t.colImporte]}>Importe</Text>
        </View>
        {data.lineas.map((l, i) => (
          <View key={i} style={t.dataRow} wrap={false}>
            <Text style={[t.cell, t.colNum]}>{i + 1}</Text>
            <Text style={[t.cell, t.colConcepto]}>{l.concepto}</Text>
            <Text style={[t.cell, t.colDesc]}>{l.descripcion || '—'}</Text>
            <Text style={[t.cell, t.colCant]}>{l.cantidad}</Text>
            <Text style={[t.cell, t.colUnidad]}>{l.unidad || '—'}</Text>
            <Text style={[t.cell, t.colPrecio]}>{l.precioUnitario}</Text>
            <Text style={[t.cell, t.colImporte]}>{l.importe}</Text>
          </View>
        ))}
        <View style={t.totalRow}>
          <Text style={[t.cellHead, { flex: 1, textAlign: 'right' }]}>TOTAL (IVA incluido):</Text>
          <Text style={[t.cellHead, t.colImporte]}>{data.totalTexto}</Text>
        </View>

        <Text style={styles.legalText}>
          Esta orden de compra ampara los conceptos, cantidades y precios arriba descritos. Favor de
          referir el folio {data.folio} en su factura y remisión. Los montos incluyen IVA. La
          recepción se sujeta a verificación de cantidad y calidad contra lo aquí especificado.
        </Text>

        <Folio value={data.folio} />
        <FooterBand />
      </Page>
    </Document>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label} </Text>
      <Text style={styles.labelStrong}>{value}</Text>
    </View>
  );
}

/**
 * Template PDF: Solicitud de Cotización (RFQ) — iniciativa dilesa-compras.
 *
 * Documento que DILESA envía a un proveedor para pedirle que cotice un conjunto
 * de conceptos. Lleva SÓLO el listado de lo solicitado (concepto, descripción,
 * cantidad, unidad) — el proveedor responde con su propio formato/precios.
 *
 * Layout: 1 página (crece a varias si hay muchas líneas; el header/footer band
 * van fixed). Reusa el branding DILESA (HeaderBand/FooterBand/styles).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Folio } from './header-footer';

export type SolicitudCotizacionData = {
  folio: string;
  fechaTexto: string;
  proyecto: string;
  tipoLabel: string;
  fechaLimiteTexto: string;
  proveedorNombre: string;
  descripcion: string | null;
  lineas: Array<{ concepto: string; descripcion: string; cantidad: string; unidad: string }>;
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
  cell: { fontSize: 8, paddingHorizontal: 4 },
  cellHead: { fontSize: 8, fontFamily: 'Helvetica-Bold', paddingHorizontal: 4 },
  colNum: { width: 22, textAlign: 'right' },
  colConcepto: { flex: 2 },
  colDesc: { flex: 3 },
  colCant: { width: 54, textAlign: 'right' },
  colUnidad: { width: 54 },
});

export function SolicitudCotizacionPDF({ data }: { data: SolicitudCotizacionData }) {
  return (
    <Document title={`Solicitud de Cotización — ${data.folio}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="SOLICITUD DE COTIZACIÓN" fecha={data.fechaTexto} />

        <Text style={styles.sectionTitle}>DATOS DE LA SOLICITUD</Text>
        <DataRow label="FOLIO:" value={data.folio} />
        <DataRow label="PROYECTO:" value={data.proyecto} />
        <DataRow label="TIPO:" value={data.tipoLabel} />
        <DataRow label="FECHA LÍMITE DE RESPUESTA:" value={data.fechaLimiteTexto} />
        {data.descripcion ? <DataRow label="DESCRIPCIÓN:" value={data.descripcion} /> : null}

        <Text style={styles.sectionTitle}>DIRIGIDO A</Text>
        <DataRow label="PROVEEDOR:" value={data.proveedorNombre} />

        <Text style={styles.sectionTitle}>CONCEPTOS A COTIZAR</Text>
        <View style={t.headerRow}>
          <Text style={[t.cellHead, t.colNum]}>#</Text>
          <Text style={[t.cellHead, t.colConcepto]}>Concepto</Text>
          <Text style={[t.cellHead, t.colDesc]}>Descripción</Text>
          <Text style={[t.cellHead, t.colCant]}>Cantidad</Text>
          <Text style={[t.cellHead, t.colUnidad]}>Unidad</Text>
        </View>
        {data.lineas.map((l, i) => (
          <View key={i} style={t.dataRow} wrap={false}>
            <Text style={[t.cell, t.colNum]}>{i + 1}</Text>
            <Text style={[t.cell, t.colConcepto]}>{l.concepto}</Text>
            <Text style={[t.cell, t.colDesc]}>{l.descripcion || '—'}</Text>
            <Text style={[t.cell, t.colCant]}>{l.cantidad}</Text>
            <Text style={[t.cell, t.colUnidad]}>{l.unidad || '—'}</Text>
          </View>
        ))}

        <Text style={styles.legalText}>
          Favor de cotizar los conceptos listados, indicando precio unitario, tiempo de entrega y
          condiciones de pago, y enviar su propuesta antes del {data.fechaLimiteTexto}. Esta
          solicitud no constituye una orden de compra ni compromiso de adquisición.
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

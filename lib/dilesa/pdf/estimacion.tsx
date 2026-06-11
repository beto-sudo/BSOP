/**
 * Template PDF: Estimación de pago a contratista (DILESA).
 * Iniciativa dilesa-estimaciones · Sprint 5.
 *
 * Replica el formato operativo de Coda: header DILESA + datos del
 * contratista + tabla desglosada por obra (unidad + tareas + montos) +
 * totales (bruto, retención 5%, neto) + bloque para solicitar factura.
 *
 * El PDF se genera al aprobar la estimación (server-side via
 * @react-pdf/renderer) y se envía como adjunto en el email al contratista
 * pidiendo la factura por el monto neto.
 */
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles } from './styles';
import { HeaderBand, FooterBand, Folio } from './header-footer';

export type EstimacionPdfData = {
  codigo: string;
  fechaCierreTexto: string;
  fechaPagoTexto: string;
  contratista: {
    nombre: string;
    abreviacion: string | null;
    rfc: string | null;
    email: string | null;
  };
  obras: Array<{
    unidad: string;
    construccionCodigo: string;
    /** Código(s) del contrato de obra al que pertenece la vivienda — referencia para la factura. */
    contrato: string | null;
    tareas: Array<{ nombre: string; fechaTerminada: string; monto: number }>;
    subtotal: number;
  }>;
  montoBruto: number;
  retencionPct: number;
  retencionMonto: number;
  montoNeto: number;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const m = (n: number) => moneyFmt.format(n);

export function EstimacionPDF({ data }: { data: EstimacionPdfData }) {
  const contratistaDisplay = data.contratista.abreviacion
    ? `${data.contratista.abreviacion} · ${data.contratista.nombre}`
    : data.contratista.nombre;
  const contratosUnicos = [
    ...new Set(data.obras.flatMap((o) => (o.contrato ? o.contrato.split(', ') : []))),
  ];

  return (
    <Document title={`Estimación ${data.codigo}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="ESTIMACIÓN DE PAGO" fecha={data.fechaCierreTexto} />
        <Folio value={data.codigo} />

        {/* Datos del contratista */}
        <View style={fichaWrap}>
          <FichaRow label="Contratista" value={contratistaDisplay} />
          {data.contratista.rfc ? <FichaRow label="RFC" value={data.contratista.rfc} /> : null}
          <FichaRow label="Fecha de cierre" value={data.fechaCierreTexto} />
          <FichaRow label="Pago programado" value={data.fechaPagoTexto} />
          <FichaRow label="# obras" value={String(data.obras.length)} />
          <FichaRow
            label="# tareas"
            value={String(data.obras.reduce((s, o) => s + o.tareas.length, 0))}
          />
        </View>

        {/* Desglose por obra */}
        <Text style={sectionTitle}>DESGLOSE POR OBRA</Text>

        {data.obras.map((obra) => (
          <View key={obra.construccionCodigo} style={obraWrap} wrap={false}>
            <View style={obraHeader}>
              <Text style={obraHeaderUnidad}>{obra.unidad}</Text>
              <Text style={obraHeaderCodigo}>{obra.construccionCodigo}</Text>
              <Text style={obraHeaderSubtotal}>{m(obra.subtotal)}</Text>
            </View>
            {obra.contrato ? (
              <View style={obraContratoRow}>
                <Text style={obraContratoLabel}>Contrato</Text>
                <Text style={obraContratoValue}>{obra.contrato}</Text>
              </View>
            ) : null}
            {/* Filas de tareas */}
            <View style={tablaHeader}>
              <Text style={[tablaCellNombre, tablaHeaderText]}>Tarea</Text>
              <Text style={[tablaCellFecha, tablaHeaderText]}>Fecha</Text>
              <Text style={[tablaCellMonto, tablaHeaderText]}>Monto</Text>
            </View>
            {obra.tareas.map((t, idx) => (
              <View key={idx} style={tablaRow}>
                <Text style={tablaCellNombre}>{t.nombre}</Text>
                <Text style={tablaCellFecha}>{t.fechaTerminada}</Text>
                <Text style={tablaCellMonto}>{m(t.monto)}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Totales */}
        <View style={totalesWrap} wrap={false}>
          <View style={totalesRow}>
            <Text style={totalesLabel}>Monto bruto</Text>
            <Text style={totalesMonto}>{m(data.montoBruto)}</Text>
          </View>
          <View style={totalesRow}>
            <Text style={totalesLabel}>Retención ({data.retencionPct.toFixed(2)}%)</Text>
            <Text style={totalesMonto}>− {m(data.retencionMonto)}</Text>
          </View>
          <View style={[totalesRow, totalesRowNeto]}>
            <Text style={totalesLabelNeto}>MONTO NETO A PAGAR</Text>
            <Text style={totalesMontoNeto}>{m(data.montoNeto)}</Text>
          </View>
        </View>

        {/* Solicitud de factura */}
        <View style={solicitudWrap} wrap={false}>
          <Text style={solicitudTitulo}>SOLICITUD DE FACTURA</Text>
          <Text style={solicitudTexto}>
            Favor de emitir factura por el monto neto de {m(data.montoNeto)} a nombre de:
          </Text>
          <Text style={solicitudReceptor}>DESARROLLO INMOBILIARIO LOS ENCINOS, S.A. DE C.V.</Text>
          <Text style={solicitudTexto}>
            Por concepto de mano de obra de las tareas relacionadas en esta estimación. Una vez
            recibida la factura por correo a facturas@dilesa.mx, se programará el pago para la fecha
            indicada arriba.
          </Text>
          {contratosUnicos.length ? (
            <Text style={solicitudTexto}>
              Favor de referenciar en la factura{' '}
              {contratosUnicos.length === 1 ? 'el contrato' : 'los contratos'}:{' '}
              <Text style={solicitudContrato}>{contratosUnicos.join(', ')}</Text>
            </Text>
          ) : null}
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

function FichaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={fichaRowStyle}>
      <Text style={fichaLabel}>{label}</Text>
      <Text style={fichaValue}>{value}</Text>
    </View>
  );
}

// Estilos locales (los compartidos vienen de ./styles).
const fichaWrap = { marginTop: 12, marginBottom: 16 };
const fichaRowStyle = { flexDirection: 'row' as const, gap: 8, marginVertical: 2 };
const fichaLabel = {
  width: 130,
  fontSize: 9,
  color: '#666',
  textTransform: 'uppercase' as const,
};
const fichaValue = { flex: 1, fontSize: 10, color: '#111' };

const sectionTitle = {
  fontSize: 11,
  fontWeight: 'bold' as const,
  marginTop: 10,
  marginBottom: 6,
  color: '#4a5d23',
  borderBottom: '1pt solid #4a5d23',
  paddingBottom: 2,
};

const obraWrap = { marginBottom: 10 };
const obraHeader = {
  flexDirection: 'row' as const,
  backgroundColor: '#f0f0f0',
  padding: 4,
  alignItems: 'center' as const,
};
const obraHeaderUnidad = {
  flex: 1,
  fontSize: 10,
  fontWeight: 'bold' as const,
  color: '#111',
};
const obraHeaderCodigo = {
  width: 200,
  fontSize: 9,
  color: '#666',
};
const obraHeaderSubtotal = {
  width: 80,
  fontSize: 10,
  fontWeight: 'bold' as const,
  textAlign: 'right' as const,
  color: '#111',
};
// Segunda línea del bloque gris del header: contrato de la vivienda
// (referencia que el contratista copia a su factura).
const obraContratoRow = {
  flexDirection: 'row' as const,
  backgroundColor: '#f0f0f0',
  paddingHorizontal: 4,
  paddingBottom: 4,
  alignItems: 'center' as const,
};
const obraContratoLabel = {
  fontSize: 7,
  color: '#666',
  textTransform: 'uppercase' as const,
  marginRight: 6,
};
const obraContratoValue = { fontSize: 8.5, fontWeight: 'bold' as const, color: '#333' };

const tablaHeader = {
  flexDirection: 'row' as const,
  borderBottom: '0.5pt solid #ccc',
  paddingVertical: 2,
};
const tablaHeaderText = { fontSize: 8, color: '#666', textTransform: 'uppercase' as const };
const tablaRow = {
  flexDirection: 'row' as const,
  paddingVertical: 1.5,
  borderBottom: '0.25pt solid #eee',
};
const tablaCellNombre = { flex: 1, fontSize: 8, color: '#333' };
const tablaCellFecha = { width: 70, fontSize: 8, color: '#666' };
const tablaCellMonto = {
  width: 70,
  fontSize: 8,
  color: '#333',
  textAlign: 'right' as const,
};

const totalesWrap = {
  marginTop: 16,
  marginLeft: 'auto' as const,
  width: 280,
  padding: 8,
  border: '0.5pt solid #ccc',
  borderRadius: 3,
};
const totalesRow = {
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  marginVertical: 2,
};
const totalesRowNeto = {
  borderTop: '0.5pt solid #4a5d23',
  paddingTop: 6,
  marginTop: 4,
};
const totalesLabel = { fontSize: 9, color: '#666' };
const totalesMonto = { fontSize: 10, color: '#111', textAlign: 'right' as const };
const totalesLabelNeto = {
  fontSize: 10,
  fontWeight: 'bold' as const,
  color: '#4a5d23',
};
const totalesMontoNeto = {
  fontSize: 12,
  fontWeight: 'bold' as const,
  color: '#4a5d23',
  textAlign: 'right' as const,
};

const solicitudWrap = {
  marginTop: 20,
  padding: 10,
  backgroundColor: '#fafaf5',
  border: '0.5pt solid #4a5d23',
  borderRadius: 3,
};
const solicitudTitulo = {
  fontSize: 10,
  fontWeight: 'bold' as const,
  color: '#4a5d23',
  marginBottom: 4,
};
const solicitudTexto = { fontSize: 9, color: '#333', marginVertical: 2, lineHeight: 1.4 };
const solicitudReceptor = {
  fontSize: 9,
  fontWeight: 'bold' as const,
  color: '#111',
  marginVertical: 2,
};
const solicitudContrato = { fontWeight: 'bold' as const, color: '#111' };

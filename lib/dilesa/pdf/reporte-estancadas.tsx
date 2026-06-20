/**
 * PDF del reporte «Ventas estancadas» (DILESA · Ventas) — ADR-047.
 * Recibe el `EstancadasResult` ya calculado (misma fuente que la pantalla).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { EstancadasResult } from '@/lib/dilesa/reportes/estancadas';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const m = (n: number | null) => (n == null ? '—' : moneyFmt.format(n));

export type EstancadasPdfMeta = { fechaTexto: string; filtrosTexto: string; umbral: number };

export function ReporteEstancadasPDF({
  result,
  meta,
}: {
  result: EstancadasResult;
  meta: EstancadasPdfMeta;
}) {
  return (
    <Document title="Ventas estancadas — DILESA">
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="VENTAS ESTANCADAS" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>Pipeline por antigüedad de fase · {meta.filtrosTexto}</Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>En pipeline</Text>
            <Text style={s.resumenValue}>{result.totalPipeline}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Estancadas (≥{meta.umbral}d)</Text>
            <Text style={s.resumenValueAlerta}>{result.estancadas}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Más antigua</Text>
            <Text style={s.resumenValue}>{result.maxDias} d</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Promedio</Text>
            <Text style={s.resumenValue}>{result.promedioDias} d</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.colCliente]}>Comprador / unidad</Text>
          <Text style={[s.th, s.colFase]}>Fase actual</Text>
          <Text style={[s.th, s.colVend]}>Vendedor</Text>
          <Text style={[s.thNum, s.colNum]}>Días</Text>
          <Text style={[s.thNum, s.colMonto]}>Precio</Text>
        </View>
        {result.filas.map((f) => (
          <View key={f.ventaId} style={s.tr} wrap={false}>
            <Text style={[s.td, s.colCliente]}>
              {f.cliente}
              {f.unidadIdentificador ? ` · ${f.unidadIdentificador}` : ''}
            </Text>
            <Text style={[s.tdMuted, s.colFase]}>{f.faseActual ?? '—'}</Text>
            <Text style={[s.tdMuted, s.colVend]}>{f.vendedor ?? '—'}</Text>
            <Text style={[f.diasEnFase >= meta.umbral ? s.diasAlerta : s.tdNum, s.colNum]}>
              {f.diasEnFase}
            </Text>
            <Text style={[s.tdNum, s.colMonto]}>{m(f.precio)}</Text>
          </View>
        ))}

        <FooterBand />
      </Page>
    </Document>
  );
}

const s = StyleSheet.create({
  subtitle: { fontSize: 9, color: colors.textMuted, marginBottom: 10 },
  resumenRow: { flexDirection: 'row', marginBottom: 14 },
  resumenCard: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  resumenLabel: {
    fontSize: 7,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  resumenValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: colors.primary },
  resumenValueAlerta: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#b45309' },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 0.3 },
  thNum: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'right' },
  tr: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
  },
  td: { fontSize: 9, color: colors.text },
  tdMuted: { fontSize: 8, color: colors.textMuted },
  tdNum: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.text, textAlign: 'right' },
  diasAlerta: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#b45309', textAlign: 'right' },
  colCliente: { width: '34%' },
  colFase: { width: '24%' },
  colVend: { width: '18%' },
  colNum: { width: '9%' },
  colMonto: { width: '15%' },
});

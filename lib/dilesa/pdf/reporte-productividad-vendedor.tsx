/**
 * PDF del reporte «Productividad por vendedor» (DILESA · Ventas) — ADR-047.
 * Recibe el `ProductividadResult` ya calculado (misma fuente que la pantalla).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { ProductividadResult } from '@/lib/dilesa/reportes/productividad-vendedor';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const m = (n: number) => moneyFmt.format(n);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export type ProductividadPdfMeta = { fechaTexto: string; filtrosTexto: string };

export function ReporteProductividadVendedorPDF({
  result,
  meta,
}: {
  result: ProductividadResult;
  meta: ProductividadPdfMeta;
}) {
  return (
    <Document title="Productividad por vendedor — DILESA">
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="PRODUCTIVIDAD POR VENDEDOR" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>Ventas · {meta.filtrosTexto}</Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Vendedores</Text>
            <Text style={s.resumenValue}>{result.totalVendedores}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Escrituradas</Text>
            <Text style={s.resumenValue}>{result.totalEscrituradas}</Text>
          </View>
          <View style={s.resumenCardWide}>
            <Text style={s.resumenLabel}>Monto escriturado</Text>
            <Text style={s.resumenValue}>{m(result.totalMontoEscriturado)}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.colVend]}>Vendedor</Text>
          <Text style={[s.thNum, s.colNum]}>Ventas</Text>
          <Text style={[s.thNum, s.colMonto]}>Pipeline</Text>
          <Text style={[s.thNum, s.colNum]}>Escrit.</Text>
          <Text style={[s.thNum, s.colNum]}>% cierre</Text>
          <Text style={[s.thNum, s.colMonto]}>Escriturado</Text>
        </View>
        {result.filas.map((f) => (
          <View key={f.vendedor} style={s.tr} wrap={false}>
            <Text style={[s.td, s.colVend]}>{f.vendedor}</Text>
            <Text style={[s.tdNum, s.colNum]}>{f.ventas}</Text>
            <Text style={[s.tdMuted, s.colMonto]}>{f.pipeline > 0 ? m(f.pipeline) : '—'}</Text>
            <Text style={[s.tdNum, s.colNum]}>{f.escrituradas}</Text>
            <Text style={[s.tdMuted, s.colNum]}>{pct(f.pctEscrituradas)}</Text>
            <Text style={[s.tdNum, s.colMonto]}>
              {f.montoEscriturado > 0 ? m(f.montoEscriturado) : '—'}
            </Text>
          </View>
        ))}
        <View style={s.trTotal} wrap={false}>
          <Text style={[s.tdTotal, s.colVend]}>Total</Text>
          <Text style={[s.tdTotalNum, s.colNum]}>{result.totalVentas}</Text>
          <Text style={[s.tdTotalNum, s.colMonto]}>{m(result.totalPipeline)}</Text>
          <Text style={[s.tdTotalNum, s.colNum]}>{result.totalEscrituradas}</Text>
          <Text style={[s.tdTotal, s.colNum]}> </Text>
          <Text style={[s.tdTotalNum, s.colMonto]}>{m(result.totalMontoEscriturado)}</Text>
        </View>

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
  resumenCardWide: {
    flex: 1.4,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  resumenLabel: {
    fontSize: 7,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  resumenValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: colors.primary },
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
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
  },
  td: { fontSize: 9, color: colors.text },
  tdMuted: { fontSize: 8, color: colors.textMuted, textAlign: 'right' },
  tdNum: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.text, textAlign: 'right' },
  trTotal: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: colors.bgSoft,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
  },
  tdTotal: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.text },
  tdTotalNum: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    textAlign: 'right',
  },
  colVend: { width: '30%' },
  colNum: { width: '12%' },
  colMonto: { width: '17%' },
});

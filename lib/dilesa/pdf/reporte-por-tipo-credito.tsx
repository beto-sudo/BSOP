/**
 * PDF del reporte «Por tipo de crédito» (DILESA · Ventas) — ADR-047.
 * Recibe el `PorTipoCreditoResult` ya calculado (misma fuente que la pantalla).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { PorTipoCreditoResult } from '@/lib/dilesa/reportes/por-tipo-credito';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const m = (n: number) => moneyFmt.format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export type PorTipoCreditoPdfMeta = { fechaTexto: string; filtrosTexto: string };

export function ReportePorTipoCreditoPDF({
  result,
  meta,
}: {
  result: PorTipoCreditoResult;
  meta: PorTipoCreditoPdfMeta;
}) {
  return (
    <Document title="Por tipo de crédito — DILESA">
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="POR TIPO DE CRÉDITO" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>Ventas · {meta.filtrosTexto}</Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Ventas</Text>
            <Text style={s.resumenValue}>{result.totalVentas}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Monto total</Text>
            <Text style={s.resumenValue}>{m(result.totalMonto)}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Tipos</Text>
            <Text style={s.resumenValue}>{result.filas.length}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.colTipo]}>Tipo de crédito</Text>
          <Text style={[s.thNum, s.colNum]}>Ventas</Text>
          <Text style={[s.thNum, s.colNum]}>%</Text>
          <Text style={[s.thNum, s.colMonto]}>Monto</Text>
          <Text style={[s.thNum, s.colNum]}>%</Text>
        </View>
        {result.filas.map((f) => (
          <View key={f.tipo} style={s.tr} wrap={false}>
            <Text style={[s.td, s.colTipo]}>{f.tipo}</Text>
            <Text style={[s.tdNum, s.colNum]}>{f.ventas}</Text>
            <Text style={[s.tdMuted, s.colNum]}>{pct(f.pctVentas)}</Text>
            <Text style={[s.tdNum, s.colMonto]}>{f.monto > 0 ? m(f.monto) : '—'}</Text>
            <Text style={[s.tdMuted, s.colNum]}>{pct(f.pctMonto)}</Text>
          </View>
        ))}
        <View style={s.trTotal} wrap={false}>
          <Text style={[s.tdTotal, s.colTipo]}>Total</Text>
          <Text style={[s.tdTotalNum, s.colNum]}>{result.totalVentas}</Text>
          <Text style={[s.tdTotal, s.colNum]}> </Text>
          <Text style={[s.tdTotalNum, s.colMonto]}>{m(result.totalMonto)}</Text>
          <Text style={[s.tdTotal, s.colNum]}> </Text>
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
    paddingVertical: 4,
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
  colTipo: { width: '44%' },
  colNum: { width: '12%' },
  colMonto: { width: '20%' },
});

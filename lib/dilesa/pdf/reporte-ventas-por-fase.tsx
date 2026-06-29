/**
 * PDF del reporte «Ventas por fase» (DILESA · Ventas) — ADR-047.
 * Recibe el `VentasPorFaseResult` ya calculado (misma fuente que la pantalla).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { VentasPorFaseResult } from '@/lib/dilesa/reportes/ventas-por-fase';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const m = (n: number) => moneyFmt.format(n);

export type VentasPorFasePdfMeta = { fechaTexto: string; filtrosTexto: string };

export function ReporteVentasPorFasePDF({
  result,
  meta,
}: {
  result: VentasPorFaseResult;
  meta: VentasPorFasePdfMeta;
}) {
  return (
    <Document title="Ventas por fase — DILESA">
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <HeaderBand title="VENTAS POR FASE" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>{meta.filtrosTexto}</Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Ventas</Text>
            <Text style={s.resumenValue}>{result.totalVentas}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Valor total</Text>
            <Text style={s.resumenValue}>{m(result.totalValor)}</Text>
          </View>
        </View>

        {result.porMes.length > 1 ? (
          <View style={s.porMesWrap}>
            <Text style={s.blockTitle}>Por mes</Text>
            {result.porMes.map((mm) => (
              <View key={mm.mes} style={s.porMesRow} wrap={false}>
                <Text style={s.porMesMes}>{mm.mes}</Text>
                <Text style={s.porMesNum}>{mm.ventas} ventas</Text>
                <Text style={s.porMesMonto}>{m(mm.valor)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={s.blockTitle}>Detalle</Text>
        <View style={s.tableHead}>
          <Text style={[s.th, s.colFecha]}>Fecha</Text>
          {result.multiFase ? <Text style={[s.th, s.colFase]}>Fase</Text> : null}
          <Text style={[s.th, s.colCliente]}>Cliente</Text>
          <Text style={[s.th, s.colUnidad]}>Unidad / proyecto</Text>
          <Text style={[s.th, s.colCredito]}>Tipo crédito</Text>
          <Text style={[s.th, s.colVendedor]}>Vendedor</Text>
          <Text style={[s.thNum, s.colMonto]}>Valor</Text>
        </View>
        {result.filas.map((f) => (
          <View key={f.id} style={s.tr} wrap={false}>
            <Text style={[s.tdMuted, s.colFecha]}>{f.fecha}</Text>
            {result.multiFase ? (
              <Text style={[s.td, s.colFase]}>
                {f.posicion}. {f.faseNombre}
              </Text>
            ) : null}
            <Text style={[s.td, s.colCliente]}>{f.cliente}</Text>
            <Text style={[s.tdMuted, s.colUnidad]}>
              {[f.unidadIdentificador, f.proyectoNombre].filter(Boolean).join(' · ') || '—'}
            </Text>
            <Text style={[s.tdMuted, s.colCredito]}>{f.tipoCredito ?? '—'}</Text>
            <Text style={[s.tdMuted, s.colVendedor]}>{f.vendedor ?? '—'}</Text>
            <Text style={[s.tdNum, s.colMonto]}>{m(f.valor)}</Text>
          </View>
        ))}
        <View style={s.trTotal} wrap={false}>
          <Text style={[s.tdTotal, s.colFecha]}> </Text>
          {result.multiFase ? <Text style={[s.tdTotal, s.colFase]}> </Text> : null}
          <Text style={[s.tdTotal, s.colCliente]}>Total ({result.totalVentas})</Text>
          <Text style={[s.tdTotal, s.colUnidad]}> </Text>
          <Text style={[s.tdTotal, s.colCredito]}> </Text>
          <Text style={[s.tdTotal, s.colVendedor]}> </Text>
          <Text style={[s.tdTotalNum, s.colMonto]}>{m(result.totalValor)}</Text>
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
  resumenValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: colors.primary },
  blockTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
    marginTop: 6,
    marginBottom: 5,
  },
  porMesWrap: { marginBottom: 8 },
  porMesRow: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
  },
  porMesMes: { fontSize: 9, fontFamily: 'Helvetica-Bold', width: '20%' },
  porMesNum: { fontSize: 9, color: colors.textMuted, width: '40%' },
  porMesMonto: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right', width: '40%' },
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
  tdMuted: { fontSize: 8, color: colors.textMuted },
  tdNum: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.text, textAlign: 'right' },
  trTotal: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: colors.bgSoft,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
  },
  tdTotal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.text },
  tdTotalNum: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    textAlign: 'right',
  },
  colFecha: { width: '11%' },
  colFase: { width: '16%' },
  colCliente: { width: '24%' },
  colUnidad: { width: '22%' },
  colCredito: { width: '14%' },
  colVendedor: { width: '15%' },
  colMonto: { width: '14%' },
});

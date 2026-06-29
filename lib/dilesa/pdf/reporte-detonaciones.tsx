/**
 * PDF del reporte «Detonaciones / Depósitos» (DILESA · Ventas) — ADR-047.
 * Recibe el `DetonacionesResult` ya calculado (misma fuente que la pantalla).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import { etiquetaFuente } from '@/lib/dilesa/reportes/detonaciones-data';
import type { DetonacionesResult } from '@/lib/dilesa/reportes/detonaciones';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const m = (n: number) => moneyFmt.format(n);

export type DetonacionesPdfMeta = { fechaTexto: string; filtrosTexto: string };

export function ReporteDetonacionesPDF({
  result,
  meta,
}: {
  result: DetonacionesResult;
  meta: DetonacionesPdfMeta;
}) {
  return (
    <Document title="Depósitos del periodo — DILESA">
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <HeaderBand title="DEPÓSITOS DEL PERIODO" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>Depósitos recibidos · {meta.filtrosTexto}</Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Depósitos</Text>
            <Text style={s.resumenValue}>{result.totalDepositos}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Monto total</Text>
            <Text style={s.resumenValue}>{m(result.totalMonto)}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Institución (detonaciones)</Text>
            <Text style={s.resumenValue}>{m(result.totalInstitucion)}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Cliente</Text>
            <Text style={s.resumenValue}>{m(result.totalCliente)}</Text>
          </View>
        </View>

        {result.porMes.length > 1 ? (
          <View style={s.porMesWrap}>
            <Text style={s.blockTitle}>Por mes</Text>
            {result.porMes.map((mm) => (
              <View key={mm.mes} style={s.porMesRow} wrap={false}>
                <Text style={s.porMesMes}>{mm.mes}</Text>
                <Text style={s.porMesNum}>{mm.depositos} dep.</Text>
                <Text style={s.porMesSplit}>Inst. {m(mm.montoInstitucion)}</Text>
                <Text style={s.porMesSplit}>Cli. {m(mm.montoCliente)}</Text>
                <Text style={s.porMesMonto}>{m(mm.monto)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={s.blockTitle}>Detalle</Text>
        <View style={s.tableHead}>
          <Text style={[s.th, s.colFecha]}>Fecha</Text>
          <Text style={[s.th, s.colFuente]}>Origen</Text>
          <Text style={[s.th, s.colCliente]}>Cliente</Text>
          <Text style={[s.th, s.colUnidad]}>Unidad / proyecto</Text>
          <Text style={[s.th, s.colCredito]}>Tipo crédito</Text>
          <Text style={[s.th, s.colRef]}>Forma / ref.</Text>
          <Text style={[s.thNum, s.colMonto]}>Monto</Text>
        </View>
        {result.depositos.map((d) => (
          <View key={d.id} style={s.tr} wrap={false}>
            <Text style={[s.tdMuted, s.colFecha]}>{d.fecha}</Text>
            <Text style={[s.td, s.colFuente]}>{etiquetaFuente(d.fuente)}</Text>
            <Text style={[s.td, s.colCliente]}>{d.cliente}</Text>
            <Text style={[s.tdMuted, s.colUnidad]}>
              {[d.unidadIdentificador, d.proyectoNombre].filter(Boolean).join(' · ') || '—'}
            </Text>
            <Text style={[s.tdMuted, s.colCredito]}>{d.tipoCredito ?? '—'}</Text>
            <Text style={[s.tdMuted, s.colRef]}>
              {[d.formaPago, d.referencia].filter(Boolean).join(' · ') || '—'}
            </Text>
            <Text style={[s.tdNum, s.colMonto]}>{m(d.monto)}</Text>
          </View>
        ))}
        <View style={s.trTotal} wrap={false}>
          <Text style={[s.tdTotal, s.colFecha]}> </Text>
          <Text style={[s.tdTotal, s.colFuente]}>Total ({result.totalDepositos})</Text>
          <Text style={[s.tdTotal, s.colCliente]}>Inst. {m(result.totalInstitucion)}</Text>
          <Text style={[s.tdTotal, s.colUnidad]}>Cli. {m(result.totalCliente)}</Text>
          <Text style={[s.tdTotal, s.colCredito]}> </Text>
          <Text style={[s.tdTotal, s.colRef]}> </Text>
          <Text style={[s.tdTotalNum, s.colMonto]}>{m(result.totalMonto)}</Text>
        </View>

        {result.sinLigar.length > 0 ? (
          <View style={s.sinLigarWrap}>
            <Text style={s.blockTitle}>
              Depósitos sin ligar a una venta ({result.sinLigar.length})
            </Text>
            {result.sinLigar.map((d) => (
              <View key={d.id} style={s.tr} wrap={false}>
                <Text style={[s.tdMuted, s.colFecha]}>{d.fecha}</Text>
                <Text style={[s.td, s.colFuente]}>{etiquetaFuente(d.fuente)}</Text>
                <Text style={[s.tdMuted, s.colCliente]}>
                  {[d.formaPago, d.referencia].filter(Boolean).join(' · ') || '—'}
                </Text>
                <Text style={[s.tdMuted, s.colUnidad]}> </Text>
                <Text style={[s.tdMuted, s.colCredito]}> </Text>
                <Text style={[s.tdMuted, s.colRef]}> </Text>
                <Text style={[s.tdNum, s.colMonto]}>{m(d.monto)}</Text>
              </View>
            ))}
          </View>
        ) : null}

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
  porMesMes: { fontSize: 9, fontFamily: 'Helvetica-Bold', width: '15%' },
  porMesNum: { fontSize: 9, color: colors.textMuted, width: '15%' },
  porMesSplit: { fontSize: 9, color: colors.textMuted, width: '25%' },
  porMesMonto: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right', width: '20%' },
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
  sinLigarWrap: { marginTop: 10 },
  colFecha: { width: '10%' },
  colFuente: { width: '10%' },
  colCliente: { width: '24%' },
  colUnidad: { width: '21%' },
  colCredito: { width: '14%' },
  colRef: { width: '11%' },
  colMonto: { width: '10%' },
});

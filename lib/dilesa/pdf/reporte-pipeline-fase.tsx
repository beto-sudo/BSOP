/**
 * PDF del reporte «Pipeline por fase» (DILESA · Ventas) — ADR-047.
 *
 * Presenta el resultado del motor `construirPipelinePorFase` con el branding
 * DILESA compartido (HeaderBand/FooterBand/styles). No deriva nada: recibe el
 * `PipelineFaseResult` ya calculado (misma fuente que la vista en pantalla).
 *
 * Gotchas @react-pdf/renderer v4.5.x: sin `gap` (se usan widths + márgenes);
 * el isotipo se carga base64 server-side dentro de HeaderBand/FooterBand.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { PipelineFaseResult } from '@/lib/dilesa/reportes/pipeline-por-fase';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const m = (n: number) => moneyFmt.format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export type PipelinePdfMeta = {
  /** Fecha de generación, ya formateada (ej. "18 de junio del 2026"). */
  fechaTexto: string;
  /** Resumen legible de los filtros aplicados (ej. "Proyecto: X · Mayo 2026"). */
  filtrosTexto: string;
};

export function ReportePipelineFasePDF({
  result,
  meta,
}: {
  result: PipelineFaseResult;
  meta: PipelinePdfMeta;
}) {
  return (
    <Document title="Pipeline por fase — DILESA Ventas">
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="PIPELINE POR FASE" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>Ventas · {meta.filtrosTexto}</Text>

        {/* Resumen ejecutivo */}
        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Ventas en pipeline</Text>
            <Text style={s.resumenValue}>{result.totalVentas}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Monto en pipeline</Text>
            <Text style={s.resumenValue}>{m(result.totalMonto)}</Text>
          </View>
          <View style={s.resumenCardWide}>
            <Text style={s.resumenLabel}>Fase con más ventas</Text>
            <Text style={s.resumenValueSm}>{result.faseCuello ?? '—'}</Text>
          </View>
        </View>

        {/* Tabla por fase */}
        <View style={s.tableHead}>
          <Text style={[s.th, s.colPos]}>#</Text>
          <Text style={[s.th, s.colFase]}>Fase</Text>
          <Text style={[s.thNum, s.colNum]}>Ventas</Text>
          <Text style={[s.thNum, s.colPct]}>%</Text>
          <Text style={[s.thNum, s.colMonto]}>Monto</Text>
          <Text style={[s.thNum, s.colPct]}>%</Text>
        </View>
        {result.filas.map((f) => (
          <View key={f.posicion} style={s.tr} wrap={false}>
            <Text style={[s.tdPos, s.colPos]}>{String(f.posicion).padStart(2, '0')}</Text>
            <Text style={[s.td, s.colFase]}>{f.fase}</Text>
            <Text style={[s.tdNum, s.colNum]}>{f.ventas}</Text>
            <Text style={[s.tdMuted, s.colPct]}>{pct(f.pctVentas)}</Text>
            <Text style={[s.tdNum, s.colMonto]}>{f.monto > 0 ? m(f.monto) : '—'}</Text>
            <Text style={[s.tdMuted, s.colPct]}>{pct(f.pctMonto)}</Text>
          </View>
        ))}

        {/* Totales */}
        <View style={s.trTotal} wrap={false}>
          <Text style={[s.tdTotal, s.colPos]}> </Text>
          <Text style={[s.tdTotal, s.colFase]}>Total pipeline</Text>
          <Text style={[s.tdTotalNum, s.colNum]}>{result.totalVentas}</Text>
          <Text style={[s.tdTotal, s.colPct]}> </Text>
          <Text style={[s.tdTotalNum, s.colMonto]}>{m(result.totalMonto)}</Text>
          <Text style={[s.tdTotal, s.colPct]}> </Text>
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

const s = StyleSheet.create({
  subtitle: {
    fontSize: 9,
    color: colors.textMuted,
    marginBottom: 10,
  },
  resumenRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
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
  resumenValue: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
  },
  resumenValueSm: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  th: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
  thNum: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#fff',
    textAlign: 'right',
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
  },
  td: {
    fontSize: 9,
    color: colors.text,
  },
  tdPos: {
    fontSize: 8,
    color: colors.textMuted,
    fontFamily: 'Helvetica-Bold',
  },
  tdNum: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
    textAlign: 'right',
  },
  tdMuted: {
    fontSize: 8,
    color: colors.textMuted,
    textAlign: 'right',
  },
  trTotal: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: colors.bgSoft,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
  },
  tdTotal: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
  },
  tdTotalNum: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    textAlign: 'right',
  },
  colPos: { width: '8%' },
  colFase: { width: '42%' },
  colNum: { width: '14%' },
  colPct: { width: '8%' },
  colMonto: { width: '20%' },
});

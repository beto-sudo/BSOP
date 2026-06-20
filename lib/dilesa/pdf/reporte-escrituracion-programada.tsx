/**
 * PDF del reporte «Escrituración programada» (DILESA · Ventas) — ADR-047.
 * Recibe el `EscrituracionProgramadaResult` ya calculado (misma fuente que la pantalla).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { EscrituracionProgramadaResult } from '@/lib/dilesa/reportes/escrituracion-programada';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const m = (n: number) => moneyFmt.format(n);

export type EscrituracionProgramadaPdfMeta = { fechaTexto: string; filtrosTexto: string };

export function ReporteEscrituracionProgramadaPDF({
  result,
  meta,
}: {
  result: EscrituracionProgramadaResult;
  meta: EscrituracionProgramadaPdfMeta;
}) {
  return (
    <Document title="Escrituración programada — DILESA">
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="ESCRITURACIÓN PROGRAMADA" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>Firmas agendadas pendientes · {meta.filtrosTexto}</Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Firmas agendadas</Text>
            <Text style={s.resumenValue}>{result.totalFirmas}</Text>
          </View>
          <View style={s.resumenCardWide}>
            <Text style={s.resumenLabel}>Monto por escriturar</Text>
            <Text style={s.resumenValue}>{m(result.totalMonto)}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.colFecha]}>Fecha</Text>
          <Text style={[s.th, s.colHora]}>Hora</Text>
          <Text style={[s.th, s.colCliente]}>Comprador</Text>
          <Text style={[s.th, s.colProy]}>Proyecto / unidad</Text>
          <Text style={[s.thNum, s.colMonto]}>Monto</Text>
        </View>
        {result.firmas.map((f) => (
          <View key={f.id} style={s.tr} wrap={false}>
            <Text style={[s.tdStrong, s.colFecha]}>{f.fecha}</Text>
            <Text style={[s.tdMuted, s.colHora]}>{f.hora ?? '—'}</Text>
            <Text style={[s.td, s.colCliente]}>{f.cliente}</Text>
            <Text style={[s.tdMuted, s.colProy]}>
              {[f.proyectoNombre, f.unidadIdentificador].filter(Boolean).join(' · ') || '—'}
            </Text>
            <Text style={[s.tdNum, s.colMonto]}>{m(f.monto)}</Text>
          </View>
        ))}
        <View style={s.trTotal} wrap={false}>
          <Text style={[s.tdTotal, s.colFecha]}>Total</Text>
          <Text style={[s.tdTotal, s.colHora]}> </Text>
          <Text style={[s.tdTotal, s.colCliente]}>({result.totalFirmas} firmas)</Text>
          <Text style={[s.tdTotal, s.colProy]}> </Text>
          <Text style={[s.tdTotalNum, s.colMonto]}>{m(result.totalMonto)}</Text>
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
    flex: 1.6,
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
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
  },
  td: { fontSize: 9, color: colors.text },
  tdStrong: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.text },
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
  tdTotal: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.text },
  tdTotalNum: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    textAlign: 'right',
  },
  colFecha: { width: '15%' },
  colHora: { width: '10%' },
  colCliente: { width: '33%' },
  colProy: { width: '27%' },
  colMonto: { width: '15%' },
});

/**
 * PDF del reporte «Ventas desasignadas» (DILESA · Ventas) — ADR-047.
 * Recibe el `DesasignadasResult` ya calculado (misma fuente que la pantalla).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { DesasignadasResult } from '@/lib/dilesa/reportes/desasignadas';

export type DesasignadasPdfMeta = { fechaTexto: string; filtrosTexto: string };

export function ReporteDesasignadasPDF({
  result,
  meta,
}: {
  result: DesasignadasResult;
  meta: DesasignadasPdfMeta;
}) {
  return (
    <Document title="Ventas desasignadas — DILESA">
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="VENTAS DESASIGNADAS" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>{meta.filtrosTexto}</Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Desasignadas</Text>
            <Text style={s.resumenValue}>{result.total}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Reubicaciones</Text>
            <Text style={s.resumenValue}>{result.reubicaciones}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Bajas</Text>
            <Text style={s.resumenValueBaja}>{result.bajas}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.colFecha]}>Fecha</Text>
          <Text style={[s.th, s.colCliente]}>Comprador</Text>
          <Text style={[s.th, s.colCat]}>Tipo</Text>
          <Text style={[s.th, s.colMotivo]}>Motivo</Text>
        </View>
        {result.filas.map((f) => (
          <View key={f.id} style={s.tr} wrap={false}>
            <Text style={[s.tdMuted, s.colFecha]}>{f.fecha}</Text>
            <Text style={[s.td, s.colCliente]}>
              {f.cliente}
              {f.unidadIdentificador ? ` · ${f.unidadIdentificador}` : ''}
            </Text>
            <Text style={[f.categoria === 'baja' ? s.catBaja : s.catReub, s.colCat]}>
              {f.categoria === 'baja' ? 'Baja' : 'Reubic.'}
            </Text>
            <Text style={[s.tdMuted, s.colMotivo]}>{f.motivo ?? '—'}</Text>
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
  resumenValueBaja: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#b45309' },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 0.3 },
  tr: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
  },
  td: { fontSize: 9, color: colors.text },
  tdMuted: { fontSize: 8, color: colors.textMuted },
  catReub: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.primary },
  catBaja: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#b45309' },
  colFecha: { width: '13%' },
  colCliente: { width: '32%' },
  colCat: { width: '11%' },
  colMotivo: { width: '44%' },
});

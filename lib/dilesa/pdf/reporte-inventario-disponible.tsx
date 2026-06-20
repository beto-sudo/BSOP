/**
 * PDF del reporte «Inventario disponible» (DILESA · Ventas) — ADR-047.
 * Recibe el `InventarioResult` ya calculado (misma fuente que la pantalla).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { InventarioResult } from '@/lib/dilesa/reportes/inventario-disponible';

export type InventarioPdfMeta = { fechaTexto: string; filtrosTexto: string };

export function ReporteInventarioDisponiblePDF({
  result,
  meta,
}: {
  result: InventarioResult;
  meta: InventarioPdfMeta;
}) {
  return (
    <Document title="Inventario disponible — DILESA">
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="INVENTARIO DISPONIBLE" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>Unidades vendibles · {meta.filtrosTexto}</Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Disponibles</Text>
            <Text style={s.resumenValue}>{result.totalDisponibles}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>En construcción</Text>
            <Text style={s.resumenValue}>{result.totalEnConstruccion}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Terminadas</Text>
            <Text style={s.resumenValue}>{result.totalTerminadas}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Proyectos</Text>
            <Text style={s.resumenValue}>{result.totalProyectos}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.colProy]}>Proyecto</Text>
          <Text style={[s.th, s.colProto]}>Prototipo</Text>
          <Text style={[s.thNum, s.colNum]}>Disponibles</Text>
          <Text style={[s.thNum, s.colNum]}>En constr.</Text>
          <Text style={[s.thNum, s.colNum]}>Terminadas</Text>
        </View>
        {result.grupos.map((g) => (
          <View key={`${g.proyecto}::${g.prototipo}`} style={s.tr} wrap={false}>
            <Text style={[s.td, s.colProy]}>{g.proyecto}</Text>
            <Text style={[s.tdMutedL, s.colProto]}>{g.prototipo}</Text>
            <Text style={[s.tdNum, s.colNum]}>{g.disponibles}</Text>
            <Text style={[s.tdMuted, s.colNum]}>{g.enConstruccion}</Text>
            <Text style={[s.tdMuted, s.colNum]}>{g.terminadas}</Text>
          </View>
        ))}
        <View style={s.trTotal} wrap={false}>
          <Text style={[s.tdTotal, s.colProy]}>Total</Text>
          <Text style={[s.tdTotal, s.colProto]}> </Text>
          <Text style={[s.tdTotalNum, s.colNum]}>{result.totalDisponibles}</Text>
          <Text style={[s.tdTotalNum, s.colNum]}>{result.totalEnConstruccion}</Text>
          <Text style={[s.tdTotalNum, s.colNum]}>{result.totalTerminadas}</Text>
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
  tdMutedL: { fontSize: 9, color: colors.textMuted },
  tdMuted: { fontSize: 9, color: colors.textMuted, textAlign: 'right' },
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
  colProy: { width: '34%' },
  colProto: { width: '26%' },
  colNum: { width: '13.3%' },
});

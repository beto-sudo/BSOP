/**
 * PDF del reporte «Inventario disponible» (DILESA · Ventas) — ADR-047.
 * Cada unidad con su precio desglosado. Landscape para que quepan las columnas.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { InventarioResult } from '@/lib/dilesa/reportes/inventario-disponible';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const m = (n: number | null) => (n && n > 0 ? moneyFmt.format(n) : '—');

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
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <HeaderBand title="INVENTARIO DISPONIBLE" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>Unidades vendibles · {meta.filtrosTexto}</Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Disponibles</Text>
            <Text style={s.resumenValue}>{result.totalDisponibles}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>En construcción</Text>
            <Text style={s.resumenValue}>{result.enConstruccion}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Terminadas</Text>
            <Text style={s.resumenValue}>{result.terminadas}</Text>
          </View>
          <View style={s.resumenCardWide}>
            <Text style={s.resumenLabel}>Valor disponible</Text>
            <Text style={s.resumenValue}>{m(result.valorTotal)}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.colUnidad]}>Unidad</Text>
          <Text style={[s.th, s.colProy]}>Proyecto / prototipo</Text>
          <Text style={[s.thNum, s.colArea]}>Área m²</Text>
          <Text style={[s.th, s.colCar]}>Caract.</Text>
          <Text style={[s.thNum, s.colMon]}>Base</Text>
          <Text style={[s.thNum, s.colMon]}>Excedente</Text>
          <Text style={[s.thNum, s.colMonS]}>Esquina</Text>
          <Text style={[s.thNum, s.colMonS]}>F. verde</Text>
          <Text style={[s.thNum, s.colMon]}>Total</Text>
        </View>
        {result.unidades.map((u) => (
          <View key={u.id} style={s.tr} wrap={false}>
            <Text style={[s.tdStrong, s.colUnidad]}>{u.identificadorCompleto}</Text>
            <Text style={[s.tdMuted, s.colProy]}>
              {[u.proyectoNombre, u.prototipo].filter(Boolean).join(' · ')}
            </Text>
            <Text style={[s.tdNum, s.colArea]}>{u.areaM2 != null ? u.areaM2.toFixed(2) : '—'}</Text>
            <Text style={[s.tdMuted, s.colCar]}>
              {[u.esEsquina ? 'Esq.' : null, u.tieneFrenteVerde ? 'F.v.' : null]
                .filter(Boolean)
                .join(' ') || '—'}
            </Text>
            <Text style={[s.tdNum, s.colMon]}>{m(u.precio.base)}</Text>
            <Text style={[s.tdMuted2, s.colMon]}>{m(u.precio.excedente)}</Text>
            <Text style={[s.tdMuted2, s.colMonS]}>{m(u.precio.esquina)}</Text>
            <Text style={[s.tdMuted2, s.colMonS]}>{m(u.precio.frenteVerde)}</Text>
            <Text style={[s.tdTotalNumRow, s.colMon]}>{m(u.precio.total)}</Text>
          </View>
        ))}
        <View style={s.trTotal} wrap={false}>
          <Text style={[s.tdTotal, s.colUnidad]}>Total ({result.totalDisponibles})</Text>
          <Text style={[s.tdTotal, s.colProy]}> </Text>
          <Text style={[s.tdTotal, s.colArea]}> </Text>
          <Text style={[s.tdTotal, s.colCar]}> </Text>
          <Text style={[s.tdTotal, s.colMon]}> </Text>
          <Text style={[s.tdTotal, s.colMon]}> </Text>
          <Text style={[s.tdTotal, s.colMonS]}> </Text>
          <Text style={[s.tdTotal, s.colMonS]}> </Text>
          <Text style={[s.tdTotalNum, s.colMon]}>{m(result.valorTotal)}</Text>
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

const s = StyleSheet.create({
  subtitle: { fontSize: 9, color: colors.textMuted, marginBottom: 10 },
  resumenRow: { flexDirection: 'row', marginBottom: 12 },
  resumenCard: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 3,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  resumenCardWide: {
    flex: 1.4,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 3,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  resumenLabel: {
    fontSize: 7,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  resumenValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: colors.primary },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  th: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 0.2 },
  thNum: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#fff', textAlign: 'right' },
  tr: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
  },
  tdStrong: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.text },
  tdMuted: { fontSize: 8, color: colors.textMuted },
  tdMuted2: { fontSize: 8, color: colors.textMuted, textAlign: 'right' },
  tdNum: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.text, textAlign: 'right' },
  tdTotalNumRow: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    textAlign: 'right',
  },
  trTotal: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: colors.bgSoft,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
  },
  tdTotal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.text },
  tdTotalNum: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    textAlign: 'right',
  },
  colUnidad: { width: '14%' },
  colProy: { width: '20%' },
  colArea: { width: '8%' },
  colCar: { width: '8%' },
  colMon: { width: '13%' },
  colMonS: { width: '9%' },
});

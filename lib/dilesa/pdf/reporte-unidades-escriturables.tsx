/**
 * PDF del reporte «Unidades escriturables» (DILESA · Ventas) — ADR-047.
 * Qué se puede firmar ya (obra terminada + extracción RUV) y qué detiene al
 * resto. Landscape para que quepan las columnas.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import {
  estatusEscriturable,
  type EscriturablesResult,
} from '@/lib/dilesa/reportes/unidades-escriturables';

const f = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export type EscriturablesPdfMeta = { fechaTexto: string; filtrosTexto: string };

export function ReporteUnidadesEscriturablesPDF({
  result,
  meta,
}: {
  result: EscriturablesResult;
  meta: EscriturablesPdfMeta;
}) {
  return (
    <Document title="Unidades escriturables — DILESA">
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <HeaderBand title="UNIDADES ESCRITURABLES" fecha={meta.fechaTexto} />
        <Text style={s.subtitle}>
          Obra terminada + extracción RUV capturada · {meta.filtrosTexto}
        </Text>

        <View style={s.resumenRow}>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Escriturables</Text>
            <Text style={s.resumenValue}>{result.escriturables}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>En inventario</Text>
            <Text style={s.resumenValue}>{result.enInventario}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Asignadas s/escriturar</Text>
            <Text style={s.resumenValue}>{result.asignadas}</Text>
          </View>
          <View style={s.resumenCard}>
            <Text style={s.resumenLabel}>Falta extracción</Text>
            <Text style={s.resumenValue}>{result.faltaExtraccion}</Text>
          </View>
          <View style={s.resumenCardLast}>
            <Text style={s.resumenLabel}>Obra en proceso</Text>
            <Text style={s.resumenValue}>{result.obraEnProceso}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.colUnidad]}>Unidad</Text>
          <Text style={[s.th, s.colProy]}>Proyecto / prototipo</Text>
          <Text style={[s.th, s.colSit]}>Situación</Text>
          <Text style={[s.th, s.colCliente]}>Comprador · fase</Text>
          <Text style={[s.th, s.colFecha]}>Obra term.</Text>
          <Text style={[s.th, s.colFecha]}>DTU</Text>
          <Text style={[s.th, s.colFecha]}>Extracción</Text>
          <Text style={[s.th, s.colEstatus]}>Estatus</Text>
        </View>
        {result.unidades.map((u) => (
          <View key={u.unidadId} style={s.tr} wrap={false}>
            <Text style={[s.tdStrong, s.colUnidad]}>{u.identificadorCompleto}</Text>
            <Text style={[s.tdMuted, s.colProy]}>
              {[u.proyectoNombre, u.prototipo].filter(Boolean).join(' · ')}
            </Text>
            <Text style={[s.tdMuted, s.colSit]}>
              {u.situacion === 'inventario' ? 'Inventario' : 'Asignada'}
            </Text>
            <Text style={[s.tdMuted, s.colCliente]}>
              {u.cliente ? [u.cliente, u.faseActual].filter(Boolean).join(' · ') : '—'}
            </Text>
            <Text style={[s.tdMuted, s.colFecha]}>
              {u.obraTerminada
                ? u.fechaObraTerminada
                  ? f(u.fechaObraTerminada)
                  : 'Sí'
                : 'En proceso'}
            </Text>
            <Text style={[s.tdMuted, s.colFecha]}>{f(u.fechaDtu)}</Text>
            <Text style={[s.tdMuted, s.colFecha]}>{f(u.fechaExtraccion)}</Text>
            <Text style={[u.escriturable ? s.tdOk : s.tdPend, s.colEstatus]}>
              {estatusEscriturable(u)}
            </Text>
          </View>
        ))}
        <View style={s.trTotal} wrap={false}>
          <Text style={s.tdTotal}>
            {result.unidades.length} unidades · {result.escriturables} escriturables de{' '}
            {result.totalCandidatas} candidatas
          </Text>
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
  resumenCardLast: {
    flex: 1,
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
  tr: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
  },
  tdStrong: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.text },
  tdMuted: { fontSize: 8, color: colors.textMuted },
  tdOk: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.primary },
  tdPend: { fontSize: 8, color: colors.textMuted },
  trTotal: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: colors.bgSoft,
    borderTopWidth: 1,
    borderTopColor: colors.primary,
  },
  tdTotal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.text },
  colUnidad: { width: '13%' },
  colProy: { width: '19%' },
  colSit: { width: '9%' },
  colCliente: { width: '23%' },
  colFecha: { width: '9%' },
  colEstatus: { width: '9%' },
});

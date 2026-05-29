/**
 * PDF del Análisis Financiero del anteproyecto DILESA.
 * Sprint 4C de la iniciativa `dilesa-proyectos-checklist-inline`.
 *
 * Replica visualmente la sección `<AnteproyectoAnalisisFinanciero>`
 * pero en formato letter para presentar al consejo o usar como
 * documento amparador del análisis aprobado.
 *
 * Una sola página (letter): predio + capital + tabla referencia vs
 * proyecto + resultado + chips de clasificaciones + prototipo
 * referencia + fecha de emisión.
 */

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { colors, styles as base } from './styles';
import { FooterBand, HeaderBand } from './header-footer';
import {
  ANALISIS_FILAS_COSTOS,
  deriveAnalisisFinanciero,
  fmtM2,
  fmtMoney,
  fmtMoneyCents,
  fmtNumber,
  fmtPct,
  labelDeClasificacion,
  type AnalisisFinancieroSnapshot,
} from '@/components/dilesa/analisis-financiero-types';

const s = StyleSheet.create({
  intro: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 9,
    color: colors.textMuted,
  },
  proyectoTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 4,
    marginBottom: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  chip: {
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 1,
    paddingHorizontal: 4,
    fontSize: 7.5,
    marginRight: 4,
    marginBottom: 2,
  },
  card: {
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 3,
    padding: 6,
    marginBottom: 4,
    backgroundColor: '#fff',
  },
  cardLabel: {
    fontSize: 8,
    color: colors.textMuted,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  grid2: {
    flexDirection: 'row',
  },
  col: {
    flex: 1,
  },
  colLeft: {
    flex: 1,
    marginRight: 4,
  },
  colRight: {
    flex: 1,
    marginLeft: 4,
  },
  rowKV: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1,
  },
  k: {
    fontSize: 8.5,
    color: colors.textMuted,
  },
  v: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
  },
  vAccent: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
  },
  table: {
    marginTop: 2,
  },
  th: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingBottom: 2,
    marginBottom: 2,
  },
  thLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 1.5,
    borderBottomWidth: 0.25,
    borderBottomColor: colors.borderSoft,
  },
  trTotal: {
    flexDirection: 'row',
    paddingTop: 4,
    paddingBottom: 2,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    marginTop: 1,
  },
  tdLabel: {
    flex: 2,
    fontSize: 8.5,
    color: colors.text,
  },
  tdLabelBold: {
    flex: 2,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  tdNum: {
    flex: 1.3,
    fontSize: 8.5,
    textAlign: 'right',
    fontFamily: 'Helvetica',
  },
  tdNumBold: {
    flex: 1.3,
    fontSize: 9,
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
  },
  tdDelta: {
    flex: 1.0,
    fontSize: 8.5,
    textAlign: 'right',
  },
  resultGrid: {
    flexDirection: 'row',
    marginTop: 2,
  },
  resultCard: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 3,
    padding: 5,
    marginRight: 4,
  },
  resultCardLast: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 3,
    padding: 5,
  },
  resultLabel: {
    fontSize: 7.5,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    marginTop: 1,
  },
  emisionLine: {
    fontSize: 7.5,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'right',
  },
});

const DASH = '—';

function n(v: number | null | undefined, formatter: (x: number) => string): string {
  if (v == null) return DASH;
  return formatter(v);
}

function delta(ref: number | null, proy: number | null) {
  if (ref == null || proy == null) {
    return { txt: DASH, color: colors.textMuted };
  }
  const d = proy - ref;
  const sign = d > 0 ? '+' : '';
  const color = d > 0 ? '#b91c1c' : d < 0 ? '#15803d' : colors.text;
  return { txt: `${sign}${fmtMoney(d)}`, color };
}

export type AnalisisPdfData = {
  nombreProyecto: string;
  estado: string;
  emitidoEnTexto: string;
  prototipoReferenciaNombre: string | null;
  snapshot: AnalisisFinancieroSnapshot;
};

export function AnalisisFinancieroPDF({ data }: { data: AnalisisPdfData }) {
  const { snapshot, prototipoReferenciaNombre } = data;
  const d = deriveAnalisisFinanciero(snapshot);

  const inversion =
    d.costoTotalProyecto != null
      ? d.costoTotalProyecto + (snapshot.valor_predio ?? snapshot.costo_terreno ?? 0)
      : null;

  return (
    <Document>
      <Page size="LETTER" style={base.page}>
        <HeaderBand title="ANÁLISIS FINANCIERO" fecha={data.emitidoEnTexto} />

        <Text style={s.proyectoTitle}>{data.nombreProyecto}</Text>
        <Text style={s.intro}>
          Estado: {data.estado} · Documento amparador del análisis financiero del anteproyecto.
        </Text>

        {/* ── Predio + Capital ──────────────────────────────────────────── */}
        <View style={s.grid2}>
          <View style={[s.card, s.colLeft]}>
            <Text style={s.cardLabel}>Predio</Text>
            <KV
              k="Clasificación"
              v={
                snapshot.clasificaciones_inmobiliarias.length === 0
                  ? DASH
                  : snapshot.clasificaciones_inmobiliarias.map(labelDeClasificacion).join(', ')
              }
            />
            <KV k="Lotes proyectados" v={n(snapshot.lotes_proyectados, fmtNumber)} />
            <KV k="Área total" v={n(snapshot.area_m2, (x) => `${fmtNumber(x)} m²`)} />
            <KV k="Área vendible" v={n(snapshot.area_vendible_m2, (x) => `${fmtNumber(x)} m²`)} />
            <KV k="Áreas verdes" v={n(snapshot.areas_verdes_m2, (x) => `${fmtNumber(x)} m²`)} />
            <KV k="Vialidades" v={n(snapshot.area_vialidades_m2, (x) => `${fmtNumber(x)} m²`)} />
            <KV k="Lote promedio" v={n(snapshot.tamano_lote_promedio, fmtM2)} />
            <KV k="% áreas verdes" v={n(d.pctVerdes, fmtPct)} accent />
            <KV k="Aprovechamiento" v={n(d.aprovechamiento, fmtPct)} accent />
          </View>

          <View style={[s.card, s.colRight]}>
            <Text style={s.cardLabel}>Capital inicial</Text>
            <KV k="Costo terreno" v={n(snapshot.costo_terreno, fmtMoney)} />
            <KV k="Valor predio" v={n(snapshot.valor_predio, fmtMoney)} />
            <KV k="$/m² aprovechable" v={n(d.precioM2Aprovechable, fmtMoneyCents)} />
            <KV k="Presupuesto estimado" v={n(snapshot.presupuesto_estimado, fmtMoney)} />
            <KV
              k="Infra cabecera necesaria"
              v={snapshot.infraestructura_cabecera_necesaria ? 'Sí' : 'No'}
            />
            <KV k="Prototipo de referencia" v={prototipoReferenciaNombre ?? DASH} />
            {snapshot.prototipos_referencia.length > 0 && (
              <>
                <Text style={[s.k, { marginTop: 3 }]}>Prototipos adicionales:</Text>
                <View style={s.chipsRow}>
                  {snapshot.prototipos_referencia.map((p) => (
                    <Text key={p} style={s.chip}>
                      {p}
                    </Text>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        {/* ── Tabla Referencia vs Proyecto ──────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Costos: Referencia vs Proyecto</Text>
          <View style={s.table}>
            <View style={s.th}>
              <Text style={[s.thLabel, s.tdLabel]}>Concepto</Text>
              <Text style={[s.thLabel, s.tdNum]}>Referencia</Text>
              <Text style={[s.thLabel, s.tdNum]}>Proyecto</Text>
              <Text style={[s.thLabel, s.tdDelta]}>Δ</Text>
            </View>
            {ANALISIS_FILAS_COSTOS.map((fila) => {
              const ref = snapshot[fila.referencia] as number | null;
              const proy = snapshot[fila.proyecto] as number | null;
              const dd = delta(ref, proy);
              return (
                <View key={fila.label} style={s.tr}>
                  <Text style={s.tdLabel}>{fila.label}</Text>
                  <Text style={s.tdNum}>{n(ref, fmtMoney)}</Text>
                  <Text style={s.tdNum}>{n(proy, fmtMoney)}</Text>
                  <Text style={[s.tdDelta, { color: dd.color }]}>{dd.txt}</Text>
                </View>
              );
            })}
            <View style={s.trTotal}>
              <Text style={s.tdLabelBold}>Costo total</Text>
              <Text style={s.tdNumBold}>{n(d.costoTotalReferencia, fmtMoney)}</Text>
              <Text style={s.tdNumBold}>{n(d.costoTotalProyecto, fmtMoney)}</Text>
              <Text
                style={[
                  s.tdDelta,
                  {
                    color: d.delta == null ? colors.textMuted : d.delta > 0 ? '#b91c1c' : '#15803d',
                    fontFamily: 'Helvetica-Bold',
                  },
                ]}
              >
                {d.delta == null ? DASH : `${d.delta > 0 ? '+' : ''}${fmtMoney(d.delta)}`}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Resultado ────────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Resultado</Text>
          <View style={s.resultGrid}>
            <View style={s.resultCard}>
              <Text style={s.resultLabel}>Utilidad proyecto</Text>
              <Text style={s.resultValue}>{n(d.utilidadProyecto, fmtMoney)}</Text>
            </View>
            <View style={s.resultCard}>
              <Text style={s.resultLabel}>Margen utilidad</Text>
              <Text style={s.resultValue}>{n(d.margenUtilidad, fmtPct)}</Text>
            </View>
            <View style={s.resultCard}>
              <Text style={s.resultLabel}>Inversión total</Text>
              <Text style={s.resultValue}>{n(inversion, fmtMoney)}</Text>
            </View>
            <View style={s.resultCardLast}>
              <Text style={s.resultLabel}>Valor comercial proyecto</Text>
              <Text style={s.resultValue}>{n(snapshot.valor_comercial_proyecto, fmtMoney)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.emisionLine}>Emitido el {data.emitidoEnTexto}</Text>

        <FooterBand />
      </Page>
    </Document>
  );
}

function KV({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <View style={s.rowKV}>
      <Text style={s.k}>{k}</Text>
      <Text style={accent ? s.vAccent : s.v}>{v}</Text>
    </View>
  );
}

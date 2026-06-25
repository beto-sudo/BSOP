/**
 * Template PDF: Tareas pendientes de ejecución de una obra (DILESA).
 *
 * Documento que se entrega al contratista (a veces lo piden) con la
 * relación de tareas que aún faltan por ejecutar, el valor de mano de
 * obra de cada una, los datos de la vivienda y del contrato. Branding
 * olivo compartido (HeaderBand / FooterBand).
 *
 * El valor por tarea = `porcentaje_costo × valor_contrato_mo` — misma
 * fórmula que la pantalla de la obra (app/dilesa/construccion/[id]) y que
 * la vista `dilesa.v_construccion_tareas_terminadas_con_mo`. Excluye los
 * hitos de recepción: no son trabajo de ejecución del contratista (se
 * cierran por el flujo "Recibir obra").
 *
 * Multipágina (`wrap`) — la lista por etapa puede crecer; por eso el PDF
 * se genera server-side con @react-pdf/renderer (no print del navegador,
 * que no pagina bajo el app-shell).
 */
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Folio } from './header-footer';

export type TareasPendientesPdfData = {
  obraCodigo: string;
  /** Identificador legible de la vivienda — ej. "M13-L4-LDS-RMC". */
  identificador: string;
  fechaTexto: string;
  proyecto: string | null;
  unidad: string | null;
  prototipo: string | null;
  m2Construccion: number | null;
  contratista: { nombre: string; abreviacion: string | null };
  /** Código(s) del contrato de obra ligado a la vivienda, si lo hay. */
  contratoCodigo: string | null;
  avancePct: number;
  valorContratoMo: number;
  moEjecutado: number;
  /** Autoritativo de la obra: valor_contrato_mo − mo_ejecutado. */
  moPorEjecutar: number;
  etapas: Array<{
    nombre: string;
    orden: number;
    tareas: Array<{ nombre: string; valor: number }>;
    subtotal: number;
  }>;
  /** Suma de las tareas listadas (lo que el contratista tiene por hacer). */
  totalPendiente: number;
  totalTareas: number;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const m = (n: number) => moneyFmt.format(n);

export function TareasPendientesPDF({ data }: { data: TareasPendientesPdfData }) {
  const contratistaDisplay = data.contratista.abreviacion
    ? `${data.contratista.abreviacion} · ${data.contratista.nombre}`
    : data.contratista.nombre;

  const ficha: Array<[string, string | null]> = [
    ['Proyecto', data.proyecto],
    ['Unidad', data.unidad],
    ['Código de obra', data.obraCodigo],
    ['Prototipo', data.prototipo],
    ['m² construcción', data.m2Construccion != null ? `${data.m2Construccion} m²` : null],
    ['Contratista', contratistaDisplay],
    ['Contrato', data.contratoCodigo],
    ['Avance de obra', `${data.avancePct.toFixed(0)}%`],
  ];

  return (
    <Document title={`Pendientes ${data.identificador}`}>
      <Page size="LETTER" style={styles.page} wrap>
        <HeaderBand title="PENDIENTES DE EJECUCIÓN" fecha={data.fechaTexto} />
        <Folio value={data.identificador} />

        {/* Datos de la vivienda + contrato */}
        <Text style={sectionTitle}>DATOS DE LA OBRA</Text>
        <View style={fichaWrap}>
          {ficha
            .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
            .map(([label, value]) => (
              <View key={label} style={fichaRow}>
                <Text style={fichaLabel}>{label}</Text>
                <Text style={fichaValue}>{value}</Text>
              </View>
            ))}
        </View>

        {/* Resumen de mano de obra */}
        <View style={resumenWrap} wrap={false}>
          <View style={resumenRow}>
            <Text style={resumenLabel}>Valor contrato MO</Text>
            <Text style={resumenMonto}>{m(data.valorContratoMo)}</Text>
          </View>
          <View style={resumenRow}>
            <Text style={resumenLabel}>MO ejecutado</Text>
            <Text style={resumenMonto}>{m(data.moEjecutado)}</Text>
          </View>
          <View style={[resumenRow, resumenRowTotal]}>
            <Text style={resumenLabelTotal}>MO POR EJECUTAR</Text>
            <Text style={resumenMontoTotal}>{m(data.moPorEjecutar)}</Text>
          </View>
        </View>

        {/* Tareas pendientes por etapa */}
        <Text style={sectionTitle}>
          TAREAS PENDIENTES DE EJECUCIÓN ({data.totalTareas}
          {data.totalTareas === 1 ? ' tarea' : ' tareas'})
        </Text>

        {data.etapas.length === 0 ? (
          <Text style={vacioText}>
            No hay tareas de construcción pendientes. La obra está lista para recepción.
          </Text>
        ) : (
          <>
            <View style={tablaHeader} fixed>
              <Text style={[tablaCellNombre, tablaHeaderText]}>Tarea</Text>
              <Text style={[tablaCellMonto, tablaHeaderText]}>Valor MO</Text>
            </View>
            {data.etapas.map((et) => (
              <View key={`${et.orden}-${et.nombre}`} style={etapaWrap} wrap={false}>
                <View style={etapaHeader}>
                  <Text style={etapaHeaderNombre}>
                    {et.orden}. {et.nombre}
                  </Text>
                  <Text style={etapaHeaderSubtotal}>{m(et.subtotal)}</Text>
                </View>
                {et.tareas.map((t, idx) => (
                  <View key={idx} style={tablaRow}>
                    <Text style={tablaCellNombre}>{t.nombre}</Text>
                    <Text style={tablaCellMonto}>{m(t.valor)}</Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={totalWrap} wrap={false}>
              <Text style={totalLabel}>TOTAL TAREAS PENDIENTES</Text>
              <Text style={totalMonto}>{m(data.totalPendiente)}</Text>
            </View>
          </>
        )}

        <Text style={notaText}>
          Relación de mano de obra pendiente de ejecución. Los montos corresponden al valor de mano
          de obra de cada tarea según el contrato de obra; no incluyen material. El avance y los
          montos se calculan al momento de generar este documento.
        </Text>

        <FooterBand />
      </Page>
    </Document>
  );
}

// ── Estilos locales (los compartidos vienen de ./styles) ──────────────────
const sectionTitle = {
  fontSize: 11,
  fontFamily: 'Helvetica-Bold' as const,
  marginTop: 12,
  marginBottom: 6,
  color: colors.primary,
  borderBottom: `1pt solid ${colors.primary}`,
  paddingBottom: 2,
};

const fichaWrap = { marginBottom: 6 };
const fichaRow = { flexDirection: 'row' as const, marginVertical: 1.5 };
const fichaLabel = {
  width: 130,
  fontSize: 9,
  color: colors.textMuted,
  textTransform: 'uppercase' as const,
};
const fichaValue = { flex: 1, fontSize: 10, color: colors.text };

const resumenWrap = {
  marginTop: 10,
  marginLeft: 'auto' as const,
  width: 280,
  padding: 8,
  border: `0.5pt solid ${colors.border}`,
  borderRadius: 3,
};
const resumenRow = {
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  marginVertical: 2,
};
const resumenRowTotal = {
  borderTop: `0.5pt solid ${colors.primary}`,
  paddingTop: 6,
  marginTop: 4,
};
const resumenLabel = { fontSize: 9, color: colors.textMuted };
const resumenMonto = { fontSize: 10, color: colors.text, textAlign: 'right' as const };
const resumenLabelTotal = {
  fontSize: 10,
  fontFamily: 'Helvetica-Bold' as const,
  color: colors.primary,
};
const resumenMontoTotal = {
  fontSize: 12,
  fontFamily: 'Helvetica-Bold' as const,
  color: colors.primary,
  textAlign: 'right' as const,
};

const tablaHeader = {
  flexDirection: 'row' as const,
  borderBottom: `0.5pt solid ${colors.border}`,
  paddingVertical: 2,
};
const tablaHeaderText = {
  fontSize: 8,
  color: colors.textMuted,
  textTransform: 'uppercase' as const,
};
const tablaRow = {
  flexDirection: 'row' as const,
  paddingVertical: 1.5,
  borderBottom: `0.25pt solid ${colors.borderSoft}`,
};
const tablaCellNombre = { flex: 1, fontSize: 9, color: colors.text, paddingRight: 8 };
const tablaCellMonto = {
  width: 90,
  fontSize: 9,
  color: colors.text,
  textAlign: 'right' as const,
};

const etapaWrap = { marginBottom: 8 };
const etapaHeader = {
  flexDirection: 'row' as const,
  backgroundColor: colors.bgSoft,
  paddingVertical: 3,
  paddingHorizontal: 4,
  alignItems: 'center' as const,
  marginTop: 4,
};
const etapaHeaderNombre = {
  flex: 1,
  fontSize: 9.5,
  fontFamily: 'Helvetica-Bold' as const,
  color: colors.text,
};
const etapaHeaderSubtotal = {
  width: 90,
  fontSize: 9,
  fontFamily: 'Helvetica-Bold' as const,
  textAlign: 'right' as const,
  color: colors.text,
};

const totalWrap = {
  flexDirection: 'row' as const,
  justifyContent: 'flex-end' as const,
  alignItems: 'center' as const,
  marginTop: 8,
  paddingTop: 6,
  borderTop: `1pt solid ${colors.primary}`,
};
const totalLabel = {
  fontSize: 10,
  fontFamily: 'Helvetica-Bold' as const,
  color: colors.primary,
  marginRight: 12,
};
const totalMonto = {
  width: 90,
  fontSize: 12,
  fontFamily: 'Helvetica-Bold' as const,
  color: colors.primary,
  textAlign: 'right' as const,
};

const vacioText = {
  fontSize: 10,
  color: colors.textMuted,
  marginTop: 4,
};
const notaText = {
  fontSize: 7.5,
  color: colors.textMuted,
  marginTop: 16,
  lineHeight: 1.35,
};

/**
 * Template PDF: Pagaré de Crédito Directo (Sprint 7h — Fase 10, PR2).
 *
 * Título de crédito (pagaré mercantil) que documenta el saldo financiado
 * por DILESA cuando el crédito de la institución + los depósitos no cubren
 * el precio. Un solo pagaré por el saldo, con plan de pagos a varias fechas.
 *
 * Redactado conforme al art. 170 de la Ley General de Títulos y Operaciones
 * de Crédito (LGTOC) + cláusulas de respaldo (vencimiento anticipado,
 * interés moratorio con fórmula TIIE, aval, sometimiento a tribunales).
 *
 * ⚠️ El texto legal debe ser revisado por Beto / su abogado antes de uso
 * en producción.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Watermark } from './header-footer';

export type PagareParcialidad = {
  num: number;
  fechaTexto: string;
  /** Abono a capital. */
  montoFmt: string;
  /** Interés ordinario del periodo — solo cuando la tasa es > 0. */
  interesFmt?: string;
  /** Capital + interés — solo cuando la tasa es > 0. */
  pagoFmt?: string;
};

export type PagareCreditoDirectoData = {
  folio: string;
  lugarSuscripcion: string;
  fechaSuscripcionTexto: string;
  // Beneficiario (DILESA)
  beneficiario: string;
  beneficiarioDomicilio: string | null;
  // Suscriptor (deudor)
  deudorNombre: string;
  deudorDomicilio: string | null;
  deudorIdentificacion: string | null;
  // Vivienda objeto
  identificacionInventario: string;
  fraccionamiento: string | null;
  domicilioOficial: string | null;
  // Montos
  montoTotalFmt: string;
  montoTotalLetra: string;
  parcialidades: PagareParcialidad[];
  /** Totales del plan — interés/pago presentes solo con tasa ordinaria > 0. */
  totalCapitalFmt: string;
  totalInteresFmt?: string;
  totalPagarFmt?: string;
  // Intereses
  interesOrdinarioPct: number | null;
  tiie28Pct: number | null;
  spreadMoratorioPct: number | null;
  tasaMoratoriaPct: number | null;
  // Aval (opcional)
  avalNombre: string | null;
  avalDomicilio: string | null;
  // Estado
  watermark?: string | null;
};

const local = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  folio: { fontSize: 9, color: colors.textMuted },
  buenoPor: {
    borderWidth: 1,
    borderColor: colors.text,
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  lugarFecha: { fontSize: 9.5, marginBottom: 8, textAlign: 'right' },
  parrafo: { fontSize: 9.5, lineHeight: 1.4, marginBottom: 7, textAlign: 'justify' },
  bold: { fontFamily: 'Helvetica-Bold' },
  blockHeading: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    marginTop: 6,
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  table: { borderWidth: 0.6, borderColor: colors.border, marginBottom: 7 },
  trHead: {
    flexDirection: 'row',
    backgroundColor: colors.bgSoft,
    borderBottomWidth: 0.6,
    borderBottomColor: colors.border,
  },
  tr: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: colors.borderSoft },
  thNum: { width: '15%', padding: 3, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  thFecha: { width: '45%', padding: 3, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  thMonto: {
    width: '40%',
    padding: 3,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  tdNum: { width: '15%', padding: 3, fontSize: 8.5 },
  tdFecha: { width: '45%', padding: 3, fontSize: 8.5 },
  tdMonto: { width: '40%', padding: 3, fontSize: 8.5, textAlign: 'right' },
  // Variante con interés desglosado (5 columnas).
  thNumI: { width: '8%', padding: 3, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  thFechaI: { width: '32%', padding: 3, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  thImpI: {
    width: '20%',
    padding: 3,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  tdNumI: { width: '8%', padding: 3, fontSize: 8.5 },
  tdFechaI: { width: '32%', padding: 3, fontSize: 8.5 },
  tdImpI: { width: '20%', padding: 3, fontSize: 8.5, textAlign: 'right' },
  trTotal: { flexDirection: 'row', backgroundColor: colors.bgSoft },
  tdTotalLabel: { padding: 3, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  tdTotalMonto: { padding: 3, fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  clausula: { fontSize: 8.3, lineHeight: 1.35, marginBottom: 5, textAlign: 'justify' },
  firmaWrap: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between' },
  firmaCol: { width: '46%', alignItems: 'center' },
  firmaLinea: {
    borderTopWidth: 0.8,
    borderTopColor: colors.text,
    width: '100%',
    marginBottom: 3,
    paddingTop: 4,
  },
  firmaLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  firmaNombre: { fontSize: 8.5, textAlign: 'center' },
  firmaDom: { fontSize: 7.5, color: colors.textMuted, textAlign: 'center', marginTop: 1 },
});

export function PagareCreditoDirectoPDF({ data }: { data: PagareCreditoDirectoData }) {
  const tieneOrdinario = (data.interesOrdinarioPct ?? 0) > 0;
  const viviendaDesc = [data.identificacionInventario, data.fraccionamiento, data.domicilioOficial]
    .filter(Boolean)
    .join(', ');

  return (
    <Document title={`Pagaré — ${data.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="PAGARÉ" fecha={`${data.lugarSuscripcion}`} />
        {data.watermark ? <Watermark text={data.watermark} /> : null}

        <View style={local.topRow}>
          <Text style={local.folio}>Folio: {data.folio}</Text>
          <Text style={local.buenoPor}>Bueno por {data.montoTotalFmt}</Text>
        </View>

        <Text style={local.lugarFecha}>
          {data.lugarSuscripcion}, a {data.fechaSuscripcionTexto}.
        </Text>

        <Text style={local.parrafo}>
          Debo y pagaré incondicionalmente a la orden de{' '}
          <Text style={local.bold}>{data.beneficiario}</Text>
          {data.beneficiarioDomicilio ? `, con domicilio en ${data.beneficiarioDomicilio}` : ''}, la
          cantidad de <Text style={local.bold}>{data.montoTotalFmt}</Text> ({data.montoTotalLetra}),
          por concepto del saldo del precio de la vivienda identificada como{' '}
          <Text style={local.bold}>{viviendaDesc}</Text>, cantidad que reconozco deber por valor
          recibido a mi entera satisfacción.
        </Text>

        <Text style={local.blockHeading}>FORMA DE PAGO</Text>
        <Text style={[local.parrafo, { marginBottom: 4 }]}>
          Me obligo a pagar la cantidad anterior en {data.parcialidades.length}{' '}
          {data.parcialidades.length === 1 ? 'exhibición' : 'parcialidades'}, en las fechas y por
          los importes siguientes, siendo el lugar de pago el domicilio del beneficiario:
        </Text>
        {tieneOrdinario ? (
          <View style={local.table}>
            <View style={local.trHead}>
              <Text style={local.thNumI}>No.</Text>
              <Text style={local.thFechaI}>Fecha de vencimiento</Text>
              <Text style={local.thImpI}>Capital</Text>
              <Text style={local.thImpI}>Interés ordinario</Text>
              <Text style={local.thImpI}>Pago total</Text>
            </View>
            {data.parcialidades.map((p) => (
              <View style={local.tr} key={p.num}>
                <Text style={local.tdNumI}>{p.num}</Text>
                <Text style={local.tdFechaI}>{p.fechaTexto}</Text>
                <Text style={local.tdImpI}>{p.montoFmt}</Text>
                <Text style={local.tdImpI}>{p.interesFmt ?? '—'}</Text>
                <Text style={local.tdImpI}>{p.pagoFmt ?? p.montoFmt}</Text>
              </View>
            ))}
            <View style={local.trTotal}>
              <Text style={[local.tdTotalLabel, { width: '40%' }]}>TOTAL</Text>
              <Text style={[local.tdTotalMonto, { width: '20%' }]}>{data.totalCapitalFmt}</Text>
              <Text style={[local.tdTotalMonto, { width: '20%' }]}>
                {data.totalInteresFmt ?? '—'}
              </Text>
              <Text style={[local.tdTotalMonto, { width: '20%' }]}>
                {data.totalPagarFmt ?? data.totalCapitalFmt}
              </Text>
            </View>
          </View>
        ) : (
          <View style={local.table}>
            <View style={local.trHead}>
              <Text style={local.thNum}>No.</Text>
              <Text style={local.thFecha}>Fecha de vencimiento</Text>
              <Text style={local.thMonto}>Importe</Text>
            </View>
            {data.parcialidades.map((p) => (
              <View style={local.tr} key={p.num}>
                <Text style={local.tdNum}>{p.num}</Text>
                <Text style={local.tdFecha}>{p.fechaTexto}</Text>
                <Text style={local.tdMonto}>{p.montoFmt}</Text>
              </View>
            ))}
            <View style={local.trTotal}>
              <Text style={[local.tdTotalLabel, { width: '60%' }]}>TOTAL</Text>
              <Text style={[local.tdTotalMonto, { width: '40%' }]}>{data.totalCapitalFmt}</Text>
            </View>
          </View>
        )}

        {tieneOrdinario ? (
          <Text style={local.clausula}>
            <Text style={local.bold}>INTERÉS ORDINARIO. </Text>La suerte principal generará un
            interés ordinario a razón del {data.interesOrdinarioPct}% anual, calculado sobre saldos
            insolutos sobre la base de un año comercial de 360 días, pagadero junto con cada
            parcialidad conforme al desglose de la tabla anterior
            {data.totalInteresFmt && data.totalPagarFmt
              ? `; los intereses ordinarios del plan ascienden a ${data.totalInteresFmt}, para un total a pagar de ${data.totalPagarFmt}`
              : ''}
            .
          </Text>
        ) : null}

        <Text style={local.clausula}>
          <Text style={local.bold}>INTERÉS MORATORIO. </Text>En caso de falta de pago oportuno,
          la(s) cantidad(es) vencida(s) causará(n) un interés moratorio a razón de la Tasa de
          Interés Interbancaria de Equilibrio (TIIE) a 28 días vigente a la fecha de suscripción del
          presente
          {data.tiie28Pct != null ? ` (${data.tiie28Pct}%)` : ''} más {data.spreadMoratorioPct ?? 4}{' '}
          puntos porcentuales
          {data.tasaMoratoriaPct != null ? `, es decir, ${data.tasaMoratoriaPct}% anual` : ''},
          computado desde la fecha de vencimiento y hasta el día de su total liquidación.
        </Text>

        <Text style={local.clausula}>
          <Text style={local.bold}>VENCIMIENTO ANTICIPADO. </Text>La falta de pago puntual de
          cualquiera de las parcialidades dará por vencido anticipadamente el plazo de la totalidad
          del adeudo, pudiendo el beneficiario exigir de inmediato el pago del saldo insoluto, sus
          intereses y accesorios, sin necesidad de declaración judicial previa.
        </Text>

        {data.avalNombre ? (
          <Text style={local.clausula}>
            <Text style={local.bold}>AVAL. </Text>Por aval, para garantizar incondicionalmente el
            pago total de este pagaré, comparece <Text style={local.bold}>{data.avalNombre}</Text>
            {data.avalDomicilio ? `, con domicilio en ${data.avalDomicilio}` : ''}, quien se obliga
            solidariamente con el suscriptor.
          </Text>
        ) : null}

        <Text style={local.clausula}>
          <Text style={local.bold}>NATURALEZA Y JURISDICCIÓN. </Text>El presente es un pagaré,
          título de crédito regido por la Ley General de Títulos y Operaciones de Crédito. Para todo
          lo relativo a su interpretación y cumplimiento, el suscriptor y, en su caso, el aval, se
          someten expresamente a la jurisdicción de los tribunales competentes de la ciudad de
          Piedras Negras, Coahuila, renunciando a cualquier otro fuero que pudiera corresponderles
          por razón de su domicilio presente o futuro.
        </Text>

        {/* Firmas */}
        <View style={local.firmaWrap}>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>EL SUSCRIPTOR (DEUDOR)</Text>
            <Text style={local.firmaNombre}>{data.deudorNombre}</Text>
            {data.deudorIdentificacion ? (
              <Text style={local.firmaDom}>{data.deudorIdentificacion}</Text>
            ) : null}
            {data.deudorDomicilio ? (
              <Text style={local.firmaDom}>{data.deudorDomicilio}</Text>
            ) : null}
          </View>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>
              {data.avalNombre ? 'EL AVAL' : 'AVAL (en su caso)'}
            </Text>
            {data.avalNombre ? <Text style={local.firmaNombre}>{data.avalNombre}</Text> : null}
            {data.avalDomicilio ? <Text style={local.firmaDom}>{data.avalDomicilio}</Text> : null}
          </View>
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

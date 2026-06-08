/**
 * Template PDF: Póliza de Garantía de Vivienda (Sprint 7h — Fase 10).
 *
 * Documento legal que el desarrollador (DILESA / "Desarrollo Inmobiliario
 * Los Encinos") otorga a favor del acreditado, para el expediente del
 * notario al programar la firma. Réplica del export de Coda.
 *
 * Las obligaciones (PRIMERA–SEXTA) son texto boilerplate fijo. Los datos
 * del desarrollador (razón social, registro Infonavit, representante,
 * teléfono, email) vienen de core.empresas; la vivienda y el acreditado de
 * la venta. Mismo branding que los demás PDFs DILESA (banda olivo + footer).
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Watermark } from './header-footer';

export type PolizaGarantiaData = {
  fechaTexto: string;
  // Desarrollador (core.empresas)
  desarrolladorRazonSocial: string;
  registroInfonavit: string | null;
  representanteLegal: string | null;
  telefono: string | null;
  email: string | null;
  // Acreditado (cliente)
  clienteNombre: string;
  identificacionInventario: string;
  // Vivienda
  fraccionamiento: string | null;
  manzana: string | null;
  lote: string | null;
  prototipo: string | null;
  domicilioOficial: string | null;
  // Estado (watermark si desasignada/expirada)
  watermark?: string | null;
};

const local = StyleSheet.create({
  introLine: { fontSize: 9, marginBottom: 2.5, lineHeight: 1.3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  emailOlivo: { color: colors.primary },
  blockHeading: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    letterSpacing: 0.4,
    marginTop: 10,
    marginBottom: 4,
  },
  datoLine: { fontSize: 9, marginBottom: 2, lineHeight: 1.25 },
  datoLabel: { fontFamily: 'Helvetica-Bold' },
  normativa: { fontSize: 8.5, marginTop: 3, lineHeight: 1.25 },
  oblHeading: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  clausula: { fontSize: 8.2, marginBottom: 5, lineHeight: 1.3, textAlign: 'justify' },
  bulletRow: { flexDirection: 'row', marginBottom: 1.5, paddingLeft: 10 },
  bulletDot: { fontSize: 8.2, width: 8 },
  bulletText: { fontSize: 8.2, flex: 1, lineHeight: 1.3 },
  expedicion: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 6 },
  firmaWrap: { marginTop: 28, flexDirection: 'row', justifyContent: 'space-between' },
  firmaCol: { width: '46%', alignItems: 'center' },
  firmaRazon: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 2 },
  firmaCaption: { fontSize: 8, color: colors.textMuted, textAlign: 'center', marginBottom: 30 },
  firmaLinea: {
    borderTopWidth: 0.8,
    borderTopColor: colors.text,
    width: '100%',
    marginBottom: 3,
    paddingTop: 4,
  },
  firmaLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  firmaNombre: { fontSize: 8.5, textAlign: 'center', marginTop: 1 },
});

function Bullet({ head, body }: { head: string; body: string }) {
  return (
    <View style={local.bulletRow}>
      <Text style={local.bulletDot}>•</Text>
      <Text style={local.bulletText}>
        <Text style={local.bold}>{head}</Text> {body}
      </Text>
    </View>
  );
}

export function PolizaGarantiaPDF({ data }: { data: PolizaGarantiaData }) {
  const acreditado = `${data.clienteNombre} (${data.identificacionInventario})`;
  return (
    <Document title={`Póliza de Garantía — ${data.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="PÓLIZA DE GARANTÍA DE VIVIENDA" fecha={data.fechaTexto} />
        {data.watermark ? <Watermark text={data.watermark} /> : null}

        {/* ── Bloque del desarrollador ── */}
        <Text style={local.introLine}>
          Garantía que otorga <Text style={local.bold}>{data.desarrolladorRazonSocial}</Text>
          {data.registroInfonavit ? (
            <>
              {' '}
              con número de registro <Text style={local.bold}>{data.registroInfonavit}</Text>
            </>
          ) : null}
        </Text>
        <Text style={local.introLine}>
          El Desarrollador/Constructor {data.desarrolladorRazonSocial}
          {data.representanteLegal ? (
            <>
              {' '}
              representado por el C. <Text style={local.bold}>{data.representanteLegal}</Text>
            </>
          ) : null}
        </Text>
        {data.telefono ? <Text style={local.introLine}>Teléfono: {data.telefono}</Text> : null}
        {data.email ? (
          <Text style={local.introLine}>
            email: <Text style={local.emailOlivo}>{data.email}</Text>
          </Text>
        ) : null}
        <Text style={local.introLine}>
          A Favor del Trabajador/Derechohabiente: <Text style={local.bold}>{acreditado}</Text>
        </Text>
        <Text style={local.introLine}>
          En lo sucesivo &quot;EL ACREDITADO&quot; respecto a la vivienda objeto de crédito
        </Text>

        {/* ── Datos de la vivienda ── */}
        <Text style={local.blockHeading}>DATOS DE LA VIVIENDA</Text>
        <Text style={local.datoLine}>
          <Text style={local.datoLabel}>FRACCIONAMIENTO: </Text>
          {data.fraccionamiento ?? '—'}
        </Text>
        <Text style={local.datoLine}>
          <Text style={local.datoLabel}>MANZANA: </Text>
          {data.manzana ?? '—'}
          {'    '}
          <Text style={local.datoLabel}>LOTE: </Text>
          {data.lote ?? '—'}
          {'    '}
          <Text style={local.datoLabel}>PROTOTIPO: </Text>
          {data.prototipo ?? '—'}
        </Text>
        <Text style={local.datoLine}>
          <Text style={local.datoLabel}>DOMICILIO OFICIAL: </Text>
          {data.domicilioOficial ?? '—'}
        </Text>
        <Text style={local.datoLine}>
          <Text style={local.datoLabel}>IDENTIFICACIÓN INVENTARIO: </Text>
          {data.identificacionInventario}
        </Text>
        <Text style={local.normativa}>
          LA PRESENTE POLIZA DE GARANTIA, SE EXPIDE EN CUMPLIMIENTO A LO DISPUESTO EN LA
          NORMATIVIDAD APROBADA POR EL INSTITUTO.
        </Text>

        {/* ── Obligaciones ── */}
        <Text style={local.oblHeading}>OBLIGACIONES</Text>

        <Text style={local.clausula}>
          <Text style={local.bold}>PRIMERA. - </Text>EL DESARROLLADOR/CONSTRUCTOR SE OBLIGA A
          RESPONDER FALLAS QUE APAREZCAN EN LA VIVIENDA, CONFORME A LAS SIGUIENTES VIGENCIAS:
        </Text>
        <Bullet
          head="HASTA POR DOS AÑOS:"
          body="EN ELEMENTOS ESTRUCTURALES (CIMENTACIÓN, MUROS, TRABES, CASTILLOS Y LOSAS)"
        />
        <Bullet
          head="HASTA UN AÑO:"
          body="EN LA IMPERMEABILIZACIÓN (*) E INSTALACIÓN ELECTRICA (EXCEPTO ACCESORIOS)"
        />
        <Bullet
          head="HASTA SEIS MESES:"
          body="EN INSTALACIONES HIDRÁULICAS, SANITARIAS Y DE GAS."
        />
        <Bullet
          head="HASTA TRES MESES:"
          body="EN PISOS, PUERTAS INTERIORES Y EXTERIORES, VENTANAS, ACCESORIOS (SANITARIOS Y ELÉCTRICOS), MUEBLES SANITARIOS."
        />

        <Text style={[local.clausula, { marginTop: 5 }]}>
          <Text style={local.bold}>SEGUNDA. - </Text>EL DESARROLLADOR/CONSTRUCTOR SE COMPROMETE
          FRENTE A &quot;EL ACREDITADO&quot; Y/O SUS BENEFICIARIOS, DURANTE EL TÉRMINO ESTIPULADO EN
          LA CLÁUSULA PRIMERA, A LA REPARACIÓN INMEDIATA, POR SU CUENTA Y COSTO, DE LAS FALLAS QUE
          SE PRESENTEN EN LA VIVIENDA.
        </Text>
        <Text style={local.clausula}>
          <Text style={local.bold}>TERCERA. – </Text>&quot;EL ACREDITADO&quot; SE DA POR ENTERADO,
          DEL ESTADO QUE GUARDAN LOS BIENES E INSTALACIONES DE LA VIVIENDA, DE ACUERDO A LA
          DESCRIPCIÓN DE ESPECIFICACIONES, MOBILIARIO Y EQUIPO, Y REVISION REALIZADA.
        </Text>
        <Text style={local.clausula}>
          <Text style={local.bold}>CUARTA. – </Text>LA GARANTÍA CONSIGNADA EN LA PRESENTE PÓLIZA, SE
          HARÁ EFECTIVA A FAVOR DEL &quot;ACREDITADO&quot; Y/O SUS BENEFICIARIOS, CUANDO SE LE HAGA
          VALER DENTRO DE LA VIGENCIA DE LA MISMA. &quot;EL DESARROLLADOR/CONSTRUCTOR&quot; RELEVA A
          INFONAVIT DE CUALQUIER RESPONSABILIDAD DERIVADA DE LAS RECLAMACIONES QUE, CON FUNDAMENTOS
          EN LA PRESENTE, PUEDA EFECTUAR &quot;EL ACREDITADO&quot;.
        </Text>
        <Text style={local.clausula}>
          <Text style={local.bold}>QUINTA. – </Text>ES RESPONSABILIDAD DE &quot;EL ACREDITADO&quot;
          CONSERVAR EN SU PODER LA PRESENTE POLIZA DE GARANTIA Y REPORTAR CUALQUIER DESPERFECTO.
          &quot;EL DESARROLLADOR/CONSTRUCTOR&quot;, TENDRA LA OBLIGACION DE ATENDER
          SATISFACTORIAMENTE EL DESPERFECTO REPORTADO.
        </Text>
        <Text style={local.clausula}>
          <Text style={local.bold}>SEXTA. – </Text>LA PRESENTE POLIZA, ESTARA VIGENTE A PARTIR DE LA
          FECHA DE ENTREGA DE LA VIVIENDA A &quot;EL ACREDITADO&quot; Y HASTA POR EL TÉRMINO
          SEÑALADO EN LA OBLIGACIÓN PRIMERA.
        </Text>
        <Text style={local.expedicion}>FECHA DE EXPEDICION: {data.fechaTexto}</Text>

        {/* ── Firmas ── */}
        <View style={local.firmaWrap}>
          <View style={local.firmaCol}>
            <Text style={local.firmaRazon}>{data.desarrolladorRazonSocial}</Text>
            <Text style={local.firmaCaption}>Nombre o Razón Social de la Empresa</Text>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Firma Representante Legal</Text>
            {data.representanteLegal ? (
              <Text style={local.firmaNombre}>{data.representanteLegal}</Text>
            ) : null}
          </View>
          <View style={local.firmaCol}>
            <Text style={local.firmaRazon}> </Text>
            <Text style={local.firmaCaption}> </Text>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Firma del Cliente</Text>
            <Text style={local.firmaNombre}>{acreditado}</Text>
          </View>
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

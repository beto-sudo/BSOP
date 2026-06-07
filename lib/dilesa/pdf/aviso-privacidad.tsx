/**
 * Template PDF: Aviso de Privacidad (Sprint 7b).
 * Replica el export de Coda. Texto legal fijo + cliente + unidad ID.
 */
import { Document, Link, Page, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Watermark } from './header-footer';

export type AvisoPrivacidadData = {
  fechaTexto: string; // "24 de Mayo del 2026"
  clienteNombre: string;
  identificacionInventario: string; // M3-L9-LDLE-ISC
  /** Si la venta está desasignada/expirada, texto a estampar como watermark. */
  watermark?: string | null;
};

export function AvisoPrivacidadPDF({ data }: { data: AvisoPrivacidadData }) {
  return (
    <Document title={`Aviso de Privacidad — ${data.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="AVISO DE PRIVACIDAD" fecha={data.fechaTexto} />
        {data.watermark ? <Watermark text={data.watermark} /> : null}

        <Text style={paragraphStyle}>
          DILESA es una empresa respetuosa de los derechos sobre los datos personales de las
          personas físicas, pone a su disposición el presente aviso de privacidad, con la finalidad
          de que el titular de los datos personales se encuentre facultado a ejercitar su derecho a
          la autodeterminación informativa.
        </Text>

        <Text style={paragraphStyle}>
          Al realizar cualquier trámite, apartado, compraventa y/o solicitar información para la
          adquisición de productos de los que comercializa DILESA, usted (el titular) declara que
          está aceptando los términos y las condiciones contenidos en este aviso y declara y otorga
          expresamente su aceptación y consentimiento utilizando para tal efecto medios
          electrónicos, en términos de lo dispuesto por el artículo 1803 del código civil federal.
        </Text>

        <Text style={paragraphStyle}>
          Si el titular no acepta en forma absoluta y completa los términos y condiciones de este
          aviso, deberá abstenerse de compartir cualquier tipo de información a DILESA por cualquier
          medio.
        </Text>

        <Text style={paragraphStyle}>
          El solo compartir datos personales a DILESA, implica para el público titular la plena e
          incondicional aceptación de todas y cada una de las condiciones generales y particulares
          incluidas en este aviso de privacidad en la versión publicada por DILESA, en el momento
          mismo en que el titular inicie cualquier apartado, compraventa y/o solicitar información
          para la adquisición de productos de los que comercializa DILESA.
        </Text>

        <Text style={paragraphStyle}>
          Las partes acuerdan que, al no existir, error, dolo, mala fe o cualquier otro vicio de la
          voluntad que pudiera nulificar la validez del presente instrumento, ambas acuerdan en
          sujetarse al tenor de lo estipulado en los siguientes:
        </Text>

        <Text style={paragraphStyle}>
          EL TITULAR reconoce y acepta que DILESA, obtendrá directamente los siguientes datos
          personales y/o patrimoniales, tales como: Nombre completo, correo electrónico, teléfono
          y/o teléfono móvil, domicilio, fecha y lugar de nacimiento, RFC, Número de Seguro Social
          (NSS), CURP, Número del INFONAVIT, pagos de pensiones alimenticias, ingresos, pagos de
          tarjeta de crédito, pagos de vehículos, pagos de créditos hipotecarios.
        </Text>

        <Text style={{ ...paragraphStyle, textAlign: 'center', marginTop: 8, marginBottom: 16 }}>
          Conozca nuestro aviso de privacidad en:{' '}
          <Link src="https://dilesa.mx/aviso-de-privacidad.html" style={linkStyle}>
            dilesa.mx/aviso-de-privacidad.html
          </Link>
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>AVISOS DE PRIVACIDAD INFONAVIT</Text>
        <Text style={paragraphStyle}>
          En esta sección encontrarás los avisos de privacidad integrales y simplificados del
          Infonavit, con ellos podrás conocer la existencia y características principales del
          tratamiento al que serán sometidos tus datos personales a fin de que puedas tomar
          decisiones informadas al respecto.
        </Text>
        <Text style={{ ...paragraphStyle, textAlign: 'center', marginTop: 4 }}>
          <Link
            src="https://portalmx.infonavit.org.mx/wps/portal/infonavit.web/transparencia/aviso-privacidad"
            style={linkStyle}
          >
            portalmx.infonavit.org.mx/wps/portal/infonavit.web/transparencia/aviso-privacidad
          </Link>
        </Text>

        <View style={styles.firmaWrap}>
          <Text style={styles.firmaCliente}>Firma del Cliente</Text>
          <Text style={styles.firmaNombre}>
            {data.clienteNombre} ({data.identificacionInventario})
          </Text>
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

const paragraphStyle = {
  fontSize: 9,
  lineHeight: 1.5,
  marginBottom: 6,
  textAlign: 'justify' as const,
};

const linkStyle = {
  color: colors.primary,
  textDecoration: 'none' as const,
};

/**
 * Template PDF: Contrato de Promesa de Compraventa (Sprint 7b).
 *
 * Replica el export Coda con interpolación correcta (los datos van
 * inline donde corresponde, no al final del párrafo como en Coda) y
 * los siguientes fixes acordados con Beto:
 *
 *   Fix 1 — Header del contrato: nombre del comprador + identificador
 *           del inmueble bien posicionados.
 *   Fix 2 — Encabezado de comparecencia: hora/día/mes/año desde el
 *           folio en lugar de "( ) HORAS DEL DIA DE HOY ( ) DE DEL ( )".
 *   Fix 3 — Cláusula PRIMERA: condiciona el DTU según tipo_credito.
 *           Si es Infonavit → DTU; si no → fecha de aprobación del
 *           crédito. (Acuerdo Beto 2026-05-24.)
 *   Fix 4 — Cláusula TERCERA: "dentro de los 30 días naturales
 *           siguientes a la firma de este contrato" en lugar del
 *           vago "el mes calendario".
 *   Fix 5 — Co-titular: si la venta tiene monto_credito_cotitular > 0,
 *           se lista al co-titular como segunda PROMITENTE COMPRADORA
 *           en el cuerpo, en GENERALES y en las firmas.
 *
 * Layout: 2 páginas de contrato + ~3 páginas de Cédula de Materiales
 *         (Anexo 3). El componente react-pdf maneja el salto automático.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Folio } from './header-footer';
import {
  CUENTA_DILESA,
  ESCRITURAS_CONSTITUTIVAS_DILESA,
  ESCRITURA_MADRE_DEFAULT,
  REPRESENTANTE_DILESA,
  TESTIGOS_DEFAULT,
  TRIBUNAL_COMPETENTE,
} from '../contrato/constantes';
import { CEDULA_MATERIALES_DEFAULT } from '../contrato/cedula-materiales-default';

export type PromesaParte = {
  nombre: string; // "CHRISTOPHER ALFONSO LIMAS MARTINEZ"
  curp?: string | null;
  rfc?: string | null;
  estadoCivil?: string | null; // "casado" / "soltero"
  profesion?: string | null;
  domicilio?: string | null; // blob por ahora
  ineNumero?: string | null;
};

export type PromesaData = {
  fechaTexto: string; // "22 de Mayo del 2026" — fecha del folio
  horaTexto: string; // "9:35" — hora del folio
  diaTexto: string; // "22"
  mesTexto: string; // "Mayo"
  anioTexto: string; // "2026"

  comprador: PromesaParte;
  coTitular?: PromesaParte | null;

  inmueble: {
    fraccionamiento: string;
    lote: string;
    manzana: string;
    superficieM2: number; // 105
    modeloVivienda: string; // "ISC" — sufijo del prototipo
    identificacionInventario: string; // "M3-L16-LDLE-ISC"
  };

  operacion: {
    precio: number; // 1021000
    precioEnLetra: string; // "Un Millón Veintiún Mil Pesos 00/100 M.N."
    enganche1pct: number; // 10210
    arras10pct: number; // 102100
    tipoCredito: string; // "Infonavit" / "Bancario" / "Recursos propios"
  };

  folio: string; // "CLM-M3-L16-LDLE-ISC-5/24/2026 9:35:36 AM"
};

const fmtMoney = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number) => fmtMoney.format(Number(n) || 0);

export function PromesaCompraventaPDF({ data }: { data: PromesaData }) {
  const esInfonavit = /infonavit/i.test(data.operacion.tipoCredito);
  const fechaMaximaCelebracion = esInfonavit
    ? 'el día que se cumplan 30 días naturales después de la obtención del Dictamen Técnico Único (DTU)'
    : 'el día que se cumplan 30 días naturales después de la fecha de aprobación del crédito';

  const compradoresNombre = data.coTitular
    ? `${data.comprador.nombre} Y ${data.coTitular.nombre}`
    : data.comprador.nombre;

  return (
    <Document title={`Promesa de Compraventa — ${data.inmueble.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page} wrap>
        <HeaderBand title="CONTRATO DE PROMESA DE COMPRAVENTA" fecha={data.fechaTexto} />

        {/* ── Header del contrato (Fix 1) ── */}
        <Text style={contratoStyles.encabezado}>
          CONTRATO DE PROMESA DE COMPRAVENTA ENTRE{' '}
          <Text style={contratoStyles.bold}>DESARROLLO INMOBILIARIO LOS ENCINOS SA DE CV</Text> Y{' '}
          <Text style={contratoStyles.bold}>{compradoresNombre}</Text> PARA UN INMUEBLE CON
          IDENTIFICACIÓN:{' '}
          <Text style={contratoStyles.bold}>{data.inmueble.identificacionInventario}</Text>
        </Text>

        {/* ── Comparecencia (Fix 2: fecha completa, no blanks) ── */}
        <Text style={contratoStyles.parrafo}>
          EN LA CIUDAD DE PIEDRAS NEGRAS, COAHUILA, MEXICO, SIENDO LAS{' '}
          <Text style={contratoStyles.bold}>{data.horaTexto}</Text> HORAS DEL DÍA DE HOY{' '}
          <Text style={contratoStyles.bold}>{data.diaTexto}</Text> DE{' '}
          <Text style={contratoStyles.bold}>{data.mesTexto.toUpperCase()}</Text> DEL{' '}
          <Text style={contratoStyles.bold}>{data.anioTexto}</Text> COMPARECIERON: POR UNA PARTE EL{' '}
          <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.nombre}</Text> EN REPRESENTACIÓN
          DE{' '}
          <Text style={contratoStyles.bold}>DESARROLLO INMOBILIARIO LOS ENCINOS S.A DE C.V.</Text>,
          A QUIEN EN LO SUCESIVO SE LE DENOMINARÁ INDISTINTAMENTE COMO{' '}
          <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text>; Y POR OTRA PARTE{' '}
          <Text style={contratoStyles.bold}>{compradoresNombre}</Text>, A{' '}
          {data.coTitular ? 'QUIENES' : 'QUIEN'} EN LO SUCESIVO SE {data.coTitular ? 'LES' : 'LE'}{' '}
          DENOMINARÁ <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text> Y A LOS
          DOS INTERVINIENTES COMO <Text style={contratoStyles.quoted}>“LAS PARTES”</Text>; QUIENES
          MÁS ADELANTE JUSTIFICARÁN LA PERSONALIDAD CON LA QUE COMPARECEN Y AMBOS LA RECONOCEN
          MUTUAMENTE DESDE ESTE MOMENTO Y QUE POR ENDE TIENEN CAPACIDAD Y APTITUD LEGAL PARA
          CONTRATAR. Y DIJERON: QUE ACUDEN A CELEBRAR UN CONTRATO DE PROMESA DE COMPRAVENTA RESPECTO
          DEL INMUEBLE QUE MÁS ADELANTE SE PRECISARÁ CONFORME A LAS SIGUIENTES DECLARACIONES Y
          CLÁUSULAS:
        </Text>

        <Text style={contratoStyles.seccionTitulo}>DECLARACIONES</Text>

        <Text style={contratoStyles.parrafo}>
          <Text style={contratoStyles.bold}>I.- </Text> Declara{' '}
          <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> que es dueña en pleno
          dominio, propiedad y pacífica posesión de un Lote de Terreno URBANO y finca que se
          identifica de la siguiente manera: Terreno Urbano y finca ubicado en Fraccionamiento{' '}
          <Text style={contratoStyles.bold}>{data.inmueble.fraccionamiento}</Text> de esta ciudad,
          que se identifica como Lote Número{' '}
          <Text style={contratoStyles.bold}>{data.inmueble.lote}</Text> de la Manzana{' '}
          <Text style={contratoStyles.bold}>{data.inmueble.manzana}</Text> del citado
          fraccionamiento, el cual tiene una superficie de{' '}
          <Text style={contratoStyles.bold}>{data.inmueble.superficieM2} m²</Text>.
        </Text>

        <Text style={contratoStyles.parrafo}>
          El inmueble antes referido es un modelo de vivienda denominado{' '}
          <Text style={contratoStyles.bold}>{data.inmueble.modeloVivienda}</Text>, modelo cuyas
          características — como son la extensión del terreno, superficie construida, tipo de
          estructura, instalaciones, acabados, accesorios, lugar o lugares de estacionamiento, áreas
          de uso común con otros inmuebles, clase de materiales utilizados en la construcción,
          servicios básicos, etc. — se encuentran especificados y descritos en el Anexo 3 del
          presente contrato y se tienen por aquí reproducidos en su totalidad. Los materiales y
          acabados quedan sujetos a disponibilidad y existencia de terceros; por tanto, podrán ser
          modificados en su caso por otro de igual calidad y precio.
        </Text>

        <Text style={contratoStyles.parrafo}>
          <Text style={contratoStyles.bold}>II.- </Text> Declara{' '}
          <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> que acredita el pleno
          dominio y propiedad mediante Escritura Pública número{' '}
          <Text style={contratoStyles.bold}>({ESCRITURA_MADRE_DEFAULT.numero})</Text>, de fecha{' '}
          <Text style={contratoStyles.bold}>{ESCRITURA_MADRE_DEFAULT.fecha}</Text>, pasada ante la
          fe del <Text style={contratoStyles.bold}>{ESCRITURA_MADRE_DEFAULT.notario.nombre}</Text>,
          titular de la Notaría Pública número{' '}
          <Text style={contratoStyles.bold}>{ESCRITURA_MADRE_DEFAULT.notario.numeroNotaria}</Text>,
          de la Ciudad de{' '}
          <Text style={contratoStyles.bold}>{ESCRITURA_MADRE_DEFAULT.notario.ciudad}</Text>, la cual
          se encuentra inscrita en el Registro Público de la Propiedad con residencia en la Ciudad
          de{' '}
          <Text style={contratoStyles.bold}>{ESCRITURA_MADRE_DEFAULT.registroPublico.ciudad}</Text>,
          bajo la entrada{' '}
          <Text style={contratoStyles.bold}>{ESCRITURA_MADRE_DEFAULT.registroPublico.entrada}</Text>
          , de fecha{' '}
          <Text style={contratoStyles.bold}>{ESCRITURA_MADRE_DEFAULT.registroPublico.fecha}</Text>.
        </Text>

        <Text style={contratoStyles.parrafo}>
          <Text style={contratoStyles.bold}>III.- </Text> Declara{' '}
          <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> que la propiedad que
          en este acto se compromete a vender se encuentra al corriente en el pago de los impuestos,
          derechos y contribuciones que causa, así como{' '}
          <Text style={contratoStyles.bold}>LIBRE DE TODO GRAVAMEN Y RESPONSABILIDAD</Text>.
        </Text>

        <Text style={contratoStyles.seccionTitulo}>CLÁUSULAS</Text>

        <Clausula
          n="PRIMERA"
          texto={
            <>
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> promete vender a{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text>, quien promete
              adquirir para sí el inmueble que ha quedado descrito y deslindado en la declaración{' '}
              <Text style={contratoStyles.bold}>I (PRIMERA)</Text> de este Instrumento con todos sus
              usos, costumbres, servidumbre, entradas, salidas, construcciones, anexidades y todo lo
              que de hecho y por derecho le corresponda o pudiera corresponderle al referido
              inmueble, estableciendo la fecha máxima para la celebración del contrato de
              compraventa <Text style={contratoStyles.bold}>{fechaMaximaCelebracion}</Text>.
            </>
          }
        />

        <Clausula
          n="SEGUNDA"
          texto={
            <>
              <Text style={contratoStyles.quoted}>“LAS PARTES”</Text> manifiestan que el precio
              pactado de la PROMESA DE COMPRAVENTA, para efectos de la operación futura, lo
              constituirá la cantidad de{' '}
              <Text style={contratoStyles.bold}>
                {money(data.operacion.precio)} ({data.operacion.precioEnLetra})
              </Text>
              , precio que acuerdan <Text style={contratoStyles.quoted}>“LAS PARTES”</Text> como
              valor total de la operación de compraventa y que se pagará mediante crédito INFONAVIT,
              bancario o con recursos propios por{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text>, complementando
              según sea el caso con las diferencias cubiertas de su propio peculio por{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text> a fin de
              complementar el valor de la operación establecido en la presente cláusula. El precio
              que deberá pagar <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text>{' '}
              a <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> será el
              establecido en las diferentes solicitudes y documentos presentados ante la entidad
              financiera; al momento de la firma de la escritura pública se deberán cubrir las
              diferencias que arroje la carta de instrucción notarial a modo de que con el monto de
              crédito y pago de estas diferencias quede liquidado el saldo total del precio de la
              operación.
            </>
          }
        />

        {/* Fix 4: TERCERA con plazo explícito */}
        <Clausula
          n="TERCERA"
          texto={
            <>
              El presente contrato se respetará y tendrá validez siempre y cuando la PROMITENTE
              COMPRADORA haya entregado en su totalidad la contraprestación estipulada en la
              cláusula SEGUNDA del presente contrato{' '}
              <Text style={contratoStyles.bold}>
                dentro de los 30 días naturales siguientes a la fecha de firma del presente contrato
              </Text>
              ; de lo contrario, el precio se actualizará al que corresponda en el momento en que se
              cubra la contraprestación antes mencionada.
            </>
          }
        />

        <Clausula
          n="CUARTA"
          texto={
            <>
              <Text style={contratoStyles.quoted}>“LAS PARTES”</Text> están de acuerdo en que los
              pagos se realizarán a{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> exclusivamente
              por cheque de depósito o transferencia bancaria a la cuenta número{' '}
              <Text style={contratoStyles.bold}>{CUENTA_DILESA.numeroCuenta}</Text> CLABE{' '}
              <Text style={contratoStyles.bold}>{CUENTA_DILESA.clabe}</Text> del Banco{' '}
              <Text style={contratoStyles.bold}>{CUENTA_DILESA.banco}</Text> a nombre de{' '}
              <Text style={contratoStyles.bold}>{CUENTA_DILESA.titular}</Text>, esto en cumplimiento
              a la Ley Federal para la Prevención e Identificación de Operaciones con Recursos de
              Procedencia Ilícita. Todo pago hecho en contravención a esta cláusula se dará por no
              hecho.
            </>
          }
        />

        <Clausula
          n="QUINTA"
          texto={
            <>
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> se obliga en este
              acto frente a <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text> a
              entregarle el bien inmueble descrito en la declaración PRIMERA,{' '}
              <Text style={contratoStyles.bold}>máximo 15 días naturales</Text> después de haber
              recibido en la cuenta de{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> el valor total
              del precio de operación, siempre y cuando la vivienda se encuentre terminada,
              habitable y se haya generado y firmado la escritura de compraventa correspondiente por
              todas las partes.
            </>
          }
        />

        <Clausula
          n="SEXTA"
          texto={
            <>
              <Text style={contratoStyles.quoted}>“LAS PARTES”</Text> están de acuerdo en que en
              esta PROMESA DE COMPRAVENTA no existe error, dolo, lesión ni enriquecimiento
              ilegítimo, obligándose en los plazos y términos contenidos en el presente contrato.
            </>
          }
        />

        <Clausula
          n="SÉPTIMA"
          texto={
            <>
              Para la celebración del presente contrato,{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text> debe cubrir por
              concepto de arras confirmatorias el <Text style={contratoStyles.bold}>1% </Text>(uno
              por ciento) de la totalidad de la contraprestación estipulada en la cláusula SEGUNDA,
              que equivale a{' '}
              <Text style={contratoStyles.bold}>
                {money(data.operacion.enganche1pct)} pesos mexicanos
              </Text>{' '}
              como mínimo. Para este contrato, éstas se imputarán al precio pactado en la cláusula
              SEGUNDA y se deberán depositar en la cuenta descrita en la cláusula CUARTA.
            </>
          }
        />

        <Clausula
          n="OCTAVA"
          texto={
            <>
              En caso de que <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text>{' '}
              solicite a <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> un
              producto con especificaciones particulares que se salgan de los prototipos de vivienda
              actuales o del orden del proceso constructivo, deberá cubrir por concepto de arras
              confirmatorias el equivalente a{' '}
              <Text style={contratoStyles.bold}>
                {money(data.operacion.arras10pct)} pesos mexicanos
              </Text>
              ; éstas se imputarán al precio pactado en la cláusula SEGUNDA y se deberán depositar
              en la cuenta descrita en la cláusula CUARTA.
            </>
          }
        />

        <Clausula
          n="NOVENA"
          texto={
            <>
              En el supuesto de que{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text> por situaciones
              ajenas a <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> no
              pudiere cumplir con la promesa de compraventa estipulada en el presente contrato — ya
              sea por razones económicas, por llegarse la fecha estipulada en la cláusula PRIMERA o
              por cualquier otra razón ajena a{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> —{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> lo dará por
              rescindido y conservará el importe de las arras confirmatorias, ya sea el descrito en
              la cláusula SÉPTIMA y, en su caso, OCTAVA. Esto se podrá llevar a cabo sin necesidad
              de declaración judicial o notificación adicional al presente contrato.
            </>
          }
        />

        <Clausula
          n="DÉCIMA"
          texto={
            <>
              En el supuesto de que{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text> por cuestiones
              de modificación de su relación laboral, modificaciones salariales, modificación de
              ingreso, aportaciones patronales y demás circunstancias económicas o crediticias se
              vea afectado en su puntuación y/o monto de crédito y condiciones financieras para
              poder ejercer su crédito al momento de la inscripción del mismo, y esto resultase en
              la imposibilidad de cumplimiento del presente contrato,{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> lo dará por
              rescindido y conservará el importe de las arras confirmatorias, ya sea el descrito en
              la cláusula SÉPTIMA y, en su caso, OCTAVA. Esto se podrá llevar a cabo sin necesidad
              de declaración judicial o notificación adicional al presente contrato.
            </>
          }
        />

        <Clausula
          n="DÉCIMA PRIMERA"
          texto={
            <>
              Una vez que <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> le
              notifique por cualquier medio electrónico y/o el que sea de común acuerdo a{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text> del fin de
              construcción del inmueble objeto del presente contrato descrito en la declaración I
              (PRIMERA), esta última tendrá un plazo máximo de{' '}
              <Text style={contratoStyles.bold}>30 días naturales</Text> para formalizar ante
              fedatario público la operación de compraventa. Caso contrario, la ubicación en
              cuestión quedará como disponible para otro cliente y{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> estará en
              facultades de asignar otra vivienda al precio actual vigente. En el supuesto de
              desistir de la formalización de la operación con las nuevas condiciones,{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> lo dará por
              rescindido y conservará las arras confirmatorias descritas en SÉPTIMA y, en su caso,
              OCTAVA.
            </>
          }
        />

        <Clausula
          n="DÉCIMA SEGUNDA"
          texto={
            <>
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text> se obliga al
              saneamiento para el caso de evicción, en los términos de la ley aplicable en la
              materia.
            </>
          }
        />

        <Clausula
          n="DÉCIMA TERCERA"
          texto={
            <>
              <Text style={contratoStyles.quoted}>“LAS PARTES”</Text> están de acuerdo en que los
              gastos de escrituración — que incluyen el Impuesto Sobre Adquisición de Inmuebles,
              derechos de Registro Público, honorarios de la Notaría y todos los gastos que origine
              la formalización de la compraventa — correrán a cargo de{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text>, a excepción del
              Impuesto sobre la Renta, que será a cargo de{' '}
              <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text>.
            </>
          }
        />

        <Clausula
          n="DÉCIMA CUARTA"
          texto={
            <>
              Para la interpretación y cumplimiento del presente contrato,{' '}
              <Text style={contratoStyles.quoted}>“LAS PARTES”</Text> se someten en forma expresa a
              la competencia y Jurisdicción de los Tribunales del{' '}
              <Text style={contratoStyles.bold}>{TRIBUNAL_COMPETENTE.distrito}</Text> en la ciudad
              de <Text style={contratoStyles.bold}>{TRIBUNAL_COMPETENTE.ciudad}</Text>, renunciando
              al fuero que pudiera corresponderles en lo presente y en lo futuro por razón de sus
              domicilios.
            </>
          }
        />

        <Clausula
          n="DÉCIMA QUINTA"
          texto={
            <>
              <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text> manifiesta bajo
              protesta de decir verdad haber leído el aviso de privacidad que se encuentra publicado
              y que está de acuerdo con el contenido del mismo.
            </>
          }
        />

        <Text style={contratoStyles.seccionTitulo}>GENERALES</Text>

        <Text style={contratoStyles.parrafo}>
          <Text style={contratoStyles.quoted}>“LAS PARTES”</Text> manifiestan BAJO PROTESTA DE DECIR
          VERDAD que han sido enteradas del contenido de este contrato de PROMESA DE COMPRAVENTA y
          que para este efecto mencionan que sus generales son las siguientes:
        </Text>

        {/* Vendedora */}
        <Text style={contratoStyles.parrafo}>
          <Text style={contratoStyles.quoted}>“LA PROMITENTE VENDEDORA”</Text>, representada en este
          acto por el <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.nombre}</Text>,
          manifestó por sus generales ser: {REPRESENTANTE_DILESA.nacionalidad},{' '}
          {REPRESENTANTE_DILESA.edad}, {REPRESENTANTE_DILESA.estadoCivil},{' '}
          {REPRESENTANTE_DILESA.profesion}, con la CURP número{' '}
          <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.curp}</Text> y con el RFC{' '}
          <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.rfc}</Text>, con domicilio en la
          casa marcada con el número{' '}
          <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.domicilio.numero}</Text> de la
          calle <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.domicilio.calle}</Text>,
          colonia <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.domicilio.colonia}</Text>{' '}
          C.P. <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.domicilio.cp}</Text> de esta
          ciudad de <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.domicilio.ciudad}</Text>{' '}
          y quien se identifica con Credencial para Votar con fotografía número{' '}
          <Text style={contratoStyles.bold}>{REPRESENTANTE_DILESA.ine.numero}</Text> expedida por el{' '}
          {REPRESENTANTE_DILESA.ine.autoridad}, la cual incluye fotografía del compareciente y
          coincide con su filiación.
        </Text>

        <Text style={contratoStyles.parrafo}>
          Así mismo justifica su personalidad y la legal existencia de la sociedad{' '}
          <Text style={contratoStyles.quoted}>
            “DESARROLLO INMOBILIARIO LOS ENCINOS, S.A. DE C.V.”
          </Text>{' '}
          con la Escritura Pública{' '}
          <Text style={contratoStyles.bold}>
            ({ESCRITURAS_CONSTITUTIVAS_DILESA.constitutiva.numero})
          </Text>{' '}
          de fecha{' '}
          <Text style={contratoStyles.bold}>
            {ESCRITURAS_CONSTITUTIVAS_DILESA.constitutiva.fecha}
          </Text>
          , pasada ante la Fe del Notario Público Número{' '}
          <Text style={contratoStyles.bold}>
            {ESCRITURAS_CONSTITUTIVAS_DILESA.constitutiva.notario}
          </Text>{' '}
          del Distrito Notarial de{' '}
          <Text style={contratoStyles.bold}>
            {ESCRITURAS_CONSTITUTIVAS_DILESA.constitutiva.distritoNotarial}
          </Text>
          , inscrita ante la oficina del Registro Público del Comercio de esa ciudad bajo el FME{' '}
          <Text style={contratoStyles.bold}>
            {ESCRITURAS_CONSTITUTIVAS_DILESA.constitutiva.fme}
          </Text>
          ; y con la Escritura Pública{' '}
          <Text style={contratoStyles.bold}>
            ({ESCRITURAS_CONSTITUTIVAS_DILESA.modificacion.numero})
          </Text>{' '}
          de fecha{' '}
          <Text style={contratoStyles.bold}>
            {ESCRITURAS_CONSTITUTIVAS_DILESA.modificacion.fecha}
          </Text>
          , pasada ante la Fe del Notario Público Número{' '}
          <Text style={contratoStyles.bold}>
            {ESCRITURAS_CONSTITUTIVAS_DILESA.modificacion.notario}
          </Text>{' '}
          del Distrito Notarial de{' '}
          <Text style={contratoStyles.bold}>
            {ESCRITURAS_CONSTITUTIVAS_DILESA.modificacion.distritoNotarial}
          </Text>
          , inscrita bajo el FME{' '}
          <Text style={contratoStyles.bold}>
            {ESCRITURAS_CONSTITUTIVAS_DILESA.modificacion.fme}
          </Text>
          . Así mismo, la sociedad cuenta con el Registro Federal de Contribuyentes{' '}
          <Text style={contratoStyles.bold}>{ESCRITURAS_CONSTITUTIVAS_DILESA.rfc}</Text>.
        </Text>

        {/* Compradora (titular + co-titular si aplica) */}
        <CompradorGenerales parte={data.comprador} />
        {data.coTitular ? <CompradorGenerales parte={data.coTitular} esCoTitular /> : null}

        <Text style={contratoStyles.seccionTitulo}>DOCUMENTOS ANEXOS</Text>
        <Text style={contratoStyles.parrafo}>
          1.- Identificación Oficial de los comparecientes.
          {'\n'}
          2.- Personalidad de “DESARROLLO INMOBILIARIO LOS ENCINOS”, S.A. DE C.V.
          {'\n'}
          3.- Cédula de características generales, materiales y acabados de la vivienda.
        </Text>

        {/* Firmas */}
        <View style={contratoStyles.firmasGroup}>
          <FirmaSlot
            nombre={REPRESENTANTE_DILESA.nombre}
            rol={'Representante Legal\n“LA PROMITENTE VENDEDORA”'}
          />
          <FirmaSlot
            nombre={`${data.comprador.nombre} (${data.inmueble.identificacionInventario})`}
            rol={'“LA PROMITENTE COMPRADORA”'}
          />
          {data.coTitular ? (
            <FirmaSlot
              nombre={`${data.coTitular.nombre} (${data.inmueble.identificacionInventario})`}
              rol={'“LA PROMITENTE COMPRADORA” (CO-TITULAR)'}
            />
          ) : null}
          {TESTIGOS_DEFAULT.map((t) => (
            <FirmaSlot key={t.nombre} nombre={t.nombre} rol="TESTIGO" />
          ))}
        </View>

        <Folio value={data.folio} />
        <FooterBand />
      </Page>

      {/* ── Anexo 3: Cédula de Materiales (multi-página automático) ── */}
      <Page size="LETTER" style={styles.page} wrap>
        <HeaderBand title="ANEXO 3 — CÉDULA DE MATERIALES" fecha={data.fechaTexto} />
        <Text style={contratoStyles.parrafo}>
          Cédula de características generales, materiales y acabados de la vivienda — referida en la
          Declaración I y en los Documentos Anexos del presente contrato. Los materiales y acabados
          quedan sujetos a disponibilidad y existencia de terceros y podrán ser modificados por
          otros de igual calidad y precio.
        </Text>

        <CedulaTable />

        <Folio value={data.folio} />
        <FooterBand />
      </Page>
    </Document>
  );
}

function Clausula({ n, texto }: { n: string; texto: React.ReactNode }) {
  return (
    <Text style={contratoStyles.clausula}>
      <Text style={contratoStyles.clausulaNumero}>{n}. — </Text>
      {texto}
    </Text>
  );
}

function CompradorGenerales({
  parte,
  esCoTitular = false,
}: {
  parte: PromesaParte;
  esCoTitular?: boolean;
}) {
  return (
    <Text style={contratoStyles.parrafo}>
      <Text style={contratoStyles.quoted}>“LA PROMITENTE COMPRADORA”</Text>
      {esCoTitular ? ' (CO-TITULAR)' : ''}, <Text style={contratoStyles.bold}>{parte.nombre}</Text>,
      manifestó por sus generales ser: mexicano por nacimiento, mayor de edad,{' '}
      {parte.estadoCivil ?? '—'}, {parte.profesion ?? 'profesionista'}
      {parte.curp ? (
        <>
          , con la CURP número <Text style={contratoStyles.bold}>{parte.curp}</Text>
        </>
      ) : null}
      {parte.rfc ? (
        <>
          {' '}
          y con el RFC <Text style={contratoStyles.bold}>{parte.rfc}</Text>
        </>
      ) : null}
      {parte.domicilio ? (
        <>
          , con domicilio en <Text style={contratoStyles.bold}>{parte.domicilio}</Text>
        </>
      ) : null}
      {parte.ineNumero ? (
        <>
          , y quien se identifica con Credencial para Votar con fotografía número{' '}
          <Text style={contratoStyles.bold}>{parte.ineNumero}</Text> expedida por el Instituto
          Nacional Electoral, la cual incluye fotografía del compareciente y coincide con su
          filiación
        </>
      ) : null}
      .
    </Text>
  );
}

function FirmaSlot({ nombre, rol }: { nombre: string; rol: string }) {
  return (
    <View style={contratoStyles.firmaSlot} wrap={false}>
      <View style={contratoStyles.firmaLinea} />
      <Text style={contratoStyles.firmaNombre}>{nombre}</Text>
      <Text style={contratoStyles.firmaRol}>{rol}</Text>
    </View>
  );
}

function CedulaTable() {
  // Anchos en porcentaje — 7 columnas
  return (
    <View style={contratoStyles.table}>
      <View style={[contratoStyles.tableRow, contratoStyles.tableHeader]} fixed>
        <Text style={[contratoStyles.tableCell, contratoStyles.tableHeaderCell, { width: '4%' }]}>
          Cve
        </Text>
        <Text style={[contratoStyles.tableCell, contratoStyles.tableHeaderCell, { width: '20%' }]}>
          Descripción
        </Text>
        <Text style={[contratoStyles.tableCell, contratoStyles.tableHeaderCell, { width: '8%' }]}>
          Marca
        </Text>
        <Text style={[contratoStyles.tableCell, contratoStyles.tableHeaderCell, { width: '10%' }]}>
          Etapa
        </Text>
        <Text style={[contratoStyles.tableCell, contratoStyles.tableHeaderCell, { width: '12%' }]}>
          Norma
        </Text>
        <Text style={[contratoStyles.tableCell, contratoStyles.tableHeaderCell, { width: '23%' }]}>
          Colocación
        </Text>
        <Text style={[contratoStyles.tableCell, contratoStyles.tableHeaderCell, { width: '23%' }]}>
          Recomendación
        </Text>
      </View>
      {CEDULA_MATERIALES_DEFAULT.map((m) => (
        <View key={m.clave} style={contratoStyles.tableRow} wrap={false}>
          <Text style={[contratoStyles.tableCell, { width: '4%' }]}>{m.clave}</Text>
          <Text style={[contratoStyles.tableCell, { width: '20%' }]}>{m.descripcion}</Text>
          <Text style={[contratoStyles.tableCell, { width: '8%' }]}>{m.marca}</Text>
          <Text style={[contratoStyles.tableCell, { width: '10%' }]}>{m.etapa}</Text>
          <Text style={[contratoStyles.tableCell, { width: '12%' }]}>{m.norma}</Text>
          <Text style={[contratoStyles.tableCell, { width: '23%' }]}>{m.colocacion}</Text>
          <Text style={[contratoStyles.tableCell, { width: '23%' }]}>{m.recomendacion}</Text>
        </View>
      ))}
    </View>
  );
}

const contratoStyles = StyleSheet.create({
  encabezado: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'justify',
    marginTop: 4,
    marginBottom: 6,
    lineHeight: 1.3,
  },
  parrafo: {
    fontSize: 8.5,
    textAlign: 'justify',
    marginBottom: 4,
    lineHeight: 1.35,
  },
  seccionTitulo: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  quoted: { fontFamily: 'Helvetica-Bold' },
  clausula: {
    fontSize: 8.5,
    textAlign: 'justify',
    marginBottom: 4,
    lineHeight: 1.35,
  },
  clausulaNumero: { fontFamily: 'Helvetica-Bold' },
  firmasGroup: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: 14,
  },
  firmaSlot: {
    width: 200,
    alignItems: 'center',
    marginBottom: 14,
  },
  firmaLinea: {
    width: '100%',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.text,
    marginBottom: 3,
    marginTop: 22,
  },
  firmaNombre: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  firmaRol: {
    fontSize: 7.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 1,
  },
  table: {
    marginTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    borderLeftWidth: 0.5,
    borderLeftColor: colors.border,
  },
  tableHeader: {
    backgroundColor: colors.primary,
  },
  tableHeaderCell: {
    color: '#fff',
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    fontSize: 6.5,
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: colors.border,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    color: colors.text,
  },
});

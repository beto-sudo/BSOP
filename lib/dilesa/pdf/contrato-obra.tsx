/**
 * Template PDF: Contrato de Servicios a Precios Unitarios y Tiempo
 * Determinado (contrato de obra DILESA ↔ contratista).
 *
 * Replica el documento vivo en Coda (canvas-KMlO5KM81i, "Contrato de
 * Construcción"): declaraciones, 18 cláusulas, tabla de lotes (cláusula
 * PRIMERA), firmas + 2 testigos, y el ANEXO 3 (plantilla de precios
 * unitarios por actividad y prototipo).
 *
 * El precio unitario de cada actividad del Anexo 3 se DERIVA en el route
 * handler: `porcentaje_costo × valor_contrato_mo(prototipo)`, porque el
 * costo MO absoluto por actividad no existe poblado (ni en BSOP ni en la
 * tabla origen de Coda — solo el % de costo está capturado).
 *
 * Layout: cuerpo del contrato (LETTER, wrap) + N páginas de Anexo 3.
 * react-pdf maneja el salto de página automático.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Folio } from './header-footer';
import {
  EL_CLIENTE_OBRA,
  PARAMETROS_OBRA,
  JURISDICCION_OBRA,
  TESTIGOS_OBRA,
} from '../contrato/constantes-obra';

export type ContratoObraContratista = {
  nombre: string; // razón social o nombre completo
  esMoral: boolean;
  representanteLegal: string | null;
  rfc: string | null;
  repse: string | null;
  registroPatronal: string | null;
  domicilio: string | null;
};

export type ContratoObraLote = {
  codigo: string; // "M13-L1-LDS-RMA-MAYA"
  proyecto: string;
  prototipo: string;
  precioMoM2: number;
  m2: number;
  valorMo: number;
  fechaCompromisoTexto: string; // "6/6/2026"
};

export type Anexo3Tarea = {
  etapa: string;
  tarea: string;
  porcentaje: number; // 0.0026 = 0.26%
  precioMo: number; // derivado = porcentaje × valorMo(prototipo)
  dias: number;
};

export type Anexo3Prototipo = {
  prototipo: string;
  valorMo: number;
  tareas: Anexo3Tarea[];
};

export type ContratoObraData = {
  folio: string;
  fechaFirmaTexto: string; // "25 de Febrero del 2026"
  fechaInicioTexto: string; // "25 de Febrero del 2026"
  fechaFinTexto: string; // "11 de Agosto del 2026"
  contratista: ContratoObraContratista;
  lotes: ContratoObraLote[];
  montoTotal: number;
  montoTotalEnLetra: string; // "Cinco Millones ... Pesos 00/100 M.N."
  anexo3: Anexo3Prototipo[];
};

const fmtMoney = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number) => fmtMoney.format(Number(n) || 0);
const money0 = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
const pct = (n: number) => `${(Number(n) * 100).toFixed(2)}%`;

export function ContratoObraPDF({ data }: { data: ContratoObraData }) {
  const c = data.contratista;
  return (
    <Document title={`Contrato de Obra — ${data.folio}`}>
      <Page size="LETTER" style={styles.page} wrap>
        <HeaderBand title="CONTRATO DE OBRA" fecha={data.fechaFirmaTexto} />

        <Text style={cStyles.titulo}>
          CONTRATO DE SERVICIOS A PRECIOS UNITARIOS Y TIEMPO DETERMINADO
        </Text>

        {/* ── Encabezado / comparecencia ── */}
        <Text style={cStyles.parrafo}>
          Contrato de Servicios a Precios Unitarios que celebran, por una parte,{' '}
          <Text style={cStyles.bold}>{EL_CLIENTE_OBRA.razonSocial}</Text>, representado por el{' '}
          <Text style={cStyles.bold}>SR. {EL_CLIENTE_OBRA.representante}</Text>, en lo sucesivo se
          le denominará <Text style={cStyles.bold}>“EL CLIENTE”</Text> y por la otra parte{' '}
          <Text style={cStyles.bold}>{c.nombre}</Text>, a quien en lo sucesivo se le denominará{' '}
          <Text style={cStyles.bold}>“EL CONTRATISTA”</Text>
          {c.representanteLegal ? (
            <>
              , representada en este acto por{' '}
              <Text style={cStyles.bold}>{c.representanteLegal}</Text> como Representante Legal
            </>
          ) : null}
          , los cuales se sujetan al tenor de las siguientes Declaraciones y Cláusulas:
        </Text>

        <Text style={cStyles.seccionTitulo}>DECLARACIONES</Text>

        {/* I — EL CLIENTE */}
        <Text style={cStyles.parrafo}>
          <Text style={cStyles.bold}>
            I.- Manifiesta “EL CLIENTE” por conducto de sus representantes:
          </Text>
        </Text>
        <Text style={cStyles.parrafo}>
          a) Es una Persona Moral constituida de conformidad con las Leyes Mexicanas, acreditándolo
          con la Escritura Constitutiva {EL_CLIENTE_OBRA.escrituraConstitutiva.numero} libro núm.{' '}
          {EL_CLIENTE_OBRA.escrituraConstitutiva.libro} volumen{' '}
          {EL_CLIENTE_OBRA.escrituraConstitutiva.volumen},{' '}
          {EL_CLIENTE_OBRA.escrituraConstitutiva.notario}, Notario Público Número{' '}
          {EL_CLIENTE_OBRA.escrituraConstitutiva.numeroNotaria} de la ciudad de{' '}
          {EL_CLIENTE_OBRA.escrituraConstitutiva.ciudad}. Que su representante acredita su
          personalidad y carácter de{' '}
          <Text style={cStyles.bold}>
            Representante Legal con poder para pleitos y cobranzas, actos de administración, actos
            de dominio, poder cambiario, y representación patronal
          </Text>
          , con el documento de escritura pública número {EL_CLIENTE_OBRA.poderRepresentante.numero}
          , bajo la fe del {EL_CLIENTE_OBRA.poderRepresentante.notario}, titular de la Notaría
          Pública Núm. {EL_CLIENTE_OBRA.poderRepresentante.numeroNotaria}, de la ciudad de{' '}
          {EL_CLIENTE_OBRA.poderRepresentante.ciudad}. Así mismo manifiesta bajo protesta de decir
          verdad que a la fecha de la firma del presente contrato no le han sido revocadas las
          facultades conferidas.
        </Text>
        <Text style={cStyles.parrafo}>
          b) Tiene capacidad jurídica para contratar lo que se expresa en este documento.
        </Text>
        <Text style={cStyles.parrafo}>
          c) Tiene establecido su domicilio en {EL_CLIENTE_OBRA.domicilio}, mismo que señala para
          todos los fines y efectos legales de este contrato. Con RFC {EL_CLIENTE_OBRA.rfc}.
        </Text>

        {/* II — EL CONTRATISTA */}
        <Text style={cStyles.parrafo}>
          <Text style={cStyles.bold}>
            II.- Manifiesta “EL CONTRATISTA”
            {c.representanteLegal ? ' por conducto de su Representante Legal' : ''}.
          </Text>
        </Text>
        <Text style={cStyles.parrafo}>
          a) Que es{' '}
          {c.esMoral ? 'una Persona Moral' : 'una Persona Física con actividad empresarial'}{' '}
          constituida de conformidad con las Leyes Mexicanas,{' '}
          <Text style={cStyles.bold}>{c.nombre}</Text> está legalmente constituida conforme a la
          legislación mexicana en la materia, registrada ante la Secretaría de Hacienda y Crédito
          Público con Cédula de Identificación Fiscal y RFC{' '}
          <Text style={cStyles.bold}>{c.rfc ?? '__________'}</Text>, con registro ante la Secretaría
          del Trabajo con REPSE N° <Text style={cStyles.bold}>{c.repse ?? '__________'}</Text> y
          Registro patronal ante el IMSS N°{' '}
          <Text style={cStyles.bold}>{c.registroPatronal ?? '__________'}</Text>.
        </Text>
        <Text style={cStyles.parrafo}>
          b) Tiene capacidad jurídica para contratar y reúne las condiciones técnicas y económicas
          para obligarse a la ejecución de la obra objeto de este contrato.
        </Text>
        <Text style={cStyles.parrafo}>
          c) Tiene establecido su domicilio en{' '}
          <Text style={cStyles.bold}>{c.domicilio ?? '__________'}</Text>, mismo que señala para
          todos los fines y efectos legales de este contrato.
        </Text>
        <Text style={cStyles.parrafo}>
          d) Que conoce y está de acuerdo con el lugar y las condiciones en que prestará sus
          servicios, tomando en cuenta la naturaleza y grado de dificultad de los mismos y todas las
          circunstancias que pudieran afectar la ejecución de los trabajos y se compromete a
          realizarlos oportunamente.
        </Text>
        <Text style={cStyles.parrafo}>
          e) Que su representada tiene interés en otorgar el presente contrato con “EL CLIENTE”, a
          fin de proporcionarle los servicios que serán detallados en el presente contrato y los
          anexos que en su caso se generen, por lo que se obliga a respetar estrictamente los
          términos y especificaciones de los mismos.
        </Text>
        <Text style={cStyles.parrafo}>
          f) Encontrarse en cumplimiento a lo dispuesto por la Ley Federal para la Prevención e
          Identificación de Operaciones con Recursos de Procedencia Ilícita y su Reglamento
          (conjuntamente la “Regulación Anti-Lavado”), por lo que el origen de los recursos
          económicos que destinará para el cumplimiento de sus obligaciones, así como el origen de
          cualesquiera otros recursos relacionados con el presente Contrato, no proviene ni
          provendrá, ni está ni estará relacionado en forma alguna, con actividades ilícitas o en
          contravención de la Regulación Anti-lavado.
        </Text>
        <Text style={cStyles.parrafo}>
          Vistas las anteriores declaraciones, ambas partes están de acuerdo en sujetar su voluntad
          a las siguientes:
        </Text>
        <Text style={cStyles.parrafo}>
          <Text style={cStyles.bold}>III.- Manifiestan Ambas Partes lo siguiente:</Text> ÚNICA.- Que
          es su deseo y libre voluntad celebrar el presente contrato ajustándose al tenor de las
          siguientes:
        </Text>

        <Text style={cStyles.seccionTitulo}>CLÁUSULAS</Text>

        <Clausula
          n="PRIMERA"
          titulo="OBJETO DEL CONTRATO"
          texto={
            <>
              Declara “EL CONTRATISTA” que acepta suministrar la mano de obra, cimbra, materiales no
              incluidos en el listado de insumos, andamios, herramienta, equipo menor y maquinaria
              para realizar la construcción de viviendas de su respectivo prototipo indicado en los
              siguientes lotes:
            </>
          }
        />
        <LotesTable lotes={data.lotes} montoTotal={data.montoTotal} />
        <Text style={cStyles.parrafo}>
          “EL CONTRATISTA” se obliga a ejecutarla hasta su total terminación de acuerdo a los
          planos, proyectos, especificaciones, presupuestos y calendarios de trabajo que se anexan
          al presente, acatando lo establecido por los diversos ordenamientos, normas y anexos
          señalados en este contrato, así como las normas de construcción vigentes en el lugar donde
          deban realizarse los trabajos, mismos que se tienen por reproducidos como parte integrante
          de estas cláusulas. Toda la documentación anterior ha sido revisada y aprobada por ambas
          partes.
        </Text>

        <Clausula
          n="SEGUNDA"
          titulo="MONTO TOTAL DEL CONTRATO"
          texto={
            <>
              “EL CLIENTE” pagará a “EL CONTRATISTA” como precio unitario conforme a los avances de
              los trabajos citados en la cláusula primera del presente contrato la cantidad de{' '}
              <Text style={cStyles.bold}>
                {money(data.montoTotal)} ({data.montoTotalEnLetra})
              </Text>
              .
            </>
          }
        />

        <Clausula
          n="TERCERA"
          titulo="PLAZO DE EJECUCIÓN DE LOS TRABAJOS"
          texto={
            <>
              “EL CONTRATISTA” se obliga a iniciar los trabajos objeto de este contrato el día{' '}
              <Text style={cStyles.bold}>{data.fechaInicioTexto}</Text> y terminarlos el{' '}
              <Text style={cStyles.bold}>{data.fechaFinTexto}</Text>.
            </>
          }
        />

        <Clausula
          n="CUARTA"
          titulo="VIGENCIA DEL CONTRATO"
          texto={
            <>
              El presente contrato iniciará su vigencia el día de su firma, el cual se señala en la
              cláusula tercera de este contrato, y terminará su vigencia hasta el día en que se
              formalice el acta entrega-recepción de los trabajos y/o servicios en forma
              satisfactoria para “EL CLIENTE”, incluyendo el Checklist de Recepción de Vivienda a
              Contratista y Revisión Pre-Entrega, incluyendo las pruebas de control de calidad y
              funcionalidad de cada una de las etapas de construcción e instalaciones requeridas por
              “EL CLIENTE” incluidas en el <Text style={cStyles.bold}>ANEXO 1</Text>.
            </>
          }
        />

        <Clausula
          n="QUINTA"
          titulo="SOLICITUD DE PRÓRROGA POR PARTE DE “EL CONTRATISTA”"
          texto={
            <>
              En los casos fortuitos o de fuerza mayor, o cuando por cualquier otra causa no
              imputable a “EL CONTRATISTA” le fuere imposible cumplir con el programa de arranques y
              terminación mencionado en la cláusula PRIMERA, solicitará oportunamente y por escrito
              la prórroga que considere necesaria, expresando los motivos en que apoye su solicitud.
              “EL CLIENTE”, bajo su responsabilidad, resolverá sobre la justificación y procedencia
              de la prórroga y en su caso concederá la que haya solicitado “EL CONTRATISTA”, o la
              que estime conveniente, mediante un acuerdo fundado y motivado por escrito, así como
              la posterior celebración de un convenio modificatorio o adicional, según sea el caso.
            </>
          }
        />

        <Clausula
          n="SEXTA"
          titulo="DISPONIBILIDAD DEL INMUEBLE, DOCUMENTOS ADMINISTRATIVOS Y/O MATERIALES"
          texto={
            <>
              “EL CLIENTE” se obliga a poner a disposición de “EL CONTRATISTA” el o los inmuebles
              donde deban llevarse a cabo los trabajos, así como la información relativa a la obra y
              los dictámenes, permisos, licencias y demás autorizaciones que se requieren para su
              realización. “EL CLIENTE” entregará a “EL CONTRATISTA” todo el material contenido en
              el <Text style={cStyles.bold}>ANEXO 2</Text> a pie de lote, siempre y cuando se
              solicite con mínimo {PARAMETROS_OBRA.diasAnticipacionMaterial} (siete) días naturales
              de anticipación, mediante correo electrónico enviado a {EL_CLIENTE_OBRA.emailCompras}.
              En caso de requerir material fuera de este lapso mínimo, “EL CONTRATISTA” deberá
              recogerlo en el almacén de “EL CLIENTE” ubicado en: {EL_CLIENTE_OBRA.almacen}, siendo
              “EL CONTRATISTA” el único responsable de transportar dichos materiales al lugar de la
              obra. Una vez recibido el material por la persona autorizada, su salvaguarda es
              responsabilidad de “EL CONTRATISTA”, quien deberá reponerlo en caso de daño, pérdida o
              robo. Cualquier material adicional al entregado podrá ser proporcionado con costo para
              “EL CONTRATISTA”, mismo que deberá pagarse antes de la siguiente estimación o, en su
              defecto, se deducirá del pago de la última estimación.
            </>
          }
        />

        <Clausula
          n="SÉPTIMA"
          titulo="FORMA DE PAGO"
          texto={
            <>
              Las partes convienen que los trabajos se paguen mediante la formulación de
              estimaciones semanales, las cuales serán extraídas de los reportes del programa de
              administración que utiliza “EL CLIENTE” como resultado de lo que el supervisor de obra
              haya calificado o aprobado como terminado al 100%. Este reporte, en conjunto con la
              plantilla de precios unitarios por actividad y prototipo proporcionada en el{' '}
              <Text style={cStyles.bold}>ANEXO 3</Text> del presente contrato, darán el monto a
              pagar en cada estimación semanal. Las estimaciones se enviarán para revisión los días
              miércoles de cada semana; “EL CONTRATISTA” deberá enviar su factura a más tardar el
              día viernes, para ser pagada por “EL CLIENTE” el miércoles de la siguiente semana.
              {'\n'}
              a) “EL CONTRATISTA” deberá demostrar de forma mensual que ha cumplido con el pago
              puntual de las cuotas obrero-patronales, el ISR retenido a sus trabajadores y la
              entrega de los CFDI por concepto de pago de salarios causados por la ejecución de la
              obra. En caso de no demostrarlo, “EL CLIENTE” retendrá el importe de sus estimaciones
              posteriores hasta la regularización.
              {'\n'}
              b) “EL CLIENTE” retendrá a “EL CONTRATISTA” un{' '}
              <Text style={cStyles.bold}>{PARAMETROS_OBRA.retencionFondoGarantiaPct}%</Text> del
              valor de cada estimación, que quedará como fondo de garantía y se entregará después de
              30 días hábiles de haber concluido el total de los trabajos, siempre que sean
              recibidos a plena satisfacción de “EL CLIENTE” conforme al ANEXO 1 y “EL CONTRATISTA”
              demuestre haber liquidado las cuotas y aportaciones ante el IMSS e INFONAVIT
              correspondientes a la obra.
              {'\n'}
              c) Si vence el plazo de 60 días naturales y “EL CONTRATISTA” no reclama la entrega de
              su fondo de garantía, contará con un plazo adicional y único de 60 días naturales; de
              lo contrario, se entenderá que renuncia a su derecho de cobro, quedando dicha cantidad
              en favor de “EL CLIENTE”.
            </>
          }
        />

        <Clausula
          n="OCTAVA"
          titulo="OBLIGACIONES DE “EL CONTRATISTA”"
          texto={
            <>
              “EL CONTRATISTA” se obliga a: a) Iniciar los trabajos dentro de los siguientes{' '}
              {PARAMETROS_OBRA.diasNaturalesParaIniciar} (quince) días naturales a partir de la
              firma y cumplir con el programa de obra; los arranques se organizan por paquetes de
              viviendas, cuyos arranques posteriores al primero quedan condicionados a mantener una
              efectividad por encima del {PARAMETROS_OBRA.efectividadMinimaPct}% por vivienda. b)
              Cumplir con las obligaciones de carácter administrativo que las leyes impongan, siendo
              por su cuenta las sanciones, multas o prórrogas. c) Cumplir con la Ley Federal del
              Trabajo, Ley del Seguro Social, Ley del ISR, Ley del INFONAVIT y demás ordenamientos
              aplicables a los patrones. d) Mantener personal técnico capacitado con cédula
              profesional, incluyendo al Director Responsable de Obra. e) Tomar las providencias
              para evitar accidentes y proporcionar mano de obra, herramienta y equipo, manteniendo
              la obra libre de desperdicios. f) Mantener a “EL CLIENTE” al margen de toda
              reclamación laboral o de terceros. g) Reconocer que la propiedad de los trabajos
              ejecutados y materiales corresponde a “EL CLIENTE”. h) Recibir y resguardar los
              materiales comprados por “EL CLIENTE”. i) Confirmar con el supervisor la programación
              de materiales con mínimo 3 días de anticipación. j) Elaborar y firmar la carta de
              terminación de obra, finiquito y no adeudos.
            </>
          }
        />

        <Clausula
          n="NOVENA"
          titulo="GARANTÍAS"
          texto={
            <>
              “EL CONTRATISTA” garantiza la correcta ejecución de los trabajos conforme al fondo de
              garantía y demás términos establecidos en el presente contrato.
            </>
          }
        />

        <Clausula
          n="DÉCIMA"
          titulo="AJUSTE DE COSTOS"
          texto={
            <>
              Las partes acuerdan que no existirán ajustes de costos durante la vigencia de este
              contrato o durante la duración de la obra.
            </>
          }
        />

        <Clausula
          n="DÉCIMA PRIMERA"
          titulo="RECEPCIÓN DE LOS TRABAJOS"
          texto={
            <>
              “EL CLIENTE” recibirá los trabajos hasta que sean terminados en su totalidad y se
              ajusten a las especificaciones convenidas. Se efectuarán recepciones parciales cuando:
              a) la parte ejecutada se ajuste a lo convenido y pueda ser utilizada; b) “EL CLIENTE”
              suspenda las obras y lo ejecutado se ajuste a lo pactado; c) de común acuerdo se dé
              por terminado anticipadamente; d) “EL CLIENTE” rescinda administrativamente; e) la
              autoridad judicial declare rescindido el contrato. La aceptación de estimaciones no
              constituye la recepción de los trabajos ni exime a “EL CONTRATISTA” de reclamos por
              faltantes o vicios ocultos.
            </>
          }
        />

        <Clausula
          n="DÉCIMA SEGUNDA"
          titulo="REPRESENTANTE DE “EL CONTRATISTA”"
          texto={
            <>
              “EL CONTRATISTA” nombrará antes de la fecha de inicio de la obra un superintendente de
              construcción permanente con poder amplio y suficiente para tomar decisiones relativas
              al cumplimiento de este contrato. “EL CLIENTE” se reserva el derecho de su aceptación.
              Dicho representante deberá permanecer en la obra en todo momento que haya personal
              ejecutando trabajos.
            </>
          }
        />

        <Clausula
          n="DÉCIMA TERCERA"
          titulo="RELACIONES LABORALES"
          texto={
            <>
              “EL CONTRATISTA” es el único responsable de las obligaciones derivadas de las
              disposiciones en materia de trabajo y de seguridad social, y se obliga a presentar a
              “EL CLIENTE”, cuando lo requiera, información sobre el cumplimiento de sus
              obligaciones ante el IMSS e INFONAVIT, respondiendo de todas las reclamaciones que sus
              trabajadores presentaren.
            </>
          }
        />

        <Clausula
          n="DÉCIMA CUARTA"
          titulo="TERMINACIÓN ADMINISTRATIVA DEL CONTRATO"
          texto={
            <>
              “EL CLIENTE” podrá en cualquier momento terminar administrativamente este contrato por
              causas de interés general. El incumplimiento de cualquiera de las obligaciones de “EL
              CONTRATISTA” dará motivo a su rescisión inmediata, sin responsabilidad para “EL
              CLIENTE”, además de aplicarse las penas convencionales y hacerse efectiva la garantía
              otorgada.
            </>
          }
        />

        <Clausula
          n="DÉCIMA QUINTA"
          titulo="PENAS CONVENCIONALES"
          texto={
            <>
              a) Si por causas imputables a “EL CONTRATISTA” no se cumple con la terminación de las
              etapas y entrega en los plazos indicados en la cláusula primera, pagará a “EL CLIENTE”
              una cantidad equivalente al{' '}
              <Text style={cStyles.bold}>
                {PARAMETROS_OBRA.penaConvencionalDiariaPct} por ciento
              </Text>{' '}
              diario por cada día de retraso respecto de la fecha compromiso para terminar. Cuando
              el monto de las sanciones acumuladas represente el{' '}
              {PARAMETROS_OBRA.topePenasRescisionPct}% del importe de la obra contratada, procederá
              la rescisión administrativa del contrato. b) Se suspenderá la aprobación de pagos de
              avance cuando hubiera trabajos defectuosos no corregidos, montos insolutos a cargo de
              “EL CONTRATISTA”, o cuando el avance sea menor en un 5% al programa de ejecución.
            </>
          }
        />

        <Clausula
          n="DÉCIMA SEXTA"
          titulo="OTRAS ESTIPULACIONES ESPECÍFICAS"
          texto={
            <>
              1. Trabajos extraordinarios: se celebrará convenio modificatorio a precios unitarios;
              si se requieren nuevos conceptos, “EL CONTRATISTA” someterá los precios unitarios
              respectivos a consideración de “EL CLIENTE”, quien podrá encomendarlos a tercera
              persona. 2. Supervisión: “EL CLIENTE” tendrá derecho de supervisar en todo tiempo las
              obras, dando instrucciones por escrito; establecerá la residencia de supervisión y
              llevará la bitácora como único medio de comunicación oficial. 3. Modificaciones al
              programa, planos y especificaciones podrán ordenarse por escrito; si varía el importe,
              se celebrará convenio modificatorio. 4. Rescisión: operará de pleno derecho a favor de
              “EL CLIENTE” conforme al procedimiento pactado. 5. Procedimiento de rescisión: se
              comunicará a “EL CONTRATISTA” para que en 15 días naturales exponga lo que a su
              derecho convenga. 6. Personal de mano de obra a cargo exclusivo de “EL CONTRATISTA”.
              7. Maquinaria, equipo y herramienta por cuenta de “EL CONTRATISTA”. 8. Limpieza en
              obra. 9. Servicios sanitarios provisionales por cuenta de “EL CONTRATISTA”.
            </>
          }
        />

        <Clausula
          n="DÉCIMA SÉPTIMA"
          titulo="JURISDICCIÓN"
          texto={
            <>
              Para la interpretación y cumplimiento del presente contrato, las partes se someten a
              la jurisdicción de los Tribunales del Estado de {JURISDICCION_OBRA.estado}, por lo que
              “EL CONTRATISTA” renuncia al fuero que pudiera corresponderle por razón de su
              domicilio presente, futuro o cualquier otra causa.
            </>
          }
        />

        <Clausula
          n="DÉCIMA OCTAVA"
          titulo="AUSENCIA DE VICIOS DEL CONSENTIMIENTO"
          texto={
            <>
              Ambas partes reconocen que en el presente Contrato no existe error, dolo, violencia,
              mala fe, lesión, ni ningún otro vicio de voluntad que pudiere nulificarlo o
              invalidarlo, encontrándose de acuerdo en la forma en que se encuentra redactado. Una
              vez leído por las partes y enteradas de su contenido y alcance legal, lo firman a su
              entera conformidad ante la presencia de dos testigos el día{' '}
              <Text style={cStyles.bold}>{data.fechaFirmaTexto}</Text>, en la Ciudad de{' '}
              {JURISDICCION_OBRA.ciudad}.
            </>
          }
        />

        {/* Firmas */}
        <View style={cStyles.firmasGroup}>
          <FirmaSlot
            nombre={`LIC. ${EL_CLIENTE_OBRA.representante}`}
            rol={'Representante Legal\nPOR “EL CLIENTE”'}
          />
          <FirmaSlot
            nombre={c.representanteLegal ?? c.nombre}
            rol={
              c.representanteLegal
                ? 'Representante Legal\nPOR “EL CONTRATISTA”'
                : 'POR “EL CONTRATISTA”'
            }
          />
          {TESTIGOS_OBRA.map((t) => (
            <FirmaSlot key={t.nombre} nombre={t.nombre} rol="TESTIGO" />
          ))}
        </View>

        <Folio value={data.folio} />
        <FooterBand />
      </Page>

      {/* ── ANEXO 3 — precios unitarios por actividad y prototipo ── */}
      <Page size="LETTER" style={styles.page} wrap>
        <HeaderBand title="ANEXO 3 — PRECIOS UNITARIOS" fecha={data.fechaFirmaTexto} />
        <Text style={cStyles.parrafo}>
          Plantilla de precios unitarios de mano de obra por actividad y prototipo, referida en la
          cláusula SÉPTIMA del presente contrato. El precio de cada actividad corresponde al
          porcentaje de costo de mano de obra aplicado sobre el valor del contrato de MO del
          prototipo respectivo.
        </Text>
        {data.anexo3.map((proto) => (
          <Anexo3Tabla key={proto.prototipo} proto={proto} />
        ))}
        <Folio value={data.folio} />
        <FooterBand />
      </Page>
    </Document>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────

function Clausula({ n, titulo, texto }: { n: string; titulo: string; texto: React.ReactNode }) {
  return (
    <Text style={cStyles.clausula}>
      <Text style={cStyles.clausulaNumero}>
        {n}.- {titulo}.-{' '}
      </Text>
      {texto}
    </Text>
  );
}

function FirmaSlot({ nombre, rol }: { nombre: string; rol: string }) {
  return (
    <View style={cStyles.firmaSlot} wrap={false}>
      <View style={cStyles.firmaLinea} />
      <Text style={cStyles.firmaNombre}>{nombre}</Text>
      <Text style={cStyles.firmaRol}>{rol}</Text>
    </View>
  );
}

function LotesTable({ lotes, montoTotal }: { lotes: ContratoObraLote[]; montoTotal: number }) {
  return (
    <View style={cStyles.table}>
      <View style={[cStyles.tableRow, cStyles.tableHeader]} fixed>
        <Text style={[cStyles.tableCell, cStyles.tableHeaderCell, { width: '26%' }]}>
          ID Construcción
        </Text>
        <Text style={[cStyles.tableCell, cStyles.tableHeaderCell, { width: '16%' }]}>Proyecto</Text>
        <Text style={[cStyles.tableCell, cStyles.tableHeaderCell, { width: '12%' }]}>
          Prototipo
        </Text>
        <Text
          style={[cStyles.tableCell, cStyles.tableHeaderCell, cStyles.cellRight, { width: '12%' }]}
        >
          Precio MO/m²
        </Text>
        <Text
          style={[cStyles.tableCell, cStyles.tableHeaderCell, cStyles.cellRight, { width: '9%' }]}
        >
          m²
        </Text>
        <Text
          style={[cStyles.tableCell, cStyles.tableHeaderCell, cStyles.cellRight, { width: '13%' }]}
        >
          Valor MO
        </Text>
        <Text
          style={[cStyles.tableCell, cStyles.tableHeaderCell, cStyles.cellRight, { width: '12%' }]}
        >
          Fecha compromiso
        </Text>
      </View>
      {lotes.map((l) => (
        <View key={l.codigo} style={cStyles.tableRow} wrap={false}>
          <Text style={[cStyles.tableCell, { width: '26%' }]}>{l.codigo}</Text>
          <Text style={[cStyles.tableCell, { width: '16%' }]}>{l.proyecto}</Text>
          <Text style={[cStyles.tableCell, { width: '12%' }]}>{l.prototipo}</Text>
          <Text style={[cStyles.tableCell, cStyles.cellRight, { width: '12%' }]}>
            {money(l.precioMoM2)}
          </Text>
          <Text style={[cStyles.tableCell, cStyles.cellRight, { width: '9%' }]}>
            {l.m2.toFixed(2)}
          </Text>
          <Text style={[cStyles.tableCell, cStyles.cellRight, { width: '13%' }]}>
            {money(l.valorMo)}
          </Text>
          <Text style={[cStyles.tableCell, cStyles.cellRight, { width: '12%' }]}>
            {l.fechaCompromisoTexto}
          </Text>
        </View>
      ))}
      <View style={[cStyles.tableRow, cStyles.tableTotalRow]} wrap={false}>
        <Text style={[cStyles.tableCell, cStyles.bold, { width: '75%' }]}>TOTAL</Text>
        <Text style={[cStyles.tableCell, cStyles.cellRight, cStyles.bold, { width: '25%' }]}>
          {money(montoTotal)}
        </Text>
      </View>
    </View>
  );
}

function Anexo3Tabla({ proto }: { proto: Anexo3Prototipo }) {
  return (
    <View style={cStyles.anexoBlock}>
      <Text style={cStyles.anexoProtoTitulo}>
        Prototipo {proto.prototipo} — Valor MO {money(proto.valorMo)}
      </Text>
      <View style={cStyles.table}>
        <View style={[cStyles.tableRow, cStyles.tableHeader]} fixed>
          <Text style={[cStyles.tableCell, cStyles.tableHeaderCell, { width: '28%' }]}>Etapa</Text>
          <Text style={[cStyles.tableCell, cStyles.tableHeaderCell, { width: '42%' }]}>
            Actividad
          </Text>
          <Text
            style={[
              cStyles.tableCell,
              cStyles.tableHeaderCell,
              cStyles.cellRight,
              { width: '10%' },
            ]}
          >
            % Costo
          </Text>
          <Text
            style={[
              cStyles.tableCell,
              cStyles.tableHeaderCell,
              cStyles.cellRight,
              { width: '12%' },
            ]}
          >
            Precio MO
          </Text>
          <Text
            style={[cStyles.tableCell, cStyles.tableHeaderCell, cStyles.cellRight, { width: '8%' }]}
          >
            Días
          </Text>
        </View>
        {proto.tareas.map((t, i) => (
          <View key={`${t.etapa}-${t.tarea}-${i}`} style={cStyles.tableRow} wrap={false}>
            <Text style={[cStyles.tableCell, { width: '28%' }]}>{t.etapa}</Text>
            <Text style={[cStyles.tableCell, { width: '42%' }]}>{t.tarea}</Text>
            <Text style={[cStyles.tableCell, cStyles.cellRight, { width: '10%' }]}>
              {pct(t.porcentaje)}
            </Text>
            <Text style={[cStyles.tableCell, cStyles.cellRight, { width: '12%' }]}>
              {money0(t.precioMo)}
            </Text>
            <Text style={[cStyles.tableCell, cStyles.cellRight, { width: '8%' }]}>
              {t.dias.toFixed(2)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const cStyles = StyleSheet.create({
  titulo: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
    letterSpacing: 0.5,
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
  clausula: {
    fontSize: 8.5,
    textAlign: 'justify',
    marginBottom: 4,
    lineHeight: 1.35,
  },
  clausulaNumero: { fontFamily: 'Helvetica-Bold' },
  firmasGroup: {
    marginTop: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  firmaSlot: {
    width: 220,
    alignItems: 'center',
    marginBottom: 18,
    marginHorizontal: 6,
  },
  firmaLinea: {
    width: '100%',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.text,
    marginBottom: 3,
    marginTop: 26,
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
    marginTop: 6,
    marginBottom: 6,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    borderLeftWidth: 0.5,
    borderLeftColor: colors.border,
  },
  tableHeader: { backgroundColor: colors.primary },
  tableHeaderCell: { color: '#fff', fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row' },
  tableTotalRow: { backgroundColor: colors.bgSoft },
  tableCell: {
    fontSize: 6.8,
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: colors.border,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    color: colors.text,
  },
  cellRight: { textAlign: 'right' },
  anexoBlock: { marginTop: 8 },
  anexoProtoTitulo: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginTop: 6,
    marginBottom: 1,
    color: colors.primary,
  },
});

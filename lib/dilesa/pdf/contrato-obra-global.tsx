/**
 * Template PDF: Contrato de Servicios a Precios Unitarios y Tiempo
 * Determinado — variante de **obra de monto global** (DILESA ↔ contratista).
 *
 * A diferencia de `contrato-obra.tsx` (vivienda, con tabla de lotes/prototipos
 * y ANEXO 3 de precios unitarios derivados), esta variante es para obra
 * descrita por su **objeto** (urbanización, cabecera, tarea menor): muro de
 * contención, barda, electrificación, etc. El objeto reemplaza la tabla de
 * lotes en la cláusula PRIMERA y no hay anexos de prototipo.
 *
 * El cuerpo legal transcribe el contrato real "Muro de contención (Maya)"
 * (sprint dilesa-contratos-obra · Fase 4): declaraciones + 18 cláusulas + 2
 * testigos. Los valores variables (objeto, monto, plazo, anticipo, retención,
 * fianza, periodicidad de estimaciones) vienen del contrato; el cliente DILESA
 * y la jurisdicción de las constantes compartidas con el template de vivienda.
 *
 * Estilos de texto re-declarados localmente (no se acoplan al de vivienda, que
 * además tiene estilos de tabla que aquí no aplican). Header/footer/folio y la
 * paleta sí se reusan. `gap` de @react-pdf/renderer v4.5.x falla bundled — se
 * usan margins.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Folio } from './header-footer';
import { EL_CLIENTE_OBRA, JURISDICCION_OBRA, TESTIGOS_OBRA } from '../contrato/constantes-obra';

export type ContratoObraGlobalContratista = {
  nombre: string; // razón social o nombre completo
  esMoral: boolean;
  representanteLegal: string | null;
  rfc: string | null;
  repse: string | null;
  registroPatronal: string | null;
  domicilio: string | null;
};

export type ContratoObraGlobalData = {
  folio: string;
  fechaFirmaTexto: string; // "26 de Diciembre del 2022"
  fechaInicioTexto: string; // "28 de Mayo del 2026"
  fechaFinTexto: string; // "26 de Junio del 2026"
  /** Objeto del contrato (cláusula PRIMERA): "Construcción de 225 metros de muro de contención…". */
  objeto: string;
  proyectoNombre: string;
  contratista: ContratoObraGlobalContratista;
  montoTotal: number;
  montoTotalEnLetra: string; // "OCHOCIENTOS SESENTA MIL 00/100 M.N."
  anticipoMonto: number;
  anticipoEnLetra: string; // "Ochenta y seis mil 00/100 M.N."
  anticipoPct: number; // 10
  retencionPct: number; // 5
  fianzaPct: number; // 10
  periodicidadDias: number; // 14
};

const fmtMoney = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number) => fmtMoney.format(Number(n) || 0);
const num = (n: number) => (Number.isFinite(n) ? String(Math.round(n)) : '__');

export function ContratoObraGlobalPDF({ data }: { data: ContratoObraGlobalData }) {
  const c = data.contratista;
  const objeto = data.objeto?.trim() || 'los trabajos descritos en el presente instrumento';
  const enProyecto = data.proyectoNombre?.trim()
    ? ` en el fraccionamiento ${data.proyectoNombre.trim()}`
    : '';
  return (
    <Document title={`Contrato de Obra — ${data.folio}`}>
      <Page size="LETTER" style={styles.page} wrap>
        <HeaderBand title="CONTRATO DE OBRA" fecha={data.fechaFirmaTexto} />

        <Text style={cStyles.titulo}>
          CONTRATO DE SERVICIOS A PRECIOS UNITARIOS Y TIEMPO DETERMINADO
        </Text>

        {/* ── Encabezado / comparecencia ── */}
        <Text style={cStyles.parrafo}>
          Contrato de Servicios a Precios Unitarios y Tiempo Determinado que celebran, por una
          parte, <Text style={cStyles.bold}>{EL_CLIENTE_OBRA.razonSocial}</Text>, representado por
          el <Text style={cStyles.bold}>SR. {EL_CLIENTE_OBRA.representante}</Text>, en lo sucesivo
          se le denominará <Text style={cStyles.bold}>“EL CLIENTE”</Text>; y por la otra parte{' '}
          <Text style={cStyles.bold}>{c.nombre}</Text>, a quien en lo sucesivo se le denominará{' '}
          <Text style={cStyles.bold}>“EL CONTRATISTA”</Text>
          {c.representanteLegal ? (
            <>
              , representada en este acto por{' '}
              <Text style={cStyles.bold}>{c.representanteLegal}</Text> en su carácter de
              Representante Legal
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
          a) Es una persona moral constituida de conformidad con las Leyes Mexicanas, acreditándolo
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
            {c.esMoral
              ? ' por conducto de su Representante Legal.'
              : ' por conducto de su Administrador Único.'}
          </Text>
        </Text>
        <Text style={cStyles.parrafo}>
          a) Es {c.esMoral ? 'una persona moral constituida' : 'una persona física constituida'} de
          conformidad con las Leyes Mexicanas, legalmente constituida conforme a la legislación
          mexicana en la materia, registrada ante la Secretaría de Hacienda y Crédito Público con
          Cédula de Identificación Fiscal y RFC{' '}
          <Text style={cStyles.bold}>{c.rfc ?? '__________'}</Text>, con registro ante la Secretaría
          de Trabajo REPSE N° <Text style={cStyles.bold}>{c.repse ?? '__________'}</Text>, y
          Registro Patronal ante el IMSS N°{' '}
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
          d) Ha tomado en consideración todas las circunstancias que pudieran afectar la ejecución
          de los trabajos y se compromete a realizarlos oportunamente.
        </Text>

        {/* III — Ambas partes */}
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
              “EL CLIENTE” encomienda a “EL CONTRATISTA” la ejecución de suministros parciales y
              mano de obra en {objeto}
              {enProyecto}, y éste se obliga a realizarla hasta su total terminación acatando para
              ello lo establecido por los diversos ordenamientos, normas y anexos señalados en este
              contrato, así como las normas de construcción vigentes en el lugar donde deban
              realizarse los trabajos, mismos que se tienen por reproducidos como parte integrante
              de estas cláusulas.
            </>
          }
        />

        <Clausula
          n="SEGUNDA"
          titulo="MONTO TOTAL DEL CONTRATO"
          texto={
            <>
              El monto total del presente contrato es por la cantidad de{' '}
              <Text style={cStyles.bold}>
                {money(data.montoTotal)} ({data.montoTotalEnLetra})
              </Text>
              . Impuesto al valor agregado incluido.
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
              satisfactoria para “EL CLIENTE”. Una vez aprobados, los programas, la propuesta de
              presupuesto aprobada, las diferentes etapas, así como sus planos debidamente revisados
              y aprobados por “EL CLIENTE” serán Anexos de este Contrato y formarán parte del mismo.
            </>
          }
        />

        <Clausula
          n="QUINTA"
          titulo="SOLICITUD DE PRÓRROGA POR PARTE DE “EL CONTRATISTA”"
          texto={
            <>
              En los casos fortuitos o de fuerza mayor, o cuando por cualquier otra causa no
              imputable a “EL CONTRATISTA” le fuere imposible cumplir con el programa, solicitará
              oportunamente y por escrito la prórroga que considere necesaria, expresando los
              motivos en que apoye su solicitud. “EL CLIENTE”, bajo su responsabilidad, resolverá
              sobre la justificación y procedencia de la prórroga y, en su caso, concederá la que
              haya solicitado “EL CONTRATISTA”, o la que estime conveniente, mediante un acuerdo
              fundado y motivado por escrito, así como la posterior celebración de un convenio
              modificatorio o adicional, según sea el caso.
            </>
          }
        />

        <Clausula
          n="SEXTA"
          titulo="DISPONIBILIDAD DEL INMUEBLE, DOCUMENTOS ADMINISTRATIVOS Y/O MATERIALES Y MAQUINARIA"
          texto={
            <>
              “EL CLIENTE” se obliga a poner a disposición de “EL CONTRATISTA” el o los inmuebles
              donde deban llevarse a cabo los trabajos materia de este contrato, así como la
              información relativa a la obra que se va a ejecutar y los dictámenes, permisos,
              licencias y demás autorizaciones que se requieren para su realización. “EL CLIENTE”
              será el encargado de proporcionar a “EL CONTRATISTA” el material necesario para la
              ejecución del presente instrumento, asignando un lugar específico de entrega y
              recepción de dicho material.
            </>
          }
        />

        <Clausula
          n="SÉPTIMA"
          titulo="ANTICIPO PARA INICIO DE OBRA"
          texto={
            data.anticipoPct > 0 ? (
              <>
                Para el inicio de la obra objeto del presente instrumento “EL CLIENTE” pagará como
                anticipo a cuenta del valor total de la obra la cantidad de{' '}
                <Text style={cStyles.bold}>
                  {money(data.anticipoMonto)} ({data.anticipoEnLetra})
                </Text>
                , impuesto al valor agregado incluido, equivalente al{' '}
                <Text style={cStyles.bold}>{num(data.anticipoPct)}%</Text> del importe total del
                presente contrato, obligándose “EL CONTRATISTA” a utilizarlo única y exclusivamente
                en dichos trabajos. La amortización de los anticipos se llevará a cabo en cada
                estimación parcial de pago de avance.
              </>
            ) : (
              <>
                Las partes acuerdan que para la ejecución de la obra objeto del presente contrato no
                se otorgará anticipo a “EL CONTRATISTA”, por lo que los trabajos se pagarán
                íntegramente mediante las estimaciones de avance conforme a la cláusula OCTAVA.
              </>
            )
          }
        />

        <Clausula
          n="OCTAVA"
          titulo="FORMA DE PAGO"
          texto={
            <>
              Las partes convienen que los trabajos objeto del presente contrato se paguen mediante
              la formulación de estimaciones que abarcarán períodos de ejecución no mayores de{' '}
              <Text style={cStyles.bold}>{num(data.periodicidadDias)} días naturales</Text>, término
              que iniciaría a partir del inicio de la obra; las que serán presentadas a la
              supervisión para su revisión y aprobación. Las estimaciones se pagarán en un plazo no
              mayor a 5 (cinco) días hábiles, contados a partir de la fecha de entrega de la factura
              a “EL CLIENTE”, la que deberá reunir los requisitos fiscales que establecen las leyes
              y contener el visto bueno de la supervisión. Acepta “EL CONTRATISTA” que “EL CLIENTE”
              le retenga el <Text style={cStyles.bold}>{num(data.retencionPct)}%</Text> de cada
              estimación presentada como fondo de garantía, el cual le será devuelto al presentar
              los oficios de entrega-recepción de las obras por parte de los representantes de “EL
              CLIENTE”. Ni las estimaciones ni las liquidaciones, aunque hayan sido pagadas, se
              considerarán como aceptación de las obras.
            </>
          }
        />

        <Clausula
          n="NOVENA"
          titulo="GARANTÍAS"
          texto={
            data.fianzaPct > 0 ? (
              <>
                “EL CONTRATISTA” entregará a “EL CLIENTE” fianza de cumplimiento por el{' '}
                <Text style={cStyles.bold}>{num(data.fianzaPct)}%</Text> del monto total del
                contrato, misma que podrá ser cancelada al término de la obra y una vez que se halle
                amortizado el total del anticipo, sin perjuicio del fondo de garantía retenido
                conforme a la cláusula OCTAVA.
              </>
            ) : (
              <>
                La correcta ejecución de los trabajos queda garantizada mediante el fondo de
                garantía que “EL CLIENTE” retiene de cada estimación conforme a la cláusula OCTAVA
                del presente contrato, el cual se devolverá a “EL CONTRATISTA” en los términos ahí
                señalados. Las partes acuerdan que no se requiere fianza de cumplimiento adicional.
              </>
            )
          }
        />

        <Clausula
          n="DÉCIMA"
          titulo="AJUSTE DE COSTOS"
          texto={
            <>
              Las partes acuerdan la revisión de los costos que integran los precios unitarios
              pactados cuando ocurran circunstancias de orden económico que determinen un aumento o
              reducción conforme al programa pactado o el vigente, dentro de los 20 (veinte) días
              hábiles siguientes a la fecha de presentación por parte de “EL CONTRATISTA”. La
              revisión se efectuará a solicitud escrita de “EL CONTRATISTA”, acompañada de la
              documentación comprobatoria; “EL CLIENTE”, dentro de los 15 (quince) días hábiles
              siguientes, resolverá sobre la procedencia de la petición.
            </>
          }
        />

        <Clausula
          n="DÉCIMA PRIMERA"
          titulo="RECEPCIÓN DE LOS TRABAJOS"
          texto={
            <>
              “EL CLIENTE” recibirá los trabajos hasta que sean terminados en su totalidad, si
              hubieren sido terminados de acuerdo con las especificaciones convenidas. Se efectuarán
              recepciones parciales cuando: a) sin estar terminada la totalidad de la obra, la parte
              ejecutada se ajuste a lo convenido y pueda ser utilizada; b) “EL CLIENTE” determine
              suspender las obras y lo ejecutado se ajuste a lo pactado; c) de común acuerdo se
              convenga dar por terminado anticipadamente el contrato; d) “EL CLIENTE” rescinda
              administrativamente el contrato; e) la autoridad judicial declare rescindido el
              contrato. “EL CLIENTE” se reserva el derecho de reclamar por trabajos faltantes o mal
              ejecutados.
            </>
          }
        />

        <Clausula
          n="DÉCIMA SEGUNDA"
          titulo="REPRESENTANTE DE “EL CONTRATISTA”"
          texto={
            <>
              “EL CONTRATISTA” nombrará antes de la fecha de inicio de la obra un superintendente de
              construcción permanente, el cual deberá tener poder amplio y suficiente para tomar
              decisiones en todo lo relativo al cumplimiento de este contrato. “EL CLIENTE” se
              reserva el derecho de su aceptación, el cual podrá ejercer en cualquier tiempo.
            </>
          }
        />

        <Clausula
          n="DÉCIMA TERCERA"
          titulo="RELACIONES LABORALES"
          texto={
            <>
              “EL CONTRATISTA” es el único responsable de las obligaciones derivadas de las
              disposiciones legales y demás ordenamientos en materia de trabajo y de seguridad
              social. “EL CONTRATISTA” se obliga por lo mismo a responder de todas las reclamaciones
              que sus trabajadores presentaren en su contra o en contra de “EL CLIENTE” en relación
              con los trabajos que ampara este contrato.
            </>
          }
        />

        <Clausula
          n="DÉCIMA CUARTA"
          titulo="SUSPENSIÓN DEL CONTRATO"
          texto={
            <>
              “EL CLIENTE” podrá suspender temporal o definitivamente, en todo o en parte, la obra
              contratada en cualquier momento por causas justificadas o por razones de interés
              general. Cuando la suspensión sea temporal, el contrato podrá continuar produciendo
              todos sus efectos legales una vez que hayan desaparecido las causas que la motivaron.
              Cuando la suspensión sea definitiva será rescindido el presente contrato, pagando “EL
              CLIENTE” los trabajos ejecutados hasta el momento de la suspensión.
            </>
          }
        />

        <Clausula
          n="DÉCIMA QUINTA"
          titulo="TERMINACIÓN ADMINISTRATIVA DEL CONTRATO"
          texto={
            <>
              “EL CLIENTE” podrá en cualquier momento terminar administrativamente este contrato por
              causas de interés general. La contravención a las disposiciones, lineamientos, bases,
              procedimientos y requisitos que establece la Ley para el Estado y Municipios de
              Coahuila en relación a la materia, o el incumplimiento de cualquiera de las
              obligaciones de “EL CONTRATISTA”, dará motivo a su rescisión inmediata, sin
              responsabilidad para “EL CLIENTE”, además de que se le apliquen a “EL CONTRATISTA” las
              penas convencionales conforme a lo establecido en este contrato y se le haga efectiva
              la garantía otorgada para el cumplimiento del mismo.
            </>
          }
        />

        <Clausula
          n="DÉCIMA SEXTA"
          titulo="OTRAS ESTIPULACIONES ESPECÍFICAS"
          texto={
            <>
              1. Trabajos extraordinarios: cuando a juicio de “EL CLIENTE” sea necesario llevar a
              cabo conceptos o cantidades de trabajo no contemplados, se celebrará convenio
              modificatorio a precios unitarios; si se requieren nuevos conceptos, “EL CONTRATISTA”
              someterá los precios unitarios respectivos a consideración de “EL CLIENTE”, quien de
              no optar por esta solución podrá encomendar los trabajos a tercera persona. 2.
              Supervisión: “EL CLIENTE” tendrá derecho de supervisar en todo tiempo las obras y dará
              instrucciones por escrito; establecerá la residencia de supervisión y llevará la
              bitácora de la obra como único medio de comunicación oficial. 3. Modificaciones al
              programa, planos, especificaciones y variaciones de las cantidades de trabajo podrán
              ordenarse por escrito; si varía el importe total, las partes celebrarán convenio
              modificatorio. 4. Rescisión: operará de pleno derecho a favor de “EL CLIENTE” conforme
              al procedimiento pactado. 5. Procedimiento de rescisión: se comunicará a “EL
              CONTRATISTA” en forma fehaciente para que, en un plazo no mayor de 15 (quince) días
              hábiles, exponga lo que a su derecho convenga. 6. Personal y equipo: a cargo exclusivo
              de “EL CONTRATISTA”. 7. Maquinaria y herramienta: por cuenta de “EL CONTRATISTA”,
              quien retirará del lugar los elementos que no se encuentren en uso.
            </>
          }
        />

        <Clausula
          n="DÉCIMA SÉPTIMA"
          titulo="JURISDICCIÓN"
          texto={
            <>
              Para la interpretación y cumplimiento del presente contrato, así como para todo
              aquello que no esté estipulado, las partes se someten a la jurisdicción de los
              Tribunales del Estado de {JURISDICCION_OBRA.estado}, por lo que “EL CONTRATISTA”
              renuncia al fuero que pudiera corresponderle por razón de su domicilio presente,
              futuro o cualquier otra causa.
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
              vez que fue leído por las partes otorgantes y debidamente enteradas de su contenido y
              alcance legal, lo firman a su entera conformidad ante la presencia de dos testigos que
              dan fe de su celebración el día{' '}
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
});

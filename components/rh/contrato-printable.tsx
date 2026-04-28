'use client';

/**
 * ContratoPrintable — plantilla de Contrato Individual de Trabajo
 * parametrizada desde el contrato que DILESA ya tiene en uso
 * (Google Drive: Manuales/RH DILESA/CONTRATOS TRABAJO/CONTRATO NUEVO
 * TRABAJO DILESA.docx). Adapta la estructura legal con la que
 * Beto/abogado ya validaron y la enriquece con los datos capturados en
 * BSOP del empleado.
 *
 * ⚠️  DISCLAIMER LEGAL:
 *   La redacción base fue proporcionada por DILESA. Este render solo
 *   sustituye los placeholders del .docx con los datos del empleado y
 *   del patrón (la empresa que está usando el módulo). Cualquier cambio
 *   estructural a las cláusulas debe revisarse por abogado laboral
 *   antes de usarse en producción.
 *
 * `patron` es requerido — se construye desde `core.empresas` con
 * `buildPatronFromDatos` en `lib/rh/datos-fiscales-empresa.ts`. No hay
 * fallback: si la empresa no tiene datos completos, el caller debe
 * bloquear la generación y mostrar mensaje "captura tus datos fiscales".
 *
 * El CSS `@media print` oculta todo fuera del <article> al imprimir.
 */

import { composeFullName } from '@/lib/name-case';
import { formatMoneda } from '@/lib/hr/calcular-finiquito';

export interface ContratoEmpleado {
  // Persona
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  nacionalidad: string | null;
  sexo: string | null;
  estado_civil: string | null;
  fecha_nacimiento: string | null;
  lugar_nacimiento: string | null;
  rfc: string | null;
  curp: string | null;
  nss: string | null;
  domicilio: string | null;
  telefono: string | null;

  // Empleado
  numero_empleado: string | null;
  fecha_ingreso: string | null;
  tipo_contrato: string | null;
  periodo_prueba_dias: number | null;
  periodo_prueba_numero: number | null;
  horario: string | null;
  lugar_trabajo: string | null;
  dia_pago: string | null;
  funciones: string | null;
  puesto: string | null;
  departamento: string | null;

  // Compensación
  sueldo_mensual: number | null;
  sueldo_diario: number | null;

  // Beneficiarios
  beneficiarios: Array<{
    nombre: string;
    parentesco: string | null;
    porcentaje: number | null;
  }>;
}

export interface ContratoPatron {
  razonSocial: string;
  rfc: string;
  domicilio: string;
  registroPatronalImss: string;
  representanteLegal: string;
  escrituraConstitutiva: {
    numero: string;
    fecha: string; // ISO o texto legible
    notario: string;
    notariaNumero: string;
    distrito: string;
  };
  poderRepresentante: {
    numero: string;
    fecha: string; // ISO o texto legible
    notario: string;
    notariaNumero: string;
    distrito: string;
  };
}

function formatDateLarga(iso: string | null): string {
  if (!iso) return '__________________';
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
  return d.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function blank(v: string | number | null | undefined, placeholder = '__________________'): string {
  if (v === null || v === undefined || v === '') return placeholder;
  return String(v);
}

const TIPO_CONTRATO_TITULO: Record<string, string> = {
  indefinido: 'POR TIEMPO INDETERMINADO',
  determinado: 'POR TIEMPO DETERMINADO',
  obra: 'POR OBRA DETERMINADA',
  temporada: 'POR TEMPORADA',
  capacitacion_inicial: 'DE CAPACITACIÓN INICIAL',
  prueba: 'SUJETO A PERIODO DE PRUEBA',
};

export function ContratoPrintable({
  empleado,
  patron,
  fechaContrato,
  vigenciaInicio,
  vigenciaFin,
}: {
  empleado: ContratoEmpleado;
  patron: ContratoPatron;
  /** Fecha en que se firma el contrato (default hoy). */
  fechaContrato?: string;
  /** Fecha de inicio de vigencia (default = fecha_ingreso). */
  vigenciaInicio?: string;
  /** Fecha de fin (para contratos por tiempo determinado; default = 30 días después del inicio). */
  vigenciaFin?: string;
}) {
  const fechaHoy = fechaContrato ?? new Date().toISOString().split('T')[0];
  const nombreCompleto = composeFullName(
    empleado.nombre,
    empleado.apellido_paterno,
    empleado.apellido_materno
  );

  const tipo = empleado.tipo_contrato ?? 'determinado';
  const tituloTipo = TIPO_CONTRATO_TITULO[tipo] ?? 'POR TIEMPO DETERMINADO';
  const esDeterminado = tipo === 'determinado' || tipo === 'obra' || tipo === 'temporada';
  const esPrueba = tipo === 'prueba';

  const inicio = vigenciaInicio ?? empleado.fecha_ingreso ?? fechaHoy;
  // Por default, contratos de DILESA son de 1 mes (30 días).
  const fin =
    vigenciaFin ??
    (() => {
      const d = new Date(inicio);
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();

  const sueldoDiarioTexto =
    empleado.sueldo_diario != null
      ? `${formatMoneda(empleado.sueldo_diario)} (${numeroAMoneda(empleado.sueldo_diario)} Moneda Nacional)`
      : '$ __________________ (__________________ Moneda Nacional)';

  return (
    <article className="contrato-print-root max-w-[800px] mx-auto p-10 text-[13px] leading-relaxed text-black bg-white">
      <style>{`
        .contrato-print-root { font-family: 'Times New Roman', Times, serif; color: #000; font-size: 12px; line-height: 1.55; }
        .contrato-print-root h1 { text-align: center; font-size: 13px; font-weight: bold; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.3px; }
        .contrato-print-root .divider { text-align: center; letter-spacing: 2px; margin: 10px 0; font-weight: bold; }
        .contrato-print-root p { margin: 6px 0; text-align: justify; }
        .contrato-print-root .declara-title { font-weight: bold; margin-top: 8px; }
        .contrato-print-root ul { margin: 4px 0 4px 24px; padding: 0; list-style: disc; }
        .contrato-print-root ol { margin: 4px 0 4px 24px; padding: 0; }
        .contrato-print-root li { margin: 3px 0; text-align: justify; }
        .contrato-print-root .clausula { margin: 10px 0; text-align: justify; }
        .contrato-print-root .clausula strong { font-weight: bold; }
        .contrato-print-root .firmas { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .contrato-print-root .firma { border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 11px; }
        .contrato-print-root strong { font-weight: bold; }
        .contrato-print-root em { font-style: italic; }
        @media print {
          body * { visibility: hidden !important; }
          .contrato-print-root, .contrato-print-root * { visibility: visible !important; }
          .contrato-print-root { position: absolute; left: 0; top: 0; width: 100%; max-width: none; margin: 0; padding: 22mm 18mm; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>

      <h1>Contrato Individual de Trabajo {tituloTipo}</h1>

      <p>
        Que celebran por una parte <strong>{patron.razonSocial}</strong> a quien en lo sucesivo se
        le denominará <strong>«EL PATRÓN»</strong> representada en este acto por el{' '}
        <strong>{patron.representanteLegal}</strong>, representante legal de la sociedad y que más
        adelante justifica su personalidad; y por la otra el C.{' '}
        <strong>{blank(nombreCompleto)}</strong>, a quien en lo sucesivo se le denominará como{' '}
        <strong>«EL TRABAJADOR»</strong>, y a ambos como <strong>«LAS PARTES»</strong> al tenor de
        las siguientes declaraciones y cláusulas:
      </p>

      <div className="divider">— — — — D E C L A R A C I O N E S — — — —</div>

      <p className="declara-title">«EL PATRÓN» Manifiesta y Declara:</p>
      <ul>
        <li>
          Que justifica su existencia y personalidad del representante legal, así como declara ser
          una persona cuyo objeto es la de prestar servicios de personal tal y como lo justifica con
          la Escritura Pública <strong>{patron.escrituraConstitutiva.numero}</strong> de fecha{' '}
          {patron.escrituraConstitutiva.fecha}, pasada ante la fe del{' '}
          {patron.escrituraConstitutiva.notario}, Notario Público{' '}
          {patron.escrituraConstitutiva.notariaNumero} del Distrito Notarial de{' '}
          {patron.escrituraConstitutiva.distrito}, misma. Compareciendo en este acto su
          representante legal el <strong>{patron.representanteLegal}</strong> quien acredita poder
          general para pleitos y cobranzas, actos de administración, especial laboral y cambiario o
          bancario, mediante escritura pública <strong>{patron.poderRepresentante.numero}</strong>{' '}
          con fecha {patron.poderRepresentante.fecha} pasada ante la fe del{' '}
          {patron.poderRepresentante.notario}, notario público número{' '}
          {patron.poderRepresentante.notariaNumero} del distrito notarial{' '}
          {patron.poderRepresentante.distrito}.
        </li>
        <li>Que su domicilio está ubicado en {patron.domicilio}.</li>
        <li>
          Que su RFC es el <strong>{patron.rfc}</strong>.
        </li>
        <li>
          Que su registro patronal ante el IMSS es el <strong>{patron.registroPatronalImss}</strong>
          .
        </li>
      </ul>

      <p className="declara-title">
        «EL TRABAJADOR» por sus propios derechos Manifiesta y declara:
      </p>
      <ul>
        <li>
          Llamarse <strong>{blank(nombreCompleto)}</strong>, ser de nacionalidad{' '}
          <strong>{blank(empleado.nacionalidad, 'Mexicana')}</strong>, sexo{' '}
          <strong>{blank(empleado.sexo)}</strong>, estado civil{' '}
          <strong>{blank(empleado.estado_civil)}</strong>.
        </li>
        <li>
          Haber nacido el <strong>{formatDateLarga(empleado.fecha_nacimiento)}</strong> en{' '}
          <strong>{blank(empleado.lugar_nacimiento)}</strong>.
        </li>
        <li>
          Tener el RFC <strong>{blank(empleado.rfc)}</strong>, CURP{' '}
          <strong>{blank(empleado.curp)}</strong>, el número de Seguridad Social{' '}
          <strong>{blank(empleado.nss)}</strong>.
        </li>
        <li>
          Que tiene su domicilio en <strong>{blank(empleado.domicilio)}</strong>.
        </li>
        <li>
          Que desempeñará el puesto de{' '}
          <strong>{blank((empleado.puesto ?? '').toUpperCase())}</strong>, que tiene los
          Conocimientos, Habilidades, Capacidades y las Aptitudes necesarias para desarrollar el
          trabajo origen de este contrato.
        </li>
        <li>
          Estar de acuerdo en desempeñar su actividad conforme a las condiciones establecidas en
          este contrato.
        </li>
        <li>Manifiesta que NO tiene crédito otorgado por INFONAVIT.</li>
      </ul>

      <p>
        Por lo anterior, las partes han convenido celebrar el presente contrato al tenor de las
        siguientes:
      </p>

      <div className="divider">— — — — C L Á U S U L A S — — — —</div>

      <p className="clausula">
        <strong>PRIMERA.</strong> El presente contrato se celebra{' '}
        {esDeterminado
          ? 'por tiempo determinado'
          : esPrueba
            ? `sujeto a un periodo de prueba conforme al Art. 39-A LFT`
            : 'por tiempo indeterminado'}
        , con vigencia del <strong>{formatDateLarga(inicio)}</strong>
        {esDeterminado || esPrueba ? (
          <>
            {' '}
            al <strong>{formatDateLarga(fin)}</strong>
          </>
        ) : null}
        , para efectos de antigüedad se le reconoce en el presente contrato la fecha del{' '}
        <strong>{formatDateLarga(empleado.fecha_ingreso)}</strong>, por así requerirlo el trabajo
        objeto de este, el cual es para desarrollar el puesto de{' '}
        <strong>{blank((empleado.puesto ?? '').toUpperCase())}</strong>.
        {esPrueba && empleado.periodo_prueba_dias && (
          <>
            {' '}
            Las partes convienen que este periodo de prueba tendrá una duración de{' '}
            <strong>{empleado.periodo_prueba_dias} días naturales</strong> y es el número{' '}
            <strong>{empleado.periodo_prueba_numero ?? 1}</strong> (de hasta 3 permitidos por
            política interna de la empresa antes de otorgar planta).
          </>
        )}
      </p>

      <p className="clausula">
        <strong>SEGUNDA.</strong> «LAS PARTES» manifiestan y aceptan que el presente contrato
        subsistirá por el tiempo necesario para la prestación del servicio señalada en la cláusula
        que antecede siempre y cuando el trabajador acredite los Conocimientos, Habilidades,
        Capacidades, Aptitudes y Actitudes necesarias para la realización de sus actividades de
        manera positivas y además realice con eficiencia y eficacia sus funciones y actividades
        definidas por «EL PATRÓN», para la prestación del servicio para el que fue contratado. En
        caso contrario se aplicarán las disposiciones de la Ley Federal del Trabajo vigente.
      </p>

      <p className="clausula">
        <strong>TERCERA.</strong> El presente contrato obliga a lo expresamente pactado conforme a
        las disposiciones contenidas en el artículo 31 de la Ley Laboral, y la duración de este será
        la señalada en la cláusula segunda, por lo que al concluirse dichos trabajos las partes
        contratantes lo darán por terminado con apoyo en el numeral antes mencionado e igualmente en
        los artículos 35, 36, 53 fracción III y demás relativos de la citada Ley Federal del
        Trabajo.
      </p>

      <p className="clausula">
        <strong>CUARTA.</strong> «EL TRABAJADOR» se obliga a prestar sus servicios como{' '}
        <strong>{blank((empleado.puesto ?? '').toUpperCase())}</strong>, realizando las funciones y
        actividades inherentes o necesarias para la prestación del trabajo que presta a «EL PATRÓN»
        como lo es:{' '}
        {empleado.funciones ? (
          <em>{empleado.funciones}</em>
        ) : (
          <strong>{blank((empleado.puesto ?? '').toUpperCase())}</strong>
        )}
        , siendo las actividades anteriores enunciativas mas no limitativas; al presente contrato se
        anexa adenda del perfil de puesto con las actividades completas que se obliga «EL
        TRABAJADOR» a prestar. Éste prestará sus servicios en{' '}
        <strong>{blank(empleado.lugar_trabajo, 'el domicilio de «EL PATRÓN»')}</strong> o en
        cualquier otro municipio del Estado de Coahuila de Zaragoza y/o en cualquier otra entidad de
        la República Mexicana, previa notificación.
      </p>

      <p className="clausula">
        <strong>QUINTA.</strong> El horario de labores de «EL TRABAJADOR» será en base a un rol que
        se determinará por la empresa y se le comunicará al trabajador dentro de las siguientes
        jornadas: la <strong>Diurna</strong> que será de ocho horas, que podrá comprender de las
        6:00 horas a 20:00 horas; la <strong>Jornada Nocturna</strong>, que será de siete horas,
        comprenderá de 23:00 horas a las 6:00 horas; y la <strong>Jornada Mixta</strong> será de
        siete horas y media, comprenderá parte de la jornada diurna y parte de la jornada nocturna
        que no podrá exceder en ningún caso más de tres horas y media de la jornada nocturna. Dentro
        de las siguientes jornadas se establecerán los horarios de trabajo.
        {empleado.horario && (
          <>
            {' '}
            Para el presente contrato, el horario específico acordado es:{' '}
            <strong>{empleado.horario}</strong>.
          </>
        )}
      </p>

      <p className="clausula">
        <strong>SEXTA.</strong> «EL TRABAJADOR» tendrá derecho a un día de descanso semanal, el cual
        se acuerda por «LAS PARTES» que será preferentemente el día domingo, conviniendo «EL
        TRABAJADOR» con «EL PATRÓN» que en cualquier momento el mismo puede ser modificado de
        acuerdo con las necesidades de «EL CLIENTE» al que se presta el servicio, pudiendo «EL
        PATRÓN» establecer dicho horario bajo cualquiera de las modalidades señaladas en el artículo
        59 de la Ley Federal del Trabajo, ya sea para implantar una labor semanaria de lunes a
        viernes y obtener el reposo del sábado en la tarde; al establecerse estas jornadas las horas
        trabajadas en exceso no se considerarán tiempo extra por ser complemento de la jornada
        normal. Así mismo se podrá acordar cualquier otra modalidad equivalente. El trabajador
        disfrutará de <strong>1 hora y media</strong> para la toma de sus alimentos.
      </p>

      <p className="clausula">
        <strong>SÉPTIMA.</strong> «EL TRABAJADOR» disfrutará de un salario diario de{' '}
        <strong>{sueldoDiarioTexto}</strong>, el cual le será cubierto{' '}
        <strong>{blank(empleado.dia_pago, 'cada día jueves de cada decena')}</strong> en el
        domicilio de «EL PATRÓN» o en su caso podrá ser por medio de depósito bancario a disposición
        del trabajador a costo de la empresa, más la proporción correspondiente al séptimo día y día
        de descanso obligatorio.
      </p>
      <p className="clausula">
        «EL PATRÓN» hará por cuenta de «EL TRABAJADOR» las deducciones legales correspondientes,
        particularmente las que se refieren a Impuesto sobre la Renta, y aportaciones de Seguridad
        Social (IMSS, créditos de INFONAVIT, SAR y FONACOT), enterando las retenciones
        correspondientes ante dichas instituciones, así como las retenciones extraordinarias
        dictadas por una autoridad judicial en los términos de las legislaciones respectivas.
      </p>

      <p className="clausula">
        <strong>OCTAVA.</strong> «EL TRABAJADOR» no podrá laborar tiempo extraordinario de trabajo,
        sin previa autorización por escrito que «EL PATRÓN» le otorgue por conducto de sus
        representantes. Cuando por causas extraordinarias, «EL TRABAJADOR» deberá de quedarse a
        laborar el tiempo extra que se requiera conforme a lo que señala la Ley Federal del Trabajo.
      </p>

      <p className="clausula">
        <strong>NOVENA.</strong> «EL TRABAJADOR» tendrá derecho al pago de vacaciones y prima
        vacacional proporcionales de acuerdo con el servicio prestado, al vencimiento del presente
        contrato en los términos señalados en el artículo 76 de la Ley Federal del Trabajo.
      </p>

      <p className="clausula">
        <strong>DÉCIMA.</strong> «EL TRABAJADOR» percibirá un aguinaldo proporcional anual de 15
        días de salario, el cual se cubrirá al término de los servicios prestados a «EL PATRÓN»
        durante dicho período.
      </p>

      <p className="clausula">
        <strong>DÉCIMA PRIMERA.</strong> «EL TRABAJADOR» se obliga en términos de la fracción X del
        artículo 134 de la Ley Federal del Trabajo, a someterse a los reconocimientos y exámenes
        médicos que «EL PATRÓN» le indique.
      </p>

      <p className="clausula">
        <strong>DÉCIMA SEGUNDA.</strong> «EL TRABAJADOR» se obliga a participar en los cursos de
        capacitación y adiestramiento que «EL PATRÓN» establezca en los Planes de Capacitación y
        Adiestramiento para el mejor conocimiento y desarrollo de sus aptitudes, mismos que podrán
        impartirse dentro y/o fuera de la jornada de labores.
      </p>

      <p className="clausula">
        <strong>DÉCIMA TERCERA.</strong> «EL TRABAJADOR» se obliga a observar las medidas de
        seguridad e higiene que determine «EL PATRÓN» o las autoridades del sector salud y respetar
        las disposiciones del Reglamento Interior de Trabajo que rige en los establecimientos donde
        se preste los servicios «EL PATRÓN».
      </p>

      <p className="clausula">
        <strong>DÉCIMA CUARTA.</strong> «EL PATRÓN» entregará a «EL TRABAJADOR» las herramientas o
        Kit de trabajo bajo vale de resguardo haciéndose responsable el trabajador bajo su custodia,
        y «EL PATRÓN» repondrá el equipo o herramienta dañada por el uso normal del trabajo.
      </p>

      <p className="clausula">
        <strong>DÉCIMA QUINTA.</strong> «EL TRABAJADOR» se obliga a no utilizar su teléfono celular
        por cuestiones de seguridad. Así mismo, «EL TRABAJADOR» se compromete a otorgar un excelente
        servicio al cliente de calidad.
      </p>

      <p className="clausula">
        <strong>DÉCIMA SEXTA.</strong> «EL TRABAJADOR» en este acto realiza la designación de
        beneficiarios a los que refiere el artículo 501 de la Ley Federal del Trabajo, para efectos
        del pago de los salarios y prestaciones devengadas y no cobradas a la muerte de los
        trabajadores o las que se generen por su fallecimiento o desaparición derivada de un acto
        delincuencial, siendo la(s) persona(s) beneficiaria(s):
      </p>
      {empleado.beneficiarios.length === 0 ? (
        <ol>
          <li>1.- __________________________________________________ ____%</li>
          <li>2.- __________________________________________________ ____%</li>
        </ol>
      ) : (
        <ol>
          {empleado.beneficiarios.map((b, i) => (
            <li key={i}>
              {i + 1}.- <strong>{b.nombre}</strong>
              {b.parentesco ? ` (${b.parentesco})` : ''}
              {b.porcentaje != null ? ` — ${b.porcentaje}%` : ''}
            </li>
          ))}
        </ol>
      )}

      <p className="clausula">
        <strong>DÉCIMA SÉPTIMA.</strong> Lo no previsto por este contrato se regirá por las
        disposiciones previstas en la Ley Federal del Trabajo, así como por el Reglamento Interior
        de Trabajo que rige en los establecimientos donde preste los servicios «EL PATRÓN».
      </p>

      <p className="clausula">
        «LAS PARTES» aceptan expresamente que, en caso de existir controversias legales en cualquier
        materia entre ambas partes, se someterán a los tribunales del domicilio de «EL PATRÓN».
      </p>

      <p className="clausula" style={{ marginTop: 16 }}>
        Leído que fue el presente contrato por quienes en él intervienen, lo ratifican en todas y
        cada una de sus partes y lo suscriben a su más entera conformidad por duplicado, en la
        ciudad de Piedras Negras, Coahuila de Zaragoza, México, el{' '}
        <strong>{formatDateLarga(fechaHoy)}</strong>.
      </p>

      <div className="firmas">
        <div>
          <div className="firma">
            <div className="mb-1">{nombreCompleto}</div>
            <div className="text-[11px]">{empleado.rfc ?? ''}</div>
            <div className="text-[11px] italic mt-0.5">«EL TRABAJADOR»</div>
          </div>
        </div>
        <div>
          <div className="firma">
            <div className="mb-1">{patron.representanteLegal}</div>
            <div className="text-[11px]">{patron.razonSocial}</div>
            <div className="text-[11px] italic mt-0.5">«EL PATRÓN»</div>
          </div>
        </div>
      </div>

      <div className="firmas" style={{ marginTop: 32 }}>
        <div>
          <div className="firma">
            <div className="mb-1">__________________________</div>
            <div className="text-[11px] italic">TESTIGO</div>
          </div>
        </div>
        <div>
          <div className="firma">
            <div className="mb-1">__________________________</div>
            <div className="text-[11px] italic">TESTIGO</div>
          </div>
        </div>
      </div>

      <div className="mt-8 text-[10px] text-gray-500 border-t pt-2 no-print">
        <p>
          <strong>Nota:</strong> Documento generado por BSOP a partir de la plantilla validada por
          DILESA (CONTRATO NUEVO TRABAJO DILESA.docx). Verifica que los datos del empleado y del
          patrón estén completos antes de imprimir. Generado el {formatDateLarga(fechaHoy)}.
        </p>
      </div>
    </article>
  );
}

/**
 * Convierte número a letra para el salario (es-MX). Implementación chica
 * suficiente para cantidades de sueldos (hasta ~99,999.99).
 */
function numeroAMoneda(n: number): string {
  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  const enteroTexto = numeroALetras(entero);
  return `${enteroTexto} pesos ${String(centavos).padStart(2, '0')}/100`;
}

const UNIDADES = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
];
const DECENAS = [
  '',
  '',
  'VEINTI',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

function numeroALetras(n: number): string {
  if (n === 0) return 'CERO';
  if (n === 100) return 'CIEN';
  if (n <= 20) return UNIDADES[n];
  if (n < 30) return `VEINTI${UNIDADES[n - 20].toLowerCase()}`.toUpperCase();
  if (n < 100) {
    const dec = Math.floor(n / 10);
    const uni = n % 10;
    return uni === 0 ? DECENAS[dec] : `${DECENAS[dec]} Y ${UNIDADES[uni]}`;
  }
  if (n < 1000) {
    const cen = Math.floor(n / 100);
    const resto = n % 100;
    return resto === 0 ? CENTENAS[cen] : `${CENTENAS[cen]} ${numeroALetras(resto)}`;
  }
  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const milesTexto = miles === 1 ? 'MIL' : `${numeroALetras(miles)} MIL`;
    return resto === 0 ? milesTexto : `${milesTexto} ${numeroALetras(resto)}`;
  }
  return String(n); // Fallback para números muy grandes (no esperados en sueldos)
}

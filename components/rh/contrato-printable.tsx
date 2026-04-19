'use client';

/**
 * ContratoPrintable — plantilla de contrato individual de trabajo conforme
 * al Art. 25 de la Ley Federal del Trabajo (México).
 *
 * ⚠️  DISCLAIMER LEGAL:
 *   Esta plantilla es un borrador generado a partir de los requisitos
 *   mínimos del Art. 25 LFT. DEBE ser revisada y firmada por un abogado
 *   laboral antes de usarse con un empleado real. BSOP / Claude no
 *   sustituye asesoría profesional. DILESA asume la responsabilidad de
 *   la redacción final, cláusulas adicionales, y cumplimiento específico
 *   al caso (tipo de contrato, riesgo del trabajo, capacitación, etc.).
 *
 * El contenido está estructurado en secciones numeradas. El CSS
 * `@media print` en `contrato-print.css` (global) oculta el app-shell y
 * deja sólo esta plantilla para impresión.
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
  beneficiarios: Array<{ nombre: string; parentesco: string | null; porcentaje: number | null }>;
}

export interface ContratoPatron {
  razonSocial: string;
  rfc: string;
  domicilio: string;
  representanteLegal: string;
  cargoRepresentante: string;
  giro: string;
}

// Patrón DILESA — valores por default. Si después necesitamos otro empresa
// con datos distintos, parametrizamos desde la pg.
export const PATRON_DILESA: ContratoPatron = {
  razonSocial: 'Desarrollos Inmobiliarios de la Laguna, S.A. de C.V.',
  rfc: 'DIL000000XXX', // ⚠️ REEMPLAZAR con RFC real de DILESA
  domicilio:
    'Av. ________________________, Col. ________________, Piedras Negras, Coahuila, C.P. 26000',
  representanteLegal: 'Adalberto Santos de los Santos',
  cargoRepresentante: 'Administrador Único',
  giro: 'Desarrollo inmobiliario y construcción',
};

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

const TIPO_CONTRATO_TEXTO: Record<string, string> = {
  indefinido: 'por tiempo indeterminado',
  determinado: 'por tiempo determinado',
  obra: 'por obra determinada',
  temporada: 'por temporada',
  capacitacion_inicial: 'de capacitación inicial',
  prueba: 'sujeto a periodo de prueba',
};

export function ContratoPrintable({
  empleado,
  patron = PATRON_DILESA,
  fechaContrato,
}: {
  empleado: ContratoEmpleado;
  patron?: ContratoPatron;
  fechaContrato?: string;
}) {
  const fechaHoy = fechaContrato ?? new Date().toISOString().split('T')[0];
  const nombreCompleto = composeFullName(
    empleado.nombre,
    empleado.apellido_paterno,
    empleado.apellido_materno
  );

  const tipoTexto =
    empleado.tipo_contrato && TIPO_CONTRATO_TEXTO[empleado.tipo_contrato]
      ? TIPO_CONTRATO_TEXTO[empleado.tipo_contrato]
      : 'por tiempo indeterminado';

  const esPrueba = empleado.tipo_contrato === 'prueba';

  return (
    <article className="contrato-print-root max-w-[800px] mx-auto p-10 text-[13px] leading-relaxed text-black bg-white">
      <style>{`
        .contrato-print-root { font-family: 'Times New Roman', Times, serif; color: #000; }
        .contrato-print-root h1 { text-align: center; font-size: 15px; font-weight: bold; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .contrato-print-root h2 { font-size: 13px; font-weight: bold; margin: 14px 0 6px; text-transform: uppercase; }
        .contrato-print-root p { margin: 6px 0; text-align: justify; }
        .contrato-print-root ol, .contrato-print-root ul { margin: 4px 0 4px 24px; padding: 0; }
        .contrato-print-root li { margin: 3px 0; text-align: justify; }
        .contrato-print-root .firmas { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .contrato-print-root .firma { border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 11px; }
        .contrato-print-root .datos-box { border: 1px solid #000; padding: 8px 10px; margin: 8px 0; font-size: 12px; }
        .contrato-print-root strong { font-weight: bold; }
        @media print {
          body * { visibility: hidden !important; }
          .contrato-print-root, .contrato-print-root * { visibility: visible !important; }
          .contrato-print-root { position: absolute; left: 0; top: 0; width: 100%; max-width: none; margin: 0; padding: 24mm 18mm; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>

      <h1>Contrato individual de trabajo</h1>
      <p className="text-center text-[11px]">
        Celebrado al amparo de los artículos 24, 25, 35 y demás relativos de la Ley Federal del
        Trabajo vigente en los Estados Unidos Mexicanos.
      </p>

      <p>
        En la ciudad de Piedras Negras, Coahuila de Zaragoza, a los{' '}
        <strong>{formatDateLarga(fechaHoy)}</strong>, comparecen por una parte{' '}
        <strong>{patron.razonSocial}</strong>, con Registro Federal de Contribuyentes{' '}
        <strong>{patron.rfc}</strong>, con domicilio en <strong>{patron.domicilio}</strong>, cuyo
        giro es <em>{patron.giro}</em>, representada en este acto por su{' '}
        <strong>{patron.cargoRepresentante}</strong>, el señor(a){' '}
        <strong>{patron.representanteLegal}</strong>, a quien en lo sucesivo se le denominará{' '}
        <strong>«EL PATRÓN»</strong>; y por la otra parte el señor(a){' '}
        <strong>{blank(nombreCompleto)}</strong>, a quien en lo sucesivo se le denominará{' '}
        <strong>«EL TRABAJADOR»</strong>, al tenor de las siguientes declaraciones y cláusulas:
      </p>

      <h2>Declaraciones</h2>

      <p>
        <strong>I. Declara EL TRABAJADOR:</strong>
      </p>
      <div className="datos-box">
        <p>
          <strong>Nombre completo:</strong> {blank(nombreCompleto)}
        </p>
        <p>
          <strong>Nacionalidad:</strong> {blank(empleado.nacionalidad)} · <strong>Sexo:</strong>{' '}
          {blank(empleado.sexo)} · <strong>Estado civil:</strong> {blank(empleado.estado_civil)}
        </p>
        <p>
          <strong>Fecha de nacimiento:</strong> {formatDateLarga(empleado.fecha_nacimiento)} ·{' '}
          <strong>Lugar:</strong> {blank(empleado.lugar_nacimiento)}
        </p>
        <p>
          <strong>CURP:</strong> {blank(empleado.curp)} · <strong>RFC:</strong>{' '}
          {blank(empleado.rfc)} · <strong>NSS:</strong> {blank(empleado.nss)}
        </p>
        <p>
          <strong>Domicilio:</strong> {blank(empleado.domicilio)}
        </p>
        <p>
          <strong>Teléfono:</strong> {blank(empleado.telefono)}
        </p>
        {empleado.numero_empleado && (
          <p>
            <strong>No. de empleado:</strong> {empleado.numero_empleado}
          </p>
        )}
        <p className="mt-2 text-[11px]">
          Declara bajo protesta de decir verdad que los datos asentados son correctos, que cuenta
          con la capacidad física y mental para desempeñar el trabajo contratado, y que acepta
          libremente las condiciones que se estipulan.
        </p>
      </div>

      <p>
        <strong>II. Declara EL PATRÓN:</strong>
      </p>
      <p>
        Ser una sociedad legalmente constituida conforme a las leyes mexicanas, contar con la
        capacidad jurídica y administrativa para celebrar este contrato, y requerir los servicios
        personales subordinados del TRABAJADOR para desempeñar el puesto y funciones que más
        adelante se describen.
      </p>

      <h2>Cláusulas</h2>

      <p>
        <strong>PRIMERA. Objeto.</strong> EL TRABAJADOR se obliga a prestar a EL PATRÓN sus
        servicios personales subordinados en el puesto de <strong>{blank(empleado.puesto)}</strong>
        {empleado.departamento ? (
          <>
            , adscrito al departamento de <strong>{empleado.departamento}</strong>
          </>
        ) : null}
        , desempeñando las siguientes funciones de manera enunciativa más no limitativa:
      </p>
      <div className="datos-box">
        {empleado.funciones ? (
          empleado.funciones.split('\n').map((l, i) => (
            <p key={i} className="mb-1">
              {l}
            </p>
          ))
        ) : (
          <p className="text-[11px] italic">
            [Detallar funciones específicas del puesto — Art. 25-III LFT exige precisión máxima.]
          </p>
        )}
      </div>

      <p>
        <strong>SEGUNDA. Duración.</strong> El presente contrato es <strong>{tipoTexto}</strong>{' '}
        (Art. {empleado.tipo_contrato === 'prueba' ? '39-A' : '35'} LFT).
        {esPrueba && (
          <>
            {' '}
            Las partes convienen un periodo de prueba de{' '}
            <strong>{blank(empleado.periodo_prueba_dias, '30')} días</strong> naturales contados a
            partir de la fecha de inicio de labores. Es el periodo de prueba número{' '}
            <strong>{blank(empleado.periodo_prueba_numero, '1')}</strong> (de hasta 3 permitidos por
            la política interna de DILESA antes de otorgar planta). Durante este periodo, si a
            juicio del patrón EL TRABAJADOR no acredita competencia para el puesto, la relación se
            da por terminada sin responsabilidad para el patrón (Art. 39-A párrafo segundo). De
            acreditarse competencia al término de este periodo, la relación se convertirá en{' '}
            <strong>por tiempo indeterminado</strong>.
          </>
        )}
      </p>

      <p>
        <strong>TERCERA. Fecha de inicio.</strong> La prestación de servicios iniciará el día{' '}
        <strong>{formatDateLarga(empleado.fecha_ingreso)}</strong>.
      </p>

      <p>
        <strong>CUARTA. Lugar de trabajo.</strong> EL TRABAJADOR prestará sus servicios en{' '}
        <strong>{blank(empleado.lugar_trabajo)}</strong> (Art. 25-IV LFT), pudiendo ser comisionado
        temporalmente a otras instalaciones o proyectos de EL PATRÓN dentro de la misma zona
        geográfica cuando las necesidades del servicio lo requieran.
      </p>

      <p>
        <strong>QUINTA. Jornada y horario.</strong> La jornada es{' '}
        <strong>{blank(empleado.horario)}</strong>. El tiempo destinado al alimento se cuenta como
        tiempo de descanso cuando EL TRABAJADOR permanece en el centro de trabajo (Art. 63 LFT). Los
        días de descanso obligatorios son los previstos en el Art. 74 LFT.
      </p>

      <p>
        <strong>SEXTA. Salario.</strong> EL PATRÓN pagará a EL TRABAJADOR un salario mensual de{' '}
        <strong>
          {empleado.sueldo_mensual != null
            ? formatMoneda(empleado.sueldo_mensual)
            : '__________________'}
        </strong>{' '}
        M.N.
        {empleado.sueldo_diario != null && (
          <>
            {' '}
            (equivalente a <strong>{formatMoneda(empleado.sueldo_diario)}</strong> diarios).
          </>
        )}{' '}
        El pago se realizará los{' '}
        <strong>{blank(empleado.dia_pago, 'días viernes de cada quincena')}</strong>.
      </p>

      <p>
        <strong>SÉPTIMA. Prestaciones.</strong> EL TRABAJADOR gozará de las prestaciones mínimas
        previstas en la LFT: aguinaldo anual de cuando menos 15 días de salario (Art. 87),
        vacaciones conforme a la tabla del Art. 76 (12 días el primer año con incrementos
        escalonados), prima vacacional del 25% sobre el salario de vacaciones (Art. 80),
        participación en las utilidades (PTU) conforme a la ley (Art. 117), y el alta ante el
        Instituto Mexicano del Seguro Social, INFONAVIT y SAR.
      </p>

      <p>
        <strong>OCTAVA. Capacitación y adiestramiento.</strong> EL PATRÓN se obliga a proporcionar a
        EL TRABAJADOR la capacitación y adiestramiento que requiera para el desempeño del puesto,
        conforme a los planes y programas que al efecto se establezcan (Art. 25-VIII LFT).
      </p>

      <p>
        <strong>NOVENA. Confidencialidad.</strong> EL TRABAJADOR se obliga a guardar absoluta
        reserva sobre la información, documentos, datos de clientes, proveedores, estrategias
        comerciales y secretos industriales a los que tenga acceso con motivo de la relación de
        trabajo, durante la vigencia de este contrato y después de su terminación.
      </p>

      <p>
        <strong>DÉCIMA. Reglamento interior.</strong> EL TRABAJADOR declara conocer y aceptar el
        Reglamento Interior de Trabajo de EL PATRÓN, comprometiéndose a su cumplimiento, así como a
        todas las políticas internas que se le notifiquen en forma documentada.
      </p>

      <p>
        <strong>DÉCIMA PRIMERA. Causales de rescisión.</strong> Son causales de rescisión sin
        responsabilidad para EL PATRÓN las previstas en el Art. 47 de la LFT. Sin limitación de las
        anteriores, son consideradas faltas graves el abandono del trabajo por más de 3 días sin
        causa justificada dentro de un periodo de 30 días, el incurrir en violencia verbal o física
        contra compañeros o superiores, y el quebranto de la confidencialidad pactada en la cláusula
        anterior.
      </p>

      <p>
        <strong>DÉCIMA SEGUNDA. Designación de beneficiarios.</strong> De conformidad con el Art.
        501 LFT, EL TRABAJADOR designa como beneficiarios de las prestaciones y salarios no cobrados
        en caso de su fallecimiento a las siguientes personas:
      </p>
      <div className="datos-box">
        {empleado.beneficiarios.length === 0 ? (
          <p className="text-[11px] italic">
            [Sin beneficiarios designados — capturar antes de firmar.]
          </p>
        ) : (
          <ol>
            {empleado.beneficiarios.map((b, i) => (
              <li key={i}>
                <strong>{b.nombre}</strong>
                {b.parentesco ? ` (${b.parentesco})` : ''}
                {b.porcentaje != null ? ` — ${b.porcentaje}%` : ''}
              </li>
            ))}
          </ol>
        )}
      </div>

      <p>
        <strong>DÉCIMA TERCERA. Jurisdicción.</strong> Para la interpretación y cumplimiento de este
        contrato, las partes se someten a la jurisdicción del Centro Federal de Conciliación y
        Registro Laboral y de los Tribunales Laborales del Estado de Coahuila, renunciando a
        cualquier otro fuero que por razón de domicilio actual o futuro pudiera corresponderles.
      </p>

      <p className="mt-4">
        Leído y entendido el presente contrato por ambas partes, lo firman por duplicado a los{' '}
        <strong>{formatDateLarga(fechaHoy)}</strong>, quedando un ejemplar en poder de cada parte
        (Art. 24 LFT).
      </p>

      <div className="firmas">
        <div>
          <div className="firma">
            <div className="mb-1">{patron.representanteLegal}</div>
            <div className="text-[11px]">
              {patron.cargoRepresentante} de {patron.razonSocial}
            </div>
            <div className="text-[11px] italic mt-0.5">EL PATRÓN</div>
          </div>
        </div>
        <div>
          <div className="firma">
            <div className="mb-1">{nombreCompleto}</div>
            <div className="text-[11px]">{empleado.rfc ?? ''}</div>
            <div className="text-[11px] italic mt-0.5">EL TRABAJADOR</div>
          </div>
        </div>
      </div>

      <div className="firmas mt-6">
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
          <strong>Nota legal:</strong> Documento generado por BSOP como borrador del contrato
          individual de trabajo. Debe ser revisado por abogado laboral antes de firmarse. No
          sustituye asesoría profesional. Versión basada en LFT vigente al{' '}
          {formatDateLarga(fechaHoy)}.
        </p>
      </div>
    </article>
  );
}

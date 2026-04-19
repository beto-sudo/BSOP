'use client';

/**
 * FiniquitoPrintable — convenio de terminación laboral y finiquito conforme
 * a LFT Art. 53 (causas de terminación), 87 (aguinaldo), 76/80
 * (vacaciones/prima vacacional), 162 (prima de antigüedad) y 50 (indemnización).
 *
 * ⚠️  DISCLAIMER: Para validez total del convenio como cosa juzgada se
 *   requiere RATIFICACIÓN ante el Centro Federal de Conciliación y Registro
 *   Laboral (Art. 33 LFT, reforma 2019). Sin ratificación, el trabajador
 *   puede impugnar los términos aunque haya firmado. El documento debe ser
 *   revisado por abogado laboral antes de usarse.
 */

import { composeFullName } from '@/lib/name-case';
import {
  CAUSA_LABELS,
  formatMoneda,
  type CausaTerminacion,
  type FiniquitoCalculado,
} from '@/lib/hr/calcular-finiquito';
import { PATRON_DILESA, type ContratoPatron } from './contrato-printable';

export interface FiniquitoEmpleadoData {
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  rfc: string | null;
  nss: string | null;
  puesto: string | null;
  departamento: string | null;
  numero_empleado: string | null;
}

function formatDateLarga(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function FiniquitoPrintable({
  empleado,
  calculo,
  motivoDetalle,
  patron = PATRON_DILESA,
  fechaConvenio,
}: {
  empleado: FiniquitoEmpleadoData;
  calculo: FiniquitoCalculado;
  motivoDetalle?: string;
  patron?: ContratoPatron;
  fechaConvenio?: string;
}) {
  const fechaHoy = fechaConvenio ?? new Date().toISOString().split('T')[0];
  const nombreCompleto = composeFullName(
    empleado.nombre,
    empleado.apellido_paterno,
    empleado.apellido_materno
  );

  const causa: CausaTerminacion = calculo.causa;
  const esRenuncia = causa === 'renuncia';

  const totalIndemnizacion = calculo.totalIndemnizacion;
  const totalFiniquito = calculo.totalFiniquito;
  const totalGeneral = calculo.totalGeneral;

  const conceptosFiniquito = calculo.conceptos.filter(
    (c) =>
      !c.concepto.toLowerCase().includes('indemnización') && !c.concepto.includes('20 días por año')
  );
  const conceptosIndemnizacion = calculo.conceptos.filter(
    (c) =>
      c.concepto.toLowerCase().includes('indemnización') || c.concepto.includes('20 días por año')
  );

  return (
    <article className="finiquito-print-root max-w-[800px] mx-auto p-10 text-[13px] leading-relaxed text-black bg-white">
      <style>{`
        .finiquito-print-root { font-family: 'Times New Roman', Times, serif; color: #000; }
        .finiquito-print-root h1 { text-align: center; font-size: 15px; font-weight: bold; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .finiquito-print-root h2 { font-size: 13px; font-weight: bold; margin: 14px 0 6px; text-transform: uppercase; }
        .finiquito-print-root p { margin: 6px 0; text-align: justify; }
        .finiquito-print-root table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
        .finiquito-print-root th, .finiquito-print-root td { border: 1px solid #000; padding: 4px 8px; text-align: left; }
        .finiquito-print-root th { background: #eee; font-weight: bold; }
        .finiquito-print-root td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .finiquito-print-root .firmas { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .finiquito-print-root .firma { border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 11px; }
        .finiquito-print-root .datos-box { border: 1px solid #000; padding: 8px 10px; margin: 8px 0; font-size: 12px; }
        .finiquito-print-root .total-row td { background: #f6f6f6; font-weight: bold; }
        @media print {
          body * { visibility: hidden !important; }
          .finiquito-print-root, .finiquito-print-root * { visibility: visible !important; }
          .finiquito-print-root { position: absolute; left: 0; top: 0; width: 100%; max-width: none; margin: 0; padding: 24mm 18mm; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>

      <h1>Convenio de terminación laboral y finiquito</h1>

      <p>
        En la ciudad de Piedras Negras, Coahuila, a los <strong>{formatDateLarga(fechaHoy)}</strong>
        , comparecen <strong>{patron.razonSocial}</strong>, representada por su representante legal,
        el señor(a) <strong>{patron.representanteLegal}</strong>, a quien en lo sucesivo se
        denominará <strong>«EL PATRÓN»</strong>, y por la otra parte el señor(a){' '}
        <strong>{nombreCompleto}</strong>, a quien en lo sucesivo se denominará{' '}
        <strong>«EL TRABAJADOR»</strong>, para celebrar el presente convenio de terminación laboral
        y finiquito al tenor de las siguientes:
      </p>

      <h2>Antecedentes</h2>

      <div className="datos-box">
        <p>
          <strong>Trabajador:</strong> {nombreCompleto}
          {empleado.rfc ? ` · RFC: ${empleado.rfc}` : ''}
          {empleado.nss ? ` · NSS: ${empleado.nss}` : ''}
          {empleado.numero_empleado ? ` · No. Empleado: ${empleado.numero_empleado}` : ''}
        </p>
        <p>
          <strong>Puesto:</strong> {empleado.puesto ?? '—'}
          {empleado.departamento ? ` · Depto.: ${empleado.departamento}` : ''}
        </p>
        <p>
          <strong>Fecha de ingreso:</strong> {formatDateLarga(calculo.fechaIngreso)}
        </p>
        <p>
          <strong>Fecha de terminación:</strong> {formatDateLarga(calculo.fechaBaja)}
        </p>
        <p>
          <strong>Antigüedad:</strong> {calculo.antiguedad.anios} año(s), {calculo.antiguedad.meses}{' '}
          mes(es), {calculo.antiguedad.dias} día(s).
        </p>
        <p>
          <strong>Salario diario base:</strong> {formatMoneda(calculo.sueldoDiario)}
          {calculo.sdi !== calculo.sueldoDiario && <> · SDI: {formatMoneda(calculo.sdi)}</>}
        </p>
      </div>

      <h2>Causa de terminación</h2>

      <p>
        Las partes declaran que la relación de trabajo termina por{' '}
        <strong>{CAUSA_LABELS[causa]}</strong>
        {esRenuncia && ' presentada por el trabajador en forma libre y espontánea'}
        {motivoDetalle ? `. ${motivoDetalle}` : '.'}
      </p>

      {causa === 'mutuo_consentimiento' && (
        <p>
          Ambas partes manifiestan estar de acuerdo en dar por terminada la relación laboral sin
          represalia ni presión de ninguna índole, con fundamento en el artículo 53 fracción I de la
          Ley Federal del Trabajo.
        </p>
      )}

      <h2>Desglose del finiquito</h2>

      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th className="num">Días</th>
            <th className="num">Base</th>
            <th className="num">Monto</th>
          </tr>
        </thead>
        <tbody>
          {conceptosFiniquito.map((c, i) => (
            <tr key={i}>
              <td>
                {c.concepto}
                {c.nota && <div className="text-[10px] text-gray-600">{c.nota}</div>}
              </td>
              <td className="num">{c.dias != null ? c.dias.toFixed(2) : '—'}</td>
              <td className="num">{c.tasa != null ? formatMoneda(c.tasa) : '—'}</td>
              <td className="num">{formatMoneda(c.monto)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan={3}>TOTAL FINIQUITO</td>
            <td className="num">{formatMoneda(totalFiniquito)}</td>
          </tr>
        </tbody>
      </table>

      {conceptosIndemnizacion.length > 0 && (
        <>
          <h2>Indemnización constitucional</h2>
          <p className="text-[11px]">
            Aplicable en caso de despido injustificado (Art. 50 LFT), a elección del trabajador en
            vez de la reinstalación (Art. 49).
          </p>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="num">Días</th>
                <th className="num">Base</th>
                <th className="num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {conceptosIndemnizacion.map((c, i) => (
                <tr key={i}>
                  <td>{c.concepto}</td>
                  <td className="num">{c.dias != null ? c.dias.toFixed(2) : '—'}</td>
                  <td className="num">{c.tasa != null ? formatMoneda(c.tasa) : '—'}</td>
                  <td className="num">{formatMoneda(c.monto)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={3}>TOTAL INDEMNIZACIÓN</td>
                <td className="num">{formatMoneda(totalIndemnizacion)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <h2 className="mt-4">Total a pagar</h2>
      <table>
        <tbody>
          <tr className="total-row">
            <td style={{ fontSize: '14px' }}>SUMA TOTAL</td>
            <td className="num" style={{ fontSize: '14px' }}>
              {formatMoneda(totalGeneral)}
            </td>
          </tr>
        </tbody>
      </table>

      {calculo.notas.length > 0 && (
        <div className="datos-box mt-3">
          <p className="text-[11px] font-bold">Notas:</p>
          <ul className="text-[11px]" style={{ margin: '2px 0 0 16px', padding: 0 }}>
            {calculo.notas.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <h2>Cláusulas</h2>

      <p>
        <strong>PRIMERA.</strong> EL PATRÓN entrega en este acto a EL TRABAJADOR la cantidad de{' '}
        <strong>{formatMoneda(totalGeneral)}</strong> ({formatMoneda(totalGeneral).replace('$', '')}{' '}
        pesos M.N.), correspondiente al desglose descrito, mediante{' '}
        <em>[efectivo / cheque / transferencia bancaria nº ________________]</em>.
      </p>

      <p>
        <strong>SEGUNDA. Descargo amplio.</strong> EL TRABAJADOR manifiesta recibir a su entera
        satisfacción el importe convenido y declara que EL PATRÓN no le queda a deber cantidad
        alguna por concepto de sueldos, salarios, horas extras, aguinaldo, prima vacacional,
        vacaciones, prima de antigüedad, indemnización, participación en las utilidades, ni por
        ningún otro concepto derivado de la relación laboral, otorgándole el más amplio y total
        finiquito que en derecho proceda y renunciando a cualquier acción legal futura por estos
        conceptos.
      </p>

      <p>
        <strong>TERCERA. Terminación.</strong> Las partes acuerdan que a partir de la fecha arriba
        señalada queda formalmente extinguida la relación laboral que los unía, sin responsabilidad
        legal recíproca más allá del cumplimiento del presente convenio.
      </p>

      <p>
        <strong>CUARTA. Confidencialidad.</strong> EL TRABAJADOR se obliga a mantener la
        confidencialidad sobre la información, documentos, clientes, proveedores y secretos
        industriales a los que haya tenido acceso durante la relación laboral, aún después de la
        terminación de la misma.
      </p>

      <p>
        <strong>QUINTA. Entrega de equipo y documentos.</strong> EL TRABAJADOR manifiesta haber
        entregado al momento de su separación todo el equipo, herramienta, documentación, llaves,
        accesos electrónicos y demás bienes propiedad de EL PATRÓN que tenía bajo su resguardo.
      </p>

      <p>
        <strong>SEXTA. Ratificación.</strong> Las partes manifiestan su voluntad de ratificar el
        presente convenio ante el Centro Federal de Conciliación y Registro Laboral con jurisdicción
        en Coahuila, a fin de que adquiera la calidad de cosa juzgada conforme al Art. 33 de la LFT.
      </p>

      <p className="mt-4">
        Leído y entendido el presente convenio por las partes y conforme a su alcance legal, lo
        firman por duplicado al margen y al calce, quedando un ejemplar en poder de cada parte.
      </p>

      <div className="firmas">
        <div>
          <div className="firma">
            <div className="mb-1">{patron.representanteLegal}</div>
            <div className="text-[11px]">{patron.razonSocial}</div>
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
          <strong>Nota legal:</strong> Borrador generado por BSOP basado en LFT vigente. Los montos
          son una aproximación — el cálculo final debe ser revisado por contador/abogado laboral
          antes del pago. Para efectos legales plenos de descargo, este convenio debe ratificarse
          ante el Centro Federal de Conciliación (Art. 33 LFT).
        </p>
      </div>
    </article>
  );
}

/**
 * Sprint 4c — siembra acuerdos + votación por socio + asistentes de las actas de
 * DILESA, extraídos de los PDFs (escaneados) por subagentes y consolidados aquí.
 *
 * Cada acuerdo se aprobó por UNANIMIDAD (ninguna acta registró disidencias), así
 * que por cada acuerdo se siembra un voto "favor" por cada socio asistente que
 * mapea a `core.empresa_socios`. Los asistentes individuales de la era previa a
 * las holdings (entidad=null) se registran con `socio_id` NULL + nombre.
 *
 * Mapeo de entidad → socio (por la tabla del Reglamento, NO por el apellido del
 * representante): Nigropetense → Santos de los Santos; Gesan → Santos Diego;
 * CHC → Chavarría Cruz.
 *
 * Idempotente: si un acta ya tiene acuerdos, se salta.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL (default), SUPABASE_SERVICE_ROLE_KEY.
 *   SUPABASE_SERVICE_ROLE_KEY="$(op read 'op://Infrastructure/SUPABASE_SERVICE_ROLE_KEY/credential')" \
 *   npx tsx scripts/import_gobierno_acuerdos_dilesa.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ybklderteyhuugzfmxbi.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY = process.env.DRY_RUN === '1';
if (!KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
/* eslint-disable @typescript-eslint/no-explicit-any */

type Ent = 'Nigropetense' | 'Gesan' | 'CHC';
type Asistente = { entidad: Ent | null; nombre: string; pct: number | null };
type ActaSeed = { folio: string; quorum: number; asistentes: Asistente[]; acuerdos: string[] };

const HOLD_3: Asistente[] = [
  { entidad: 'Nigropetense', nombre: 'Nigropetense Inmobiliaria S.A.', pct: 33.33 },
  { entidad: 'Gesan', nombre: 'Gesan Inmobiliaria del Bravo, SA de CV', pct: 33.33 },
  { entidad: 'CHC', nombre: 'Inmobiliaria CHC', pct: 33.33 },
];

const ACTAS: ActaSeed[] = [
  {
    folio: '2',
    quorum: 100,
    asistentes: [
      { entidad: null, nombre: 'Gerardo Santos Benavides', pct: 66.6 },
      { entidad: null, nombre: 'Salvador Chavarría Delgado', pct: 33.4 },
    ],
    acuerdos: [
      'Se aumenta el capital social en su parte variable en $3,000,000.00 (aportación en efectivo), emitiendo 3,000 acciones serie "B" de $1,000.00 c/u. Aportan: Gerardo Santos Benavides $2,000,000 y Salvador Chavarría Delgado $1,000,000.',
      'El capital social queda en $3,500,000.00 (500 acciones serie A fija + 3,000 serie B variable): Gerardo Santos Benavides 2,333 acciones (66.60%), Salvador Chavarría Delgado 1,167 (33.40%).',
      'Anotaciones en el Libro de Registro de Accionistas y de Aumentos/Disminuciones de capital (arts. 128 y 219 LGSM).',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '3',
    quorum: 100,
    asistentes: [
      { entidad: null, nombre: 'Gerardo Santos Benavides', pct: 66.6 },
      { entidad: null, nombre: 'Salvador Chavarría Delgado', pct: 33.4 },
    ],
    acuerdos: [
      'Se aprueban los informes del Administrador y del Comisario sobre el ejercicio irregular 4-sep a 31-dic-2003 (inicio de operaciones).',
      'No hay proyecto de aplicación de resultados por tratarse de periodo de inicio de operaciones (sin utilidad ni pérdida contable). Sin dividendos.',
      'Se ratifican como Administradores a Gerardo Santos Benavides y Salvador Chavarría Delgado, y como Comisario a Óscar González Martínez.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '5',
    quorum: 100,
    asistentes: [
      { entidad: null, nombre: 'Gerardo Santos Benavides', pct: 66.6 },
      { entidad: null, nombre: 'Salvador Chavarría Delgado', pct: 33.4 },
    ],
    acuerdos: [
      'Se aprueban los informes del Administrador Único y del Comisario sobre el ejercicio 2004.',
      'Aplicación de resultados 2004: la pérdida contable neta de -$440,224.00 se aplica a resultados de ejercicios anteriores. Sin dividendos.',
      'Se ratifican los Administradores; se acepta la renuncia del Comisario Óscar González Martínez y se designa a la Lic. Blanca Delia Rodríguez Elizalde.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '11',
    quorum: 100,
    asistentes: [
      { entidad: 'Nigropetense', nombre: 'Nigropetense (rep. Urbano Santos Benavides)', pct: 33.2 },
      { entidad: null, nombre: 'Gerardo Santos Benavides', pct: 33.4 },
      { entidad: null, nombre: 'Salvador Chavarría Delgado', pct: 33.4 },
    ],
    acuerdos: [
      'Se aprueban los informes del Administrador Único y del Comisario sobre el ejercicio 2009.',
      'Aplicación de resultados a la cuenta de resultados de ejercicios anteriores (resultado contable neto 2009 ~$233,415). Sin reparto de dividendos.',
      'Se ratifican Administradores (Gerardo Santos Benavides, Salvador Chavarría Delgado), a Nigropetense como socio y a la Comisario Lic. Blanca Delia Rodríguez Elizalde.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '12',
    quorum: 100,
    asistentes: [
      { entidad: 'Nigropetense', nombre: 'Nigropetense (rep. Urbano Santos Benavides)', pct: 33.2 },
      { entidad: null, nombre: 'Gerardo Santos Benavides', pct: 33.4 },
      { entidad: null, nombre: 'Salvador Chavarría Delgado', pct: 33.4 },
    ],
    acuerdos: [
      'Se aprueba la transmisión de 1,167 acciones (33.40%) de Gerardo Santos Benavides a favor de Gesan Inmobiliaria del Bravo, S.A. de C.V. (aportación de la totalidad de sus acciones).',
      'El capital queda: Nigropetense 1,166 (33.20%), Gesan 1,167 (33.40%), Salvador Chavarría Delgado 1,167 (33.40%); total 3,500 acciones.',
      'Endoso de títulos y anotaciones en el Libro de Registro de Accionistas.',
      'Se reforma el Artículo Sexto de los Estatutos para reflejar la nueva integración del capital.',
      'Gerardo Santos Benavides deja de ser socio (persona física); se acepta como socio a Gesan Inmobiliaria del Bravo y se le ratifica como Administrador.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '13',
    quorum: 100,
    asistentes: [
      { entidad: 'Nigropetense', nombre: 'Nigropetense (rep. Urbano Santos Benavides)', pct: 33.2 },
      { entidad: 'Gesan', nombre: 'Gesan (rep. Gerardo Santos Benavides)', pct: 33.4 },
      { entidad: null, nombre: 'Salvador Chavarría Delgado', pct: 33.4 },
    ],
    acuerdos: [
      'Se aprueban los informes del Administrador y del Comisario sobre el ejercicio 2010.',
      'Aplicación de resultados 2010: ganancia contable neta de $3,571,111 a resultados de ejercicios anteriores; ISR $373,803. Se decreta reparto de dividendos por $1,500,000.',
      'Se ratifican Administradores, socios (Nigropetense y Gesan) y Comisario Lic. Blanca Delia Rodríguez Elizalde.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '14',
    quorum: 100,
    asistentes: [
      { entidad: 'Nigropetense', nombre: 'Nigropetense', pct: 33.2 },
      { entidad: 'Gesan', nombre: 'Gesan', pct: 33.4 },
      { entidad: null, nombre: 'Salvador Chavarría Delgado', pct: 33.4 },
    ],
    acuerdos: [
      'Se aprueban los informes del Administrador y del Comisario sobre el ejercicio 2011.',
      'Aplicación de resultados 2011: pérdida contable neta de -$662,314 a resultados de ejercicios anteriores. Reparto de dividendos $1,500,000.',
      'Ratificación de Administradores (Salvador Chavarría Delgado, Gerardo Santos Benavides), socios y Comisario Lic. Blanca Delia Rodríguez Elizalde.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '15',
    quorum: 100,
    asistentes: [
      { entidad: 'Nigropetense', nombre: 'Nigropetense', pct: 33.2 },
      { entidad: 'Gesan', nombre: 'Gesan', pct: 33.4 },
      { entidad: null, nombre: 'Salvador Chavarría Delgado', pct: 33.4 },
    ],
    acuerdos: [
      'Se aprueban los informes del Administrador y del Comisario sobre el ejercicio 2012.',
      'Aplicación de resultados 2012: ganancia contable neta de $10,400,948 a resultados de ejercicios anteriores. Reparto de dividendos $1,050,000.',
      'Ratificación de Administradores; se acepta la renuncia de la Comisario Lic. Blanca Delia Rodríguez Elizalde y se designa al C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '17',
    quorum: 100,
    asistentes: [
      { entidad: 'Nigropetense', nombre: 'Nigropetense (rep. Urbano Santos Benavides)', pct: 33.2 },
      { entidad: 'Gesan', nombre: 'Gesan (rep. Gerardo Santos Benavides)', pct: 33.4 },
      { entidad: null, nombre: 'Salvador Chavarría Delgado', pct: 33.4 },
    ],
    acuerdos: [
      'Lectura y aprobación del acta de la sesión extraordinaria anterior.',
      'Salvador Chavarría Delgado enajena sus 1,167 acciones (33.40%); los demás socios renuncian al derecho del tanto y se traspasan a favor de Inmobiliaria CHC de Piedras Negras, S.A. de C.V. (rep. María Josefina Cruz Santos) que paga el valor nominal.',
      'Se modifica el Artículo Sexto de los Estatutos. Capital: Nigropetense 1,166 (33.20%), Gesan 1,167 (33.40%), Inmobiliaria CHC 1,167 (33.40%).',
      'Salvador Chavarría Delgado deja de ser socio; se acepta como socio a Inmobiliaria CHC y se ratifica a Salvador Chavarría Delgado como Administrador de DILESA.',
      'Se designa a Salvador Chavarría Delgado como Delegado Especial para protocolizar e inscribir el acta.',
    ],
  },
  {
    folio: '18',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Aumento de capital en su parte variable en $33,759,000 (hasta $36,759,000), emitiendo 33,759 acciones serie "B" por capitalización de utilidades retenidas; cada socio suscribe 11,253 (33.33%).',
      'Capital resultante $37,259,000 (500 serie A + 36,759 serie B): Nigropetense 12,419 (33.33%), Gesan 12,420 (33.33%), CHC 12,420 (33.33%).',
      'Anotaciones en el Libro de Registro de Accionistas.',
      'Se designa a Adalberto Santos de los Santos como Delegado Especial para protocolizar los acuerdos.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '20',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Ante el fallecimiento de Don Salvador Chavarría Delgado (Administrador), se aprueba que la Sociedad sea administrada únicamente por Don Adalberto Santos de los Santos, como Administrador Único y Director, con la suma de poderes ya conferidos (art. 152 LGSM); acepta el cargo.',
      'Se designa a Adalberto Santos de los Santos como Delegado Especial para protocolizar los acuerdos.',
    ],
  },
  {
    folio: '21',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueban los informes del Administrador Único y del Comisario sobre el ejercicio 2013.',
      'Aplicación de resultados 2013: utilidad contable neta de $7,604,480 a resultados de ejercicios anteriores. Sin reparto de dividendos.',
      'Ratificación del Administrador Único Adalberto Santos de los Santos, socios y Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '22',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueban los informes del Administrador Único y del Comisario sobre el ejercicio 2014.',
      'Aplicación de resultados 2014: utilidad contable neta de $5,661,605 a resultados de ejercicios anteriores. Sin reparto de dividendos.',
      'Ratificación del Administrador Único Adalberto Santos de los Santos, socios y Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '23',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se presenta la revaluación del inventario del terreno (908,980.87 m², Col. Lomas de la Villa); avalúo 15-dic-2015 de $240,105,670.69 con superávit por revaluación de $238,527,000.',
      'Aumento de capital por capitalización del superávit en su parte variable en $238,527,000, emitiendo 238,527 acciones serie "B"; cada socio suscribe 79,509 (33.33%).',
      'Capital resultante $289,127,000: Nigropetense 96,375 (33.33%), Gesan 96,376 (33.33%), CHC 96,376 (33.33%).',
      'Se designa a Adalberto Santos de los Santos como Delegado Especial para protocolizar los acuerdos.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '24',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueban los informes del Administrador Único y del Comisario sobre el ejercicio 2015.',
      'Aplicación de resultados 2015: utilidad contable neta de $39,037,949 a resultados de ejercicios anteriores. Sin reparto de dividendos.',
      'Ratificación del Administrador Único Adalberto Santos de los Santos y del Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '25',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se cambia el sistema de administración de Administrador Único a Consejo de Administración, integrado: Presidente Gerardo Santos Benavides; Secretario Urbano Santos Benavides; Tesorero Adalberto Santos de los Santos; Vocales Josefina Cruz Santos, Isidro de los Santos Villarreal y Gerardo Santos Diego. Los consejeros aceptan.',
      'Por ser los socios personas morales, el Consejo se conforma por dos personas asignadas y ratificadas por escrito por el representante legal de cada empresa socia, hasta que la Asamblea acuerde lo contrario.',
      'Se ratifican a Adalberto Santos de los Santos y Gerardo Santos Benavides los poderes: pleitos y cobranzas, representación laboral, actos de administración, actos de dominio (amplísimo) y cambiario, con limitación de ejercer el dominio conjuntamente con otro apoderado.',
      'Se otorga a Josefina Cruz Santos poder para pleitos y cobranzas, representación laboral, actos de administración, actos de dominio y cambiario, con la misma limitación de dominio conjunto.',
      'Se otorga a Adalberto Santos de los Santos, Gerardo Santos Benavides y Josefina Cruz Santos un poder especial para actos de dominio, exclusivo para la venta de casas habitación construidas sobre los inmuebles de la Sociedad.',
      'Se designa a Adalberto Santos de los Santos como Delegado Especial para protocolizar los acuerdos.',
    ],
  },
  {
    folio: '26',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueban los informes del Administrador Único y del Comisario sobre el ejercicio 2016.',
      'Aplicación de resultados 2016: pérdida contable neta de -$28,700,879 a resultados de ejercicios anteriores.',
      'Ratificación del Presidente de la Asamblea (Gerardo Santos Benavides) y del Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '27',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueban los informes del Administrador Único y del Comisario sobre el ejercicio 2017.',
      'Aplicación de resultados 2017: utilidad contable neta de $2,457,603 (utilidad antes de impuestos $3,427,542; ISR $969,939) a resultados de ejercicios anteriores.',
      'Ratificación del Presidente de la Asamblea (Gerardo Santos Benavides) y del Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '28',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueban los informes del Administrador Único y del Comisario sobre el ejercicio 2018.',
      'Aplicación de resultados 2018: utilidad contable neta de $2,914,628 (utilidad antes de impuestos $3,482,189; ISR $567,561) a resultados de ejercicios anteriores.',
      'Ratificación del Presidente de la Asamblea (Gerardo Santos Benavides) y del Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '29',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueba el informe del Administrador Único y el dictamen del Comisario sobre el ejercicio 2019.',
      'Aplicación de resultados 2019: pérdida contable neta de -$13,922,518 (pérdida antes de impuestos -$12,538,968; ISR $1,383,550) a resultados de ejercicios anteriores.',
      'Ratificación del Administrador (Presidente Gerardo Santos Benavides, Secretario Urbano Santos Benavides) y del Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '30',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueba el informe del Administrador Único y el dictamen del Comisario sobre el ejercicio 2020.',
      'Aplicación de resultados 2020: utilidad contable neta de $2,208,829 (utilidad antes de impuestos $3,451,072; ISR $1,242,243) a resultados de ejercicios anteriores.',
      'Ratificación del Administrador (Presidente Gerardo Santos Benavides, Secretario Urbano Santos Benavides) y del Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '31',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Resolución única: se modifica el objeto social (Artículo Segundo de los estatutos) para ampliar las actividades a un objeto inmobiliario amplio (poseer/comprar/vender/fraccionar/arrendar/gravar/hipotecar inmuebles; administrar aportaciones y cartera; comercializar materiales de construcción; desarrollar fraccionamientos; servicios técnicos y subcontratación; participar en concursos y en capital de otras sociedades; operar marcas, patentes y títulos de crédito; agencias/sucursales/almacenes; y los actos necesarios para el objeto social).',
      'Se designa a Gerardo Santos Benavides como Delegado Especial para protocolizar e inscribir el acta. Protocolizada: Escritura Pública No. 81 del 11-ago-2021, Notario Público No. 3 de Piedras Negras (Lic. Francisco Javier Cedillo Martínez).',
    ],
  },
  {
    folio: '32',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Ampliación y modificación del Consejo de Administración (cargos por 2 años, reelegibles): Presidente Gerardo Santos Benavides; Secretario Urbano Santos Benavides; Tesorero Adalberto Santos de los Santos; Vocales: María Josefina Cruz Santos, Michelle Santos Diego, Alejandra Chavarría Cruz, Urbano Santos de los Santos, Franziella Santos de los Santos, Patricia de los Santos Garza, Patricia Santos de los Santos, Anna Patricia Chavarría Cruz, Salvador Chavarría Cruz, Analicia Chavarría Cruz, Amanda Chavarría Cruz, Rosantina Santos Diego, Gerardo Santos Diego, Lázaro Santos Diego, Gerónimo Santos Diego y María Santos Diego. Los consejeros aceptan y entran en funciones.',
      'Se ratifican a Adalberto Santos de los Santos, Gerardo Santos Benavides y María Josefina Cruz Santos los poderes (pleitos y cobranzas, representación laboral, actos de administración, actos de dominio amplísimo y cambiario), con limitación de ejercer el dominio conjuntamente con otro apoderado de dominio. Vigencia 5 años desde la protocolización.',
      'Se designa a Gerardo Santos Benavides como Delegado Especial para protocolizar los acuerdos. Protocolizada: Escritura Pública No. 121 del 29-oct-2021, Notario Público No. 3 de Piedras Negras (Lic. Francisco Javier Cedillo Martínez).',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '33',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueba el informe del Administrador Único y el dictamen del Comisario sobre el ejercicio 2021.',
      'Aplicación de resultados 2021: utilidad contable neta de $3,126,237 (utilidad antes de impuestos $4,649,200; ISR $1,019,381; PTU $503,582) a resultados de ejercicios anteriores.',
      'Ratificación del Administrador (Presidente Gerardo Santos Benavides, Secretario Urbano Santos Benavides) y del Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
  {
    folio: '34',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se ratifica y nombra el Consejo de Administración por 2 años (reelegibles): Presidente Gerardo Santos Benavides; Secretario Urbano Santos Benavides; Tesorero Adalberto Santos de los Santos; y 16 vocales (María Josefina Cruz Santos, Michelle Santos Diego, Alejandra Chavarría Cruz, Urbano Santos de los Santos, Franziella Santos de los Santos, Patricia de los Santos Garza, Patricia Santos de los Santos, Anna Patricia Chavarría Cruz, Salvador Chavarría Cruz, Analicia Chavarría Cruz, Amanda Chavarría Cruz, Rosantina Santos Diego, Gerardo Santos Diego, Lázaro Santos Diego, Gerónimo Santos Diego y María Santos Diego).',
      'Se revocan todos los poderes conferidos con anterioridad a esta asamblea.',
      'Se otorgan a Gerardo Santos Benavides, Urbano Santos Benavides, Adalberto Santos de los Santos, María Josefina Cruz Santos, Alejandra Chavarría Cruz y Michelle Santos Diego (por separado) poderes generales para pleitos y cobranzas, actos de administración, representación laboral, cambiario/bancario, actos de dominio y facultad de sustituir/delegar. Vigencia 10 años. Limitación: el poder para actos de dominio se ejerce de manera CONJUNTA por al menos dos apoderados de dominio.',
      'Se otorga poder especial para actos de dominio, exclusivo para la venta de casas habitación de la Sociedad, a Adalberto Santos de los Santos, Michelle Santos Diego y Alejandra Chavarría Cruz (por separado). Vigencia 10 años.',
      'Se designa a Adalberto Santos de los Santos como Delegado de la Asamblea para protocolizar los acuerdos. Protocolizada: Escritura Pública No. 208 del 10-ago-2022, Notario Público No. 25 de Piedras Negras (Lic. Guillermo Nicolás López Elizondo).',
      'Redacción, lectura y aprobación del acta.',
    ],
  },
  {
    folio: '35',
    quorum: 100,
    asistentes: HOLD_3,
    acuerdos: [
      'Se aprueba el informe del Administrador Único y el dictamen del Comisario sobre el ejercicio 2022.',
      'Aplicación de resultados 2022: utilidad contable neta de $20,168,313 (utilidad antes de impuestos $21,161,373; ISR $713,654; PTU $279,406) a resultados de ejercicios anteriores.',
      'Ratificación del Administrador (Presidente Gerardo Santos Benavides, Secretario Urbano Santos Benavides) y del Comisario C.P.C. Sergio Montes Cárdenas.',
      'Lectura y aprobación del acta.',
    ],
  },
];

async function main() {
  const { data: emp } = await (sb.schema('core') as any)
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  const empresaId = emp.id as string;

  // Mapa entidad → socio_id.
  const { data: socios } = await (sb.schema('core') as any)
    .from('empresa_socios')
    .select('id, nombre')
    .eq('empresa_id', empresaId);
  const socioId = (ent: Ent): string | null => {
    const needle = ent === 'Nigropetense' ? 'Nigropetense' : ent === 'Gesan' ? 'Gesan' : 'CHC';
    return (socios ?? []).find((s: any) => s.nombre.includes(needle))?.id ?? null;
  };

  let actasSeed = 0,
    acuerdosSeed = 0,
    votosSeed = 0,
    asisSeed = 0,
    skipped = 0;

  for (const a of ACTAS) {
    const { data: acta } = await (sb.schema('core') as any)
      .from('gobierno_actas')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('folio', a.folio)
      .maybeSingle();
    if (!acta) {
      console.warn(`acta ${a.folio}: no existe header — skip`);
      continue;
    }
    const { count } = await (sb.schema('core') as any)
      .from('gobierno_acta_acuerdos')
      .select('id', { count: 'exact', head: true })
      .eq('acta_id', acta.id);
    if ((count ?? 0) > 0) {
      console.log(`acta ${a.folio}: ya tiene acuerdos — skip`);
      skipped++;
      continue;
    }
    if (DRY) {
      console.log(
        `[dry] acta ${a.folio}: ${a.acuerdos.length} acuerdos, ${a.asistentes.length} asistentes`
      );
      continue;
    }

    // Asistentes.
    for (const asis of a.asistentes) {
      const sid = asis.entidad ? socioId(asis.entidad) : null;
      await (sb.schema('core') as any).from('gobierno_acta_asistentes').insert({
        acta_id: acta.id,
        empresa_id: empresaId,
        socio_id: sid,
        presente: true,
        representado_por: asis.nombre,
        porcentaje: asis.pct,
      });
      asisSeed++;
    }

    // Acuerdos + votos (unánimes: favor por cada socio asistente mapeado).
    const mappedSocioIds = a.asistentes
      .map((x) => (x.entidad ? socioId(x.entidad) : null))
      .filter((x): x is string => !!x);
    let orden = 1;
    for (const punto of a.acuerdos) {
      const { data: ac } = await (sb.schema('core') as any)
        .from('gobierno_acta_acuerdos')
        .insert({ acta_id: acta.id, empresa_id: empresaId, orden, punto, resultado: 'aprobado' })
        .select('id')
        .single();
      acuerdosSeed++;
      orden++;
      for (const sid of mappedSocioIds) {
        await (sb.schema('core') as any).from('gobierno_acta_votos').insert({
          acuerdo_id: ac.id,
          empresa_id: empresaId,
          socio_id: sid,
          sentido: 'favor',
        });
        votosSeed++;
      }
    }
    // Quórum del header (si difiere).
    await (sb.schema('core') as any)
      .from('gobierno_actas')
      .update({ quorum_pct: a.quorum })
      .eq('id', acta.id);
    actasSeed++;
    console.log(
      `acta ${a.folio}: ✓ ${a.acuerdos.length} acuerdos, ${mappedSocioIds.length} socios con voto`
    );
  }

  console.log(
    `\nResumen: ${actasSeed} actas sembradas, ${acuerdosSeed} acuerdos, ${votosSeed} votos, ${asisSeed} asistentes, ${skipped} skip.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

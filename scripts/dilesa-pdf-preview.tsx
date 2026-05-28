/**
 * Render local de los PDFs DILESA con data sintética para verificar
 * que Solicitud entra en 1 página. Solo se usa durante development —
 * no se invoca en producción.
 *
 * Uso: npx tsx scripts/dilesa-pdf-preview.tsx
 *      open /tmp/solicitud-preview.pdf
 *      open /tmp/aviso-preview.pdf
 */
import { renderToFile } from '@react-pdf/renderer';
import { SolicitudAsignacionPDF } from '../lib/dilesa/pdf/solicitud-asignacion';
import { AvisoPrivacidadPDF } from '../lib/dilesa/pdf/aviso-privacidad';
import { FicuPDF } from '../lib/dilesa/pdf/ficu';
import { evaluarRiesgo } from '../lib/dilesa/ficu/riesgo';
import { PromesaCompraventaPDF } from '../lib/dilesa/pdf/promesa-compraventa';

const solicitudData = {
  fechaTexto: '24 de Mayo del 2026',
  fraccionamiento: 'BOSQUES DE SAN JOSÉ',
  manzana: '3',
  lote: '9',
  prototipo: 'LDLE-ISC',
  domicilioOficial: 'CALLE ALAMOS #1234',
  identificacionInventario: 'M3-L9-LDLE-ISC',
  terrenoExcedente: 32,
  frenteVerde: true,
  esquina: false,
  precioM2Excedente: 850,
  asesorVentas: 'JUAN HERNÁNDEZ MARTÍNEZ',
  valorComercial: 950000,
  valorExcedenteTerreno: 27200,
  valorFrenteVerde: 15000,
  valorEsquina: 0,
  valorVentaFuturo: 992200,
  costoCreditoAdicional: 12000,
  productosAdicionales: 0,
  precioVenta: 1004200,
  enganche1pct: 10042,
  isai2pct: 20084,
  gastosNotariales6pct: 60252,
  tipoCredito: 'INFONAVIT TRADICIONAL',
  pagoDirecto: 50000,
  montoCreditoTitular: 700000,
  montoCreditoCotitular: 254200,
  totalPagosDisponibles: 1004200,
  clienteNombre: 'PEDRO PÉREZ GÓMEZ (M3-L9-LDLE-ISC)',
  folio: 'PPG-M3-L9-LDLE-ISC-5/24/2026 14:30:00',
};

const avisoData = {
  fechaTexto: '24 de Mayo del 2026',
  clienteNombre: 'PEDRO PÉREZ GÓMEZ',
  identificacionInventario: 'M3-L9-LDLE-ISC',
};

const riesgo = evaluarRiesgo({
  tipoPersona: 'PERSONA FÍSICA',
  nacionalidad: 'MEXICANA',
  esPep: false,
  formaPago: 'FINANCIAMIENTO HIPOTECARIO',
  usoEfectivo: 'SIN USO DE EFECTIVO',
});

const ficuData = {
  fechaTexto: '24 de Mayo del 2026',
  nombres: 'JUAN ANTONIO',
  apellidoPaterno: 'HERNANDEZ',
  apellidoMaterno: 'MUÑOZ',
  fechaNacimientoTexto: '25 de Diciembre del 1990',
  curp: 'HEMJ901225HCLRXN03',
  rfc: 'HEMJ9012251C1',
  identificacion: {
    tipo: 'INE / Credencial para Votar',
    numero: '1649603399',
    autoridad: 'Instituto Nacional Electoral',
    vigencia: 'Vigente',
  },
  domicilio: {
    integrado: 'SONORA #1038, COL. SAN JOAQUIN, PIEDRAS NEGRAS, COAHUILA, CP 26094, MÉXICO',
  },
  telefono: '8781228408',
  correo: 'antoniohernandez2009_@hotmail.com',
  personalidad: 'PERSONA FÍSICA',
  nacionalidad: 'MEXICANA',
  esPep: false,
  formaPago: 'FINANCIAMIENTO HIPOTECARIO',
  usoEfectivo: 'SIN USO DE EFECTIVO',
  ocupacion: 'OTRAS OCUPACIONES - AGENTE ADUANAL',
  conocimientoDuenoBeneficiario: 'Por cuenta propia',
  criteriosRiesgo: riesgo.criterios,
  scoreTotal: riesgo.scoreTotal,
  clasificacionRiesgo: riesgo.clasificacion,
  clienteNombre: 'JUAN ANTONIO HERNANDEZ MUÑOZ',
  identificacionInventario: 'M3-L9-LDLE-ISC',
};

const promesaData = {
  fechaTexto: '24 de Mayo del 2026',
  horaTexto: '9:35',
  diaTexto: '24',
  mesTexto: 'Mayo',
  anioTexto: '2026',
  comprador: {
    nombre: 'CHRISTOPHER ALFONSO LIMAS MARTINEZ',
    curp: 'LIMC010418HCLMRHA6',
    rfc: 'LIMC010418GU4',
    estadoCivil: 'casado',
    profesion: 'profesionista',
    domicilio: 'OBREROS #712 B, COL. VILLA DE FUENTE, PIEDRAS NEGRAS, COAHUILA, CP 26094',
    ineNumero: '1890265649',
  },
  coTitular: null,
  inmueble: {
    fraccionamiento: 'Lomas de los Encinos',
    lote: '16',
    manzana: '3',
    superficieM2: 105,
    modeloVivienda: 'ISC',
    identificacionInventario: 'M3-L16-LDLE-ISC',
  },
  operacion: {
    precio: 1_021_000,
    precioEnLetra: 'Un Millón Veintiún Mil Pesos 00/100 M.N.',
    enganche1pct: 10_210,
    arras10pct: 102_100,
    tipoCredito: 'Infonavit Tradicional',
  },
  folio: 'CLM-M3-L16-LDLE-ISC-5/24/2026 9:35:36 AM',
};

async function main() {
  await renderToFile(<SolicitudAsignacionPDF data={solicitudData} />, '/tmp/solicitud-preview.pdf');
  console.log('✔ /tmp/solicitud-preview.pdf');

  await renderToFile(<AvisoPrivacidadPDF data={avisoData} />, '/tmp/aviso-preview.pdf');
  console.log('✔ /tmp/aviso-preview.pdf');

  await renderToFile(<FicuPDF data={ficuData} />, '/tmp/ficu-preview.pdf');
  console.log('✔ /tmp/ficu-preview.pdf');

  await renderToFile(<PromesaCompraventaPDF data={promesaData} />, '/tmp/promesa-preview.pdf');
  console.log('✔ /tmp/promesa-preview.pdf');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

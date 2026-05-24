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

async function main() {
  await renderToFile(<SolicitudAsignacionPDF data={solicitudData} />, '/tmp/solicitud-preview.pdf');
  console.log('✔ /tmp/solicitud-preview.pdf');

  await renderToFile(<AvisoPrivacidadPDF data={avisoData} />, '/tmp/aviso-preview.pdf');
  console.log('✔ /tmp/aviso-preview.pdf');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

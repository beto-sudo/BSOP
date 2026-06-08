/**
 * Template PDF: Solicitud de Avalúo (Sprint 7g).
 *
 * Versión imprimible del email de Fase 4 (`lib/dilesa/avaluo-emails.ts`).
 * Para entregar la solicitud en papel cuando la casa valuadora no tiene
 * email registrado, o cuando el operador quiere copia física.
 *
 * Mismo branding que los demás PDFs DILESA (banda olivo + footer).
 */
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { StyleSheet } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import { SeccionDatos, Parrafo, type FilaDato } from './seccion-datos';

export type SolicitudAvaluoData = {
  fechaTexto: string;
  valuadorNombre: string;
  // Inmueble
  fraccionamiento: string | null;
  manzana: string | null;
  lote: string | null;
  prototipo: string | null;
  identificacionInventario: string;
  domicilioOficial: string | null;
  areaTerreno: string | null; // "184.89 m²"
  areaConstruida: string | null;
  caracteristicas: string | null; // "Esquina · Frente verde"
  // Comprador
  clienteNombre: string;
  clienteCurp: string | null;
  clienteTelefono: string | null;
  // Contacto ventas
  vendedorNombre: string | null;
  vendedorEmail: string | null;
};

const local = StyleSheet.create({
  saludo: { fontSize: 10.5, marginTop: 4, marginBottom: 4 },
  firmaWrap: { marginTop: 36, flexDirection: 'row', justifyContent: 'space-between' },
  firmaCol: { width: '45%', alignItems: 'center' },
  firmaLinea: {
    borderTopWidth: 0.8,
    borderTopColor: colors.text,
    width: '100%',
    marginBottom: 3,
    paddingTop: 4,
  },
  firmaLabel: { fontSize: 8.5, color: colors.textMuted, textAlign: 'center' },
});

export function SolicitudAvaluoPDF({ data }: { data: SolicitudAvaluoData }) {
  const filasInmueble: FilaDato[] = [
    { label: 'Fraccionamiento', value: data.fraccionamiento },
    { label: 'Manzana', value: data.manzana },
    { label: 'Lote', value: data.lote },
    { label: 'Prototipo', value: data.prototipo },
    { label: 'Identificación inventario', value: data.identificacionInventario },
    { label: 'Dirección', value: data.domicilioOficial },
    { label: 'Área terreno', value: data.areaTerreno },
    { label: 'Área construida', value: data.areaConstruida },
    { label: 'Características', value: data.caracteristicas },
  ];
  const filasCliente: FilaDato[] = [
    { label: 'Nombre', value: data.clienteNombre },
    { label: 'CURP', value: data.clienteCurp },
    { label: 'Teléfono', value: data.clienteTelefono },
  ];
  const filasVentas: FilaDato[] = [
    { label: 'Gerencia de ventas', value: data.vendedorNombre },
    { label: 'Correo', value: data.vendedorEmail },
  ];

  return (
    <Document title={`Solicitud de Avalúo — ${data.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="SOLICITUD DE AVALÚO" fecha={data.fechaTexto} />

        <Text style={local.saludo}>
          Estimado(a) <Text style={{ fontFamily: 'Helvetica-Bold' }}>{data.valuadorNombre}</Text>,
        </Text>
        <Parrafo>
          Por medio del presente solicitamos sus amables servicios para realizar el avalúo comercial
          de la siguiente vivienda en proceso de venta. A continuación encontrará los datos del
          inmueble y del comprador, así como los datos de contacto del responsable comercial para
          coordinar la visita y la entrega del dictamen.
        </Parrafo>

        <SeccionDatos titulo="Datos del inmueble a valuar" filas={filasInmueble} />
        <SeccionDatos titulo="Datos del comprador" filas={filasCliente} />
        <SeccionDatos titulo="Contacto para coordinar la visita" filas={filasVentas} />

        <Parrafo>
          Una vez concluido el avalúo, le agradeceremos hacer llegar el dictamen al gerente de
          ventas indicado para su captura en nuestro sistema. Quedamos atentos a cualquier solicitud
          adicional de información.
        </Parrafo>

        <View style={local.firmaWrap}>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Solicita — DILESA</Text>
          </View>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Recibe — Casa Valuadora</Text>
          </View>
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

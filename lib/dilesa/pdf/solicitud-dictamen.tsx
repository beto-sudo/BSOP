/**
 * Template PDF: Solicitud de Dictaminación Notarial (Sprint 7g).
 *
 * Versión imprimible del email de Fase 7 (`lib/dilesa/dictamen-emails.ts`).
 * Para entregar la solicitud en papel cuando la notaría no tiene email
 * registrado, o cuando el operador quiere copia física.
 */
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { StyleSheet } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import { SeccionDatos, Parrafo, type FilaDato } from './seccion-datos';

export type SolicitudDictamenData = {
  fechaTexto: string;
  notarioNombre: string;
  // Inmueble
  fraccionamiento: string | null;
  manzana: string | null;
  lote: string | null;
  prototipo: string | null;
  identificacionInventario: string;
  domicilioOficial: string | null;
  areaTerreno: string | null;
  areaConstruida: string | null;
  // Comprador
  clienteNombre: string;
  clienteCurp: string | null;
  clienteTelefono: string | null;
  // Operación
  tipoCredito: string | null;
  precioVenta: string | null; // "$2,790,000"
  montoCreditoTitular: string | null;
  montoCreditoCotitular: string | null;
  // Contacto ventas
  vendedorNombre: string | null;
  vendedorEmail: string | null;
};

const local = StyleSheet.create({
  saludo: { fontSize: 10.5, marginTop: 4, marginBottom: 4 },
  firmaWrap: { marginTop: 28, flexDirection: 'row', justifyContent: 'space-between' },
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

export function SolicitudDictamenPDF({ data }: { data: SolicitudDictamenData }) {
  const filasInmueble: FilaDato[] = [
    { label: 'Fraccionamiento', value: data.fraccionamiento },
    { label: 'Manzana', value: data.manzana },
    { label: 'Lote', value: data.lote },
    { label: 'Prototipo', value: data.prototipo },
    { label: 'Identificación inventario', value: data.identificacionInventario },
    { label: 'Dirección', value: data.domicilioOficial },
    { label: 'Área terreno', value: data.areaTerreno },
    { label: 'Área construida', value: data.areaConstruida },
  ];
  const filasCliente: FilaDato[] = [
    { label: 'Nombre', value: data.clienteNombre },
    { label: 'CURP', value: data.clienteCurp },
    { label: 'Teléfono', value: data.clienteTelefono },
  ];
  const filasOperacion: FilaDato[] = [
    { label: 'Tipo de crédito', value: data.tipoCredito },
    { label: 'Precio de venta', value: data.precioVenta },
    { label: 'Crédito titular', value: data.montoCreditoTitular },
    { label: 'Crédito co-titular', value: data.montoCreditoCotitular },
  ];
  const filasVentas: FilaDato[] = [
    { label: 'Gerencia de ventas', value: data.vendedorNombre },
    { label: 'Correo', value: data.vendedorEmail },
  ];

  return (
    <Document title={`Solicitud de Dictaminación — ${data.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="SOLICITUD DE DICTAMINACIÓN" fecha={data.fechaTexto} />

        <Text style={local.saludo}>
          Estimado(a) <Text style={{ fontFamily: 'Helvetica-Bold' }}>{data.notarioNombre}</Text>,
        </Text>
        <Parrafo>
          Por medio del presente solicitamos sus servicios para el dictamen jurídico y elaboración
          de la Carta de Instrucción Notarial de la siguiente operación inmobiliaria. A continuación
          encontrará los datos del inmueble, del comprador y de la operación.
        </Parrafo>

        <SeccionDatos titulo="Datos del inmueble a escriturar" filas={filasInmueble} />
        <SeccionDatos titulo="Datos del comprador" filas={filasCliente} />
        <SeccionDatos titulo="Datos de la operación" filas={filasOperacion} />
        <SeccionDatos titulo="Contacto para coordinar la entrega" filas={filasVentas} />

        <Parrafo>
          Una vez concluido el dictamen, le agradeceremos hacer llegar la Carta de Instrucción al
          gerente de ventas indicado para su captura en nuestro sistema. Quedamos atentos a
          cualquier solicitud adicional de información.
        </Parrafo>

        <View style={local.firmaWrap}>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Solicita — DILESA</Text>
          </View>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Recibe — Notaría</Text>
          </View>
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

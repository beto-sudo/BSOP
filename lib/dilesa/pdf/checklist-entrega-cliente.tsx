/**
 * Template PDF: Checklist para Entrega de Vivienda al cliente (Fase 15 —
 * Entregada, iniciativa dilesa-ventas-expediente S5).
 *
 * Réplica del formato físico de DILESA ("Check List para Entrega de
 * Vivienda"): mismas 7 secciones y 22 puntos íntegros con casillas SÍ / NO +
 * observación por punto. Mejoras: fraccionamiento dinámico (el original lo
 * traía impreso fijo), datos de la vivienda y del cliente prellenados, fecha
 * de entrega, y numeración corregida (el original repetía el "6").
 *
 * Lo firman el CLIENTE y Atención a Clientes en la entrega física; el
 * escaneado firmado se sube en la captura de la Fase 15 (rol
 * `checklist_entrega`).
 */
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { StyleSheet } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Watermark } from './header-footer';
import { SeccionDatos, type FilaDato } from './seccion-datos';

export type ChecklistEntregaClienteData = {
  fechaTexto: string;
  // Vivienda
  fraccionamiento: string | null;
  manzana: string | null;
  lote: string | null;
  domicilioOficial: string | null;
  prototipo: string | null;
  identificacionInventario: string;
  // Cliente
  clienteNombre: string;
  // Estado (watermark si desasignada/expirada)
  watermark?: string | null;
};

const SECCIONES: Array<{ titulo: string; items: string[] }> = [
  {
    titulo: '1. CONCEPTOS HIDRÁULICOS',
    items: [
      'Inodoro y lavabo',
      'Tinaco con tapa',
      'Registro (1) y (2)',
      'Murete de servicio de agua',
    ],
  },
  {
    titulo: '2. INSTALACIÓN ELÉCTRICA',
    items: ['Murete de servicio de luz, guía y zapatas', 'Centro de carga con pastillas'],
  },
  {
    titulo: '3. HERRERÍA Y VENTANERÍA',
    items: ['Marcos de puertas', 'Ventanas', 'Vidrios quebrados'],
  },
  {
    titulo: '4. CARPINTERÍA Y CERRAJERÍA',
    items: ['Puertas de interior', 'Puerta de exterior', 'Chapas interiores y exteriores'],
  },
  {
    titulo: '5. AZULEJOS',
    items: ['Loseta en fachada', 'Pisos', 'Azulejo de baño', 'Piso antiderrapante en baño'],
  },
  {
    titulo: '6. PINTURA',
    items: ['Interior', 'Exterior'],
  },
  {
    titulo: '7. DIVERSOS',
    items: ['Impermeabilización', 'Bardas', 'Guía murete de luz', 'Terminales de baquelita'],
  },
];

const local = StyleSheet.create({
  secHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    marginTop: 8,
    marginBottom: 2,
  },
  secTitle: { fontSize: 8.5, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  colHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 1.5,
    borderBottomWidth: 0.6,
    borderBottomColor: colors.border,
    marginBottom: 1,
  },
  colHeadBox: { width: 20, fontSize: 6.5, color: colors.textMuted, textAlign: 'center' },
  colHeadItem: { width: '38%', fontSize: 6.5, color: colors.textMuted, paddingLeft: 4 },
  colHeadObs: { flex: 1, fontSize: 6.5, color: colors.textMuted, paddingLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 17,
    borderBottomWidth: 0.4,
    borderBottomColor: colors.border,
  },
  boxCell: { width: 20, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 10,
    height: 10,
    borderWidth: 0.9,
    borderColor: colors.text,
    borderRadius: 1,
  },
  itemCell: { width: '38%', fontSize: 8, paddingLeft: 4, paddingRight: 4, paddingVertical: 2 },
  obsCell: {
    flex: 1,
    borderLeftWidth: 0.4,
    borderLeftColor: colors.border,
    alignSelf: 'stretch',
  },
  firmaWrap: { marginTop: 44, flexDirection: 'row', justifyContent: 'space-between' },
  firmaCol: { width: '45%', alignItems: 'center' },
  firmaLinea: {
    borderTopWidth: 0.8,
    borderTopColor: colors.text,
    width: '100%',
    marginBottom: 3,
    paddingTop: 4,
  },
  firmaLabel: { fontSize: 8.5, color: colors.textMuted, textAlign: 'center' },
  leyenda: { fontSize: 7.5, color: colors.textMuted, marginTop: 8 },
});

function SeccionChecklist({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <View>
      <View style={local.secHeader} wrap={false}>
        <Text style={local.secTitle}>{titulo}</Text>
      </View>
      <View style={local.colHeadRow} wrap={false}>
        <Text style={local.colHeadBox}>SÍ</Text>
        <Text style={local.colHeadBox}>NO</Text>
        <Text style={local.colHeadItem}>CONCEPTO</Text>
        <Text style={local.colHeadObs}>OBSERVACIONES</Text>
      </View>
      {items.map((item) => (
        <View key={item} style={local.row} wrap={false}>
          <View style={local.boxCell}>
            <View style={local.box} />
          </View>
          <View style={local.boxCell}>
            <View style={local.box} />
          </View>
          <Text style={local.itemCell}>{item}</Text>
          <View style={local.obsCell} />
        </View>
      ))}
    </View>
  );
}

export function ChecklistEntregaClientePDF({ data }: { data: ChecklistEntregaClienteData }) {
  const filasVivienda: FilaDato[] = [
    { label: 'Fraccionamiento', value: data.fraccionamiento },
    { label: 'Manzana / Lote', value: [data.manzana, data.lote].filter(Boolean).join(' / ') },
    { label: 'Dirección / No. oficial', value: data.domicilioOficial },
    { label: 'Prototipo', value: data.prototipo },
    { label: 'Identificación inventario', value: data.identificacionInventario },
    { label: 'Nombre del cliente', value: data.clienteNombre },
    { label: 'Fecha de entrega', value: '____________________' },
  ];

  return (
    <Document title={`Checklist Entrega de Vivienda — ${data.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page}>
        {data.watermark ? <Watermark text={data.watermark} /> : null}
        <HeaderBand title="CHECKLIST PARA ENTREGA DE VIVIENDA" fecha={data.fechaTexto} />

        <SeccionDatos titulo="Datos de la entrega" filas={filasVivienda} />

        {SECCIONES.map((s) => (
          <SeccionChecklist key={s.titulo} titulo={s.titulo} items={s.items} />
        ))}

        <View style={local.firmaWrap} wrap={false}>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Firma de Cliente</Text>
          </View>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Firma de Atención a Clientes</Text>
          </View>
        </View>

        <Text style={local.leyenda}>
          El cliente recibe la vivienda de conformidad una vez revisados los conceptos anteriores.
          El checklist firmado se digitaliza y se archiva en el expediente de la operación (Fase 15
          — Entregada).
        </Text>

        <FooterBand />
      </Page>
    </Document>
  );
}

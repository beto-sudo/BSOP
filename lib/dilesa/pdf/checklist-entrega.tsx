/**
 * Template PDF: Checklist Pre-Entrega de Vivienda (Fase 14 — Preparada
 * para Entrega, iniciativa dilesa-ventas-expediente S5).
 *
 * Réplica mejorada del formato físico de DILESA ("CHECK LIST PRE - ENTREGA
 * VIVIENDA", 3 páginas Excel): mismas 5 secciones y los 43 puntos íntegros,
 * pero compactado a una fila por punto con casillas OK / NO + línea de
 * observación, datos de la vivienda y del cliente prellenados, y bloque de
 * firmas (el original no traía casillas ni firmas).
 *
 * Flujo: el equipo de Calidad y Entrega lo imprime desde BSOP, recorre la
 * vivienda palomeando en papel, firma, escanea y sube el PDF firmado en la
 * captura de la Fase 14 (rol `checklist_pre_entrega`).
 */
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { StyleSheet } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand, Watermark } from './header-footer';
import { SeccionDatos, type FilaDato } from './seccion-datos';

export type ChecklistEntregaData = {
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

const SECCIONES: Array<{ titulo: string; nota?: string; items: string[] }> = [
  {
    titulo: 'EXTERIOR',
    items: [
      'Banqueta, zinc y accesos libres sin daño',
      'Acometida eléctrica con pruebas y número oficial',
      'Toma de agua domiciliaria con pruebas',
      'Muros sin daño',
      'Pintura exterior uniforme',
      'Sellado exterior en ventanas',
      'Cristales de ventanas limpios',
      'Impermeabilización sin marcas ni humedad y/o insulación',
      'Limpieza exterior',
    ],
  },
  {
    titulo: 'INTERIOR — PLANTA BAJA',
    items: [
      'Funcionamiento de puertas y chapas',
      'Acabado de interiores y yeso en muros',
      'Acabado de interiores y yeso en cielos',
      'Pintura en marcos',
      'Colocación de zoclos y boquilla',
      'Pisos cerámicos y boquilla',
      'Centro de carga y breakers',
      'Rosetas, contactos y apagadores',
      'Equipamiento sanitario con accesorios y pruebas',
      'Lavabos, llaves y accesorios (pruebas)',
      'Regadera, coladera y accesorios (pruebas)',
      'Limpieza interior',
    ],
  },
  {
    titulo: 'INTERIOR — PLANTA ALTA',
    nota: 'N/A si la vivienda es de una sola planta',
    items: [
      'Funcionamiento de puertas y chapas',
      'Acabado de interiores y yeso en muros',
      'Acabado de interiores y yeso en cielos',
      'Pintura en marcos',
      'Colocación de zoclos y boquilla',
      'Pisos cerámicos y boquilla',
      'Centro de carga y breakers',
      'Rosetas, contactos y apagadores',
      'Revisión de lavadora con pruebas',
      'Equipamiento sanitario con accesorios y pruebas',
      'Lavabos, llaves y accesorios (pruebas)',
      'Regadera, coladera y accesorios (pruebas)',
      'Limpieza interior',
    ],
  },
  {
    titulo: 'PLANTA AZOTEA',
    items: [
      'Pretiles, diamantes y base de tinaco',
      'Tinaco, accesorios y pruebas',
      'Insulación y/o impermeabilización en azotea con acabado',
      'Flashing, filetes y pintura',
    ],
  },
  {
    titulo: 'PATIO DE SERVICIO O EXTERIOR',
    items: [
      'Lavadero con tomas',
      'Preparación de boiler con pruebas',
      'Tubería de gas con pruebas',
      'Rosetas exteriores y pruebas eléctricas',
      'Pruebas hidrosanitarias a red municipal',
    ],
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
  secNota: { fontSize: 7, color: '#ffffff', marginLeft: 6, opacity: 0.85 },
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
  obsLineasWrap: { marginTop: 4 },
  obsLinea: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.textMuted,
    height: 16,
  },
  firmaWrap: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between' },
  firmaCol: { width: '45%', alignItems: 'center' },
  firmaLinea: {
    borderTopWidth: 0.8,
    borderTopColor: colors.text,
    width: '100%',
    marginBottom: 3,
    paddingTop: 4,
  },
  firmaLabel: { fontSize: 8.5, color: colors.textMuted, textAlign: 'center' },
  leyenda: { fontSize: 7.5, color: colors.textMuted, marginTop: 6 },
});

function SeccionChecklist({
  titulo,
  nota,
  items,
}: {
  titulo: string;
  nota?: string;
  items: string[];
}) {
  return (
    <View>
      <View style={local.secHeader} wrap={false}>
        <Text style={local.secTitle}>{titulo}</Text>
        {nota ? <Text style={local.secNota}>({nota})</Text> : null}
      </View>
      <View style={local.colHeadRow} wrap={false}>
        <Text style={local.colHeadBox}>OK</Text>
        <Text style={local.colHeadBox}>NO</Text>
        <Text style={local.colHeadItem}>PUNTO A REVISAR</Text>
        <Text style={local.colHeadObs}>OBSERVACIÓN O UBICACIÓN DE DAÑOS</Text>
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

export function ChecklistEntregaPDF({ data }: { data: ChecklistEntregaData }) {
  const filasVivienda: FilaDato[] = [
    { label: 'Fraccionamiento', value: data.fraccionamiento },
    { label: 'Manzana / Lote', value: [data.manzana, data.lote].filter(Boolean).join(' / ') },
    { label: 'Domicilio oficial', value: data.domicilioOficial },
    { label: 'Prototipo', value: data.prototipo },
    { label: 'Identificación inventario', value: data.identificacionInventario },
    { label: 'Cliente', value: data.clienteNombre },
    { label: 'Entidad', value: 'Piedras Negras, Coah.' },
    { label: 'Fecha de revisión', value: '____________________' },
  ];

  return (
    <Document title={`Checklist Pre-Entrega — ${data.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page}>
        {data.watermark ? <Watermark text={data.watermark} /> : null}
        <HeaderBand title="CHECKLIST PRE-ENTREGA DE VIVIENDA" fecha={data.fechaTexto} />

        <SeccionDatos titulo="Datos de la vivienda" filas={filasVivienda} />

        {SECCIONES.map((s) => (
          <SeccionChecklist key={s.titulo} titulo={s.titulo} nota={s.nota} items={s.items} />
        ))}

        <View wrap={false}>
          <View style={local.secHeader}>
            <Text style={local.secTitle}>OBSERVACIONES NO CONTEMPLADAS EN EL CHECKLIST</Text>
          </View>
          <View style={local.obsLineasWrap}>
            <View style={local.obsLinea} />
            <View style={local.obsLinea} />
            <View style={local.obsLinea} />
            <View style={local.obsLinea} />
          </View>
        </View>

        <View style={local.firmaWrap} wrap={false}>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Realizó — Calidad y Entrega</Text>
          </View>
          <View style={local.firmaCol}>
            <View style={local.firmaLinea} />
            <Text style={local.firmaLabel}>Vo.Bo. — Gerencia</Text>
          </View>
        </View>

        <Text style={local.leyenda}>
          La vivienda queda preparada para entrega una vez verificados todos los puntos. El
          checklist firmado se digitaliza y se archiva en el expediente de la operación (Fase 14 —
          Preparada para Entrega).
        </Text>

        <FooterBand />
      </Page>
    </Document>
  );
}

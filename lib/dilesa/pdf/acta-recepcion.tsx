/**
 * Template PDF: Acta de Recepción de Obra al Contratista (formato EN BLANCO,
 * iniciativa `dilesa-atencion-clientes` S4 — recepción papel-primero).
 *
 * Es el formato "CHECK LIST PRE-ENTREGA VIVIENDA" de DILESA que Atención a
 * Clientes / EVAP imprime **en blanco** ANTES del recorrido, marca a mano en
 * campo (C / O / N/A por punto) y firma (Supervisor de Obra · Contratista ·
 * Atención a Clientes). El escaneado firmado se sube en el drawer de recepción
 * y es el gate único del cierre.
 *
 * Gemelo del `checklist-entrega.tsx` (entrega al cliente, Fase 14): mismo
 * branding olivo + isotipo (HeaderBand/FooterBand) para que ambos checklists
 * impresos se vean idénticos. Diferencias propias del acta: 6 secciones
 * (incluye "Pruebas de servicios"), casillas C/O/N-A en vez de OK/NO, datos de
 * la obra (contratista/supervisor) en vez del cliente, y firma a 3 columnas.
 *
 * Los ítems salen del catálogo único `lib/dilesa/recepcion-checklist.ts`
 * (`RECEPCION_CHECKLIST`) — misma fuente de verdad que el drawer; no se
 * duplican aquí.
 */
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { StyleSheet } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import { SeccionDatos, type FilaDato } from './seccion-datos';
import { RECEPCION_CHECKLIST } from '@/lib/dilesa/recepcion-checklist';

export type ActaRecepcionData = {
  fechaTexto: string;
  codigo: string;
  proyecto: string | null;
  unidad: string | null;
  contratista: string | null;
  supervisor: string | null;
  fechaProgramada: string | null;
};

const LINEA_BLANCO = '____________________';

const local = StyleSheet.create({
  subtitulo: {
    fontSize: 8.5,
    color: colors.textMuted,
    marginTop: -2,
    marginBottom: 2,
  },
  leyenda: {
    fontSize: 7.5,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 2,
  },
  secHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    marginTop: 8,
    marginBottom: 2,
  },
  secTitle: { fontSize: 8.5, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  secNota: { fontSize: 7, color: '#ffffff', opacity: 0.85 },
  colHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 1.5,
    borderBottomWidth: 0.6,
    borderBottomColor: colors.border,
    marginBottom: 1,
  },
  colHeadItem: { width: '40%', fontSize: 6.5, color: colors.textMuted, paddingLeft: 4 },
  colHeadBox: { width: 24, fontSize: 6.5, color: colors.textMuted, textAlign: 'center' },
  colHeadObs: { flex: 1, fontSize: 6.5, color: colors.textMuted, paddingLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 17,
    borderBottomWidth: 0.4,
    borderBottomColor: colors.border,
  },
  itemCell: { width: '40%', fontSize: 8, paddingLeft: 4, paddingRight: 4, paddingVertical: 2 },
  boxCell: { width: 24, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 10,
    height: 10,
    borderWidth: 0.9,
    borderColor: colors.text,
    borderRadius: 1,
  },
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
  firmaWrap: { marginTop: 34, flexDirection: 'row', justifyContent: 'space-between' },
  firmaCol: { width: '30%', alignItems: 'center' },
  firmaLinea: {
    borderTopWidth: 0.8,
    borderTopColor: colors.text,
    width: '100%',
    marginBottom: 3,
    paddingTop: 4,
  },
  firmaRol: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  firmaLabel: { fontSize: 7, color: colors.textMuted, textAlign: 'center', marginTop: 1 },
});

function SeccionChecklist({
  titulo,
  nota,
  items,
}: {
  titulo: string;
  nota?: string;
  items: readonly { clave: string; etiqueta: string }[];
}) {
  return (
    <View>
      <View style={local.secHeader} wrap={false}>
        <Text style={local.secTitle}>{titulo}</Text>
        {nota ? <Text style={local.secNota}>{nota}</Text> : null}
      </View>
      <View style={local.colHeadRow} wrap={false}>
        <Text style={local.colHeadItem}>PUNTO A REVISAR</Text>
        <Text style={local.colHeadBox}>C</Text>
        <Text style={local.colHeadBox}>O</Text>
        <Text style={local.colHeadBox}>N/A</Text>
        <Text style={local.colHeadObs}>OBSERVACIÓN O UBICACIÓN DE DAÑOS</Text>
      </View>
      {items.map((item) => (
        <View key={item.clave} style={local.row} wrap={false}>
          <Text style={local.itemCell}>{item.etiqueta}</Text>
          <View style={local.boxCell}>
            <View style={local.box} />
          </View>
          <View style={local.boxCell}>
            <View style={local.box} />
          </View>
          <View style={local.boxCell}>
            <View style={local.box} />
          </View>
          <View style={local.obsCell} />
        </View>
      ))}
    </View>
  );
}

export function ActaRecepcionPDF({ data }: { data: ActaRecepcionData }) {
  const filas: FilaDato[] = [
    { label: 'Fraccionamiento', value: data.proyecto },
    { label: 'Unidad', value: data.unidad ?? data.codigo },
    { label: 'Contratista', value: data.contratista ?? LINEA_BLANCO },
    { label: 'Supervisor de obra', value: data.supervisor ?? LINEA_BLANCO },
    { label: 'Entidad', value: 'Piedras Negras, Coah.' },
    { label: 'Fecha programada', value: data.fechaProgramada ?? LINEA_BLANCO },
    { label: 'Fecha de recepción', value: LINEA_BLANCO },
  ];

  return (
    <Document title={`Acta de recepción de obra — ${data.unidad ?? data.codigo}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="RECEPCIÓN DE OBRA A CONTRATISTA" fecha={data.fechaTexto} />
        <Text style={local.subtitulo}>Check list pre-entrega de vivienda</Text>

        <SeccionDatos titulo="Datos de la vivienda" filas={filas} />

        <Text style={local.leyenda}>
          Marque cada punto: C = Cumple · O = Con observación · N/A = No aplica. Anote el detalle o
          la ubicación del daño en la columna de observaciones.
        </Text>

        {RECEPCION_CHECKLIST.map((sec) => (
          <SeccionChecklist
            key={sec.clave}
            titulo={sec.titulo}
            nota={sec.opcional ? '(N/A si la vivienda es de una sola planta)' : undefined}
            items={sec.items}
          />
        ))}

        <View wrap={false}>
          <View style={local.secHeader}>
            <Text style={local.secTitle}>OBSERVACIONES NO CONTEMPLADAS EN EL CHECKLIST</Text>
          </View>
          <View style={local.obsLineasWrap}>
            <View style={local.obsLinea} />
            <View style={local.obsLinea} />
            <View style={local.obsLinea} />
          </View>
        </View>

        <View style={local.firmaWrap} wrap={false}>
          {[
            { rol: 'Supervisor de Obra', nombre: data.supervisor },
            { rol: 'Contratista', nombre: data.contratista },
            { rol: 'Atención a Clientes (EVAP)', nombre: null },
          ].map((f) => (
            <View key={f.rol} style={local.firmaCol}>
              <View style={local.firmaLinea} />
              <Text style={local.firmaRol}>{f.rol}</Text>
              <Text style={local.firmaLabel}>{f.nombre ?? 'Nombre y firma'}</Text>
            </View>
          ))}
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

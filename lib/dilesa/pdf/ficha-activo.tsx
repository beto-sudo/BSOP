/**
 * FichaActivoPDF — ficha comercial de un activo del portafolio para
 * prospectos de venta/renta (iniciativa `dilesa-portafolio-predios` · S7).
 *
 * Material EXTERNO: solo datos objetivos del inmueble (nada de notas
 * internas, embudo ni bitácora — el loader ya filtra). Branding DILESA con
 * HeaderBand/FooterBand compartidos.
 */
import { Document, Image, Link, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { HeaderBand, FooterBand } from './header-footer';
import { styles as base } from './styles';
import type { FichaActivo } from '@/lib/dilesa/ficha-activo-data';

const TIPO_LABEL: Record<string, string> = {
  terreno: 'Terreno',
  lote: 'Lote',
  casa: 'Casa',
  local: 'Local comercial',
  plaza: 'Plaza comercial',
  edificio: 'Edificio',
  nave: 'Nave industrial',
  departamento: 'Departamento',
  espectacular: 'Espectacular',
  unipolar: 'Unipolar',
};

function money(v: number): string {
  return v.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
}

export function FichaActivoPDF({ ficha, fechaTexto }: { ficha: FichaActivo; fechaTexto: string }) {
  const ubicacion = [ficha.zona, ficha.municipio, ficha.estadoGeo].filter(Boolean).join(' · ');
  const modalidad =
    ficha.cuentaVenta && ficha.cuentaRenta
      ? 'Disponible en venta o renta'
      : ficha.cuentaRenta
        ? 'Disponible en renta'
        : 'Disponible en venta';

  const generales: { label: string; value: string }[] = [
    { label: 'Tipo de inmueble', value: TIPO_LABEL[ficha.tipo] ?? ficha.tipo },
    ...(ficha.areaM2 != null
      ? [{ label: 'Superficie', value: `${ficha.areaM2.toLocaleString('es-MX')} m²` }]
      : []),
    ...(ficha.direccion ? [{ label: 'Ubicación', value: ficha.direccion }] : []),
    ...(ubicacion ? [{ label: 'Zona', value: ubicacion }] : []),
    ...(ficha.claveCatastral ? [{ label: 'Clave catastral', value: ficha.claveCatastral }] : []),
    ...(ficha.situacionLegal ? [{ label: 'Situación legal', value: ficha.situacionLegal }] : []),
  ];

  return (
    <Document title={`Ficha comercial — ${ficha.nombre}`}>
      <Page size="LETTER" style={base.page}>
        <HeaderBand title="FICHA COMERCIAL" fecha={fechaTexto} />

        <View style={s.headline}>
          <Text style={s.nombre}>{ficha.nombre}</Text>
          <Text style={s.modalidad}>{modalidad}</Text>
          {ficha.valorEstimado != null && ficha.cuentaVenta ? (
            <Text style={s.precio}>Precio de lista: {money(ficha.valorEstimado)}</Text>
          ) : null}
        </View>

        {ficha.fotos.length > 0 ? (
          <View style={s.fotosRow}>
            {ficha.fotos.map((url, i) => (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image key={i} src={url} style={ficha.fotos.length === 1 ? s.fotoSola : s.foto} />
            ))}
          </View>
        ) : null}

        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>DATOS GENERALES</Text>
          {generales.map((r) => (
            <View key={r.label} style={s.fila}>
              <Text style={s.filaLabel}>{r.label}</Text>
              <Text style={s.filaValor}>{r.value}</Text>
            </View>
          ))}
        </View>

        {ficha.detalle.length > 0 ? (
          <View style={s.seccion}>
            <Text style={s.seccionTitulo}>CARACTERÍSTICAS</Text>
            {ficha.detalle.map((r) => (
              <View key={r.label} style={s.fila}>
                <Text style={s.filaLabel}>{r.label}</Text>
                <Text style={s.filaValor}>{r.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {ficha.latitud != null && ficha.longitud != null ? (
          <View style={s.seccion}>
            <Text style={s.seccionTitulo}>UBICACIÓN EN MAPA</Text>
            <Link
              src={`https://maps.google.com/?q=${ficha.latitud},${ficha.longitud}`}
              style={s.mapa}
            >
              {`Ver en Google Maps: ${ficha.latitud.toFixed(6)}, ${ficha.longitud.toFixed(6)}`}
            </Link>
          </View>
        ) : null}

        <View style={s.contacto}>
          <Text style={s.contactoTexto}>
            Informes y citas: DILESA — Desarrollo Inmobiliario Los Encinos. Los datos de esta ficha
            son informativos y pueden actualizarse sin previo aviso; precio y condiciones sujetos a
            confirmación por escrito.
          </Text>
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

const s = StyleSheet.create({
  headline: { marginTop: 10, marginBottom: 8 },
  nombre: { fontSize: 18, fontWeight: 700 },
  modalidad: { fontSize: 11, marginTop: 3, color: '#8a8a4a', fontWeight: 700 },
  precio: { fontSize: 13, marginTop: 4, fontWeight: 700 },
  fotosRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  foto: { width: '49%', height: 150, objectFit: 'cover', borderRadius: 4 },
  fotoSola: { width: '100%', height: 190, objectFit: 'cover', borderRadius: 4 },
  seccion: { marginBottom: 10 },
  seccionTitulo: {
    fontSize: 9,
    color: '#8a8a4a',
    fontWeight: 700,
    letterSpacing: 1,
    marginBottom: 4,
    borderBottom: '1 solid #ddd',
    paddingBottom: 2,
  },
  fila: { flexDirection: 'row', paddingVertical: 1.5 },
  filaLabel: { width: '38%', fontSize: 9.5, color: '#555' },
  filaValor: { width: '62%', fontSize: 9.5, fontWeight: 500 },
  mapa: { fontSize: 9.5, color: '#2563eb' },
  contacto: { marginTop: 'auto', paddingTop: 8 },
  contactoTexto: { fontSize: 7.5, color: '#888' },
});

/**
 * PortafolioListadoPDF — listado imprimible del inventario del portafolio
 * (iniciativa `dilesa-portafolio-predios`). Respeta los filtros activos de
 * la lista (vienen en el query de la ruta). Branding DILESA compartido.
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { HeaderBand, FooterBand } from './header-footer';
import { styles as base } from './styles';
import { TIPO_ACTIVO_LABEL_FULL } from '@/lib/dilesa/portafolio';

export type PortafolioListadoRow = {
  nombre: string;
  tipo: string;
  estado: string;
  destino: string | null;
  etiqueta: string | null;
  zona: string | null;
  municipio: string | null;
  area_m2: number | null;
  valor_estimado: number | null;
};

const ESTADO_LABEL: Record<string, string> = {
  adquirido: 'Adquirido',
  operando: 'Operando',
  en_intervencion: 'En intervención',
  desincorporado: 'Desincorporado',
};

function money(v: number): string {
  return v.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
}

export function PortafolioListadoPDF({
  rows,
  fechaTexto,
  filtrosTexto,
}: {
  rows: PortafolioListadoRow[];
  fechaTexto: string;
  filtrosTexto: string;
}) {
  const supTotal = rows.reduce((a, r) => a + (r.area_m2 ?? 0), 0);
  const valorTotal = rows.reduce((a, r) => a + (r.valor_estimado ?? 0), 0);

  return (
    <Document title="Portafolio DILESA">
      <Page size="LETTER" orientation="landscape" style={base.page}>
        <HeaderBand title="PORTAFOLIO" fecha={fechaTexto} />
        <Text style={s.filtros}>{filtrosTexto}</Text>

        <View style={s.thead} fixed>
          <Text style={[s.th, s.cNombre]}>Predio / activo</Text>
          <Text style={[s.th, s.cTipo]}>Tipo</Text>
          <Text style={[s.th, s.cEstado]}>Estado</Text>
          <Text style={[s.th, s.cEtiqueta]}>Etiqueta / destino</Text>
          <Text style={[s.th, s.cZona]}>Zona</Text>
          <Text style={[s.th, s.cMunicipio]}>Municipio</Text>
          <Text style={[s.th, s.cNum]}>m²</Text>
          <Text style={[s.th, s.cNum]}>Valor estimado</Text>
        </View>

        {rows.map((r, i) => (
          <View key={i} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]} wrap={false}>
            <Text style={[s.td, s.cNombre]}>{r.nombre}</Text>
            <Text style={[s.td, s.cTipo]}>{TIPO_ACTIVO_LABEL_FULL[r.tipo] ?? r.tipo}</Text>
            <Text style={[s.td, s.cEstado]}>{ESTADO_LABEL[r.estado] ?? r.estado}</Text>
            <Text style={[s.td, s.cEtiqueta]}>
              {[r.etiqueta, r.destino].filter(Boolean).join(' · ') || '—'}
            </Text>
            <Text style={[s.td, s.cZona]}>{r.zona ?? '—'}</Text>
            <Text style={[s.td, s.cMunicipio]}>{r.municipio ?? '—'}</Text>
            <Text style={[s.td, s.cNum]}>
              {r.area_m2 != null ? r.area_m2.toLocaleString('es-MX') : '—'}
            </Text>
            <Text style={[s.td, s.cNum]}>
              {r.valor_estimado != null ? money(r.valor_estimado) : '—'}
            </Text>
          </View>
        ))}

        <View style={s.totales} wrap={false}>
          <Text style={s.totalesTexto}>
            {rows.length} activos · {Math.round(supTotal).toLocaleString('es-MX')} m² · valor
            estimado {money(valorTotal)}
          </Text>
        </View>

        <FooterBand />
      </Page>
    </Document>
  );
}

const s = StyleSheet.create({
  filtros: { fontSize: 8.5, color: '#777', marginTop: 8, marginBottom: 6 },
  thead: {
    flexDirection: 'row',
    borderBottom: '1.5 solid #8a8a4a',
    paddingBottom: 3,
    marginBottom: 2,
  },
  th: { fontSize: 8, fontWeight: 700, color: '#8a8a4a' },
  tr: { flexDirection: 'row', paddingVertical: 2.5, borderBottom: '0.5 solid #e5e5e5' },
  trAlt: { backgroundColor: '#f7f7f2' },
  td: { fontSize: 8 },
  cNombre: { width: '26%', paddingRight: 4 },
  cTipo: { width: '11%', paddingRight: 4 },
  cEstado: { width: '9%', paddingRight: 4 },
  cEtiqueta: { width: '15%', paddingRight: 4 },
  cZona: { width: '13%', paddingRight: 4 },
  cMunicipio: { width: '9%', paddingRight: 4 },
  cNum: { width: '8.5%', textAlign: 'right', paddingRight: 4 },
  totales: { marginTop: 6, borderTop: '1.5 solid #8a8a4a', paddingTop: 4 },
  totalesTexto: { fontSize: 9, fontWeight: 700, textAlign: 'right' },
});

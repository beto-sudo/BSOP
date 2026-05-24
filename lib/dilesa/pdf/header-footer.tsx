/**
 * Header + Footer reusables para los PDFs DILESA.
 *
 * Replica el branding visual del export de Coda: banda olivo con
 * isotipo + título grande arriba, banda olivo con "DESARROLLO
 * INMOBILIARIO LOS ENCINOS" + url + logo abajo.
 *
 * Las imágenes (isotipo, logo) viven en `public/brand/dilesa/`. En el
 * server renderiza el PDF via @react-pdf/renderer, las cargamos con
 * `path.resolve` + buffer (no funciona el `/brand/...` URL en server).
 */
import { Image, Text, View } from '@react-pdf/renderer';
import { styles } from './styles';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Lee imagen del filesystem como base64 data URL (compatible con server-side rendering). */
function readImageDataUrl(relativePath: string): string {
  const abs = resolve(process.cwd(), 'public', relativePath);
  const buf = readFileSync(abs);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// Pre-leer al cargar el módulo (cero overhead por request).
const ISOTIPO_DATA_URL = (() => {
  try {
    return readImageDataUrl('brand/dilesa/isotipo.png');
  } catch {
    return null;
  }
})();

export function HeaderBand({ title, fecha }: { title: string; fecha: string }) {
  return (
    <>
      <View style={styles.bandTopWrap}>
        <View style={styles.isotipoWrap}>
          {ISOTIPO_DATA_URL ? <Image src={ISOTIPO_DATA_URL} style={styles.isotipo} /> : null}
        </View>
        <View style={styles.bandTitleBar}>
          <Text style={styles.bandTitle}>{title}</Text>
        </View>
      </View>
      <Text style={styles.fechaTopRight}>{fecha}</Text>
    </>
  );
}

export function FooterBand() {
  return (
    <>
      <View style={styles.footerBandBg} fixed />
      <View style={styles.footerBand} fixed>
        <View>
          <Text style={styles.footerBandText}>DESARROLLO</Text>
          <Text style={styles.footerBandText}>INMOBILIARIO LOS ENCINOS</Text>
          <Text style={styles.footerBandUrl}>dilesa.mx (878) 791-1818</Text>
        </View>
        {ISOTIPO_DATA_URL ? <Image src={ISOTIPO_DATA_URL} style={styles.footerBandLogo} /> : null}
      </View>
    </>
  );
}

export function Folio({ value }: { value: string }) {
  return (
    <Text style={styles.folio} fixed>
      {value}
    </Text>
  );
}

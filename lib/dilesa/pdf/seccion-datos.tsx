/**
 * Sección de datos reusable para PDFs DILESA — título + filas
 * label/valor. Usada por las solicitudes imprimibles (avalúo, dictamen)
 * que replican las secciones del email correspondiente en papel.
 *
 * Las filas con `value` null/'' se omiten para no ensuciar el PDF con
 * campos vacíos (mismo criterio que `renderSeccionDatos` del email).
 */
import { Text, View } from '@react-pdf/renderer';
import { StyleSheet } from '@react-pdf/renderer';
import { colors } from './styles';

export type FilaDato = { label: string; value: string | null | undefined };

const s = StyleSheet.create({
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
  },
  label: {
    fontSize: 8.5,
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    width: '45%',
  },
  value: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
    textAlign: 'right',
    width: '55%',
  },
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.5,
    marginBottom: 6,
    textAlign: 'justify',
  },
});

export function SeccionDatos({ titulo, filas }: { titulo: string; filas: FilaDato[] }) {
  const visibles = filas.filter((f) => f.value != null && String(f.value).trim() !== '');
  if (visibles.length === 0) return null;
  return (
    <View>
      <Text style={s.sectionTitle}>{titulo}</Text>
      {visibles.map((f) => (
        <View style={s.row} key={f.label}>
          <Text style={s.label}>{f.label}</Text>
          <Text style={s.value}>{String(f.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export function Parrafo({ children }: { children: string }) {
  return <Text style={s.paragraph}>{children}</Text>;
}

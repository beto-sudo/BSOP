/**
 * Estilos compartidos para los PDFs DILESA (Sprint 7b).
 * Replicamos el look del export de Coda — colores corporativos olivo +
 * gris, tipografía sans-serif uniforme.
 *
 * Diseñado para que Solicitud de Asignación quepa en 1 página letter
 * (la cantidad de filas exige compresión vertical). Aviso de
 * Privacidad sobra con esto.
 */
import { StyleSheet, Font } from '@react-pdf/renderer';

// El default font de @react-pdf/renderer (Helvetica) cubre bien.
// Si queremos Inter o similar más adelante, se registra con Font.register.
Font.registerHyphenationCallback((word) => [word]);

export const colors = {
  primary: '#7d8043', // olivo DILESA
  text: '#111111',
  textMuted: '#666666',
  border: '#d4d4d4',
  borderSoft: '#ececec',
  bgSoft: '#f5f5f5',
  bandTop: '#8a8a4a',
  bandBottomDark: '#8a8a4a',
  bandBottomLight: '#bdbd91',
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 60, // espacio para el footer band (45) + margen
    paddingHorizontal: 36,
    fontSize: 10,
    color: colors.text,
    fontFamily: 'Helvetica',
  },
  bandTopWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  isotipoWrap: {
    width: 52,
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 4,
    marginRight: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  isotipo: { width: 42, height: 42 },
  bandTitleBar: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 2,
  },
  bandTitle: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  fechaTopRight: {
    fontSize: 8,
    color: colors.textMuted,
    textAlign: 'right',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
    marginBottom: 3,
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 1.5,
  },
  label: {
    fontSize: 9,
    color: colors.text,
    fontFamily: 'Helvetica',
    letterSpacing: 0.3,
  },
  labelStrong: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.3,
  },
  valueRight: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft,
    marginVertical: 5,
  },
  rowSplit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 1.5,
  },
  rightCol: {
    alignItems: 'flex-end',
    marginVertical: 2,
  },
  precioVenta: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  precioBreakdownLabel: {
    fontSize: 8,
    color: colors.textMuted,
  },
  precioBreakdownValue: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  legalText: {
    fontSize: 6.5,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 1.25,
  },
  legalTextBold: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
  },
  firmaWrap: {
    marginTop: 14,
    alignItems: 'center',
  },
  firmaCliente: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  firmaNombre: {
    fontSize: 9,
  },
  firmaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  firmaLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  folio: {
    position: 'absolute',
    bottom: 50,
    right: 36,
    fontSize: 6.5,
    color: colors.textMuted,
  },
  footerBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 28,
  },
  footerBandBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 45,
    backgroundColor: colors.bandBottomDark,
  },
  footerBandText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
    textAlign: 'right',
    marginRight: 10,
    zIndex: 2,
  },
  footerBandUrl: {
    color: '#fff',
    fontSize: 7,
    textAlign: 'right',
    marginRight: 10,
    zIndex: 2,
  },
  footerBandLogo: {
    width: 32,
    height: 32,
    backgroundColor: '#fff',
    borderRadius: 4,
    padding: 3,
    zIndex: 2,
  },
});

/**
 * Estilos compartidos para los PDFs DILESA (Sprint 7b).
 * Replicamos el look del export de Coda — colores corporativos olivo +
 * gris, tipografía sans-serif uniforme, márgenes legibles.
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
    paddingTop: 30,
    paddingBottom: 90, // espacio para el footer band
    paddingHorizontal: 40,
    fontSize: 10,
    color: colors.text,
    fontFamily: 'Helvetica',
  },
  bandTopWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  isotipoWrap: {
    width: 70,
    height: 70,
    backgroundColor: '#fff',
    borderRadius: 4,
    marginRight: 12,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  isotipo: { width: 50, height: 50 },
  bandTitleBar: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 2,
  },
  bandTitle: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  fechaTopRight: {
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'right',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 3,
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
    marginVertical: 10,
  },
  rowSplit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  rightCol: {
    alignItems: 'flex-end',
    marginVertical: 6,
  },
  precioVenta: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  precioBreakdownLabel: {
    fontSize: 9,
    color: colors.textMuted,
  },
  precioBreakdownValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  legalText: {
    fontSize: 7,
    color: colors.textMuted,
    marginTop: 8,
    lineHeight: 1.4,
  },
  legalTextBold: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  firmaWrap: {
    marginTop: 28,
    alignItems: 'center',
  },
  firmaCliente: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  firmaNombre: {
    fontSize: 9,
  },
  firmaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 22,
  },
  firmaLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  folio: {
    position: 'absolute',
    bottom: 76,
    right: 40,
    fontSize: 7,
    color: colors.textMuted,
  },
  footerBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 30,
  },
  footerBandBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
    backgroundColor: colors.bandBottomDark,
  },
  footerBandText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    textAlign: 'right',
    marginRight: 10,
    zIndex: 2,
  },
  footerBandUrl: {
    color: '#fff',
    fontSize: 8,
    textAlign: 'right',
    marginRight: 10,
    zIndex: 2,
  },
  footerBandLogo: {
    width: 38,
    height: 38,
    backgroundColor: '#fff',
    borderRadius: 4,
    padding: 4,
    zIndex: 2,
  },
});

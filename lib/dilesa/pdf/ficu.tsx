/**
 * Template PDF: FICU — Formato de Identificación de Clientes (Sprint 7b).
 *
 * Replica el export Coda + 4 fixes legales LFPIORPI vs. la versión
 * histórica:
 *   1. Domicilio completo (calle, # ext, # int, colonia, municipio,
 *      CP, entidad federativa, país).
 *   2. Identificación con tipo + autoridad + vigencia (no solo número).
 *   3. Texto correcto de Dueño Beneficiario para compra residencial
 *      propia ("por cuenta propia y para sí mismo, es a la vez el
 *      Dueño Beneficiario").
 *   4. Declaración explícita de origen lícito de los recursos.
 *
 * EBR: pie chart de 5 segmentos calculado por `lib/dilesa/ficu/riesgo`.
 *
 * Layout: 1 página letter.
 */
import { Document, G, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import { styles, colors } from './styles';
import { HeaderBand, FooterBand } from './header-footer';
import type { CriterioRiesgo, Nivel } from '../ficu/riesgo';

export type DomicilioFicu = {
  // Si los campos estructurados no están disponibles, se usa `integrado`
  // (blob de texto) como fallback. La intención es migrar erp.personas a
  // domicilio estructurado en sprint posterior; por ahora el blob ya está.
  calle?: string | null;
  numeroExterior?: string | null;
  numeroInterior?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  codigoPostal?: string | null;
  entidadFederativa?: string | null;
  pais?: string | null;
  integrado?: string | null;
};

export type IdentificacionFicu = {
  tipo: string; // "INE / Credencial para votar" | "Pasaporte" | "Cédula profesional"
  numero: string;
  autoridad: string; // "INE" | "SRE" | etc.
  vigencia?: string | null; // fecha o "Vigente"
};

export type FicuData = {
  fechaTexto: string; // "22 de Mayo del 2026"

  // Datos personales
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  fechaNacimientoTexto: string;
  curp: string;
  rfc: string;

  identificacion: IdentificacionFicu;
  domicilio: DomicilioFicu;
  telefono: string;
  correo: string;

  // KYC / clasificación
  personalidad: string; // "PERSONA FÍSICA"
  nacionalidad: string;
  esPep: boolean;
  formaPago: string;
  usoEfectivo: string;
  ocupacion: string;
  conocimientoDuenoBeneficiario: string;

  // Riesgo (EBR)
  criteriosRiesgo: CriterioRiesgo[];
  scoreTotal: number;
  clasificacionRiesgo: Nivel;

  // Firma + folio
  clienteNombre: string;
  identificacionInventario: string;
};

const COLOR_SEGMENTO = ['#4f81bd', '#9bbb59', '#c0504d', '#8064a2', '#f79646'];

export function FicuPDF({ data }: { data: FicuData }) {
  return (
    <Document title={`FICU — ${data.clienteNombre} — ${data.identificacionInventario}`}>
      <Page size="LETTER" style={styles.page}>
        <HeaderBand title="FORMATO DE IDENTIFICACIÓN DE CLIENTES" fecha={data.fechaTexto} />

        {/* ── Datos personales ── */}
        <DataRow label="Nombre(s):" value={data.nombres} />
        <DataRow label="Apellido Paterno:" value={data.apellidoPaterno} />
        <DataRow label="Apellido Materno:" value={data.apellidoMaterno} />
        <DataRow label="Fecha de Nacimiento:" value={data.fechaNacimientoTexto} />
        <View style={ficuStyles.tripleRow}>
          <DataInline label="CURP:" value={data.curp} />
          <DataInline label="RFC:" value={data.rfc} />
        </View>

        {/* ── Identificación (FIX 2: tipo + autoridad + vigencia) ── */}
        <Text style={ficuStyles.subTitle}>Identificación Oficial</Text>
        <View style={ficuStyles.tripleRow}>
          <DataInline label="Tipo:" value={data.identificacion.tipo} />
          <DataInline label="Número:" value={data.identificacion.numero} />
        </View>
        <View style={ficuStyles.tripleRow}>
          <DataInline label="Autoridad:" value={data.identificacion.autoridad} />
          {data.identificacion.vigencia ? (
            <DataInline label="Vigencia:" value={data.identificacion.vigencia} />
          ) : null}
        </View>

        {/* ── Domicilio (FIX 1: completo si hay datos estructurados; blob si no) ── */}
        <Text style={ficuStyles.subTitle}>Domicilio</Text>
        <DomicilioBlock d={data.domicilio} />

        <DataRow label="Teléfono:" value={data.telefono} />
        <DataRow label="Correo Electrónico:" value={data.correo} />

        {/* ── KYC ── */}
        <DataRow label="Personalidad:" value={data.personalidad} />
        <DataRow label="Nacionalidad:" value={data.nacionalidad} />
        <DataRow label="Persona Políticamente Expuesta:" value={data.esPep ? 'SÍ' : 'NO'} />
        <DataRow label="Forma de Pago:" value={data.formaPago} />
        <DataRow label="Uso de Efectivo:" value={data.usoEfectivo} />
        <DataRow label="Actividad, Ocupación o Profesión:" value={data.ocupacion} />
        <DataRow
          label="Conocimiento Dueño Beneficiario:"
          value={data.conocimientoDuenoBeneficiario || '—'}
        />

        {/* ── Evaluación de Riesgo + Pie Chart ── */}
        <View style={ficuStyles.riesgoSection}>
          <View style={ficuStyles.riesgoLeft}>
            <Text style={styles.sectionTitle}>EVALUACIÓN DE RIESGO</Text>
            {data.criteriosRiesgo.map((c, idx) => (
              <View key={c.nombre} style={ficuStyles.criterioRow}>
                <View style={[ficuStyles.swatch, { backgroundColor: COLOR_SEGMENTO[idx] }]} />
                <Text style={ficuStyles.criterioNombre}>{c.nombre}</Text>
                <View style={[ficuStyles.nivelChip, { backgroundColor: tintForNivel(c.nivel) }]}>
                  <Text style={ficuStyles.nivelChipText}>{c.nivel}</Text>
                </View>
                <Text style={ficuStyles.criterioPct}>{c.porcentaje.toFixed(2)}%</Text>
              </View>
            ))}
            <View style={ficuStyles.totalRow}>
              <Text style={ficuStyles.totalLabel}>TOTAL</Text>
              <Text style={ficuStyles.totalValue}>{data.scoreTotal.toFixed(2)}%</Text>
              <View
                style={[
                  ficuStyles.nivelChip,
                  { backgroundColor: tintForNivel(data.clasificacionRiesgo) },
                ]}
              >
                <Text style={ficuStyles.nivelChipText}>{data.clasificacionRiesgo}</Text>
              </View>
            </View>
          </View>
          <View style={ficuStyles.riesgoRight}>
            <Text style={styles.sectionTitle}>RIESGO TOMADO</Text>
            <PieChart criterios={data.criteriosRiesgo} />
          </View>
        </View>

        {/* ── Manifestaciones legales LFPIORPI ── */}
        <View style={ficuStyles.legalWrap}>
          <Bullet>
            Manifiesto bajo protesta de decir verdad que la documentación presentada es auténtica y
            no presenta alteración alguna, y que fue obtenida de conformidad con las disposiciones
            legales vigentes aplicables; que la información y datos proporcionados son veraces y
            actualizados, además de que reflejan la situación real de quien suscribe, todo ello para
            efectos de la identificación de los clientes o usuarios de actividades vulnerables,
            prevista en el artículo 18 Fracción I de la Ley Federal para la Prevención e
            Identificación de Operaciones con Recursos de Procedencia Ilícita.
          </Bullet>
          {/* FIX 3: texto correcto de Dueño Beneficiario */}
          <Bullet>
            En cumplimiento a la obligación establecida en el artículo 18 fracción III de la Ley
            Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia
            Ilícita, el Cliente declara que la presente operación se realiza{' '}
            <Text style={styles.legalTextBold}>por cuenta propia y para sí mismo</Text>, por lo que
            el Cliente es a la vez el Dueño Beneficiario de la operación. En términos de lo previsto
            en las Reglas de Carácter General a que se refiere la citada Ley, esta Constancia es
            firmada por quienes intervienen en la realización de la Actividad Vulnerable.
          </Bullet>
          {/* FIX 4: origen lícito */}
          <Bullet>
            El Cliente manifiesta bajo protesta de decir verdad que los recursos destinados a la
            presente operación{' '}
            <Text style={styles.legalTextBold}>provienen de fuente lícita y comprobable</Text>, y
            que no se está utilizando esta operación para encubrir, transferir o invertir recursos
            de procedencia ilícita.
          </Bullet>
          <Bullet>
            Con la finalidad de mantener actualizado el expediente, el Cliente se compromete a
            informar cualquier cambio de la información proporcionada en este documento.
          </Bullet>
        </View>

        {/* ── Firma ── */}
        <View style={styles.firmaWrap}>
          <Text style={styles.firmaCliente}>Firma del Cliente</Text>
          <Text style={styles.firmaNombre}>
            {data.clienteNombre} ({data.identificacionInventario})
          </Text>
        </View>

        <Text style={ficuStyles.avisoPrivacidad}>
          Para conocer nuestro aviso de privacidad por favor entre a:
          dilesa.mx/aviso-de-privacidad.html
        </Text>

        <FooterBand />
      </Page>
    </Document>
  );
}

/** Pie chart SVG manual — 5 segmentos uniformes (20% c/u) coloreados. */
function PieChart({ criterios }: { criterios: CriterioRiesgo[] }) {
  const size = 130;
  const r = 55;
  const cx = size / 2;
  const cy = size / 2;
  // Cada criterio aporta 20% del pie con color fijo (independiente del nivel)
  const n = criterios.length;
  const segmentAngle = (2 * Math.PI) / n;

  const segments = criterios.map((c, idx) => {
    const startAngle = idx * segmentAngle - Math.PI / 2;
    const endAngle = (idx + 1) * segmentAngle - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = segmentAngle > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { d, color: COLOR_SEGMENTO[idx], label: c.nombre };
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G>
        {segments.map((s, i) => (
          <Path key={i} d={s.d} fill={s.color} />
        ))}
      </G>
    </Svg>
  );
}

function tintForNivel(nivel: Nivel): string {
  switch (nivel) {
    case 'Bajo':
      return '#d4e8c0';
    case 'Medio':
      return '#f7e4a3';
    case 'Alto':
      return '#f4b8b8';
  }
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={ficuStyles.dataRow}>
      <Text style={ficuStyles.dataLabel}>{label} </Text>
      <Text style={ficuStyles.dataValue}>{value}</Text>
    </View>
  );
}

function DataInline({ label, value }: { label: string; value: string }) {
  return (
    <Text style={{ marginRight: 14 }}>
      <Text style={ficuStyles.dataLabel}>{label} </Text>
      <Text style={ficuStyles.dataValue}>{value}</Text>
    </Text>
  );
}

function DomicilioBlock({ d }: { d: DomicilioFicu }) {
  const tieneEstructurado =
    d.calle || d.colonia || d.municipio || d.codigoPostal || d.entidadFederativa;
  if (!tieneEstructurado && d.integrado) {
    return <DataRow label="Domicilio integrado:" value={d.integrado} />;
  }
  return (
    <>
      {d.calle ? <DataRow label="Calle:" value={d.calle} /> : null}
      <View style={ficuStyles.tripleRow}>
        {d.numeroExterior ? <DataInline label="Número exterior:" value={d.numeroExterior} /> : null}
        {d.numeroInterior ? <DataInline label="Número interior:" value={d.numeroInterior} /> : null}
      </View>
      {d.colonia ? <DataRow label="Colonia:" value={d.colonia} /> : null}
      <View style={ficuStyles.tripleRow}>
        {d.municipio ? <DataInline label="Municipio:" value={d.municipio} /> : null}
        {d.codigoPostal ? <DataInline label="CP:" value={d.codigoPostal} /> : null}
      </View>
      <View style={ficuStyles.tripleRow}>
        {d.entidadFederativa ? (
          <DataInline label="Entidad Federativa:" value={d.entidadFederativa} />
        ) : null}
        {d.pais ? <DataInline label="País:" value={d.pais} /> : null}
      </View>
    </>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={ficuStyles.bulletRow}>
      <Text style={ficuStyles.bulletDot}>•</Text>
      <Text style={styles.legalText}>{children}</Text>
    </View>
  );
}

const ficuStyles = StyleSheet.create({
  dataRow: { flexDirection: 'row', marginBottom: 1.2 },
  dataLabel: { fontSize: 8.5, color: colors.text },
  dataValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  tripleRow: { flexDirection: 'row', marginBottom: 1.2 },
  subTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginTop: 4,
    marginBottom: 2,
    color: colors.text,
  },
  riesgoSection: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 12,
  },
  riesgoLeft: { flex: 1 },
  riesgoRight: { width: 160, alignItems: 'center' },
  criterioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    gap: 4,
  },
  swatch: { width: 7, height: 7, borderRadius: 1 },
  criterioNombre: { fontSize: 8, flex: 1 },
  nivelChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  nivelChipText: { fontSize: 7, fontFamily: 'Helvetica-Bold' },
  criterioPct: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    width: 38,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSoft,
    gap: 4,
  },
  totalLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', flex: 1 },
  totalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: colors.primary },
  legalWrap: { marginTop: 8 },
  bulletRow: { flexDirection: 'row', marginBottom: 2 },
  bulletDot: { fontSize: 8, marginRight: 4, marginTop: 1, color: colors.textMuted },
  avisoPrivacidad: {
    fontSize: 7,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
});

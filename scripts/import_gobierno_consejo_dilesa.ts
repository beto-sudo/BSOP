/**
 * Sprint 4d — siembra el Consejo de Administración COMPLETO de DILESA según el
 * Acta 34 (10-ago-2022, ratifica el Acta 32 de 2021): 19 miembros.
 *
 * Reemplaza las filas `organo='consejo'` de DILESA (el baseline de 2 vitalicios
 * del Sprint 4a) por los 19 reales. NO toca `organo='comite_directivo'`.
 *
 * Mapeo a socio/familia por la tabla del Reglamento (pág. 20-21):
 *   Nigropetense → Santos de los Santos; Gesan → Santos Diego; CHC → Chavarría Cruz.
 *
 * Voto: el Reglamento (3.2.2) y las actas indican que ostentan el voto de su
 * sociedad: Gerardo (Gesan) y Urbano (Nigropetense), vitalicios; y por CHC,
 * María Josefina Cruz Santos (representante de CHC — POR CONFIRMAR con Beto).
 * Los demás 16 consejeros tienen voz.
 *
 * Idempotente (borra+reinserta el consejo). DRY_RUN=1 para previsualizar.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ybklderteyhuugzfmxbi.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY = process.env.DRY_RUN === '1';
if (!KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
/* eslint-disable @typescript-eslint/no-explicit-any */

type Ent = 'Nigropetense' | 'Gesan' | 'CHC';
type Cargo = 'presidente' | 'secretario' | 'propietario' | 'miembro';
type Miembro = {
  nombre: string;
  entidad: Ent;
  cargo: Cargo;
  ostenta_voto: boolean;
  vitalicio: boolean;
  notas: string;
};

const PERIODO_INICIO = '2022-08-10'; // Acta 34 (protocolización Escritura 208)
const REF =
  'Consejo nombrado en Acta 32 (oct-2021) y ratificado en Acta 34 (10-ago-2022), por 2 años, reelegibles.';

const CONSEJO: Miembro[] = [
  {
    nombre: 'Gerardo Santos Benavides',
    entidad: 'Gesan',
    cargo: 'presidente',
    ostenta_voto: true,
    vitalicio: true,
    notas: `Presidente. Consejero fundador vitalicio; ostenta el voto de Gesan. ${REF}`,
  },
  {
    nombre: 'Urbano Santos Benavides',
    entidad: 'Nigropetense',
    cargo: 'secretario',
    ostenta_voto: true,
    vitalicio: true,
    notas: `Secretario. Consejero fundador vitalicio; ostenta el voto de Nigropetense. ${REF}`,
  },
  {
    nombre: 'Adalberto Santos de los Santos',
    entidad: 'Nigropetense',
    cargo: 'propietario',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Tesorero. ${REF}`,
  },
  {
    nombre: 'María Josefina Cruz Santos',
    entidad: 'CHC',
    cargo: 'miembro',
    ostenta_voto: true,
    vitalicio: false,
    notas: `Vocal. Representante de CHC — ostenta el voto de CHC (POR CONFIRMAR con Beto). ${REF}`,
  },
  {
    nombre: 'Michelle Santos Diego',
    entidad: 'Gesan',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Alejandra Chavarría Cruz',
    entidad: 'CHC',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Urbano Santos de los Santos',
    entidad: 'Nigropetense',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Franziella Santos de los Santos',
    entidad: 'Nigropetense',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Patricia de los Santos Garza',
    entidad: 'Nigropetense',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Patricia Santos de los Santos',
    entidad: 'Nigropetense',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Anna Patricia Chavarría Cruz',
    entidad: 'CHC',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Salvador Chavarría Cruz',
    entidad: 'CHC',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Analicia Chavarría Cruz',
    entidad: 'CHC',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Amanda Chavarría Cruz',
    entidad: 'CHC',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Rosantina Santos Diego',
    entidad: 'Gesan',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Gerardo Santos Diego',
    entidad: 'Gesan',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Lázaro Santos Diego',
    entidad: 'Gesan',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'Gerónimo Santos Diego',
    entidad: 'Gesan',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
  {
    nombre: 'María Santos Diego',
    entidad: 'Gesan',
    cargo: 'miembro',
    ostenta_voto: false,
    vitalicio: false,
    notas: `Vocal. ${REF}`,
  },
];

async function main() {
  const { data: emp } = await (sb.schema('core') as any)
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  const empresaId = emp.id as string;

  const { data: socios } = await (sb.schema('core') as any)
    .from('empresa_socios')
    .select('id, nombre')
    .eq('empresa_id', empresaId);
  const socioId = (ent: Ent): string | null =>
    (socios ?? []).find((s: any) => s.nombre.includes(ent))?.id ?? null;

  console.log(`DILESA = ${empresaId}${DRY ? ' (DRY)' : ''}. Consejo: ${CONSEJO.length} miembros.`);
  for (const m of CONSEJO) {
    console.log(
      `  ${m.cargo.padEnd(11)} ${m.nombre}  → ${m.entidad}${m.ostenta_voto ? '  [VOTO]' : ''}${m.vitalicio ? ' [vitalicio]' : ''}`
    );
  }
  if (DRY) return;

  // Reemplaza solo el órgano 'consejo' (comité directivo intacto).
  const { error: delErr } = await (sb.schema('core') as any)
    .from('gobierno_consejeros')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('organo', 'consejo');
  if (delErr) {
    console.error(`delete consejo: ${delErr.message}`);
    process.exit(1);
  }

  const rows = CONSEJO.map((m) => ({
    empresa_id: empresaId,
    organo: 'consejo',
    socio_id: socioId(m.entidad),
    nombre: m.nombre,
    cargo: m.cargo,
    ostenta_voto: m.ostenta_voto,
    vitalicio: m.vitalicio,
    periodo_inicio: PERIODO_INICIO,
    activo: true,
    notas: m.notas,
  }));
  const { error: insErr } = await (sb.schema('core') as any)
    .from('gobierno_consejeros')
    .insert(rows);
  if (insErr) {
    console.error(`insert consejo: ${insErr.message}`);
    process.exit(1);
  }
  console.log(`\n✓ Consejo sembrado: ${rows.length} miembros (3 con voto, 2 vitalicios).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

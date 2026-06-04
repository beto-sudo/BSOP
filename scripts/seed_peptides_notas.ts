/**
 * Seed idempotente — Notas curadas + enriquecimiento de catálogo (sanren-peptides, Sprint 5).
 *
 * Cura las guías de STG (Google Doc "Guides" + wiki stairwaytogray.com) a
 * peptides.notas y enriquece peptides.peptidos para los GLP-1. NO toca el
 * Telegram (ese digest se agrega cuando libere el export).
 *
 * Idempotente: borra las notas con fuente 'STG%' y las re-inserta; el catálogo
 * se UPDATEA por nombre (no crea filas — el importer ya cargó los nombres).
 * Data personal/curada, fuera de migraciones versionadas (no corre en preview/CI).
 *
 *   DRY_RUN=1 npx tsx --env-file=.env.local scripts/seed_peptides_notas.ts
 *   npx tsx --env-file=.env.local scripts/seed_peptides_notas.ts
 *
 * No es consejo médico. Resume material comunitario con su fuente; encuadrar en UI.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
}

const DOC = 'STG Guides (doc)';
const WIKI = 'STG Wiki';
const F = '2026-05-06T00:00:00Z'; // fecha del doc "Guides"

interface NotaSeed {
  titulo: string;
  cuerpo: string;
  tipo: 'alerta' | 'hallazgo' | 'protocolo' | 'nota';
  tags: string[];
  fuente: string;
  fecha: string;
}

const NOTAS: NotaSeed[] = [
  {
    titulo: 'Seguridad básica del mercado gris (10 reglas)',
    tipo: 'protocolo',
    tags: ['seguridad'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      '1) No confíes en nadie en internet. 2) Solo agua bacteriostática Pfizer Hospira (no la del vendor). 3) No confíes en el COA del vendor (pureza/cantidad/esterilidad). 4) MOQ = 10 viales; desconfía de quien venda viales sueltos o "group buys" de terceros. 5) Evita cripto en tu 1er pedido si puedes. 6) Si no puedes testear todo, únete a un group test. 7) Pide warehouse doméstico cuando exista. 8) Los vendors de USA tienen el MISMO riesgo (o más) que los de China — trátalos igual. 9) Quédate en Tirzepatide o Semaglutide antes de explorar otros. 10) Nunca vendas a nadie; no gastes más de lo que estás dispuesto a perder.',
  },
  {
    titulo: 'Reconstitución con filtro — pasos',
    tipo: 'protocolo',
    tags: ['reconstitucion', 'esterilidad'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Material: alcohol isopropílico 70%, guantes, vial liofilizado, jeringa luer-lock 3 mL + agujas, vial estéril vacío, agua Hospira, filtro PES 0.22µm (4 o 13 mm), contenedor de sharps. Pasos: lavar/desinfectar área y puertos; cargar agua Hospira; inyectar al vial liofilizado; girar suave y dejar disolver 5+ min; aspirar todo; quitar aguja, instalar filtro PES, nueva aguja, empujar a vial estéril nuevo. El filtro remueve bacterias/mold ya presentes; el agua Hospira evita que crezcan pero no remueve lo que ya hay.',
  },
  {
    titulo: 'Cálculo de dosis y concentración',
    tipo: 'nota',
    tags: ['dosis'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Units = volumen en la jeringa. La masa de péptido en el vial es fija; el agua que agregas define la CONCENTRACIÓN (mg/mL). Regla fácil: 1 mL por cada 10 mg (1 mL→10 mg, 25 u = 2.5 mg). Viales suelen ser de 3 mL, así que en dosis grandes (30/40/60 mg) usa 0.5 mL por 10 mg. Anota SIEMPRE la concentración usada. Calculadoras: compoundpal.com, reverse.peprecon.com (ojo: muchas usan mcg, 1 mg = 1000 mcg).',
  },
  {
    titulo: 'Almacenamiento y BUD (vida útil)',
    tipo: 'nota',
    tags: ['almacenamiento'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Powder liofilizado → freezer hasta reconstituir (2-3 años en freezer estándar -18°C; 5+ años en ultracold -60/-80°C). Reconstituido → refrigerador. Agua Hospira → lugar fresco/oscuro, NO en fridge; BUD 28 días desde la 1ª punción. USP marca 28 días tras puncionar un vial multidosis; método aséptico + filtrado ayudan a extenderlo. Cada punción es una oportunidad de contaminación.',
  },
  {
    titulo: 'Group testing — qué buscar',
    tipo: 'protocolo',
    tags: ['testing'],
    fuente: `${DOC} + ${WIKI} (Testing 101)`,
    fecha: F,
    cuerpo:
      'Test primario: HPLC (presencia del péptido, pureza, masa real en mg). Objetivo: ≥98% de pureza y ±15% de masa vs la etiqueta. Janoshik = gold standard internacional; muchos vendors solo honran garantía con reporte Janoshik (pregunta su política antes de comprar). Endotoxina y esterilidad: córrelos por la DATA, no porque el vendor del mercado gris vaya a reembolsar. Más vials testeados del mismo batch = mejor promedio (ley de los grandes números). Detalle: stairwaytogray.com/posts/testing/testing-101/',
  },
  {
    titulo: 'Endotoxina y esterilidad — por qué importan',
    tipo: 'alerta',
    tags: ['seguridad', 'endotoxina'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Endotoxina = toxinas bacterianas que NO se filtran (más pequeñas que el poro del filtro). El test de esterilidad (TAMC/TYMC en Janoshik, USP71 en PeptideTest) cultiva para ver si crece bacteria. Son suplementos al COA y rara vez tienen garantía de reembolso/reship. Un batch con endotoxina alta es un riesgo agudo — por eso el filtro de endotoxina del módulo está al frente.',
  },
  {
    titulo: 'Notación de kits',
    tipo: 'nota',
    tags: ['basics'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Kit = 10 viales. T30 = Tirz 300 mg (10×30 mg). R10 = Reta 100 mg (10×10 mg). C10 = Cagri 100 mg. S10 = Sema 100 mg. Ej: T30 da 6 dosis de 5 mg, 4 de 7.5 mg o 3 de 10 mg por vial. Todo llega como powder liofilizado en vial de 3 mL — NO comprar líquido ni "raw".',
  },
  {
    titulo: 'Vendors vs group buys',
    tipo: 'nota',
    tags: ['sourcing'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Vendor Promo = venta directa del vendor (con su rep). Aunque listen COAs, NO se confían los tests del vendor; testea tú o en grupo tras recibir (batch/cap color/fecha). "Group buy" de terceros (alguien que junta MOQ) = mucho más riesgoso, NO para newbies — la mayoría de scams vienen de ahí. No hay "mejor vendor": todos tienen pros/contras y un buen vendor hoy puede fallar mañana; lee el historial de la hoja de vendors.',
  },
  {
    titulo: 'Pagos / Crypto 1-2-3',
    tipo: 'nota',
    tags: ['pago', 'crypto'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Nunca pagues al vendor directo desde Coinbase/Cashapp/Zelle (riesgo de baneo de cuenta) — envía desde tu wallet personal (Trust Wallet). Compra USDC/USDT + un poco de gas (SOL/ETH baratos; TRON es el más caro). Siempre haz una transacción de prueba ($5-20) y que el vendor confirme. Los DMs con info de pago son 99% scam: usa solo el contacto del Vendor Promo.',
  },
  {
    titulo: 'Labs de sangre recomendados',
    tipo: 'nota',
    tags: ['salud', 'labs'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Idealmente: una vez antes de empezar y luego cada 6 meses (opcional durante un stall). Panel: Metabólico completo (CBC, CMP, lípidos, ALT/AST, bilirrubina, fosfatasa alc.), Tiroides (TSH/T3/T4), A1C (diabetes/prediabetes), Lipasa (páncreas). Útil también: DEXA (músculo/grasa) y monitor de presión. Se pueden ordenar sin doctor (privatemdlabs, ultalabtests, ownyourlabs, functionhealth…).',
  },
  {
    titulo: 'Insumos clave',
    tipo: 'nota',
    tags: ['insumos'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Agua bacteriostática: SOLO Hospira (0.9% benzyl alcohol); BUD 28 días post-punción. Viales estériles (no confiar en "esterilidad" de Amazon). Jeringas luer-lock 3 mL 25-27g para reconstituir; jeringas de insulina (0.5/1 mL) para inyectar (aguja 5/16"). Filtros PES 0.22µm de 4 o 13 mm. Proveedores en la pestaña Insumos.',
  },
  {
    titulo: 'Diccionario de términos',
    tipo: 'nota',
    tags: ['glosario'],
    fuente: DOC,
    fecha: F,
    cuerpo:
      'Lyophilized: powder liofilizado. COA: Certificate of Analysis (pureza/cantidad por HPLC). Sterility test: cultivo para detectar bacteria. Endotoxin test: toxinas bacterianas no filtrables. TAMC/TYMC: conteos de esterilidad (Janoshik). USP71: esterilidad (PeptideTest). MOQ: pedido mínimo. Domestic warehouse: envía desde USA (ya pasó aduana). International: envía de China (pasa aduana). Pinning: inyectar. BAC water: agua con 0.9% benzyl alcohol.',
  },
];

interface CatalogoSeed {
  nombre: string;
  clase: string;
  descripcion: string;
  reconstitucion: string;
  cautelas: string;
}

const CATALOGO: CatalogoSeed[] = [
  {
    nombre: 'Tirzepatide',
    clase: 'glp1',
    descripcion:
      'Agonista dual GIP/GLP-1. El péptido más usado y con más data clínica del espacio (>10M usuarios en USA, FDA-approved como Mounjaro/Zepbound). API producida en China (algunos en India).',
    reconstitucion:
      'Liofilizado; reconstituir con agua Hospira (1 mL por 10 mg = 100 u; 0.5 mL/10 mg en viales grandes). Filtro PES 0.22µm opcional. Powder→freezer, líquido→fridge.',
    cautelas:
      'No comprar líquido ni "raw". Gray-grade: confirma pureza/masa por testing independiente. Investiga efectos/interacciones antes de iniciar.',
  },
  {
    nombre: 'Semaglutide',
    clase: 'glp1',
    descripcion:
      'Agonista GLP-1. FDA-approved (Ozempic/Wegovy), amplia data clínica de seguridad y eficacia.',
    reconstitucion: 'Igual que Tirz: liofilizado, agua Hospira, 1 mL por 10 mg.',
    cautelas: 'Investiga perfil antes de iniciar; confirma por testing independiente.',
  },
  {
    nombre: 'Retatrutide',
    clase: 'glp1',
    descripcion:
      'Triple agonista GLP-1 / GIP / glucagón. En ensayos clínicos (aún no aprobado por FDA).',
    reconstitucion: 'Liofilizado; agua Hospira. Confirmar concentración y anotarla.',
    cautelas:
      'Mueve frecuencia cardiaca en reposo, presión y peso — relevante con historia cardiovascular; coordina con tu seguimiento médico. Perfil de seguridad aún en estudio.',
  },
  {
    nombre: 'Cagrilintide',
    clase: 'glp1',
    descripcion:
      'Análogo de amilina de acción larga; se estudia solo y combinado con Semaglutide (CagriSema).',
    reconstitucion: 'Liofilizado; agua Hospira.',
    cautelas: 'En investigación; confirma por testing independiente.',
  },
  {
    nombre: 'Mazdutide',
    clase: 'glp1',
    descripcion: 'Agonista dual GLP-1 / glucagón; en ensayos clínicos.',
    reconstitucion: 'Liofilizado; agua Hospira.',
    cautelas: 'En investigación; confirma por testing independiente.',
  },
  {
    nombre: 'BPC-157',
    clase: 'healing',
    descripcion:
      'Pentadecapéptido de 15 aminoácidos (sec. GEPPPGKPADDAGLV; fórmula C62H98N16O22; CAS 1628202-19-6). Se investiga para reparación de tejido (tendón, intestino); SIN aprobación clínica ni ensayos de fase tardía en humanos.',
    reconstitucion:
      'Liofilizado, soluble en agua (≥5 mg/mL). Reconstituir con agua Hospira; almacenar refrigerado 2-8°C.',
    cautelas:
      'Research-grade, perfil de seguridad en humanos no establecido. Confirma identidad/pureza/endotoxina por testing independiente (la COA del vendor no basta).',
  },
];

interface TelegramNota extends NotaSeed {
  peptido?: string | null;
  vendor?: string | null;
}

// Alertas de mods curadas del export del Telegram STG (ventana 16-30 ene 2026).
const T = 'STG Telegram';
const TF = '2026-01-30T00:00:00Z';
const TELEGRAM: TelegramNota[] = [
  {
    titulo: 'ASC baneado de STG',
    tipo: 'alerta',
    tags: ['vendor', 'ban'],
    vendor: 'ASC',
    fuente: T,
    fecha: TF,
    cuerpo:
      'STG baneó a ASC: mandó producto equivocado (un cliente testeó "AOD" en Janoshik y NO era AOD), no reembolsó LipoC con pH extremadamente ácido, y hubo reportes de Reta turbia y NAD gelificado. La garantía de pureza no sirve si mandan el producto equivocado o peligroso.',
  },
  {
    titulo: '"AOD purple cap" es frag176-191, no AOD9604',
    tipo: 'alerta',
    tags: ['testing', 'adulteracion'],
    peptido: 'AOD',
    fuente: T,
    fecha: TF,
    cuerpo:
      'Resultados Janoshik: todos los "purple cap AOD" testearon como frag176-191 (ASC nov/dic, QYC nov, HYB nov, SSA nov; también sep). HYB white cap = AOD subdosificado (0.97 mg). Si compras "purple cap AOD" probablemente recibes frag.',
  },
  {
    titulo: 'SRY — recall multi-péptido (impureza p-chlorocresol)',
    tipo: 'alerta',
    tags: ['recall', 'contaminacion'],
    vendor: 'SRY',
    fuente: T,
    fecha: TF,
    cuerpo:
      'Recall de SRY por impureza; Janoshik identificó por espectrometría de masas que la impureza es p-chlorocresol (no 4-hidroxi como decía el aviso de SRY). Recomendación de STG: no devolver el producto (riesgo + reventa); destruirlo a cambio de reship/refund.',
  },
  {
    titulo: "SRYLAB — recall batch E22050528 (aditivo 4'-hidroxiacetofenona)",
    tipo: 'alerta',
    tags: ['recall', 'contaminacion'],
    vendor: 'SRY',
    fuente: T,
    fecha: TF,
    cuerpo:
      "SRYLAB detectó trazas de 4'-hidroxiacetofenona (CAS 99-93-4) en el batch E22050528: CAG 5/10 mg, Reta 5/10 mg, Tirz 10/20/30 mg, MOTS-C 10 mg, MT-2 10 mg (sobre todo T30). Origen: residuo de tubing de silicón de un proveedor previo. Reemplazo/refund a afectados.",
  },
  {
    titulo: 'SRY GHK-Cu 50mg blue cap — sobrellenado ~2x',
    tipo: 'hallazgo',
    tags: ['testing'],
    vendor: 'SRY',
    peptido: 'GHK-Cu',
    fuente: T,
    fecha: TF,
    cuerpo:
      '2 viales de SRY GHK-Cu 50 mg (blue cap) testearon 100% sobrellenados (~100 mg en vez de 50 mg), vía Janoshik. Recordatorio: testea tus kits.',
  },
  {
    titulo: 'SSA T15 red cap (Mfg 17-ene) — mal etiquetado, es Retatrutide',
    tipo: 'alerta',
    tags: ['adulteracion', 'testing'],
    vendor: 'SSA',
    peptido: 'Tirzepatide',
    fuente: T,
    fecha: TF,
    cuerpo:
      'Kits SSA T15 red cap (Mfg 17-ene-2025) vendidos como Tirzepatide testearon como Retatrutide (confirmado por Janoshik, HPLC+LCMS: vial A = Reta 4728 Da). No se sabe si todos los kits de ese mfg están afectados — testea antes de usar.',
  },
  {
    titulo: 'Checa el pH antes de inyectar',
    tipo: 'nota',
    tags: ['seguridad', 'reconstitucion'],
    fuente: T,
    fecha: TF,
    cuerpo:
      'Los GLP-1 reconstituidos deben quedar en pH 6-9. Para subQ, 4-9 se considera "seguro" para comodidad de inyección. Usa tiras de pH (Amazon). LipoC ácido ha causado problemas.',
  },
  {
    titulo: 'NovoPen / adapters — precaución + recall de adapters',
    tipo: 'alerta',
    tags: ['insumos', 'seguridad'],
    fuente: T,
    fecha: TF,
    cuerpo:
      'Los cartuchos de 3 mL no entran al NovoPen sin adapter; forzarlos daña la pluma o el cartucho. Además: adapters Gansulin/NovoPen NP Max retirados por posible falla estructural bajo presión — dejar de usarlos (reemplazo/refund por email).',
  },
  {
    titulo: 'SLU-PP — no inyectable',
    tipo: 'alerta',
    tags: ['seguridad'],
    fuente: T,
    fecha: TF,
    cuerpo:
      'SLU-PP es hidrofóbico y requiere solventes no seguros para inyección. Oral: tests de miembros sugieren que no sobrevive el ácido estomacal y se degrada en fragmentos tipo hidrazina (no ingerir).',
  },
  {
    titulo: 'Botox DIY — desaconsejado',
    tipo: 'alerta',
    tags: ['seguridad'],
    fuente: T,
    fecha: TF,
    cuerpo:
      'No hay labs en la comunidad que verifiquen la potencia del Botox. Un vial de 100u tiene solo 5-20 ng de toxina activa; errores mínimos de dosis aumentan el riesgo de toxicidad letal. Fuertemente desaconsejado el DIY de fuentes no reguladas.',
  },
  {
    titulo: 'PBS no es para inyección',
    tipo: 'nota',
    tags: ['seguridad'],
    fuente: T,
    fecha: TF,
    cuerpo:
      'PBS es un reactivo de laboratorio, no un producto farmacéutico; no está destinado a inyección en humanos.',
  },
  {
    titulo: 'PSA — impersonadores / grupos STG falsos',
    tipo: 'alerta',
    tags: ['scam', 'seguridad'],
    fuente: T,
    fecha: TF,
    cuerpo:
      'Circula un impersonador con grupo STG y cuenta "Stair Master" falsos. No mandes dinero ni info. Verifica siempre vía stairwaytogray.com (tiene el Discord correcto). No confíes en DMs no solicitados (99% scam).',
  },
];

// Curado de los PDFs del export (análisis comunitario "Manufacturer Groups").
const PDFS: TelegramNota[] = [
  {
    titulo: 'Manufacturer Groups — 5 grupos de fábrica (96 de 97 vendors)',
    tipo: 'hallazgo',
    tags: ['sourcing', 'manufacturer'],
    fuente: 'STG Manufacturer Groups (PDF)',
    fecha: '2026-04-12T00:00:00Z',
    cuerpo:
      'Análisis comunitario que agrupa 96 de 97 vendors en 5 "grupos de fábrica" por su firma de COA (Diff% y pureza% por producto, ventanas de 60 días). Insight clave: vendors del mismo grupo probablemente comparten manufacturer/source — un test limpio en uno es evidencia (no garantía) para los otros, y "vendors distintos" pueden ser la misma fábrica. Grupos (vendors clave): G1 — foco Reta/Tirz, Tesamorelin bajo (ABC, PTB, QYC, Shanghai JinBei/Leader, LSPL…); G2 — el más grande (BFF/AMO, JEEP, QST, SSA, TFC, SRY, Uther, Reta-Peptide, XDR…); G3 — GHK-Cu alto (HYB, PMQ…); G4 — Tirz Diff alto (HK Peptides, Tydes, WBS…); G5 — GHK-Cu 100mg muy negativo (QSC…). Úsalo para no "diversificar" comprándole a 3 vendors que en realidad son la misma fábrica.',
  },
];

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const sbp = (sb as { schema: (s: string) => ReturnType<typeof sb.schema> }).schema('peptides');

  console.log(
    `Curado: ${NOTAS.length} guía + ${TELEGRAM.length} Telegram + ${PDFS.length} PDF notas · ${CATALOGO.length} péptidos`
  );
  if (DRY_RUN) {
    console.log(
      '[DRY_RUN] notas:',
      [...NOTAS, ...TELEGRAM, ...PDFS].map((n) => `${n.tipo}: ${n.titulo}`)
    );
    console.log(
      '[DRY_RUN] catálogo:',
      CATALOGO.map((c) => c.nombre)
    );
    return;
  }

  // Notas: idempotente (borra las STG-sourced y re-inserta).
  const { error: delErr } = await sbp.from('notas').delete().like('fuente', 'STG%');
  if (delErr) throw new Error(`delete notas: ${delErr.message}`);
  const rows = [
    ...NOTAS.map((n) => ({ ...n, peptido: null, vendor_codigo: null })),
    ...[...TELEGRAM, ...PDFS].map((n) => ({
      titulo: n.titulo,
      cuerpo: n.cuerpo,
      tipo: n.tipo,
      tags: n.tags,
      fuente: n.fuente,
      fecha: n.fecha,
      peptido: n.peptido ?? null,
      vendor_codigo: n.vendor ?? null,
    })),
  ];
  const { error: insErr } = await sbp.from('notas').insert(rows);
  if (insErr) throw new Error(`insert notas: ${insErr.message}`);

  // Catálogo: UPDATE por nombre (no crea filas).
  let enriquecidos = 0;
  for (const c of CATALOGO) {
    const { error, count } = await sbp
      .from('peptidos')
      .update(
        {
          clase: c.clase,
          descripcion: c.descripcion,
          reconstitucion: c.reconstitucion,
          cautelas: c.cautelas,
          fuente: 'STG Guides + Wiki',
        },
        { count: 'exact' }
      )
      .eq('nombre', c.nombre);
    if (error) throw new Error(`update ${c.nombre}: ${error.message}`);
    enriquecidos += count ?? 0;
  }

  console.log(`✓ ${NOTAS.length} notas insertadas · ${enriquecidos} péptidos enriquecidos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

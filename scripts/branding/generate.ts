/**
 * Genera el paquete completo de branding por empresa a partir de un SVG master.
 *
 * Uso:
 *   npx tsx scripts/branding/generate.ts \
 *     --empresa dilesa \
 *     --svg public/brand/dilesa/master.svg \
 *     --primario '#7D812E' \
 *     --secundario '#4F4C4D' \
 *     --fondo '#FAF7EE' \
 *     --upload
 *
 * Flags:
 *   --empresa <slug>       slug de core.empresas (obligatorio)
 *   --svg <path>           SVG master local (obligatorio en primera corrida)
 *   --primario <hex>       color primario
 *   --secundario <hex>     color secundario
 *   --fondo <hex>          fondo de marca claro (default crema neutro)
 *   --texto <hex>          color de texto de títulos (default #1F1F1F)
 *   --upload               si se pasa, sube al bucket `empresas` y actualiza DB
 *   --only <list>          solo genera variantes de la lista (comma-separated)
 *                          ej. --only header_email,footer_doc
 *   --split-ratio <0..1>   fracción vertical donde termina el isotipo; default 0.72
 *                          (bajar si el wordmark ocupa más de la mitad del SVG)
 *   --wordmark-colors <hex,hex>
 *                          colores del wordmark (para SVGs donde NO es gris neutro;
 *                          e.g. RDB tiene wordmark en dos verdes saturados)
 *
 * Salida:
 *   Archivos locales → `public/brand/<slug>/<variant>.{svg,png,ico}`
 *   Si --upload → sube a Supabase Storage `empresas/<slug>/brand/` y actualiza DB.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharpBase from 'sharp';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Wrapper que siempre pasa limitInputPixels: false — evita "bad extract area" /
// "pixel limit exceeded" al procesar SVG que se expanden a buffers grandes.
// Si el primer argumento es un objeto de opciones (tiene `create` o `text`), se
// mergea en las opciones; si es Buffer/string/etc, va como input.
function sharp(input?: unknown, opts?: Record<string, unknown>) {
  const mergedOpts = { limitInputPixels: false, ...(opts ?? {}) };
  if (
    input &&
    typeof input === 'object' &&
    !Buffer.isBuffer(input) &&
    !(input instanceof Uint8Array) &&
    !Array.isArray(input) &&
    !(input instanceof ArrayBuffer)
  ) {
    return sharpBase({ ...(input as object), ...mergedOpts } as unknown as Parameters<typeof sharpBase>[0]);
  }
  // @ts-expect-error — input overloads are broad
  return sharpBase(input, mergedOpts);
}

// ─── Env loader (same convention as otros scripts) ──────────────────────────────

function loadEnvFile(filePath: string) {
  try {
    const content = require('node:fs').readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // ignore si no existe — sigue funcionando si las vars ya están en el entorno
  }
}

// ─── CLI parser minimal ─────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

// ─── Types ──────────────────────────────────────────────────────────────────────

type Paleta = {
  primario: string;
  primario_dark: string;
  secundario: string;
  fondo: string;
  texto: string;
  inverso: string;
};

type EmpresaRow = {
  id: string;
  slug: string;
  nombre: string;
  nombre_comercial: string | null;
  razon_social: string | null;
  rfc: string | null;
  domicilio_calle: string | null;
  domicilio_numero_ext: string | null;
  domicilio_colonia: string | null;
  domicilio_municipio: string | null;
  domicilio_estado: string | null;
  domicilio_cp: string | null;
};

type GeneratedAsset = {
  variant: string;
  localPath: string;
  contentType: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function darken(hex: string, amount = 0.15): string {
  const h = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function rgbFromPctString(s: string): [number, number, number] {
  // "rgb(48.98%, 50.50%, 18.29%)" → [125, 129, 47]
  const m = s.match(/rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)/);
  if (!m) throw new Error(`No parseable rgb string: ${s}`);
  return [
    Math.round(parseFloat(m[1]) * 2.55),
    Math.round(parseFloat(m[2]) * 2.55),
    Math.round(parseFloat(m[3]) * 2.55),
  ];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Reemplaza TODOS los colores del SVG (formato rgb(xx%, yy%, zz%)) por UN color target.
 * Util para generar variante "inversa" donde todo el logo se pinta en blanco/crema.
 */
function recolorSvgAll(svg: string, targetHex: string): string {
  const [r, g, b] = hexToRgb(targetHex);
  return svg.replace(/rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)/g, () => {
    return `rgb(${((r / 255) * 100).toFixed(4)}%, ${((g / 255) * 100).toFixed(4)}%, ${((b / 255) * 100).toFixed(4)}%)`;
  });
}

/**
 * Reemplaza solo el wordmark por un color target. Por default detecta grises
 * neutros (saturación < 0.2). Si se pasan `extraHexes`, también reemplaza esos
 * colores exactos (para wordmarks con colores saturados como RDB).
 * Preserva el color del isotipo.
 */
function recolorSvgWordmark(svg: string, targetHex: string, extraHexes: string[] = []): string {
  const [r, g, b] = hexToRgb(targetHex);
  const targetStr = `rgb(${((r / 255) * 100).toFixed(4)}%, ${((g / 255) * 100).toFixed(4)}%, ${((b / 255) * 100).toFixed(4)}%)`;
  const extras = extraHexes.map((h) => hexToRgb(h));
  const colorMatches = (rr: number, gg: number, bb: number) =>
    extras.some(([er, eg, eb]) => Math.abs(rr - er) <= 3 && Math.abs(gg - eg) <= 3 && Math.abs(bb - eb) <= 3);
  return svg.replace(/rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)/g, (match) => {
    const [rr, gg, bb] = rgbFromPctString(match);
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation < 0.2) return targetStr;
    if (colorMatches(rr, gg, bb)) return targetStr;
    return match;
  });
}

async function svgBox(svg: string): Promise<{ width: number; height: number }> {
  const meta = await sharp(Buffer.from(svg), { density: 300, limitInputPixels: false }).metadata();
  return { width: meta.width ?? 1000, height: meta.height ?? 1000 };
}

// ─── Generadores por variante ───────────────────────────────────────────────────

/**
 * Aplana SVG a PNG con fondo blanco (no transparente) y lo split en isotipo (top)
 * y wordmark (bottom). El flatten es crítico para que .trim() recorte horizontalmente.
 */
/**
 * Split del master SVG en isotipo (top) y wordmark (bottom).
 *
 * @param mode 'opaque' (flatten a blanco + trim por color blanco) o 'alpha'
 *             (preservar transparencia + trim por canal alpha). Usa 'alpha' cuando
 *             el contenido del SVG es blanco/inverso para que el trim no recorte
 *             los pixeles del propio logo.
 */
async function splitMaster(masterSvg: string, splitRatio = 0.72, mode: 'opaque' | 'alpha' = 'opaque') {
  const base = sharp(Buffer.from(masterSvg), { density: 300, limitInputPixels: false });
  const masterPng =
    mode === 'opaque'
      ? await base.flatten({ background: '#ffffff' }).png().toBuffer()
      : await base.png().toBuffer();

  const meta = await sharp(masterPng).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const splitY = Math.round(H * splitRatio);

  // Sharp tiene un bug al encadenar extract().trim() sobre output de flatten();
  // separamos en 2 pipelines (extract → buffer → trim → buffer).
  const trimOpts =
    mode === 'opaque'
      ? { background: '#ffffff', threshold: 10 }
      : { threshold: 10 }; // sin background → usa pixel top-left (transparente)

  const isoRaw = await sharp(masterPng)
    .extract({ left: 0, top: 0, width: W, height: splitY })
    .png()
    .toBuffer();
  const iso = await sharp(isoRaw).trim(trimOpts).toBuffer();

  const wordRaw = await sharp(masterPng)
    .extract({ left: 0, top: splitY, width: W, height: H - splitY })
    .png()
    .toBuffer();
  const word = await sharp(wordRaw).trim(trimOpts).toBuffer();

  return { iso, word };
}

async function composeHorizontalLight(
  outDir: string,
  masterSvg: string,
  _paleta: Paleta,
  splitRatio: number,
): Promise<GeneratedAsset> {
  const { iso, word } = await splitMaster(masterSvg, splitRatio);

  const targetH = 400;
  const isoResized = await sharp(iso).resize({ height: targetH }).png().toBuffer();
  const wordResized = await sharp(word).resize({ height: Math.round(targetH * 0.38) }).png().toBuffer();
  const iM = await sharp(isoResized).metadata();
  const wM = await sharp(wordResized).metadata();

  const gap = Math.round(targetH * 0.12);
  const padding = Math.round(targetH * 0.1);
  const canvasW = padding * 2 + iM.width! + gap + wM.width!;
  const canvasH = padding * 2 + targetH;

  const composed = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
  })
    .composite([
      { input: isoResized, left: padding, top: Math.round((canvasH - iM.height!) / 2) },
      { input: wordResized, left: padding + iM.width! + gap, top: Math.round((canvasH - wM.height!) / 2) },
    ])
    .png()
    .toBuffer();

  const finalPath = path.join(outDir, 'logo-horizontal-light.png');
  await fs.writeFile(finalPath, composed);
  return { variant: 'logo_horizontal_light', localPath: finalPath, contentType: 'image/png' };
}

async function composeHorizontalDark(
  outDir: string,
  masterSvg: string,
  paleta: Paleta,
  splitRatio: number,
  wordmarkColors: string[],
): Promise<GeneratedAsset> {
  // Para dark: pinta el wordmark (el gris neutro del SVG) a color inverso (blanco/crema)
  // Dejamos el isotipo con su color primario original (se ve bien sobre oscuro).
  const darkSvg = recolorSvgWordmark(masterSvg, paleta.inverso, wordmarkColors);

  const masterPng = await sharp(Buffer.from(darkSvg), { density: 300, limitInputPixels: false }).png().toBuffer();
  const meta = await sharp(masterPng).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const splitY = Math.round(H * splitRatio);
  const iso = await sharp(masterPng)
    .extract({ left: 0, top: 0, width: W, height: splitY })
    .trim({ background: 'white', threshold: 10 })
    .toBuffer();
  const word = await sharp(masterPng)
    .extract({ left: 0, top: splitY, width: W, height: H - splitY })
    .trim({ background: 'white', threshold: 10 })
    .toBuffer();
  const targetH = 400;
  const isoResized = await sharp(iso).resize({ height: targetH }).png().toBuffer();
  const wordResized = await sharp(word).resize({ height: Math.round(targetH * 0.45) }).png().toBuffer();
  const isoM = await sharp(isoResized).metadata();
  const wordM = await sharp(wordResized).metadata();
  const gap = 40;
  const padding = 40;
  const canvasW = padding * 2 + isoM.width! + gap + wordM.width!;
  const canvasH = padding * 2 + targetH;
  const composed = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: isoResized, left: padding, top: Math.round((canvasH - isoM.height!) / 2) },
      { input: wordResized, left: padding + isoM.width! + gap, top: Math.round((canvasH - wordM.height!) / 2) },
    ])
    .png()
    .toBuffer();

  const finalPath = path.join(outDir, 'logo-horizontal-dark.png');
  await fs.writeFile(finalPath, composed);
  return { variant: 'logo_horizontal_dark', localPath: finalPath, contentType: 'image/png' };
}

async function composeVertical(outDir: string, masterSvg: string): Promise<GeneratedAsset> {
  // El master ya es vertical — lo exportamos como PNG alto res recortado a bbox.
  const png = await sharp(Buffer.from(masterSvg), { density: 300, limitInputPixels: false })
    .trim({ background: '#ffffff', threshold: 10 })
    .resize({ height: 1200, withoutEnlargement: false })
    .png()
    .toBuffer();
  const finalPath = path.join(outDir, 'logo-vertical.png');
  await fs.writeFile(finalPath, png);
  return { variant: 'logo_vertical', localPath: finalPath, contentType: 'image/png' };
}

async function composeIsotipo(outDir: string, masterSvg: string, splitRatio: number): Promise<GeneratedAsset> {
  const { iso } = await splitMaster(masterSvg, splitRatio);
  const out = await sharp(iso).resize({ height: 1200 }).png().toBuffer();
  const finalPath = path.join(outDir, 'isotipo.png');
  await fs.writeFile(finalPath, out);
  return { variant: 'isotipo', localPath: finalPath, contentType: 'image/png' };
}

async function composeFavicon(outDir: string, masterSvg: string, paleta: Paleta, splitRatio: number): Promise<GeneratedAsset> {
  // 512x512 cuadrado con fondo color primario + isotipo en color inverso centrado.
  const invSvg = recolorSvgAll(masterSvg, paleta.inverso);
  const { iso } = await splitMaster(invSvg, splitRatio, 'alpha');
  const isoFit = await sharp(iso)
    .resize({ width: 360, height: 360, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const [pr, pg, pb] = hexToRgb(paleta.primario);
  const composed = await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: pr, g: pg, b: pb, alpha: 1 } },
  })
    .composite([{ input: isoFit, gravity: 'center' }])
    .png()
    .toBuffer();

  const finalPath = path.join(outDir, 'favicon-512.png');
  await fs.writeFile(finalPath, composed);
  return { variant: 'favicon', localPath: finalPath, contentType: 'image/png' };
}

async function composeHeaderEmail(
  outDir: string,
  masterSvg: string,
  paleta: Paleta,
  splitRatio: number,
): Promise<GeneratedAsset> {
  // Banner 1600x320 con fondo gradiente primario y logo completo en color inverso.
  const W = 1600;
  const H = 320;

  // Recolorea TODO a inverso (isotipo + wordmark) porque el fondo es primario.
  const invSvg = recolorSvgAll(masterSvg, paleta.inverso);
  const { iso, word } = await splitMaster(invSvg, splitRatio, 'alpha');

  const targetIsoH = Math.round(H * 0.62);
  const targetWordH = Math.round(targetIsoH * 0.38);
  const isoResized = await sharp(iso).resize({ height: targetIsoH }).png().toBuffer();
  const wordResized = await sharp(word).resize({ height: targetWordH }).png().toBuffer();
  const iM = await sharp(isoResized).metadata();
  const wM = await sharp(wordResized).metadata();

  const gap = Math.round(targetIsoH * 0.15);
  const totalW = iM.width! + gap + wM.width!;
  const isoX = Math.round((W - totalW) / 2);
  const wordX = isoX + iM.width! + gap;

  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${paleta.primario}"/>
        <stop offset="100%" stop-color="${paleta.primario_dark}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
  </svg>`;
  const bg = await sharp(Buffer.from(bgSvg)).png().toBuffer();

  const composed = await sharp(bg)
    .composite([
      { input: isoResized, left: isoX, top: Math.round((H - iM.height!) / 2) },
      { input: wordResized, left: wordX, top: Math.round((H - wM.height!) / 2) },
    ])
    .png()
    .toBuffer();

  const finalPath = path.join(outDir, 'header-email.png');
  await fs.writeFile(finalPath, composed);
  return { variant: 'header_email', localPath: finalPath, contentType: 'image/png' };
}

async function composeFooterDoc(
  outDir: string,
  empresa: EmpresaRow,
  paleta: Paleta,
): Promise<GeneratedAsset> {
  // Footer 1600x160 con barra de color primario arriba + texto fiscal abajo
  const W = 1600;
  const H = 160;

  const domicilio = [
    [empresa.domicilio_calle, empresa.domicilio_numero_ext].filter(Boolean).join(' '),
    empresa.domicilio_colonia,
    [empresa.domicilio_municipio, empresa.domicilio_estado].filter(Boolean).join(', '),
    empresa.domicilio_cp ? `C.P. ${empresa.domicilio_cp}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const razon = empresa.razon_social ?? empresa.nombre_comercial ?? empresa.nombre;
  const rfc = empresa.rfc ?? '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="8" fill="${paleta.primario}"/>
    <rect y="8" width="${W}" height="${H - 8}" fill="${paleta.fondo}"/>
    <text x="${W / 2}" y="55" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" fill="${paleta.texto}">
      ${escapeXml(razon)}${rfc ? `  ·  RFC: ${escapeXml(rfc)}` : ''}
    </text>
    <text x="${W / 2}" y="90" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${paleta.secundario}">
      ${escapeXml(domicilio)}
    </text>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const finalPath = path.join(outDir, 'footer-doc.png');
  await fs.writeFile(finalPath, png);
  return { variant: 'footer_doc', localPath: finalPath, contentType: 'image/png' };
}

async function composeWatermark(outDir: string, masterSvg: string, splitRatio: number): Promise<GeneratedAsset> {
  // Marca de agua: isotipo grande, opacidad 8%, rotado 30°
  const { iso: isoBuf } = await splitMaster(masterSvg, splitRatio);
  const iso = await sharp(isoBuf)
    .resize({ height: 1200 })
    .rotate(-30, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const watermark = await sharp(iso)
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([0, 0, 0, Math.round(255 * 0.08)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
  const finalPath = path.join(outDir, 'watermark.png');
  await fs.writeFile(finalPath, watermark);
  return { variant: 'watermark', localPath: finalPath, contentType: 'image/png' };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Supabase upload ────────────────────────────────────────────────────────────

async function uploadAsset(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  slug: string,
  asset: GeneratedAsset,
): Promise<string> {
  const filename = path.basename(asset.localPath);
  const storagePath = `${slug}/brand/${filename}`;
  const body = await fs.readFile(asset.localPath);
  const { error } = await supabase.storage
    .from('branding')
    .upload(storagePath, body, { upsert: true, contentType: asset.contentType });
  if (error) throw new Error(`Upload ${asset.variant}: ${error.message}`);
  const { data } = supabase.storage.from('branding').getPublicUrl(storagePath);
  return `${data.publicUrl}?v=${Date.now()}`;
}

async function uploadMasterSvg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  slug: string,
  svgPath: string,
): Promise<string> {
  const body = await fs.readFile(svgPath);
  const storagePath = `${slug}/brand/master.svg`;
  const { error } = await supabase.storage
    .from('branding')
    .upload(storagePath, body, { upsert: true, contentType: 'image/svg+xml' });
  if (error) throw new Error(`Upload master.svg: ${error.message}`);
  const { data } = supabase.storage.from('branding').getPublicUrl(storagePath);
  return `${data.publicUrl}?v=${Date.now()}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '..', '..');
  loadEnvFile(path.join(repoRoot, '.env.local'));

  const args = parseArgs(process.argv.slice(2));
  const slug = args.empresa as string;
  const svgArg = args.svg as string | undefined;
  if (!slug) throw new Error('--empresa <slug> es obligatorio');

  const paleta: Paleta = {
    primario: (args.primario as string) ?? '#000000',
    primario_dark: '',
    secundario: (args.secundario as string) ?? '#666666',
    fondo: (args.fondo as string) ?? '#FAF7EE',
    texto: (args.texto as string) ?? '#1F1F1F',
    inverso: (args.inverso as string) ?? '#FFFFFF',
  };
  paleta.primario_dark = darken(paleta.primario, 0.2);

  const outDir = path.join(repoRoot, 'public', 'brand', slug);
  await fs.mkdir(outDir, { recursive: true });

  // SVG master
  let masterSvgPath = svgArg ? path.resolve(svgArg) : path.join(outDir, 'master.svg');
  if (!(await fileExists(masterSvgPath))) {
    throw new Error(`No se encontró el SVG master en ${masterSvgPath}. Pasa --svg <path>.`);
  }
  const masterSvg = await fs.readFile(masterSvgPath, 'utf8');

  console.log(`→ Generando branding para ${slug}`);
  console.log(`  primario: ${paleta.primario}`);
  console.log(`  primario-dark: ${paleta.primario_dark}`);
  console.log(`  secundario: ${paleta.secundario}`);
  console.log(`  fondo: ${paleta.fondo}`);
  console.log(`  texto: ${paleta.texto}`);
  console.log(`  inverso: ${paleta.inverso}`);

  const only = typeof args.only === 'string' ? (args.only as string).split(',') : null;
  const shouldRun = (v: string) => !only || only.includes(v);

  const splitRatio = typeof args['split-ratio'] === 'string' ? parseFloat(args['split-ratio'] as string) : 0.72;
  const wordmarkColors =
    typeof args['wordmark-colors'] === 'string'
      ? (args['wordmark-colors'] as string).split(',').map((s) => s.trim())
      : [];
  console.log(`  split-ratio: ${splitRatio}`);
  if (wordmarkColors.length) console.log(`  wordmark-colors: ${wordmarkColors.join(', ')}`);

  const assets: GeneratedAsset[] = [];

  if (shouldRun('logo_horizontal_light'))
    assets.push(await composeHorizontalLight(outDir, masterSvg, paleta, splitRatio));
  if (shouldRun('logo_horizontal_dark'))
    assets.push(await composeHorizontalDark(outDir, masterSvg, paleta, splitRatio, wordmarkColors));
  if (shouldRun('logo_vertical')) assets.push(await composeVertical(outDir, masterSvg));
  if (shouldRun('isotipo')) assets.push(await composeIsotipo(outDir, masterSvg, splitRatio));
  if (shouldRun('favicon')) assets.push(await composeFavicon(outDir, masterSvg, paleta, splitRatio));
  if (shouldRun('header_email'))
    assets.push(await composeHeaderEmail(outDir, masterSvg, paleta, splitRatio));
  if (shouldRun('watermark')) assets.push(await composeWatermark(outDir, masterSvg, splitRatio));

  console.log(`✓ Generados ${assets.length} variantes en ${path.relative(repoRoot, outDir)}/`);

  // Footer requires empresa data from DB
  let empresaRow: EmpresaRow | null = null;
  if (args.upload || shouldRun('footer_doc')) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'core' },
    });
    const { data, error } = await supabase
      .from('empresas')
      .select(
        'id, slug, nombre, nombre_comercial, razon_social, rfc, domicilio_calle, domicilio_numero_ext, domicilio_colonia, domicilio_municipio, domicilio_estado, domicilio_cp',
      )
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`No se encontró empresa con slug=${slug}`);
    empresaRow = data as EmpresaRow;

    if (shouldRun('footer_doc')) assets.push(await composeFooterDoc(outDir, empresaRow, paleta));

    if (args.upload) {
      console.log(`→ Subiendo a Supabase Storage (bucket: branding/${slug}/brand/)...`);
      const masterUrl = await uploadMasterSvg(supabase, slug, masterSvgPath);
      const urls: Record<string, string> = { logo_master_url: masterUrl };
      for (const a of assets) {
        const u = await uploadAsset(supabase, slug, a);
        urls[`${a.variant}_url`] = u;
        console.log(`  ✓ ${a.variant}`);
      }

      // Update DB
      const update: Record<string, unknown> = {
        color_primario: paleta.primario,
        color_primario_dark: paleta.primario_dark,
        color_secundario: paleta.secundario,
        color_texto_titulo: paleta.texto,
        color_fondo_brand: paleta.fondo,
        color_inverso: paleta.inverso,
        branding_updated_at: new Date().toISOString(),
        ...urls,
      };
      const { error: upErr } = await supabase.from('empresas').update(update).eq('slug', slug);
      if (upErr) throw upErr;
      console.log(`✓ DB actualizada en core.empresas (slug=${slug})`);
    }
  }

  console.log(`\n✅ Listo. Revisa los archivos en public/brand/${slug}/`);
}

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

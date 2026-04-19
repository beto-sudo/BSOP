#!/usr/bin/env node
/**
 * scrape_coda_junta_images.mjs
 *
 * Re-imports images from Coda junta detail views into BSOP.
 *
 * Works by driving a headless Chromium via Playwright using Beto's Coda
 * session cookies (extracted from /tmp/coda-cookies.txt). For each junta:
 *   1. Navigate to the row detail view (Temas column must be visible).
 *   2. Grab the Temas column HTML from the rendered DOM.
 *   3. For every <img> in that HTML, download the binary with cookies.
 *   4. Upload each image to Supabase Storage (bucket: adjuntos/juntas/<junta_id>/).
 *   5. Rewrite <img src> in the HTML to the BSOP proxy URL /api/adjuntos/...
 *   6. Update erp.juntas.descripcion with the merged HTML (text + new image URLs).
 *
 * Usage (from repo root):
 *   node scripts/scrape_coda_junta_images.mjs --rowId i-wSqcZYuPmy         # single junta (dry-run in DB)
 *   node scripts/scrape_coda_junta_images.mjs --junta-id <uuid>            # by BSOP id
 *   node scripts/scrape_coda_junta_images.mjs --all --since 2024-01-01     # all juntas since date
 *   DRY_RUN=1 node scripts/...                                              # no DB writes
 *
 * Prereqs:
 *   - /tmp/coda-cookies.txt with a current Coda session cookie string
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - npx playwright install chromium (if first run)
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ─── Config ───────────────────────────────────────────────────────────────

const CODA_DOC_ID = 'ZNxWl_DI2D';
const CODA_DOC_SLUG = 'DILESA_dZNxWl_DI2D';
const CODA_PAGE_SLUG = 'Juntas_suafsfQq';
const CODA_TABLE_ID = 'grid-9m184aI_C3';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CODA_API_KEY = process.env.CODA_API_KEY;
const DRY_RUN = process.env.DRY_RUN === '1';
const COOKIES_PATH = process.env.CODA_COOKIES_PATH || '/tmp/coda-cookies.txt';

// Extract useful cookies from the cookie string for Playwright format
function parseCookieString(str) {
  return str
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const eq = p.indexOf('=');
      if (eq < 0) return null;
      const name = p.slice(0, eq).trim();
      const value = p.slice(eq + 1).trim();
      return { name, value };
    })
    .filter(Boolean);
}

function loadCodaCookies() {
  if (!fs.existsSync(COOKIES_PATH)) {
    throw new Error(`Cookies file not found: ${COOKIES_PATH}`);
  }
  const raw = fs.readFileSync(COOKIES_PATH, 'utf8').trim();
  const pairs = parseCookieString(raw);
  // Attach to coda.io domain
  return pairs.map((p) => ({
    name: p.name,
    value: p.value,
    domain: '.coda.io',
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'None',
  }));
}

// ─── CLI parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(key) {
  const idx = args.indexOf(`--${key}`);
  if (idx < 0) return null;
  return args[idx + 1];
}
function hasArg(key) {
  return args.includes(`--${key}`);
}

const SINGLE_ROW_ID = getArg('rowId');
const SINGLE_JUNTA_ID = getArg('junta-id');
const DO_ALL = hasArg('all');
const SINCE = getArg('since');

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // Determine which juntas to process
  const targets = await resolveTargets(supabase);
  if (targets.length === 0) {
    console.log('No juntas to process.');
    return;
  }
  console.log(`→ Will process ${targets.length} junta(s).`);

  // Launch browser — HEADFUL mode to confirm session is working.
  // Switch to headless:true after confirmed.
  const headless = process.env.HEADLESS === '1';
  console.log(`→ Launching Chromium (${headless ? 'headless' : 'headful'})...`);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 1000 },
  });
  const cookies = loadCodaCookies();
  console.log(`→ Loaded ${cookies.length} cookies`);
  await context.addCookies(cookies);
  // Coda internal APIs expect this header (saw it in the captured curl).
  await context.setExtraHTTPHeaders({ 'x-auth-user-id': '102021' });

  // Quick auth check: hit a cheap authenticated endpoint with the cookies.
  const authCheck = await context.newPage();
  try {
    const res = await authCheck.goto('https://coda.io/account', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = res ? res.status() : 0;
    console.log(`→ auth check /account: HTTP ${status}`);
    if (status >= 400) {
      throw new Error(`cookies rejected (HTTP ${status}) — refresh /tmp/coda-cookies.txt`);
    }
  } finally {
    await authCheck.close();
  }

  let ok = 0;
  let fail = 0;
  const failures = [];

  for (const target of targets) {
    try {
      const result = await processOne(context, supabase, target);
      if (result.skipped) {
        console.log(`  — skipped: ${target.titulo} (${result.reason})`);
      } else {
        console.log(
          `  ✅ ${target.titulo}: ${result.imagesDownloaded} imgs, ${result.htmlLen} chars HTML${DRY_RUN ? ' [DRY]' : ''}`,
        );
      }
      ok++;
    } catch (e) {
      console.error(`  ❌ ${target.titulo}: ${e.message}`);
      fail++;
      failures.push({ id: target.id, titulo: target.titulo, error: e.message });
    }
  }

  await browser.close();

  console.log(`\nDone. ${ok} processed, ${fail} failed.`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f.titulo}: ${f.error}`);
  }
}

// ─── Target resolution ───────────────────────────────────────────────────

async function resolveTargets(supabase) {
  if (SINGLE_ROW_ID) {
    // Caller gave Coda row id directly; we need to find matching junta in BSOP
    // by querying Coda for the row's Nombre de Junta, then matching on titulo.
    // To keep this simple, single-row mode also requires --junta-id.
    throw new Error('--rowId alone is not enough; also pass --junta-id for single-row mode');
  }
  if (SINGLE_JUNTA_ID) {
    const { data, error } = await supabase
      .schema('erp')
      .from('juntas')
      .select('id, titulo, fecha_hora, descripcion, empresa_id')
      .eq('id', SINGLE_JUNTA_ID)
      .single();
    if (error || !data) throw new Error(`Junta not found: ${SINGLE_JUNTA_ID}`);
    return [data];
  }
  if (DO_ALL) {
    const since = SINCE || '2024-01-01';
    const { data, error } = await supabase
      .schema('erp')
      .from('juntas')
      .select('id, titulo, fecha_hora, descripcion, empresa_id')
      .eq('empresa_id', 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479') // DILESA
      .gte('fecha_hora', since)
      .not('titulo', 'is', null)
      .order('fecha_hora', { ascending: false });
    if (error) throw error;
    return data;
  }
  throw new Error('Usage: --junta-id <uuid> OR --all [--since YYYY-MM-DD]');
}

// ─── Per-junta processing ────────────────────────────────────────────────

async function processOne(context, supabase, junta) {
  // 1. Find the Coda row ID that matches this junta by title.
  const codaRow = await findCodaRowIdByTitle(context, junta.titulo);
  if (!codaRow || !codaRow.juntaNum) {
    return { skipped: true, reason: `no matching Coda row (row=${JSON.stringify(codaRow)})` };
  }

  // 2. Open the row detail view by locating the row text and clicking expand.
  //    r{num} hashes aren't stable — they depend on current grid sort/filter,
  //    but the row text (junta title) is unique per row and stable.
  const page = await context.newPage();
  try {
    const listUrl = `https://coda.io/d/${CODA_DOC_SLUG}/${CODA_PAGE_SLUG}`;
    await page.goto(listUrl, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(10000); // let Coda settle
    // Scroll the grid until the target row is rendered (virtualized list).
    // Coda only renders visible rows; keep scrolling until our title appears.
    const found = await page.evaluate(async (title) => {
      const maxScrolls = 80;
      for (let i = 0; i < maxScrolls; i++) {
        // Find a cell containing our exact title
        const all = Array.from(document.querySelectorAll('*')).filter(
          (el) => el.children.length === 0 && (el.textContent || '').trim() === title.trim(),
        );
        if (all.length > 0) {
          all[0].scrollIntoView({ block: 'center' });
          return true;
        }
        // Scroll any scrollable container holding the grid
        const scrollers = document.querySelectorAll('[class*="scroll"], [style*="overflow"]');
        for (const s of scrollers) {
          s.scrollBy(0, 1000);
        }
        window.scrollBy(0, 1000);
        await new Promise((r) => setTimeout(r, 200));
      }
      return false;
    }, junta.titulo);
    if (!found) {
      return { skipped: true, reason: 'title not found in grid after scrolling' };
    }
    // Click on the row to select, then trigger expand via keyboard (Shift+Space is Coda's shortcut).
    await page.evaluate((title) => {
      const cell = Array.from(document.querySelectorAll('*')).find(
        (el) => el.children.length === 0 && (el.textContent || '').trim() === title.trim(),
      );
      if (cell) cell.click();
    }, junta.titulo);
    await page.waitForTimeout(500);
    // Find the expand icon for the selected row. In Coda it's typically in the first column
    // with aria-label like "Expand row" or a small arrow icon.
    const expanded = await page.evaluate(() => {
      const btn = document.querySelector('[aria-label*="Expand row" i], [aria-label*="Abrir fila" i]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!expanded) {
      // Fallback: Coda's keyboard shortcut Shift+Space on selected row
      await page.keyboard.press('Shift+Space');
    }
    // Wait for the detail modal to render
    await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
    // Wait for "Calculating..." to disappear (Coda still processing formulas)
    try {
      await page.waitForFunction(
        () => !document.body.innerText.includes('Calculating'),
        { timeout: 60000 },
      );
      console.log(`    (Calculating finished)`);
    } catch {
      console.log(`    (Calculating still visible after 60s — proceeding anyway)`);
    }
    // Wait for modal loading-indicator to disappear
    try {
      await page.waitForFunction(
        () => !document.querySelector('[data-coda-ui-id="loading-indicator"]'),
        { timeout: 30000 },
      );
    } catch {}
    // Click "Show hidden columns" if present
    try {
      await page.click('text=/Show hidden columns|Mostrar columnas ocultas/i', { timeout: 5000 });
      console.log(`    (clicked Show hidden columns)`);
    } catch {
      console.log(`    (Show hidden columns not found — maybe already expanded)`);
    }
    // Extra settle time for canvas content (rich text with embedded imgs)
    await page.waitForTimeout(5000);

    // Debug: always save a screenshot for inspection
    const dbgDir = '/tmp/coda-scrape-debug';
    fs.mkdirSync(dbgDir, { recursive: true });
    const dbgBase = path.join(dbgDir, `junta-${junta.id.slice(0, 8)}`);
    await page.screenshot({ path: `${dbgBase}.png`, fullPage: true });
    const modalHtmlForDebug = await page.evaluate(() => {
      const m = document.querySelector('[role="dialog"]');
      return m ? m.innerHTML : '(no modal)';
    });
    fs.writeFileSync(`${dbgBase}.html`, modalHtmlForDebug);
    console.log(`    (debug: wrote ${dbgBase}.png + .html)`);

    // Pull the Temas column HTML + images
    const temasData = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { html: '', images: [] };
      // Find the Temas container: look for a heading/label with "Temas" text then sibling content
      const labels = Array.from(modal.querySelectorAll('*')).filter(
        (el) =>
          el.children.length === 0 &&
          /^Temas$/.test((el.textContent || '').trim()),
      );
      let container = null;
      for (const label of labels) {
        // Walk up to find a sibling that contains <img> elements
        let p = label.parentElement;
        while (p && p !== modal) {
          const imgs = p.querySelectorAll('img');
          if (imgs.length > 0) {
            container = p;
            break;
          }
          // Check sibling
          if (p.nextElementSibling) {
            const sImgs = p.nextElementSibling.querySelectorAll('img');
            if (sImgs.length > 0) {
              container = p.nextElementSibling;
              break;
            }
          }
          p = p.parentElement;
        }
        if (container) break;
      }
      // Fallback: use first modal child with images
      if (!container) {
        const allImgs = modal.querySelectorAll('img');
        if (allImgs.length > 0) container = modal;
      }
      if (!container) return { html: modal.innerText || '', images: [] };

      const imgs = Array.from(container.querySelectorAll('img')).filter((i) => {
        if (!i.src || i.src.startsWith('data:')) return false;
        return i.naturalHeight > 50 && i.naturalWidth > 50;
      });
      return {
        html: container.innerHTML,
        innerText: container.innerText,
        images: imgs.map((i) => ({
          src: i.src,
          w: i.naturalWidth,
          h: i.naturalHeight,
          alt: i.alt || 'image',
        })),
      };
    });

    if (!temasData.images || temasData.images.length === 0) {
      return { skipped: true, reason: 'no images in Temas' };
    }

    // 3. Download each image with cookies via the browser context
    const downloadedImages = [];
    for (const img of temasData.images) {
      const buffer = await downloadImageViaPage(page, img.src);
      if (!buffer) continue;
      downloadedImages.push({ ...img, buffer });
    }

    // 4. Upload to Supabase + rewrite srcs in HTML
    let updatedHtml = temasData.html;
    const mapping = []; // { originalSrc, newProxyUrl }
    for (const [idx, img] of downloadedImages.entries()) {
      const ext = detectExt(img.buffer) || 'png';
      const filename = `${Date.now()}-${idx}-${randomUUID().slice(0, 6)}.${ext}`;
      const storagePath = `juntas/${junta.id}/${filename}`;
      if (!DRY_RUN) {
        const { error: upErr } = await supabase.storage
          .from('adjuntos')
          .upload(storagePath, img.buffer, {
            contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            upsert: false,
          });
        if (upErr) throw new Error(`upload failed: ${upErr.message}`);
      }
      const proxyUrl = `/api/adjuntos/${storagePath}`;
      // Replace the exact src string in the HTML
      const escapedSrc = img.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      updatedHtml = updatedHtml.replace(new RegExp(escapedSrc, 'g'), proxyUrl);
      mapping.push({ originalSrc: img.src.slice(0, 60), newProxyUrl: proxyUrl, sizeBytes: img.buffer.length });
    }

    // 5. Sanitize HTML (remove Coda-specific wrappers, keep text + images)
    const cleaned = sanitizeCodaHtml(updatedHtml);

    // 6. Update erp.juntas.descripcion
    if (!DRY_RUN) {
      const { error: updErr } = await supabase
        .schema('erp')
        .from('juntas')
        .update({ descripcion: cleaned })
        .eq('id', junta.id);
      if (updErr) throw new Error(`DB update failed: ${updErr.message}`);
    }

    return {
      imagesDownloaded: downloadedImages.length,
      htmlLen: cleaned.length,
      mapping,
    };
  } finally {
    await page.close();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function findCodaRowIdByTitle(_context, titulo) {
  // Use the public Coda API v1 with Bearer token for reliable row lookup.
  // Cookies are only needed later for downloading imgix-hosted canvas images.
  //
  // Returns: { id: "i-wSqcZYuPmy", juntaNum: 765 } — both are needed:
  //   id is used for direct row API calls,
  //   juntaNum ("Junta#" column) is used for the detail-view URL hash (#Juntas_.../r765&view=center).
  if (!CODA_API_KEY) throw new Error('CODA_API_KEY env is required');
  const apiUrl = `https://coda.io/apis/v1/docs/${CODA_DOC_ID}/tables/${CODA_TABLE_ID}/rows?query=${encodeURIComponent(`"Nombre de Junta":"${titulo}"`)}&limit=1&useColumnNames=true`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${CODA_API_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const row = data.items?.[0];
  if (!row) return null;
  const juntaNum = row.values?.['Junta#'];
  return { id: row.id, juntaNum };
}

async function downloadImageViaPage(page, imgSrc) {
  try {
    const arrayBuf = await page.evaluate(async (src) => {
      const res = await fetch(src, { credentials: 'include', mode: 'cors' });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return Array.from(new Uint8Array(buf));
    }, imgSrc);
    if (!arrayBuf) return null;
    return Buffer.from(arrayBuf);
  } catch (e) {
    console.error(`    download error: ${e.message}`);
    return null;
  }
}

function detectExt(buf) {
  if (buf.length < 8) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  // WebP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return 'webp';
  return null;
}

function sanitizeCodaHtml(html) {
  // Strip Coda's internal data-* attributes and classes, keep structure + content + img proxy URLs.
  // This is a minimal sanitizer; full sanitation can be added when wiring to production.
  return html
    .replace(/\sclass="[^"]*"/g, '')
    .replace(/\sdata-[a-z0-9-]+="[^"]*"/g, '')
    .replace(/\sstyle="[^"]*"/g, '')
    .replace(/<span[^>]*>|<\/span>/g, '')
    .replace(/\n\s*\n/g, '\n');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

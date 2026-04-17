/**
 * rescue_junta_images.ts
 *
 * Downloads images embedded in erp.juntas.descripcion (migrated from Coda)
 * and re-hosts them in Supabase Storage bucket "adjuntos".
 *
 * Prerequisites:
 *   NEXT_PUBLIC_SUPABASE_URL  – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypasses RLS)
 *
 * Usage:
 *   npx tsx scripts/rescue_junta_images.ts
 *   DRY_RUN=1 npx tsx scripts/rescue_junta_images.ts   # preview only
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const BUCKET = 'adjuntos';

const IMG_TAG_RE = /<img\s[^>]*src=["']([^"']+)["'][^>]*>/gi;

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

function guessContentType(url: string): string {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return MIME_MAP[ext] || 'image/jpeg';
}

function guessFilename(url: string, index: number): string {
  try {
    const parsed = new URL(url);
    const basename = path.basename(parsed.pathname);
    if (basename && basename !== '/' && basename.includes('.')) return basename;
  } catch { /* ignore */ }
  return `image_${index}.jpg`;
}

function isExternalImage(src: string): boolean {
  if (!src.startsWith('http')) return false;
  if (src.includes('supabase.co')) return false;
  return true;
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BSOP-ImageRescue/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.log(`     ⚠️  HTTP ${res.status} for ${url}`);
      return null;
    }
    const contentType = res.headers.get('content-type') ?? guessContentType(url);
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch (err: any) {
    console.log(`     ⚠️  Download failed: ${err.message}`);
    return null;
  }
}

async function main() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

  console.log('\n🖼️  Junta Image Rescue Script');
  if (DRY_RUN) console.log('📋 DRY RUN mode — no data will be written\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: juntas, error: qErr } = await supabase
    .schema('erp' as any)
    .from('juntas')
    .select('id, titulo, descripcion')
    .like('descripcion', '%<img%')
    .order('created_at', { ascending: true });

  if (qErr) throw new Error(`Query failed: ${qErr.message}`);
  console.log(`📋 Found ${juntas?.length ?? 0} juntas with <img> tags\n`);
  if (!juntas || juntas.length === 0) return;

  let totalImages = 0;
  let rescued = 0;
  let failed = 0;
  let skipped = 0;
  let juntasUpdated = 0;

  for (const junta of juntas) {
    const matches: { fullMatch: string; src: string }[] = [];
    let match: RegExpExecArray | null;
    IMG_TAG_RE.lastIndex = 0;
    while ((match = IMG_TAG_RE.exec(junta.descripcion)) !== null) {
      matches.push({ fullMatch: match[0], src: match[1] });
    }

    if (matches.length === 0) continue;

    const externalImages = matches.filter((m) => isExternalImage(m.src));
    if (externalImages.length === 0) {
      skipped += matches.length;
      continue;
    }

    console.log(`📌 ${junta.titulo ?? junta.id} — ${externalImages.length} external image(s)`);
    totalImages += externalImages.length;

    let updatedHtml = junta.descripcion;
    let juntaChanged = false;

    for (let i = 0; i < externalImages.length; i++) {
      const { src } = externalImages[i];
      const filename = guessFilename(src, i);
      const storagePath = `juntas/${junta.id}/${randomUUID()}_${filename}`;

      console.log(`     📥 ${src.substring(0, 80)}${src.length > 80 ? '...' : ''}`);

      if (DRY_RUN) {
        console.log(`     → Would upload to: ${storagePath}`);
        rescued++;
        continue;
      }

      const downloaded = await downloadImage(src);
      if (!downloaded) {
        failed++;
        continue;
      }

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, downloaded.buffer, {
          contentType: downloaded.contentType,
          upsert: false,
        });

      if (uploadErr) {
        console.log(`     ❌ Upload failed: ${uploadErr.message}`);
        failed++;
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

      const newUrl = publicUrlData.publicUrl;
      updatedHtml = updatedHtml.split(src).join(newUrl);
      juntaChanged = true;
      rescued++;
      console.log(`     ✅ → ${storagePath}`);
    }

    if (juntaChanged && !DRY_RUN) {
      const { error: updateErr } = await supabase
        .schema('erp' as any)
        .from('juntas')
        .update({ descripcion: updatedHtml })
        .eq('id', junta.id);

      if (updateErr) {
        console.log(`     ❌ Failed to update junta: ${updateErr.message}`);
      } else {
        juntasUpdated++;
      }
    }
  }

  console.log('\n✅ Image rescue complete!');
  console.log(`   Total external images found: ${totalImages}`);
  console.log(`   Successfully rescued: ${rescued}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Skipped (already Supabase): ${skipped}`);
  console.log(`   Juntas updated: ${juntasUpdated}`);
  if (DRY_RUN) console.log('\n📋 DRY RUN — no data was written');
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});

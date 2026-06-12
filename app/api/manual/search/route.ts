import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { listManualDocs } from '@/lib/manual/load';
import { searchManualDocs } from '@/lib/manual/search';

/**
 * Búsqueda full-text del manual (`/api/manual/search?q=avaluo`). La consume
 * `<ManualSearch>` (portada `/dilesa/manual`) con debounce. Al ser ruta
 * estática, Next la resuelve ANTES que el catch-all `/api/manual/[...slug]`.
 *
 * Auth: mismo criterio que el catch-all — el contenido es "cómo se usa", pero
 * exige sesión para que un anónimo no enumere la estructura interna.
 *
 * La lectura del fs por request es barata (57 docs ≈ 120KB) y la ruta lleva
 * su propia entrada en `outputFileTracingIncludes` (next.config.ts) para que
 * los `.md` viajen al deploy.
 */
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // GET de solo lectura — no necesitamos escribir cookies de refresh.
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const docs = await listManualDocs('dilesa');
  return NextResponse.json({ results: searchManualDocs(docs, q) });
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { loadManualDoc } from '@/lib/manual/load';

/**
 * Sirve el contenido de un doc del manual por su slug (`/api/manual/dilesa/
 * ventas/lista`). Lo consume `<HelpDrawer>` (client) al abrir la ayuda
 * contextual de una pantalla.
 *
 * Auth: el contenido es "cómo se usa" (no sensible), pero el endpoint exige
 * sesión — el botón "?" solo aparece en pantallas ya gateadas, así que el
 * fetch siempre ocurre autenticado; un anónimo no debe poder enumerar la
 * estructura interna de módulos (defense in depth).
 *
 * El loader (`lib/manual/load.ts`) valida los segmentos contra path traversal
 * y exige frontmatter con versión, así que aquí solo cableamos auth + IO.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
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

  const { slug } = await params;
  const doc = await loadManualDoc(slug);
  if (!doc) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ frontmatter: doc.frontmatter, body: doc.body });
}

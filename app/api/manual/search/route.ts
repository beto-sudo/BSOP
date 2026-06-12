import { NextResponse } from 'next/server';
import { listManualDocs } from '@/lib/manual/load';
import { searchManualDocs } from '@/lib/manual/search';
import { filterManualDocs } from '@/lib/manual/access';
import { getManualReaderContext } from '@/lib/manual/server';

/**
 * Búsqueda full-text del manual (`/api/manual/search?q=avaluo`). La consume
 * `<ManualSearch>` (portada `/dilesa/manual`) con debounce. Al ser ruta
 * estática, Next la resuelve ANTES que el catch-all `/api/manual/[...slug]`.
 *
 * RBAC: busca SOLO sobre los docs de módulos a los que el usuario tiene
 * acceso (`filterManualDocs`) — un usuario sin Tesorería no encuentra (ni
 * enumera) la ayuda de Tesorería.
 *
 * La lectura del fs por request es barata (57 docs ≈ 120KB) y la ruta lleva
 * su propia entrada en `outputFileTracingIncludes` (next.config.ts) para que
 * los `.md` viajen al deploy.
 */
export async function GET(req: Request) {
  const ctx = await getManualReaderContext();
  if (!ctx) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const docs = filterManualDocs(ctx.perms, await listManualDocs('dilesa'));
  return NextResponse.json({ results: searchManualDocs(docs, q) });
}

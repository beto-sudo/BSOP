import { NextResponse } from 'next/server';
import { loadManualDoc } from '@/lib/manual/load';
import { canReadManualDoc } from '@/lib/manual/access';
import { getManualReaderContext } from '@/lib/manual/server';

/**
 * Sirve el contenido de un doc del manual por su slug (`/api/manual/dilesa/
 * ventas/lista`). Lo consume `<HelpDrawer>` (client) al abrir la ayuda
 * contextual de una pantalla.
 *
 * RBAC: además de exigir sesión, el doc solo se sirve si el usuario tiene
 * acceso de lectura al módulo del doc (frontmatter `modulo:`, misma semántica
 * que el sidebar). El drawer contextual ya hereda el gate de la pantalla,
 * pero el endpoint no debe confiar en eso: sin este check, cualquier usuario
 * autenticado podía leer el manual completo por URL (defense in depth, R3).
 * Sin acceso → 404 (mismo shape que not_found: no se revela qué existe).
 *
 * El loader (`lib/manual/load.ts`) valida los segmentos contra path traversal
 * y exige frontmatter con versión, así que aquí solo cableamos auth + RBAC.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const ctx = await getManualReaderContext();
  if (!ctx) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { slug } = await params;
  const doc = await loadManualDoc(slug);
  if (!doc || !canReadManualDoc(ctx.perms, doc)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ frontmatter: doc.frontmatter, body: doc.body });
}

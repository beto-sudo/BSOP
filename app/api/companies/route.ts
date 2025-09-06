// app/api/companies/route.ts
// Lista las empresas a las que el usuario (según su JWT en cookie sb-access-token) tiene acceso.
// No usa @supabase/auth-helpers-nextjs. Utiliza PostgREST directamente.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Ayudante mínimo para respuestas de error uniformes
function err(msg: string, status = 500) {
  return NextResponse.json({ items: [], error: msg }, { status });
}

export async function GET() {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return err("Missing SUPABASE env (URL/ANON_KEY)", 500);
    }

    const c = await cookies();
    const jwt = c.get("sb-access-token")?.value;
    // Sin sesión → devolver vacío (evita 401 en build/SSR)
    if (!jwt) {
      return NextResponse.json({ items: [] });
    }

    // PostgREST: traemos membership + expand de tabla "Company"
    // Ajusta nombres si tu FK se llama distinto.
    const url = new URL(`${SUPABASE_URL}/rest/v1/company_member`);
    url.searchParams.set(
      "select",
      "company:Company(id,name,slug,isActive)"
    );
    url.searchParams.set("user_id", "eq.auth.uid()"); // alternativa segura si tienes policies con auth.uid()
    url.searchParams.set("is_active", "eq.true");

    const res = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jwt}`,
        // Para que PostgREST permita usar filtros con auth.uid(), enviamos el token del usuario
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return err(`postgrest_error ${res.status}: ${txt || res.statusText}`, res.status);
    }

    const rows: Array<{ company: { id: string; name: string; slug?: string; isActive?: boolean } | null }> =
      await res.json();

    const items =
      (rows || [])
        .map((r) => r.company)
        .filter(Boolean)
        .filter((c) => c!.isActive !== false) // si existe y es false, se excluye
        .map((c) => ({ id: c!.id, name: c!.name, slug: c!.slug }));

    return NextResponse.json({ items });
  } catch (e: any) {
    return err(e?.message || "unexpected_error", 500);
  }
}

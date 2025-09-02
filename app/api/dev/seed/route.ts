// app/api/dev/seed/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs"; // para usar Buffer si algún día lo necesitas
export const revalidate = 0;

// ⚠️ Este endpoint es sensible. Idealmente protégelo por ENV o Auth si lo dejas en prod.
export async function GET() {
  // Narrowing: si falta la service key devolvemos 500 y TS deja de marcar "posiblemente null"
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" },
      { status: 500 }
    );
  }

  try {
    // Si solo quieres permitirlo en PREVIEW/DEV, descomenta:
    // if (process.env.VERCEL_ENV === "production") {
    //   return NextResponse.json({ error: "Seed disabled in production" }, { status: 403 });
    // }

    // Ejemplo: seed de roles (ajusta tabla/campo si difieren)
    const roles = ["Admin", "Compras", "Inventario", "Ventas", "Caja", "Reportes"].map(
      (name) => ({ name })
    );

    const { error: e1 } = await db
      .from("Role")
      .upsert(roles as any, { onConflict: "name" } as any); // cast para call signature de TS

    if (e1) throw e1;

    return NextResponse.json({ ok: true, seeded: { roles: roles.length } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}

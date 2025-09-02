// app/api/dev/seed/route.ts
import { NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  try {
    // if (process.env.VERCEL_ENV === "production") {
    //   return NextResponse.json({ error: "Seed disabled in production" }, { status: 403 });
    // }
    const db = dbOrThrow();
    const roles = ["Admin", "Compras", "Inventario", "Ventas", "Caja", "Reportes"].map((name) => ({ name }));
    const { error } = await db.from("Role").upsert(roles as any, { onConflict: "name" } as any);
    if (error) throw error;
    return NextResponse.json({ ok: true, seeded: { roles: roles.length } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 400 });
  }
}

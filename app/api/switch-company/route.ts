// app/api/switch-company/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COMPANY_COOKIE_KEY = "CURRENT_COMPANY_ID";

export async function POST(req: Request) {
  const { companyId } = await req.json().catch(() => ({ companyId: null as string | null }));
  const c = await cookies();

  if (!companyId) {
    // Limpiar selección => modo BSOP
    c.delete(COMPANY_COOKIE_KEY);
    return NextResponse.json({ ok: true, cleared: true });
  }

  // Guardar selección (sin validar membresía; sigues usando RLS en tus queries)
  c.set(COMPANY_COOKIE_KEY, String(companyId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });

  return NextResponse.json({ ok: true });
}

// app/api/current-company/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COMPANY_COOKIE_KEY = "CURRENT_COMPANY_ID";

export async function GET() {
  const c = await cookies();
  const companyId = c.get(COMPANY_COOKIE_KEY)?.value ?? null;

  // Nota: aquí no resolvemos nombre (evitamos DB/libs).
  // El cliente puede mostrar sólo "BSOP" cuando sea null,
  // o pedir el nombre por otro flujo si ya lo tienes en memoria.
  return NextResponse.json({ companyId, companyName: null });
}

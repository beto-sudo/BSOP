// lib/company.ts
import { cookies } from "next/headers";

export const COMPANY_COOKIE_KEY = "CURRENT_COMPANY_ID";

export async function getCurrentCompanyIdFromCookies(): Promise<string | null> {
  const c = await cookies();
  return c.get(COMPANY_COOKIE_KEY)?.value ?? null;
}

export async function setCurrentCompanyCookie(companyId: string | null) {
  const c = await cookies();
  if (!companyId) {
    // limpiar cookie => modo BSOP sin empresa
    c.delete(COMPANY_COOKIE_KEY);
    return;
  }
  c.set(COMPANY_COOKIE_KEY, companyId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
}

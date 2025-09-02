import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();

  const isAuth = url.pathname.startsWith("/signin") || url.pathname.startsWith("/auth");
  const isStatic = url.pathname.startsWith("/_next") || /\.\w+$/.test(url.pathname);
  const isApi = url.pathname.startsWith("/api");
  if (isAuth || isStatic || isApi) return NextResponse.next();

  // completa ?company desde cookie (tu lógica)
  const hasCompany = url.searchParams.has("company");
  const cookieCompany = req.cookies.get("company")?.value;
  if (!hasCompany && cookieCompany) {
    url.searchParams.set("company", cookieCompany);
    return NextResponse.rewrite(url);
  }

  // 🔒 guard de sesión: cookies httpOnly creadas en /auth/callback
  const hasSession = Boolean(req.cookies.get("sb-access-token")?.value);
  if (!hasSession) {
    url.pathname = "/signin";
    url.searchParams.set("redirect", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };

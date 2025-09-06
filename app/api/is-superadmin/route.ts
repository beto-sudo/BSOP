// app/api/is-superadmin/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Flag global por entorno (como lo tenías en Vercel)
  const flag = process.env.NEXT_PUBLIC_IS_SUPERADMIN === "1";

  // Validación opcional por lista de correos
  const allowList = (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Si quieres validar por email, envíalo en el header x-user-email desde el cliente
  const email = request.headers.get("x-user-email")?.toLowerCase();

  let isOnList = false;
  if (email && allowList.length > 0) {
    isOnList = allowList.includes(email);
  }

  return NextResponse.json({ isSuperadmin: flag || isOnList });
}

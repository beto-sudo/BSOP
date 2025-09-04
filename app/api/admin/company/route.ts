// app/api/admin/company/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  return NextResponse.json({ ok: true, route: "admin/company GET" });
}

export async function POST(_req: NextRequest) {
  return NextResponse.json({ ok: true, route: "admin/company POST" });
}

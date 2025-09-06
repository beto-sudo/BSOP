// app/api/diag/env/route.ts
import { NextResponse } from "next/server";

export const revalidate = 0;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;

  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY_present: !!anon, // no exponemos la key
    NEXT_PUBLIC_SUPABASE_URL_host: url ? new URL(url).host : null,
  });
}

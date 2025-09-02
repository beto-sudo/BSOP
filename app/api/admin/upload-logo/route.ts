// app/api/admin/upload-logo/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(req: Request) {
  // Toma el cliente admin (si uno es null, intenta con el otro por si acaso)
  const admin = supabaseAdmin ?? getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" },
      { status: 500 }
    );
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const company = ((form.get("company") as string) || "default").toLowerCase();
  const bucket = (form.get("bucket") as string) || "public";
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const safeName = file.name.replace(/\s+/g, "_");
  const path = `branding/${company}/${Date.now()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await admin
    .storage
    .from(bucket)
    .upload(path, buf, { upsert: true, contentType: file.type || "application/octet-stream" } as any);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ ok: true, path, publicUrl: data.publicUrl });
}

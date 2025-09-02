import { NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin"; // si falla el alias, usa "../../../lib/supabaseAdmin"

export const revalidate = 0;

// POST multipart/form-data: { company: "rincon", file: <logo> }
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const company = String(form.get("company") || "").toLowerCase();
    const file = form.get("file") as File | null;

    if (!company || !file) {
      return NextResponse.json({ error: "company and file required" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const cleanName = file.name.replace(/\s+/g, "_").toLowerCase();
    const path = `${company}/${Date.now()}-${cleanName}`;

    const buf = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await db.storage
      .from("branding")
      .upload(path, buf, { contentType: file.type || `image/${ext}`, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: pub } = db.storage.from("branding").getPublicUrl(path);
    return NextResponse.json({ url: pub.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "upload failed" }, { status: 500 });
  }
}

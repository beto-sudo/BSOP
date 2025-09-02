// app/api/admin/upload-logo/route.ts
import { NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const db = dbOrThrow();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const company = ((form.get("company") as string) || "default").toLowerCase();
    const bucket = (form.get("bucket") as string) || "public";
    if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

    const safeName = file.name.replace(/\s+/g, "_");
    const path = `branding/${company}/${Date.now()}-${safeName}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error } = await db.storage.from(bucket).upload(path, buf, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    } as any);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data } = db.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ ok: true, path, publicUrl: data.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

// si TS se queja, crea /types/pdf-parse.d.ts con:  declare module "pdf-parse";
export async function POST(req: Request) {
  try {
    const data = await req.formData();
    const file = data.get("file") as File | null;
    if (!file) return NextResponse.json({ ok: false, error: "Falta archivo" }, { status: 400 });

    // ✅ import dinámico DENTRO de la función (no top-level)
    const pdfParse = (await import("pdf-parse")).default as any;
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer).catch(() => ({ text: "" }));
    const text: string = parsed?.text || "";

    return NextResponse.json({ ok: true, text });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

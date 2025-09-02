import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";

export const revalidate = 0;

// Utilidades -----------------------------
const MONTHS: Record<string, string> = {
  enero:"01", febrero:"02", marzo:"03", abril:"04", mayo:"05", junio:"06",
  julio:"07", agosto:"08", septiembre:"09", setiembre:"09", octubre:"10",
  noviembre:"11", diciembre:"12"
};
function parseSpanishDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const re = /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/i;
  const m = s.match(re);
  if (!m) return null;
  const dd = m[1].padStart(2,"0");
  const mm = MONTHS[m[2].toLowerCase()];
  const yyyy = m[3];
  return mm ? `${yyyy}-${mm}-${dd}` : null;
}
function firstN(text: string, n=6000) {
  if (!text) return "";
  return text.length > n ? text.slice(0, n) : text;
}
function classify(text: string) {
  const t = text.toLowerCase();
  const has = (k: RegExp) => k.test(t);
  let category: "constitucion" | "poder" | "acta" | "cap_table" | "otro" = "otro";

  if (has(/acta\s+de\s+asamblea|asamblea\s+(ordinaria|extraordinaria)/i)) category = "acta";
  if (has(/\bpoder(es)?\b|\bapoderado\b|\bfacultades\b/)) category = "poder";
  if (has(/\bescritura\b.*\bconstitutiv/i) || has(/\bconstitución\b.*\bsociedad\b/)) category = "constitucion";
  if (has(/\bcapital\s+social\b|\bacciones?\b|\baccionistas?\b|\bporcentaje\b/)) category = category === "otro" ? "cap_table" : category;

  const issuedAt = parseSpanishDate(t.match(/(fecha|de fecha)\s+(?:el\s+)?(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)?.[2] || t.match(/a\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)?.[1]);
  const expiresAt = parseSpanishDate(t.match(/(vence|vigencia)\s+(?:el\s+)?(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)?.[2]);
  const notaryNumber = t.match(/notar(?:i[oa])\s+publica?\s*(?:n[úu]m(?:ero)?\.?\s*)?(\d{1,4})/i)?.[1] || null;
  const notaryName = t.match(/notar(?:i[oa])\s+publica?.{0,40}?(lic\.?|licenciado|licenciada)\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ.\s]+?)(?:,|\n)/i)?.[2]
                  || t.match(/ante\s+la\s+fe\s+del\s+notar(?:i[oa])\s+publica?.{0,20}?([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑ.\s]+?)(?:,|\n)/i)?.[1]
                  || null;

  let title = "Documento legal";
  if (category === "acta") title = "Acta de Asamblea";
  if (category === "poder") title = "Poder";
  if (category === "constitucion") title = "Escritura Constitutiva";

  return { category, issuedAt, expiresAt, notaryName, notaryNumber, title };
}
// ----------------------------------------

/**
 * GET /api/legal/docs?company=rincon
 */
export async function GET(req: NextRequest) {
  const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
  if (!slug) return NextResponse.json({ error: "company param required" }, { status: 400 });

  const { data: comp, error: e1 } = await db.from("Company").select("id").eq("slug", slug).single();
  if (e1 || !comp) return NextResponse.json({ error: "company not found" }, { status: 404 });

  const { data, error } = await db
    .from("CompanyDocument")
    .select("id, category, title, issuedAt, expiresAt, notaryName, notaryNumber, city, state, summary, storage_path, createdAt")
    .eq("companyId", comp.id)
    .order("createdAt", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // bucket privado: genera URLs firmadas a 1h
  const out = await Promise.all((data ?? []).map(async (d) => {
    const { data: s } = await db.storage.from("legal").createSignedUrl(d.storage_path, 3600);
    return { ...d, signedUrl: s?.signedUrl || null };
  }));

  return NextResponse.json(out);
}

/**
 * POST /api/legal/docs
 * multipart/form-data: file + company (+ opcional overrides en campos de texto)
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const company = String(form.get("company") || "").toLowerCase();
    const file = form.get("file") as File | null;

    if (!company || !file) {
      return NextResponse.json({ error: "company and file required" }, { status: 400 });
    }

    const { data: comp, error: e1 } = await db.from("Company").select("id").eq("slug", company).single();
    if (e1 || !comp) return NextResponse.json({ error: "company not found" }, { status: 404 });

    // 1) Extraer texto con pdf-parse (instala: npm i pdf-parse)
    const pdfParse = (await import("pdf-parse")).default as any;
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer).catch(() => ({ text: "" }));
    const text: string = parsed?.text || "";

    // 2) Clasificar + metadatos
    const base = classify(text);
    const title = String(form.get("title") || base.title);
    const category = String(form.get("category") || base.category) as any;
    const issuedAt = String(form.get("issuedAt") || base.issuedAt || "");
    const expiresAt = String(form.get("expiresAt") || base.expiresAt || "");
    const notaryName = String(form.get("notaryName") || base.notaryName || "");
    const notaryNumber = String(form.get("notaryNumber") || base.notaryNumber || "");
    const city = String(form.get("city") || "");
    const state = String(form.get("state") || "");
    const summary = String(form.get("summary") || firstN(text, 400));

    // 3) Subir archivo a Storage (bucket privado "legal")
    const cleanName = file.name.replace(/\s+/g, "_").toLowerCase();
    const path = `${company}/${Date.now()}-${cleanName}`;
    const mime = file.type || "application/pdf";
    const bytes = new Uint8Array(buffer);

    const { error: upErr } = await db.storage.from("legal").upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // 4) Guardar registro
    const insert = {
      companyId: comp.id,
      category,
      title,
      issuedAt: issuedAt || null,
      expiresAt: expiresAt || null,
      notaryName: notaryName || null,
      notaryNumber: notaryNumber || null,
      city: city || null,
      state: state || null,
      parties: null,
      tags: null,
      summary,
      text_excerpt: firstN(text, 6000),
      storage_path: path,
      autoDetected: true
    };

    const { data: doc, error: insErr } = await db
      .from("CompanyDocument")
      .insert(insert)
      .select("id, category, title, issuedAt, expiresAt, notaryName, notaryNumber, city, state, summary, storage_path, createdAt")
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    const { data: s } = await db.storage.from("legal").createSignedUrl(path, 3600);
    return NextResponse.json({ ...doc, signedUrl: s?.signedUrl || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "ingest failed" }, { status: 500 });
  }
}

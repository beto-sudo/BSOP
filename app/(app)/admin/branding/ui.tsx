"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Branding = {
  brandName?: string;
  primary?: string;
  secondary?: string;
  logoUrl?: string;
  slogan?: string;
  mission?: string;
  vision?: string;
  values?: string[]; // lista de valores
  assets?: {
    letterheadUrl?: string;          // hoja membretada (PDF/imagen)
    businessCardFrontUrl?: string;   // tarjeta frente
    businessCardBackUrl?: string;    // tarjeta reverso (opcional)
    emailSignatureUrl?: string;      // imagen firma de correo
  };
};

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function rgbToHex(r: number, g: number, b: number) {
  const h = (x: number) => x.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toLowerCase();
}
function hexToRgb(hex: string): [number, number, number] | null {
  const m = (hex || "").replace("#","").match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lighten(hex: string, amount = 0.35) { // 35% más claro
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r,g,b] = rgb;
  const mix = (c: number) => Math.round(c + (255 - c) * clamp01(amount));
  return rgbToHex(mix(r), mix(g), mix(b));
}
function mix(hexA: string, hexB: string, t = 0.5) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const [r1,g1,b1] = a, [r2,g2,b2] = b;
  const m = (x:number,y:number)=>Math.round(x*(1-t)+y*t);
  return rgbToHex(m(r1,r2), m(g1,g2), m(b1,b2));
}

/** Cuantización simple: bucketiza colores (paso 16) y elige el más frecuente ignorando blancos/transparentes */
function dominantColorFromImageData(data: ImageData): string {
  const buckets = new Map<string, number>();
  const { data: px } = data as any;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i+1], b = px[i+2], a = px[i+3];
    if (a < 200) continue; // ignora semitransparente
    // ignora casi blanco y casi negro
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    if (max > 245 && min > 230) continue;  // blanco
    if (max < 20 && min < 20) continue;    // negro

    const q = (v:number)=> Math.round(v/16)*16; // bucketing
    const key = `${q(r)},${q(g)},${q(b)}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  if (buckets.size === 0) return "#334155"; // fallback slate-700

  let best = "", freq = -1;
  for (const [k, n] of buckets.entries()) {
    if (n > freq) { freq = n; best = k; }
  }
  const [r,g,b] = best.split(",").map(Number);
  return rgbToHex(r,g,b);
}

async function loadImageToCanvas(src: string, maxW = 240): Promise<ImageData> {
  // Imagen same-origin (vía /api/utils/image-proxy) → canvas no queda “tainted”
  const img = new Image();
  img.crossOrigin = "anonymous"; // por si acaso
  img.src = src;
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("No se pudo cargar la imagen"));
  });
  const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
  const w = Math.min(maxW, img.naturalWidth);
  const h = Math.max(1, Math.round(w * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no soportado");
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return data;
}

function proxify(url: string) {
  if (!url) return "";
  // para evitar CORS en previews
  return `/api/utils/image-proxy?url=${encodeURIComponent(url)}`;
}

function parseValuesInput(raw: string): string[] {
  // Permite separar por comas o saltos de línea; quita vacíos/duplicados
  const parts = raw
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

export default function BrandingClient() {
  const qp = useSearchParams();
  const company = (qp.get("company") || "").toLowerCase();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Campos base
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primary, setPrimary] = useState("#334155");
  const [secondary, setSecondary] = useState("#94a3b8");

  // Mensajería/identidad
  const [slogan, setSlogan] = useState("");
  const [valuesInput, setValuesInput] = useState(""); // UI como texto
  const [mission, setMission] = useState("");
  const [vision, setVision] = useState("");

  // Activos
  const [letterheadUrl, setLetterheadUrl] = useState("");          // hoja membretada (PDF/imagen)
  const [businessCardFrontUrl, setBusinessCardFrontUrl] = useState("");
  const [businessCardBackUrl, setBusinessCardBackUrl] = useState("");
  const [emailSignatureUrl, setEmailSignatureUrl] = useState("");

  // cargar datos actuales
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!company) return;
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Error al cargar empresa");
        if (!alive) return;

        const b: Branding = j?.settings?.branding || {};
        setBrandName(b.brandName || j?.name || "");
        setLogoUrl(b.logoUrl || "");
        setPrimary(b.primary || "#334155");
        setSecondary(b.secondary || "#94a3b8");

        setSlogan(b.slogan || "");
        setMission(b.mission || "");
        setVision(b.vision || "");
        setValuesInput((b.values || []).join(", "));

        setLetterheadUrl(b.assets?.letterheadUrl || "");
        setBusinessCardFrontUrl(b.assets?.businessCardFrontUrl || "");
        setBusinessCardBackUrl(b.assets?.businessCardBackUrl || "");
        setEmailSignatureUrl(b.assets?.emailSignatureUrl || "");
      } catch (e: any) {
        if (alive) setError(e?.message || "Error inesperado");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [company]);

  // detectar desde logo (siempre permitido, aunque ya exista)
  async function detectFromLogo() {
    setError(null);
    setSaved(null);
    if (!logoUrl) {
      setError("Primero especifica el URL del logo.");
      return;
    }
    try {
      const proxied = proxify(logoUrl);
      const data = await loadImageToCanvas(proxied);
      const dom = dominantColorFromImageData(data);
      const soft = mix(lighten(dom, 0.45), "#ffffff", 0.25); // secundario suave

      setPrimary(dom);
      setSecondary(soft);
    } catch (e: any) {
      setError(e?.message || "No se pudo detectar el color del logo.");
    }
  }

  // guardar (merge seguro en API)
  async function save() {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      // validación ligera de hex
      const isHex = (h: string) => /^#[0-9a-f]{6}$/i.test(h);
      if (!isHex(primary)) throw new Error("Color primario inválido (usa formato #rrggbb).");
      if (!isHex(secondary)) throw new Error("Color secundario inválido (usa formato #rrggbb).");

      const body = {
        settings: {
          branding: {
            brandName: brandName || null,
            logoUrl: logoUrl || null,
            primary,
            secondary,
            slogan: slogan || null,
            mission: mission || null,
            vision: vision || null,
            values: parseValuesInput(valuesInput),
            assets: {
              letterheadUrl: letterheadUrl || null,
              businessCardFrontUrl: businessCardFrontUrl || null,
              businessCardBackUrl: businessCardBackUrl || null,
              emailSignatureUrl: emailSignatureUrl || null,
            },
          } as Branding,
        },
      };

      const r = await fetch(`/api/admin/company?company=${company}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j?.error || "No se pudo guardar");
      }
      setSaved("Guardado correctamente");
    } catch (e: any) {
      setError(e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const previewStyle = useMemo(() => ({
    background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
  }), [primary, secondary]);

  const isPdf = (u: string) => /\.pdf($|\?)/i.test(u);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Branding</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={detectFromLogo}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
            title="Detectar colores a partir del logo actual"
          >
            Detectar del logo
          </button>
          <button
            disabled={saving}
            onClick={save}
            className="rounded-md bg-[var(--brand-primary,#0f172a)] text-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </header>

      {loading && <div className="text-sm text-slate-500">Cargando…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {saved && <div className="text-sm text-green-700">{saved}</div>}

      {/* Identidad visual */}
      <section className="grid gap-4">
        <div className="rounded-lg border p-4">
          <label className="block text-xs text-slate-500 mb-1">Nombre de marca</label>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Nombre para mostrar"
          />
        </div>

        <div className="rounded-lg border p-4 grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Logo URL</label>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="https://…/logo.png"
            />
            <div className="mt-3 rounded-md border p-2 grid place-items-center h-28 bg-white">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxify(logoUrl)} alt="Logo" className="max-h-24 object-contain" />
              ) : (
                <span className="text-xs text-slate-400">Sin logo</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Previsualización</label>
            <div className="rounded-md h-[140px] border" style={previewStyle} />
          </div>
        </div>

        <div className="rounded-lg border p-4 grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Color primario (#rrggbb)</label>
            <input
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              placeholder="#334155"
            />
            <div className="mt-2 h-8 rounded border" style={{ backgroundColor: primary }} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Color secundario (suave) (#rrggbb)</label>
            <input
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              placeholder="#94a3b8"
            />
            <div className="mt-2 h-8 rounded border" style={{ backgroundColor: secondary }} />
          </div>
        </div>
      </section>

      {/* Mensajería */}
      <section className="grid gap-4">
        <div className="rounded-lg border p-4">
          <label className="block text-xs text-slate-500 mb-1">Slogan</label>
          <input
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Ej. Calidad que se nota"
          />
        </div>

        <div className="rounded-lg border p-4 grid gap-2">
          <label className="block text-xs text-slate-500">Valores (separados por coma o por renglón)</label>
          <textarea
            value={valuesInput}
            onChange={(e) => setValuesInput(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm min-h-[80px]"
            placeholder={"Ej.\nRespeto, Innovación, Servicio"}
          />
          <div className="text-xs text-slate-500">
            Vista previa:{" "}
            <span className="font-mono">
              [{parseValuesInput(valuesInput).map(v => `"${v}"`).join(", ")}]
            </span>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <label className="block text-xs text-slate-500 mb-1">Misión</label>
          <textarea
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm min-h-[80px]"
            placeholder="Nuestra misión es…"
          />
        </div>

        <div className="rounded-lg border p-4">
          <label className="block text-xs text-slate-500 mb-1">Visión</label>
          <textarea
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm min-h-[80px]"
            placeholder="Nuestra visión es…"
          />
        </div>
      </section>

      {/* Activos / Plantillas */}
      <section className="grid gap-4">
        <h2 className="text-sm font-semibold">Plantillas y activos</h2>

        <div className="rounded-lg border p-4 grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Hoja membretada (URL PDF o imagen)</label>
            <input
              value={letterheadUrl}
              onChange={(e) => setLetterheadUrl(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="https://…/letterhead.pdf ó .png"
            />
            <div className="mt-3 rounded-md border p-2 h-28 bg-white grid place-items-center text-xs text-slate-500">
              {letterheadUrl ? (
                isPdf(letterheadUrl) ? (
                  <a className="underline" href={letterheadUrl} target="_blank" rel="noreferrer">Abrir PDF</a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxify(letterheadUrl)} alt="Hoja membretada" className="max-h-24 object-contain" />
                )
              ) : (
                <span>Sin archivo</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Firma de correo (imagen URL)</label>
            <input
              value={emailSignatureUrl}
              onChange={(e) => setEmailSignatureUrl(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="https://…/signature.png (recomendado 600×200 png transparente)"
            />
            <div className="mt-3 rounded-md border p-2 h-28 bg-white grid place-items-center">
              {emailSignatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxify(emailSignatureUrl)} alt="Firma correo" className="max-h-24 object-contain" />
              ) : (
                <span className="text-xs text-slate-500">Sin imagen</span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4 grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tarjeta de presentación — Frente (URL imagen)</label>
            <input
              value={businessCardFrontUrl}
              onChange={(e) => setBusinessCardFrontUrl(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="https://…/business-card-front.png"
            />
            <div className="mt-3 rounded-md border p-2 h-28 bg-white grid place-items-center">
              {businessCardFrontUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxify(businessCardFrontUrl)} alt="Tarjeta frente" className="max-h-24 object-contain" />
              ) : (
                <span className="text-xs text-slate-500">Sin imagen</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Tarjeta de presentación — Reverso (URL imagen)</label>
            <input
              value={businessCardBackUrl}
              onChange={(e) => setBusinessCardBackUrl(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="https://…/business-card-back.png"
            />
            <div className="mt-3 rounded-md border p-2 h-28 bg-white grid place-items-center">
              {businessCardBackUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxify(businessCardBackUrl)} alt="Tarjeta reverso" className="max-h-24 object-contain" />
              ) : (
                <span className="text-xs text-slate-500">Sin imagen</span>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// app/admin/branding/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Branding = {
  brandName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  logoUrl?: string | null;
};

function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

// ---------- Conversión HEX <-> HSL ----------
function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  const H = (v: number) => toHex(Math.max(0, Math.min(255, Math.round(v))));
  return `#${H(r)}${H(g)}${H(b)}`;
}
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
}
function hslToRgb(h: number, s: number, l: number) {
  h/=360; s/=100; l/=100;
  if (s === 0) {
    const v = Math.round(l*255); return { r:v, g:v, b:v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q-p)*6*t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q-p)*(2/3 - t)*6;
    return p;
  };
  const q = l < .5 ? l*(1+s) : l + s - l*s;
  const p = 2*l - q;
  const r = hue2rgb(p, q, h + 1/3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1/3);
  return { r: Math.round(r*255), g: Math.round(g*255), b: Math.round(b*255) };
}
function hexToHsl(hex: string) { const {r,g,b} = hexToRgb(hex); return rgbToHsl(r,g,b); }
function hslToHex(h: number, s: number, l: number) { const {r,g,b}=hslToRgb(h,s,l); return rgbToHex(r,g,b); }

function Swatch({hex}:{hex:string}) {
  return <div className="h-8 w-8 rounded-lg border" style={{ background: hex }} title={hex} />;
}

// ---------- Cuantización rápida para extraer paleta ----------
type Col = { r:number; g:number; b:number; a:number; h:number; s:number; l:number };
function isNearWhite(c: Col) { return c.l > 92 || (c.r>245 && c.g>245 && c.b>245); }
function isNearBlack(c: Col) { return c.l < 6  || (c.r<10  && c.g<10  && c.b<10 ); }
function isGrayish(c: Col)   { return c.s < 12; }
function hueDist(a:number,b:number){ const d=Math.abs(a-b)%360; return d>180?360-d:d; }

function quantizeTopColors(pixels: Col[], bins=36) {
  // Binning en tono + claridad para robustez, ponderado por saturación
  const map = new Map<string, {sum:[number,number,number]; count:number; sample:Col}>();
  for (const c of pixels) {
    if (c.a < 24) continue;
    if (isNearWhite(c) || isNearBlack(c)) continue;
    // dejamos algunos grises si son muy frecuentes, pero en general evitamos colores poco saturados
    if (c.s < 8) continue;

    const hbin = Math.floor((c.h/360) * bins);           // 0..bins-1
    const lbin = Math.floor((c.l/100) * 4);              // 0..3
    const key = `${hbin}:${lbin}`;
    const w = Math.max(0.5, c.s/100);                    // peso por saturación

    const prev = map.get(key);
    if (!prev) map.set(key, { sum:[c.r*w, c.g*w, c.b*w], count:w, sample:c });
    else {
      prev.sum[0]+=c.r*w; prev.sum[1]+=c.g*w; prev.sum[2]+=c.b*w; prev.count+=w;
    }
  }
  const entries = [...map.entries()].map(([key, v]) => {
    const r = v.sum[0]/v.count, g = v.sum[1]/v.count, b = v.sum[2]/v.count;
    const hsl = rgbToHsl(r,g,b);
    const score = v.count * (0.6 + 0.4*(hsl.s/100));     // cuenta * viveza
    return { key, hex: rgbToHex(r,g,b), hsl, score };
  });
  entries.sort((a,b)=>b.score-a.score);
  return entries.slice(0,8);
}

function extractPaletteFromImage(img: HTMLImageElement) {
  const max = 128;
  const ratio = Math.max(img.naturalWidth, img.naturalHeight) / max || 1;
  const w = Math.max(1, Math.round(img.naturalWidth / ratio));
  const h = Math.max(1, Math.round(img.naturalHeight / ratio));

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const pixels: Col[] = [];
  for (let i=0;i<data.length;i+=4){
    const r = data[i], g=data[i+1], b=data[i+2], a=data[i+3];
    const {h:sH, s:sS, l:sL} = rgbToHsl(r,g,b);
    pixels.push({ r,g,b,a, h:sH, s:sS, l:sL });
  }

  const tops = quantizeTopColors(pixels, 36);
  // elige primario: el primero suficientemente saturado y no muy claro/oscuro
  const primary = tops.find(t => t.hsl.s >= 25 && t.hsl.l > 20 && t.hsl.l < 82) ?? tops[0] ?? { hex:"#4f46e5", hsl:{h:242,s:83,l:60} as any };

  // secundario: distinto en tono y similar brillo
  const secondary = tops.find(t => hueDist(t.hsl.h, primary.hsl.h) >= 25 && Math.abs(t.hsl.l - primary.hsl.l) <= 20)
                 ?? tops.find(t => hueDist(t.hsl.h, primary.hsl.h) >= 40)
                 ?? tops[1]
                 ?? { hex:"#14b8a6", hsl:{h:172,s:70,l:45} as any };

  return { primary: primary.hex, secondary: secondary.hex };
}

// -------------------------------------------------------

export default function BrandingPage() {
  const qp = useSearchParams();
  const company = useMemo(() => (qp.get("company") || "").toLowerCase(), [qp]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branding, setBranding] = useState<Branding>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Sliders controlados (primario)
  const [pH, setPH] = useState(220); const [pS, setPS] = useState(70); const [pL, setPL] = useState(50);
  // Secundario
  const [sH, setSH] = useState(170); const [sS, setSS] = useState(65); const [sL, setSL] = useState(45);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
      const data = r.ok ? await r.json() : {};
      const b: Branding = data?.settings?.branding ?? {};
      const primary = (b.primaryColor || "#4f46e5").toLowerCase();
      const secondary = (b.secondaryColor || "#14b8a6").toLowerCase();
      setBranding({
        brandName: b.brandName || data?.name || "",
        primaryColor: primary,
        secondaryColor: secondary,
        logoUrl: b.logoUrl || null,
      });
      const phsl = hexToHsl(primary); setPH(phsl.h); setPS(phsl.s); setPL(phsl.l);
      const shsl = hexToHsl(secondary); setSH(shsl.h); setSS(shsl.s); setSL(shsl.l);
      setLoading(false);
    })();
  }, [company]);

  // Sync sliders -> hex
  useEffect(() => { setBranding(b => ({ ...b, primaryColor: hslToHex(pH,pS,pL) })); }, [pH,pS,pL]);
  useEffect(() => { setBranding(b => ({ ...b, secondaryColor: hslToHex(sH,sS,sL) })); }, [sH,sS,sL]);

  function onPrimaryHexChange(hex: string) {
    const clean = hex?.startsWith("#") ? hex : `#${hex}`;
    setBranding(b => ({ ...b, primaryColor: clean }));
    const hsl = hexToHsl(clean); setPH(hsl.h); setPS(hsl.s); setPL(hsl.l);
  }
  function onSecondaryHexChange(hex: string) {
    const clean = hex?.startsWith("#") ? hex : `#${hex}`;
    setBranding(b => ({ ...b, secondaryColor: clean }));
    const hsl = hexToHsl(clean); setSH(hsl.h); setSS(hsl.s); setSL(hsl.l);
  }

  async function save() {
    setSaving(true);
    let logoUrl = branding.logoUrl || null;
    try {
      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        fd.append("company", company);
        const r = await fetch("/api/admin/upload-logo", { method: "POST", body: fd });
        if (r.ok) {
          const data = await r.json();
          logoUrl = data.url || logoUrl;
        }
      }
    } catch {}

    const body = {
      company,
      branding: {
        brandName: branding.brandName ?? "",
        primaryColor: branding.primaryColor ?? "#4f46e5",
        secondaryColor: branding.secondaryColor ?? "#14b8a6",
        logoUrl,
      },
    };

    const r = await fetch("/api/admin/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!r.ok) {
      const e = await r.json().catch(()=>({})); alert(e.error || "No se pudo guardar"); return;
    }

    // Aplica tema en vivo
    window.dispatchEvent(new CustomEvent("branding:update", {
      detail: { primaryColor: body.branding.primaryColor, secondaryColor: body.branding.secondaryColor }
    }));
    alert("Branding guardado");
  }

  // ---------- Nuevo: detectar colores desde logo ----------
  async function detectFromLogo() {
    // 1) determina de dónde tomar la imagen
    let src: string | null = null;
    if (logoFile) {
      src = URL.createObjectURL(logoFile);
    } else if (branding.logoUrl) {
      try {
        // hacemos fetch para garantizar CORS y convertir a blob
        const res = await fetch(branding.logoUrl);
        const blob = await res.blob();
        src = URL.createObjectURL(blob);
      } catch {
        src = branding.logoUrl; // fallback optimista
      }
    }
    if (!src) { alert("Sube un logo o pega una URL primero."); return; }

    // 2) carga imagen y extrae paleta
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const { primary, secondary } = extractPaletteFromImage(img);
        onPrimaryHexChange(primary);
        onSecondaryHexChange(secondary);
        // aplica tema al vuelo para visualizar
        window.dispatchEvent(new CustomEvent("branding:update", {
          detail: { primaryColor: primary, secondaryColor: secondary }
        }));
      } finally {
        // libera el blob si fue objectURL
        if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
      }
    };
    img.onerror = () => {
      alert("No pude leer la imagen (CORS o URL inválida). Si el logo está en Supabase, asegúrate de que sea público.");
      if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    };
    img.src = src;
  }

  const previewBorder = { border: "1px solid var(--brand-200)" } as any;

  return (
    <div key={company} className="space-y-8">
      <h2 className="text-2xl font-semibold">Configuración · Branding</h2>

      <section className="rounded-2xl border bg-white p-4 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs text-slate-500 mb-1">Nombre de marca</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={branding.brandName || ""}
              onChange={(e)=>setBranding(b=>({...b, brandName: e.target.value}))}
            />
          </div>

          {/* PRIMARIO */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Color primario</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-14 p-0 border rounded"
                value={branding.primaryColor || "#4f46e5"}
                onChange={(e)=>onPrimaryHexChange(e.target.value)}
              />
              <input
                className="flex-1 rounded-xl border px-3 py-2 font-mono"
                value={branding.primaryColor || ""}
                onChange={(e)=>onPrimaryHexChange(e.target.value)}
                placeholder="#4f46e5"
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="text-xs text-slate-500">Tono</label>
              <input type="range" min={0} max={360} value={pH} onChange={e=>setPH(+e.target.value)} />
              <span className="text-xs text-right">{pH}</span>

              <label className="text-xs text-slate-500">Saturación</label>
              <input type="range" min={0} max={100} value={pS} onChange={e=>setPS(clamp(+e.target.value))} />
              <span className="text-xs text-right">{pS}%</span>

              <label className="text-xs text-slate-500">Luz</label>
              <input type="range" min={0} max={100} value={pL} onChange={e=>setPL(clamp(+e.target.value))} />
              <span className="text-xs text-right">{pL}%</span>
            </div>
          </div>

          {/* SECUNDARIO */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Color secundario</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-14 p-0 border rounded"
                value={branding.secondaryColor || "#14b8a6"}
                onChange={(e)=>onSecondaryHexChange(e.target.value)}
              />
              <input
                className="flex-1 rounded-xl border px-3 py-2 font-mono"
                value={branding.secondaryColor || ""}
                onChange={(e)=>onSecondaryHexChange(e.target.value)}
                placeholder="#14b8a6"
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="text-xs text-slate-500">Tono</label>
              <input type="range" min={0} max={360} value={sH} onChange={e=>setSH(+e.target.value)} />
              <span className="text-xs text-right">{sH}</span>

              <label className="text-xs text-slate-500">Saturación</label>
              <input type="range" min={0} max={100} value={sS} onChange={e=>setSS(clamp(+e.target.value))} />
              <span className="text-xs text-right">{sS}%</span>

              <label className="text-xs text-slate-500">Luz</label>
              <input type="range" min={0} max={100} value={sL} onChange={e=>setSL(clamp(+e.target.value))} />
              <span className="text-xs text-right">{sL}%</span>
            </div>
          </div>

          {/* Logo URL + upload */}
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Logo URL (opcional)</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={branding.logoUrl || ""}
                onChange={(e)=>setBranding(b=>({...b, logoUrl: e.target.value}))}
                placeholder="https://..."
              />
              <p className="text-[11px] text-slate-500 mt-1">También puedes subir un archivo y detectar desde ahí.</p>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Subir logo (PNG/SVG)</label>
              <input type="file" accept="image/*" onChange={(e)=>setLogoFile(e.target.files?.[0] || null)} />
            </div>
          </div>
        </div>

        {/* Preview simple */}
        <div className="mt-4 flex items-center gap-4">
          <div className="rounded-2xl p-4" style={{ background: "var(--brand-50)", ...previewBorder }}>
            <div className="h-5 w-24 rounded" style={{ background: "var(--brand-500)" }} />
            <div className="mt-3 h-2 w-36 rounded" style={{ background: "var(--brand-200)" }} />
          </div>
          <div className="rounded-2xl p-4" style={{ background: "var(--brand2-50)", ...previewBorder }}>
            <div className="h-5 w-24 rounded" style={{ background: "var(--brand2-500)" }} />
            <div className="mt-3 h-2 w-36 rounded" style={{ background: "var(--brand2-200)" }} />
          </div>
          <div className="flex items-center gap-2">
            <Swatch hex={branding.primaryColor || "#4f46e5"} />
            <Swatch hex={branding.secondaryColor || "#14b8a6"} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={detectFromLogo} className="rounded-xl px-4 py-2 border hover:bg-slate-50">
            Detectar colores del logo
          </button>
          <button onClick={save} disabled={saving || loading} className="btn-primary disabled:opacity-60">
            {saving ? "Guardando..." : "Guardar branding"}
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          Al guardar, el tema aplica variables CSS para el primario (<code>--brand</code>, <code>--brand-50…900</code>) y secundario (<code>--brand2</code>, <code>--brand2-50…900</code>).  
          Puedes usarlas en Tailwind con <code>bg-[var(--brand-500)]</code>, <code>text-[var(--brand2-700)]</code>, etc.
        </p>
      </section>
    </div>
  );
}

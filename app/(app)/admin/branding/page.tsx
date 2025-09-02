// app/(app)/admin/branding/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Branding = {
  brandName: string;
  primary: string;
  secondary: string;
  logoUrl: string;
};

type CompanyResp = {
  name?: string;
  settings?: { branding?: Partial<Branding> };
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
function luma({ r, g, b }: { r: number; g: number; b: number }) {
  // rec. 709
  return 0.2126*(r/255) + 0.7152*(g/255) + 0.0722*(b/255);
}

/** K-means simple (k=3) sobre una imagen downscaleada para obtener 3 colores dominantes */
async function extractPalette(imgUrl: string): Promise<string[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = imgUrl;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const W = 120, H = Math.max(60, Math.round((img.height / img.width) * 120));
  canvas.width = W; canvas.height = H;
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  // muestreo
  const pts: number[][] = [];
  for (let i = 0; i < data.length; i += 4 * 4) { // salto para acelerar
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 220) continue; // ignora transparentes
    pts.push([r, g, b]);
  }
  if (pts.length < 6) return ["#273c90", "#8692c1", "#666666"];

  // kmeans k=3
  const K = 3;
  let centers = pts.sort(() => 0.5 - Math.random()).slice(0, K).map(p => p.slice());
  for (let iter = 0; iter < 10; iter++) {
    const buckets: number[][][] = Array.from({ length: K }, () => []);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      for (let k = 0; k < K; k++) {
        const c = centers[k];
        const d = (p[0]-c[0])**2 + (p[1]-c[1])**2 + (p[2]-c[2])**2;
        if (d < bd) { bd = d; bi = k; }
      }
      buckets[bi].push(p);
    }
    for (let k = 0; k < K; k++) {
      const b = buckets[k];
      if (b.length === 0) continue;
      const m = b.reduce((acc, p) => [acc[0]+p[0], acc[1]+p[1], acc[2]+p[2]], [0,0,0]);
      centers[k] = [m[0]/b.length, m[1]/b.length, m[2]/b.length];
    }
  }
  // ordena por población aproximada (luego por luma)
  // (en esta versión, población ~ cercanía en la última asignación)
  const scores = centers.map((c) => {
    const lum = luma({ r: c[0], g: c[1], b: c[2] });
    return { c, lum };
  }).sort((a, b) => a.lum - b.lum);

  return scores.map(s => rgbToHex(s.c[0], s.c[1], s.c[2]));
}

export default function BrandingPage() {
  const qp = useSearchParams();
  const company = (qp.get("company") || "").toLowerCase();
  const [state, setState] = useState<Branding>({ brandName: "", primary: "#273c90", secondary: "#8692c1", logoUrl: "" });
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Carga inicial
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        const json: CompanyResp = await r.json();
        const b = json?.settings?.branding ?? {};
        setState({
          brandName: (b.brandName as string) || json?.name || "",
          primary: (b.primary as string) || "#273c90",
          secondary: (b.secondary as string) || "#8692c1",
          logoUrl: (b.logoUrl as string) || "",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [company]);

  const textOnPrimary = useMemo(() => {
    const lum = luma(hexToRgb(state.primary));
    return lum > 0.55 ? "#111111" : "#ffffff";
  }, [state.primary]);

  async function detectFromLogoUrl(url: string) {
    setDetecting(true);
    try {
      const colors = await extractPalette(url);
      // heurística: medio/oscuro → primario, claro → secundario
      const sorted = colors.sort((a,b) => luma(hexToRgb(a)) - luma(hexToRgb(b)));
      const primary = sorted[1] || sorted[0] || state.primary;
      const secondary = sorted[2] || sorted[0] || state.secondary;
      setState((s) => ({ ...s, primary, secondary }));
    } catch (e) {
      console.error("Detect colors:", e);
      alert("No pude detectar colores. Verifica el logo o intenta con otro archivo.");
    } finally {
      setDetecting(false);
    }
  }

  async function onDetectClick() {
    if (state.logoUrl) {
      await detectFromLogoUrl(state.logoUrl);
    } else {
      fileRef.current?.click();
    }
  }

  async function onPickFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    // Sube a Supabase Storage (bucket 'branding') y usa la URL pública
    const supabase = supabaseBrowser();
    const path = `branding/${company}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const { error } = await supabase.storage.from("public").upload(path, file, { upsert: true, cacheControl: "3600" } as any);
    if (error) {
      console.error(error);
      alert("No pude subir el logo.");
      return;
    }
    const { data } = supabase.storage.from("public").getPublicUrl(path);
    setState((s) => ({ ...s, logoUrl: data.publicUrl }));
    await detectFromLogoUrl(data.publicUrl);
  }

  async function saveBranding() {
  const payload = { settings: { branding: state } };
  const r = await fetch(`/api/admin/company?company=${company}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    let msg = r.statusText;
    try {
      const j = await r.json();
      msg = j?.error || msg;
    } catch {
      try { msg = await r.text(); } catch {}
    }
    alert("No pude guardar el branding: " + msg);
    return;
  }

  // Notifica a ThemeLoader y otras pestañas
  window.dispatchEvent(new CustomEvent("branding:updated", { detail: { company } }));
  try { localStorage.setItem("branding:updated", String(Date.now())); } catch {}
}


  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Configuración · Branding</h1>

      {loading ? (
        <div className="mt-6 text-sm text-slate-500">Cargando…</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda: Marca + logo */}
          <div className="rounded-2xl border p-4">
            <label className="block text-sm font-medium mb-2">Nombre de marca</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={state.brandName}
              onChange={(e) => setState((s) => ({ ...s, brandName: e.target.value }))}
            />

            <label className="block text-sm font-medium mt-4 mb-2">Logo URL (opcional)</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={state.logoUrl}
              onChange={(e) => setState((s) => ({ ...s, logoUrl: e.target.value }))}
              placeholder="https://…/logo.png"
            />

            <div className="text-xs text-slate-500 mt-2">
              También puedes subir un archivo y detectar desde ahí.
            </div>

            <div className="flex items-center gap-3 mt-4">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
              >
                Subir logo (PNG/SVG)
              </button>
              <button
                onClick={onDetectClick}
                disabled={detecting}
                className="rounded-md bg-[var(--brand-700)] text-white px-3 py-2 text-sm disabled:opacity-50"
              >
                {detecting ? "Detectando…" : "Detectar colores del logo"}
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="h-12 w-20 rounded-md border grid place-items-center">
                {state.logoUrl ? (
                  <img src={state.logoUrl} alt="logo" className="max-h-10 max-w-[76px] object-contain" />
                ) : (
                  <div className="text-xs text-slate-400">Sin logo</div>
                )}
              </div>
              <div className="text-xs text-slate-500">Preview</div>
            </div>
          </div>

          {/* Columna central: color primario */}
          <div className="rounded-2xl border p-4">
            <label className="block text-sm font-medium mb-2">Color primario</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={state.primary}
                onChange={(e) => setState((s) => ({ ...s, primary: e.target.value }))}
                className="h-10 w-10 rounded-md border p-0"
              />
              <input
                className="flex-1 rounded-xl border px-3 py-2"
                value={state.primary}
                onChange={(e) => setState((s) => ({ ...s, primary: e.target.value }))}
              />
            </div>

            <div className="mt-4 rounded-xl border overflow-hidden">
              <div className="h-12" style={{ background: state.primary }} />
              <div className="p-3 flex items-center justify-between">
                <div className="text-sm" style={{ color: textOnPrimary }}>
                  Texto sobre primario
                </div>
                <div className="text-xs text-slate-500">Contraste aprox: {luma(hexToRgb(state.primary)).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Columna derecha: color secundario */}
          <div className="rounded-2xl border p-4">
            <label className="block text-sm font-medium mb-2">Color secundario</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={state.secondary}
                onChange={(e) => setState((s) => ({ ...s, secondary: e.target.value }))}
                className="h-10 w-10 rounded-md border p-0"
              />
              <input
                className="flex-1 rounded-xl border px-3 py-2"
                value={state.secondary}
                onChange={(e) => setState((s) => ({ ...s, secondary: e.target.value }))}
              />
            </div>

            <div className="mt-4 rounded-xl border overflow-hidden">
              <div className="h-12" style={{ background: state.secondary }} />
              <div className="p-3 text-xs text-slate-500">Úsalo para acentos y elementos informativos.</div>
            </div>
          </div>

          <div className="lg:col-span-3 flex items-center gap-3">
            <button
              onClick={saveBranding}
              className="rounded-md bg-[var(--brand-700)] text-white px-4 py-2"
            >
              Guardar branding
            </button>
            <button
              onClick={() => {
                // Reaplicar sin guardar (preview rápido)
                window.dispatchEvent(new CustomEvent("branding:updated", { detail: { company } }));
                try { localStorage.setItem("branding:updated", String(Date.now())); } catch {}
              }}
              className="rounded-md border px-4 py-2"
            >
              Reaplicar tema (preview)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

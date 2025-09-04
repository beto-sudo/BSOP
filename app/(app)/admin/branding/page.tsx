"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Helpers: clamps y conversiones color */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function hexToRgb(hex: string) {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return { r: 37, g: 99, b: 235 }; // #2563eb fallback
  const h = m[1];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(clamp(Math.round(r), 0, 255))}${toHex(
    clamp(Math.round(b), 0, 255)
  )}${toHex(clamp(Math.round(g), 0, 255))}`;
}
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
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
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToRgb(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const tc = [hk + 1/3, hk, hk - 1/3].map((t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1/6) return p + (q - p) * 6 * tt;
    if (tt < 1/2) return q;
    if (tt < 2/3) return p + (q - p) * (2/3 - tt) * 6;
    return p;
  });
  return {
    r: Math.round(tc[0] * 255),
    g: Math.round(tc[1] * 255),
    b: Math.round(tc[2] * 255),
  };
}
function hslToHex(h: number, s: number, l: number) {
  const { r, g, b } = hslToRgb(h, s, l);
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Paleta 50–900 estilo Tailwind variando Lightness */
const L_SCALE: Record<string, number> = {
  "50": 97, "100": 94, "200": 86, "300": 77, "400": 66,
  "500": 56, "600": 47, "700": 39, "800": 32, "900": 25,
};
function buildPalette(h: number, s: number) {
  const out: Record<string, string> = {};
  (Object.keys(L_SCALE) as (keyof typeof L_SCALE)[]).forEach((k) => {
    out[k] = hslToHex(h, s, L_SCALE[k]);
  });
  return out;
}
/** Aplica paleta a las CSS vars que ya usa tu ThemeLoader */
function applyPaletteToCssVars(palette: Record<string, string>) {
  const root = document.documentElement;
  for (const k of Object.keys(palette)) {
    root.style.setProperty(`--brand-${k}`, palette[k]);
  }
  root.style.setProperty(`--brand`, palette["500"] ?? "#2563eb");
}

/** Tipado del GET /api/admin/company?company=... (lo que ya usas) */
type CompanyResponse = {
  id: string;
  name: string;
  slug: string;
  settings?: {
    branding?: {
      brandName?: string;
      primary?: string;        // hex base (ya lo tenías)
      hue?: number;            // nuevo para re-editar H/S/L
      saturation?: number;
      lightness?: number;
      palette?: Record<string, string>; // { "50":"#...", ... }
      logoUrl?: string;
      // secondary?: string;  // lo dejamos por si lo usas luego
    };
  };
};

export default function BrandingPage() {
  const qp = useSearchParams();
  const company = (qp.get("company") || "").toLowerCase();

  // Estado H/S/L (defaults cercanos a #2563eb)
  const [h, setH] = useState(220);
  const [s, setS] = useState(83);
  const [l, setL] = useState(56);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const palette = useMemo(() => buildPalette(h, s), [h, s]);
  const baseHex = useMemo(() => hslToHex(h, s, l), [h, s, l]);

  // Cargar branding actual (sin mover rutas ni shape)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!company) { setLoading(false); return; }
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        const data = (await r.json()) as CompanyResponse;
        if (!alive) return;

        const b = data?.settings?.branding || {};
        setName(b.brandName || data?.name || "");

        if (typeof b.hue === "number" && typeof b.saturation === "number") {
          setH(clamp(b.hue, 0, 360));
          setS(clamp(b.saturation, 0, 100));
          setL(typeof b.lightness === "number" ? clamp(b.lightness, 0, 100) : 56);
        } else if (b.primary) {
          const { r: rr, g: gg, b: bb } = hexToRgb(b.primary);
          const { h: hh, s: ss, l: ll } = rgbToHsl(rr, gg, bb);
          setH(hh); setS(ss); setL(ll);
        } else {
          setH(220); setS(83); setL(56);
        }

        // Aplica paleta persistida, o construye a partir de H/S
        const p = b.palette;
        if (typeof window !== "undefined") {
          applyPaletteToCssVars(p ?? buildPalette(h, s));
        }
      } catch (e) {
        console.error("branding load error", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  // Aplicar en vivo cuando se mueven sliders
  useEffect(() => {
    if (typeof window !== "undefined") applyPaletteToCssVars(palette);
  }, [palette]);

  async function onSave() {
    if (!company) return alert("Selecciona una empresa (?company=slug).");
    setSaving(true);
    try {
      const body = {
        settings: {
          branding: {
            brandName: name,
            primary: baseHex,  // guardamos base en HEX (compat con tu modelo actual)
            hue: h,
            saturation: s,
            lightness: l,
            palette,           // guardamos la 50–900
          },
        },
      };
      const r = await fetch(`/api/admin/company?company=${company}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Error ${r.status}: ${await r.text()}`);
      alert("Branding guardado.");
    } catch (e: any) {
      console.error(e);
      alert(`No se pudo guardar: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-2">Branding</h1>
        <p className="text-sm text-slate-500">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Branding de empresa</h1>
          <p className="text-sm text-slate-500">
            Ajusta el color base con H/S/L; generamos la paleta <code>50–900</code> y la aplicamos en vivo.
          </p>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium border border-[var(--brand-300)] bg-[var(--brand-50)] hover:bg-[var(--brand-100)] text-[var(--brand-800)]"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </header>

      {/* Nombre de marca */}
      <section className="grid gap-3 max-w-xl">
        <label className="text-xs text-slate-500">Nombre para mostrar</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme S.A. de C.V."
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
        />
      </section>

      {/* Sliders H/S/L */}
      <section className="grid md:grid-cols-3 gap-6 max-w-4xl">
        <div className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Hue (H)</span>
            <span className="text-xs text-slate-500">{h}</span>
          </div>
          <input type="range" min={0} max={360} value={h} onChange={(e) => setH(parseInt(e.target.value))} className="w-full" />
        </div>

        <div className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Saturation (S)</span>
            <span className="text-xs text-slate-500">{s}%</span>
          </div>
          <input type="range" min={0} max={100} value={s} onChange={(e) => setS(parseInt(e.target.value))} className="w-full" />
        </div>

        <div className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Lightness (L)</span>
            <span className="text-xs text-slate-500">{l}%</span>
          </div>
          <input type="range" min={0} max={100} value={l} onChange={(e) => setL(parseInt(e.target.value))} className="w-full" />
        </div>
      </section>

      {/* Color base directo (HEX) que sincroniza H/S/L */}
      <section className="grid gap-3 max-w-xl">
        <label className="text-xs text-slate-500">Color base (HEX)</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={baseHex}
            onChange={(e) => {
              const { r, g, b } = hexToRgb(e.target.value);
              const { h: hh, s: ss, l: ll } = rgbToHsl(r, g, b);
              setH(hh); setS(ss); setL(ll);
            }}
            className="h-10 w-14 rounded border"
            aria-label="Selector de color base"
          />
          <code className="text-sm">{baseHex}</code>
        </div>
        <p className="text-xs text-slate-500">
          El selector sincroniza la base con H/S/L; la paleta 50–900 se recalcula automáticamente.
        </p>
      </section>

      {/* Vista previa de paleta */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Paleta generada</h2>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
          {(Object.keys(palette) as (keyof typeof palette)[]).map((k) => (
            <div key={k} className="rounded-lg border overflow-hidden">
              <div className="h-10" style={{ backgroundColor: palette[k] }} title={`${k} ${palette[k]}`} />
              <div className="px-2 py-1 text-[10px] flex items-center justify-between">
                <span className="font-medium">{k}</span>
                <span className="text-slate-500">{palette[k]}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Se aplican <code>--brand-50</code>…<code>--brand-900</code> en vivo; al guardar, persistimos en <code>settings.branding</code>.
        </p>
      </section>
    </main>
  );
}

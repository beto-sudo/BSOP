// app/_components/ThemeLoader.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

type Branding = {
  brandName?: string;
  primary?: string;   // hex (#273c90)
  secondary?: string; // hex
  logoUrl?: string;
};

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}
function clamp(n: number, min = 0, max = 255) { return Math.min(max, Math.max(min, n)); }
/** lighten/darken in RGB space by mixing with white/black */
function shade(hex: string, percent: number) {
  const { r, g, b } = hexToRgb(hex);
  const p = percent / 100;
  const mix = (c: number, towards: number) => clamp(Math.round(c + (towards - c) * Math.abs(p)));
  if (p >= 0) {
    return rgbToHex(mix(r, 255), mix(g, 255), mix(b, 255));
  } else {
    return rgbToHex(mix(r, 0), mix(g, 0), mix(b, 0));
  }
}
function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

function applyCssVars(primary: string, secondary: string) {
  const root = document.documentElement.style;

  // Escala simple; ajusta si quieres otro mapeo
  const scale = {
    50: 35, 100: 28, 200: 20, 300: 14, 400: 7, 500: 0,
    600: -6, 700: -12, 800: -18, 900: -24,
  } as const;

  root.setProperty("--brand", primary);
  Object.entries(scale).forEach(([k, p]) =>
    root.setProperty(`--brand-${k}`, p === 0 ? primary : shade(primary, Number(p)))
  );

  const sec = secondary || primary;
  root.setProperty("--brand2", sec);
  Object.entries(scale).forEach(([k, p]) =>
    root.setProperty(`--brand2-${k}`, p === 0 ? sec : shade(sec, Number(p)))
  );
}

export default function ThemeLoader() {
  const qp = useSearchParams();
  const company = qp.get("company") || "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!company) return;
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        const json = await r.json();
        const b: Branding = json?.settings?.branding ?? {};
        const primary = (b.primary || "#273c90").toString();
        const secondary = (b.secondary || "#8692c1").toString();
        if (!cancelled) applyCssVars(primary, secondary);
      } catch (e) {
        // fallback
        applyCssVars("#273c90", "#8692c1");
        console.error("ThemeLoader branding fetch error:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [company]);

  return null;
}

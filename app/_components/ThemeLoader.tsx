// app/_components/ThemeLoader.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

type Branding = {
  brandName?: string;
  primary?: string;   // #RRGGBB
  secondary?: string; // #RRGGBB
};

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function clamp(n: number, min = 0, max = 255) { return Math.min(max, Math.max(min, n)); }
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
/** lighten/darken by mixing with white/black */
function shade(hex: string, percent: number) {
  const { r, g, b } = hexToRgb(hex);
  const p = percent / 100;
  const mix = (c: number, towards: number) => clamp(Math.round(c + (towards - c) * Math.abs(p)));
  return p >= 0
    ? rgbToHex(mix(r, 255), mix(g, 255), mix(b, 255))
    : rgbToHex(mix(r, 0), mix(g, 0), mix(b, 0));
}

function applyCssVars(primary: string, secondary: string) {
  const root = document.documentElement.style;
  const scale: Record<number, number> = { 50: 35, 100: 28, 200: 20, 300: 14, 400: 7, 500: 0, 600: -6, 700: -12, 800: -18, 900: -24 };

  root.setProperty("--brand", primary);
  Object.entries(scale).forEach(([k, p]) =>
    root.setProperty(`--brand-${k}`, Number(p) === 0 ? primary : shade(primary, Number(p)))
  );

  const sec = secondary || primary;
  root.setProperty("--brand2", sec);
  Object.entries(scale).forEach(([k, p]) =>
    root.setProperty(`--brand2-${k}`, Number(p) === 0 ? sec : shade(sec, Number(p)))
  );
}

async function fetchBranding(company: string): Promise<Branding | null> {
  try {
    const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
    const json = await r.json();
    const b = json?.settings?.branding ?? {};
    return { brandName: b.brandName || json?.name || "", primary: b.primary, secondary: b.secondary };
  } catch (e) {
    console.error("ThemeLoader branding fetch error:", e);
    return null;
  }
}

export default function ThemeLoader() {
  const qp = useSearchParams();
  const company = qp.get("company") || "";

  useEffect(() => {
    let stop = false;

    async function load() {
      if (!company) return;
      const b = await fetchBranding(company);
      const primary = b?.primary || "#273c90";
      const secondary = b?.secondary || "#8692c1";
      if (!stop) applyCssVars(primary, secondary);
    }
    load();

    // Reaplicar cuando alguien dispare "branding:updated" o cuando
    // otro tab escriba "branding:updated" en localStorage
    const handler = (e?: any) => {
      if (!e || e.detail?.company === company || e.key === "branding:updated") load();
    };
    window.addEventListener("branding:updated", handler as EventListener);
    window.addEventListener("storage", handler);

    return () => {
      stop = true;
      window.removeEventListener("branding:updated", handler as EventListener);
      window.removeEventListener("storage", handler);
    };
  }, [company]);

  return null;
}

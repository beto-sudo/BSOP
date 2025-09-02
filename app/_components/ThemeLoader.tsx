// app/_components/ThemeLoader.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(
    Math.max(0, Math.min(255, Math.round(g)))
  )}${toHex(Math.max(0, Math.min(255, Math.round(b))))}`;
}

function mix(hex: string, target: string, pct: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  const r = a.r + (b.r - a.r) * pct;
  const g = a.g + (b.g - a.g) * pct;
  const bl = a.b + (b.b - a.b) * pct;
  return rgbToHex(r, g, bl);
}

function makeScale(base: string) {
  // similar a Tailwind: 50 (muy claro)… 900 (muy oscuro)
  return {
    50: mix(base, "#ffffff", 0.90),
    100: mix(base, "#ffffff", 0.80),
    200: mix(base, "#ffffff", 0.60),
    300: mix(base, "#ffffff", 0.40),
    400: mix(base, "#ffffff", 0.20),
    500: base,
    600: mix(base, "#000000", 0.12),
    700: mix(base, "#000000", 0.24),
    800: mix(base, "#000000", 0.36),
    900: mix(base, "#000000", 0.48),
  };
}

function applyTheme(primary: string, secondary?: string) {
  const root = document.documentElement;
  const p = (primary || "#4f46e5").toLowerCase();
  const s = (secondary || "#14b8a6").toLowerCase();

  const ps = makeScale(p);
  const ss = makeScale(s);

  root.style.setProperty("--brand", p);
  Object.entries(ps).forEach(([k, v]) => root.style.setProperty(`--brand-${k}`, v));

  root.style.setProperty("--brand2", s);
  Object.entries(ss).forEach(([k, v]) => root.style.setProperty(`--brand2-${k}`, v));

  // utilidades
  root.style.setProperty("--brand-muted", ps[50]);
}

export default function ThemeLoader() {
  const qp = useSearchParams();
  const company = useMemo(() => (qp.get("company") || "").toLowerCase(), [qp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!company) return;
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        const branding = data?.settings?.branding ?? {};
        if (!cancelled) applyTheme(branding.primaryColor || "#4f46e5", branding.secondaryColor || "#14b8a6");
      } catch {}
    })();

    // permite que otras pantallas disparen actualización al vuelo
    const onUpdate = (e: any) => {
      applyTheme(e.detail?.primaryColor, e.detail?.secondaryColor);
    };
    window.addEventListener("branding:update", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("branding:update", onUpdate);
    };
  }, [company]);

  return null;
}

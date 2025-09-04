"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/* Helpers */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function hslToHex(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    const toHex = (v: number) => v.toString(16).padStart(2, "0");
    return `#${toHex(v)}${toHex(v)}${toHex(v)}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const tc = [hk + 1 / 3, hk, hk - 1 / 3].map((t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  });
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(tc[0])}${toHex(tc[1])}${toHex(tc[2])}`;
}
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
function applyPalette(prefix: "brand" | "brand2", palette: Record<string, string>) {
  const root = document.documentElement;
  for (const k of Object.keys(palette)) {
    root.style.setProperty(`--${prefix}-${k}`, palette[k]);
  }
  root.style.setProperty(`--${prefix}`, palette["500"] ?? (prefix === "brand" ? "#2563eb" : "#14b8a6"));
}
function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : "";
}

/* Componente */
export default function ThemeLoader() {
  const qp = useSearchParams();
  const pathname = usePathname();
  const company = (qp.get("company") || getCookie("company") || "").toLowerCase();

  const [loading, setLoading] = useState(false);
  const lastApplied = useRef<string>("");

  const key = useMemo(() => `${company}::${pathname}`, [company, pathname]);

  useEffect(() => {
    if (!company) return;

    let cancelled = false;
    async function fetchAndApply() {
      try {
        setLoading(true);
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = await r.json();
        if (cancelled) return;

        const b = data?.settings?.branding || {};

        // primaria
        const pal1: Record<string, string> =
          b.palette ??
          (typeof b.hue === "number" && typeof b.saturation === "number"
            ? buildPalette(b.hue, b.saturation)
            : undefined) ??
          buildPalette(220, 83);

        // secundaria (string legacy o bloque)
        const sec = typeof b.secondary === "string" ? { primary: b.secondary } : (b.secondary || {});
        const pal2: Record<string, string> =
          sec?.palette ??
          (typeof sec?.hue === "number" && typeof sec?.saturation === "number"
            ? buildPalette(sec.hue, sec.saturation)
            : undefined) ??
          buildPalette(180, 70);

        applyPalette("brand", pal1);
        applyPalette("brand2", pal2);

        lastApplied.current = company;
      } catch {
        applyPalette("brand", buildPalette(220, 83));
        applyPalette("brand2", buildPalette(180, 70));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (lastApplied.current !== company) fetchAndApply();

    return () => { cancelled = true; };
  }, [company, key]);

  // escucha “branding:updated” y cambios cross-tab
  useEffect(() => {
    function refetch() { lastApplied.current = ""; document.dispatchEvent(new Event("visibilitychange")); }
    const onCustom = () => refetch();
    const onStorage = (e: StorageEvent) => { if (e.key === "branding:updated") refetch(); };
    window.addEventListener("branding:updated", onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("branding:updated", onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}

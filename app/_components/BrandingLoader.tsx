'use client';

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

function shade(hex: string, percent: number) {
  const m = hex.replace("#","").match(/.{1,2}/g);
  if (!m) return hex;
  const [r,g,b] = m.map(x => parseInt(x,16));
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const rn = Math.round((t - r) * p + r);
  const gn = Math.round((t - g) * p + g);
  const bn = Math.round((t - b) * p + b);
  const toHex = (n:number) => n.toString(16).padStart(2,"0");
  return `#${toHex(rn)}${toHex(gn)}${toHex(bn)}`;
}

export default function BrandingLoader() {
  const qp = useSearchParams();
  const companySlug = (qp.get("company") || "").toLowerCase();

  useEffect(() => {
    (async () => {
      try {
        if (!companySlug) return;
        const r = await fetch(`/api/admin/company?company=${companySlug}`, { cache: "no-store" });
        const json = await r.json();
        const primary = json?.settings?.branding?.primary || "#334155";

        const root = document.documentElement;
        root.style.setProperty("--brand-50", shade(primary, 88));
        root.style.setProperty("--brand-100", shade(primary, 75));
        root.style.setProperty("--brand-200", shade(primary, 60));
        root.style.setProperty("--brand-800", shade(primary, -10));
        root.style.setProperty("--brand-900", shade(primary, -20));
        root.style.setProperty("--brand-primary", primary);
      } catch {}
    })();
  }, [companySlug]);

  return null;
}

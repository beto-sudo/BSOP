// app/_components/BrandingClient.tsx
"use client";

import { useEffect } from "react";

type Theme = {
  primary?: string;
  primaryText?: string;
  surface?: string;
  surfaceText?: string;
  accent?: string;
};

const BSOP_DEFAULT: Required<Theme> = {
  primary: "#111827",       // gris carbón
  primaryText: "#ffffff",
  surface: "#ffffff",
  surfaceText: "#111827",
  accent: "#84cc16",        // lime-400/500
};

export default function BrandingClient({
  theme,
  companyName,
}: {
  theme: Theme | null;
  companyName: string | null;
}) {
  useEffect(() => {
    const t = { ...BSOP_DEFAULT, ...(theme ?? {}) };
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", t.primary);
    root.style.setProperty("--brand-primary-text", t.primaryText);
    root.style.setProperty("--brand-surface", t.surface);
    root.style.setProperty("--brand-surface-text", t.surfaceText);
    root.style.setProperty("--brand-accent", t.accent);

    // opcional: título de la pestaña refleje empresa o BSOP
    if (companyName) {
      if (!document.title.includes(companyName)) {
        document.title = `${companyName} · BSOP`;
      }
    } else {
      document.title = "BSOP";
    }
  }, [theme, companyName]);

  return null;
}

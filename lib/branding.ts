// lib/branding.ts
// Utilidad para aplicar el "tema" (branding) de cada empresa usando variables CSS.
// Se usa así (cliente):
//   import { applyBranding } from "@/lib/branding";
//   applyBranding(company?.settings?.branding)

export type BrandingTheme = {
  primary: string;               // Ej. "#2563eb"
  primaryForeground: string;     // Ej. "#ffffff"
  sidebarBg: string;             // Ej. "#0b1220"
  sidebarFg: string;             // Ej. "#d3e1ff"
  sidebarMuted: string;          // Ej. "#9db0d3"
  sidebarActiveBg: string;       // Ej. "#172137"
  sidebarActiveFg: string;       // Ej. "#ffffff"
  sidebarBorder: string;         // Ej. "#1f2a44"
  logoUrl?: string;              // Opcional: para leerlo desde document.body.dataset.logoUrl
};

export const DEFAULT_BRANDING: BrandingTheme = {
  primary: "#2563eb",
  primaryForeground: "#ffffff",
  sidebarBg: "#0b1220",
  sidebarFg: "#d3e1ff",
  sidebarMuted: "#9db0d3",
  sidebarActiveBg: "#172137",
  sidebarActiveFg: "#ffffff",
  sidebarBorder: "#1f2a44",
  logoUrl: "/logo.svg",
};

// ---------- helpers ----------
function clampHex(hex: string) {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toLowerCase()}` : "#000000";
}
function hexToRgbTuple(hex: string): [number, number, number] {
  const h = clampHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}
function setCssVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}
function setCssColorVar(name: string, hex: string) {
  const [r, g, b] = hexToRgbTuple(hex);
  // Formato compatible con Tailwind: rgb(var(--x) / <alpha-value>)
  setCssVar(name, `${r} ${g} ${b}`);
}

// ---------- API ----------
export function applyBranding(input?: Partial<BrandingTheme>) {
  if (typeof window === "undefined") return;
  const t: BrandingTheme = { ...DEFAULT_BRANDING, ...(input || {}) };

  // brand tokens en RGB (para Tailwind)
  setCssColorVar("--brand-primary", t.primary);
  setCssColorVar("--brand-primary-foreground", t.primaryForeground);

  // tokens del sidebar (usamos tal cual los HEX)
  setCssVar("--sidebar-bg", clampHex(t.sidebarBg));
  setCssVar("--sidebar-fg", clampHex(t.sidebarFg));
  setCssVar("--sidebar-muted", clampHex(t.sidebarMuted));
  setCssVar("--sidebar-active-bg", clampHex(t.sidebarActiveBg));
  setCssVar("--sidebar-active-fg", clampHex(t.sidebarActiveFg));
  setCssVar("--sidebar-border", clampHex(t.sidebarBorder));

  if (t.logoUrl) document.body.dataset.logoUrl = t.logoUrl;
  else delete document.body.dataset.logoUrl;
}

// Para probar rápido desde consola del navegador:
// window.__applyBranding({ primary: "#22c55e" })
declare global { interface Window { __applyBranding?: (b?: Partial<BrandingTheme>) => void; } }
if (typeof window !== "undefined") window.__applyBranding = applyBranding;

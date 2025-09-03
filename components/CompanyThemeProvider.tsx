"use client";

import { ReactNode, useEffect } from "react";
import { applyBranding, DEFAULT_BRANDING, type BrandingTheme } from "@/lib/branding";

export function CompanyThemeProvider({
  children,
  initialBranding,
}: {
  children: ReactNode;
  initialBranding?: Partial<BrandingTheme>;
}) {
  useEffect(() => {
    // Aplica al montar. Luego, al cambiar de empresa, vuelve a llamarse applyBranding(...)
    applyBranding(initialBranding ?? DEFAULT_BRANDING);
  }, [initialBranding]);

  return <>{children}</>;
}

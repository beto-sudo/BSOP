"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Fuerza la presencia de ?company SOLO donde hace sentido.
 * Exenta /settings/*, /companies, /auth, /signin, /api… y permite "/" si ya trae ?company.
 */
export default function CompanyParamGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const qp = useSearchParams();

  const company = qp.get("company") || "";

  const isExempt =
    pathname === "/companies" ||
    pathname.startsWith("/companies") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/api");

  useEffect(() => {
    // Permitir "/" si ya tiene ?company=... (home de una empresa)
    if (pathname === "/") {
      if (!company) router.replace("/companies");
      return;
    }
    if (isExempt) return;
    if (!company) router.replace("/companies");
  }, [pathname, company, isExempt, router]);

  return null;
}

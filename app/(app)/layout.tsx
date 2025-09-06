// app/(app)/layout.tsx

// Fuerza SSR/dinámico como antes (evita export estático)
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import type { ReactNode } from "react";
import BrandingLoader from "@/app/_components/BrandingLoader";
import ClientShell from "./ClientShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Server: Branding/temas por cookie */}
      <BrandingLoader />
      {/* Cliente: sidebar ajustable + topbar; sin pasar funciones como props */}
      <ClientShell>{children}</ClientShell>
    </div>
  );
}

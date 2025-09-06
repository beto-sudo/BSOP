// app/(app)/layout.tsx

// 🔒 Fuerza SSR en todo el segmento (evita export estático)
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import type { ReactNode } from "react";
import BrandingLoader from "@/app/_components/BrandingLoader";
import Topbar from "@/app/_components/Topbar";
import Sidebar from "@/app/_components/Sidebar";
import ClientShell from "./ClientShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Server: mantiene cookies/headers y aplica branding como antes */}
      <BrandingLoader />

      {/* Conserva tu layout original basado en flex; el ancho lo maneja ClientShell */}
      <ClientShell
        renderSidebar={(width) => <Sidebar width={width} />}
        renderTopbar={<Topbar />}
      >
        {children}
      </ClientShell>
    </div>
  );
}

// app/(app)/layout.tsx
import type { ReactNode } from "react";
import BrandingLoader from "@/app/_components/BrandingLoader";
import Topbar from "@/app/_components/Topbar";
import Sidebar from "@/app/_components/Sidebar";
import ClientShell from "./ClientShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Server: deja que Branding aplique tema con cookies/headers */}
      <BrandingLoader />

      {/* Mantiene TU layout original (flex). El ajuste de ancho vive en ClientShell. */}
      <ClientShell
        renderSidebar={(width) => <Sidebar width={width} />}
        renderTopbar={<Topbar />}
      >
        {children}
      </ClientShell>
    </div>
  );
}

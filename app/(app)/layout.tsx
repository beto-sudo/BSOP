// app/(app)/layout.tsx
import type { ReactNode } from "react";
import BrandingLoader from "@/app/_components/BrandingLoader";
import Sidebar from "@/app/_components/Sidebar";
import Topbar from "@/app/_components/Topbar";
import ClientShell from "./ClientShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Server component: puede usar next/headers, cookies, etc. */}
      <BrandingLoader />
      {/* Cliente: maneja el grid + resize sin forzar al layout a ser client */}
      <ClientShell sidebar={<Sidebar />} topbar={<Topbar />}>
        {children}
      </ClientShell>
    </div>
  );
}

// app/(app)/layout.tsx
import type { ReactNode } from "react";
import BrandingLoader from "@/app/_components/BrandingLoader";
import Topbar from "@/app/_components/Topbar";
import Sidebar from "@/app/_components/Sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <BrandingLoader />
      {/* Layout en dos columnas: [Sidebar] | [Topbar + Main] */}
      <div className="flex min-h-screen">
        {/* Columna fija: Sidebar a todo lo alto */}
        <Sidebar />

        {/* Columna flexible: Topbar y contenido */}
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

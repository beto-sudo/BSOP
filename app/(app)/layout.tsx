// app/(app)/layout.tsx

// Fuerza SSR/dinámico como antes (evita export estático)
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import type { ReactNode } from "react";
import BrandingLoader from "@/app/_components/BrandingLoader";
import Topbar from "@/app/_components/Topbar";
import Sidebar from "@/app/_components/Sidebar";
import ClientShell from "./ClientShell";
import ErrorBoundary from "./ErrorBoundary";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <BrandingLoader />

      <ErrorBoundary>
        <ClientShell
          renderSidebar={(width) => <Sidebar width={width} />}
          renderTopbar={<Topbar />}
        >
          {children}
        </ClientShell>
      </ErrorBoundary>
    </div>
  );
}

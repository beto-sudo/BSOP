// app/(app)/layout.tsx
import type { ReactNode } from "react";
import BrandingLoader from "@/app/_components/BrandingLoader";
import Topbar from "@/app/_components/Topbar";
import Sidebar from "@/app/_components/Sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <BrandingLoader /> {/* aplica variables CSS de marca */}
      <Topbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

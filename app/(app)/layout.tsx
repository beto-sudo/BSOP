// app/(app)/layout.tsx

// Fuerza SSR (evita export estático y respeta cookies/branding)
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import type { ReactNode } from "react";
import BrandingLoader from "@/app/_components/BrandingLoader";
import ClientShell from "./ClientShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Server: aplica branding/tema por cookies como antes */}
      <BrandingLoader />
      {/* Client: sólo gestiona el ancho del sidebar y el handler */}
      <ClientShell>{children}</ClientShell>
    </>
  );
}

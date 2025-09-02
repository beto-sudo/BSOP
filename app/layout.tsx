import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BSOP",
  description: "BSOP Core v1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // IMPORTANTE: sólo html/body en el root; nada de Sidebar aquí
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 antialiased">
        {children}
      </body>
    </html>
  );
}

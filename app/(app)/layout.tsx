"use client";
// app/(app)/layout.tsx
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import BrandingLoader from "@/app/_components/BrandingLoader";
import Topbar from "@/app/_components/Topbar";
import Sidebar from "@/app/_components/Sidebar";

/**
 * Layout en 3 columnas:
 * [Sidebar ajustable] [handler] [columna derecha (Topbar + Main)]
 * - Sidebar ocupa toda la altura y llega hasta arriba
 * - Topbar se desprende a la derecha del sidebar
 * - El ancho del sidebar se persiste en localStorage
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const STORAGE_KEY = "bsop:sidebarWidth";
  const MIN = 224;        // ancho mínimo del sidebar (px)
  const MAX = 480;        // ancho máximo del sidebar (px)
  const HANDLE_W = 6;     // ancho del handler (px)

  const [sidebarW, setSidebarW] = useState<number>(() => {
    if (typeof window === "undefined") return 280;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const n = saved ? Number(saved) : 280;
    return Number.isFinite(n) ? Math.min(MAX, Math.max(MIN, n)) : 280;
  });

  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(sidebarW));
    } catch {}
  }, [sidebarW]);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startW: sidebarW };
    document.body.classList.add("select-none");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };
  const onMouseMove = (e: MouseEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const delta = e.clientX - s.startX;
    const next = Math.min(MAX, Math.max(MIN, s.startW + delta));
    setSidebarW(next);
  };
  const onMouseUp = () => {
    dragRef.current = null;
    document.body.classList.remove("select-none");
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startW: sidebarW };
    document.body.classList.add("select-none");
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const t = e.touches[0];
    const delta = t.clientX - s.startX;
    const next = Math.min(MAX, Math.max(MIN, s.startW + delta));
    setSidebarW(next);
  };
  const onTouchEnd = () => {
    dragRef.current = null;
    document.body.classList.remove("select-none");
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <BrandingLoader />
      <div
        className="min-h-screen w-full"
        style={{
          display: "grid",
          gridTemplateColumns: `${sidebarW}px ${HANDLE_W}px 1fr`,
          gridTemplateRows: "100vh",
        }}
      >
        {/* Sidebar altura completa */}
        <div style={{ gridColumn: "1 / 2", gridRow: "1 / 2" }}>
          <Sidebar />
        </div>

        {/* Handler de ajuste */}
        <div
          role="separator"
          aria-label="Ajustar ancho del panel lateral"
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          className="cursor-col-resize bg-transparent hover:bg-slate-200 active:bg-slate-300"
          style={{ gridColumn: "2 / 3", gridRow: "1 / 2" }}
          title="Arrastra para ajustar el ancho"
        />

        {/* Columna derecha: Topbar arriba + Main abajo */}
        <div
          style={{ gridColumn: "3 / 4", gridRow: "1 / 2", display: "grid", gridTemplateRows: "auto 1fr" }}
          className="min-w-0"
        >
          <Topbar />
          <main className="min-w-0 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

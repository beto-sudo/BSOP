"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Mantiene TU estructura flex:
 * [ Sidebar (width px) | handler 6px | columna derecha (Topbar + Main) ]
 * Solo gestiona el ancho y el drag; no toca contenidos.
 */
export default function ClientShell({
  renderSidebar,
  renderTopbar,
  children,
}: {
  renderSidebar: (width: number) => ReactNode;
  renderTopbar: ReactNode;
  children: ReactNode;
}) {
  const STORAGE_KEY = "bsop:sidebarWidth";
  const MIN = 224;
  const MAX = 480;
  const HANDLE_W = 6;

  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 260; // tu valor por defecto
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const n = saved ? Number(saved) : 260;
    return Number.isFinite(n) ? Math.min(MAX, Math.max(MIN, n)) : 260;
  });

  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
  }, [width]);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startW: width };
    document.body.classList.add("select-none");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };
  const onMouseMove = (e: MouseEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const next = Math.min(MAX, Math.max(MIN, s.startW + (e.clientX - s.startX)));
    setWidth(next);
  };
  const onMouseUp = () => {
    dragRef.current = null;
    document.body.classList.remove("select-none");
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startW: width };
    document.body.classList.add("select-none");
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = dragRef.current; if (!s) return;
    const t = e.touches[0];
    const next = Math.min(MAX, Math.max(MIN, s.startW + (t.clientX - s.startX)));
    setWidth(next);
  };
  const onTouchEnd = () => {
    dragRef.current = null;
    document.body.classList.remove("select-none");
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (misma columna que ya tenías) */}
      <div style={{ width }}>{renderSidebar(width)}</div>

      {/* Handler */}
      <div
        role="separator"
        aria-label="Ajustar ancho del panel lateral"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className="cursor-col-resize"
        style={{ width: HANDLE_W }}
        title="Arrastra para ajustar el ancho"
      />

      {/* Columna derecha: Topbar y contenido (idéntico a lo tuyo) */}
      <div className="flex-1 min-w-0 flex flex-col">
        {renderTopbar}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

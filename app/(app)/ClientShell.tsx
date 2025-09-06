"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * Mantiene tu layout flex original:
 * [ Sidebar | handler (6px) | columna derecha (Topbar + Main) ]
 * - Solo gestiona el ancho del sidebar y el drag.
 * - Evita leer localStorage hasta montar para no desincronizar SSR/CSR.
 */
export default function ClientShell({
  renderSidebar,
  renderTopbar,
  children,
}: {
  renderSidebar: (width: number) => ReactNode; // El Sidebar aplica style={{ width }}
  renderTopbar: ReactNode;
  children: ReactNode;
}) {
  const STORAGE_KEY = "bsop:sidebarWidth";
  const MIN = 224;
  const MAX = 480;
  const HANDLE_W = 6;

  // Inicia con 260 y luego lee localStorage al montar
  const [width, setWidth] = useState<number>(260);
  const mountedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const n = saved ? Number(saved) : 260;
      setWidth(Number.isFinite(n) ? Math.min(MAX, Math.max(MIN, n)) : 260);
    } finally {
      mountedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width]);

  // Drag con mouse
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

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

  // Drag con touch
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startW: width };
    document.body.classList.add("select-none");
    window.addEventListener("touchmove", onTouchMove as any, { passive: false });
    window.addEventListener("touchend", onTouchEnd as any);
  };

  const onTouchMove = (e: TouchEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const t = e.touches[0];
    const next = Math.min(MAX, Math.max(MIN, s.startW + (t.clientX - s.startX)));
    setWidth(next);
  };

  const onTouchEnd = () => {
    dragRef.current = null;
    document.body.classList.remove("select-none");
    window.removeEventListener("touchmove", onTouchMove as any);
    window.removeEventListener("touchend", onTouchEnd as any);
  };

  // Limpieza por si el componente se desmonta en medio del drag
  useEffect(() => {
    return () => {
      document.body.classList.remove("select-none");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove as any);
      window.removeEventListener("touchend", onTouchEnd as any);
    };
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar directo (el propio componente aplica style={{ width }}) */}
      {renderSidebar(width)}

      {/* Handler visible */}
      <div
        role="separator"
        aria-label="Ajustar ancho del panel lateral"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className="cursor-col-resize border-l hover:bg-slate-100 active:bg-slate-200"
        style={{ width: HANDLE_W }}
        title="Arrastra para ajustar el ancho"
      />

      {/* Derecha: Topbar + contenido */}
      <div className="flex-1 min-w-0 flex flex-col">
        {renderTopbar}
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

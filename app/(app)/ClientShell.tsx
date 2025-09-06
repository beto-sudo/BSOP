"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * Mantiene tu layout flex original:
 * [ Sidebar | handler (6px) | derecha (Topbar + Main) ]
 * - Solo gestiona el ancho (drag + persistencia).
 * - Blindajes para evitar errores de hidratación / valores NaN.
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

  const [width, setWidth] = useState<number>(260);
  const mounted = useRef(false);

  // Lee localStorage al montar y normaliza el valor
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      let n = saved ? Number(saved) : 260;
      if (!Number.isFinite(n)) n = 260;
      n = Math.min(MAX, Math.max(MIN, n));
      setWidth(n);
    } finally {
      mounted.current = true;
    }
  }, []);

  useEffect(() => {
    if (!mounted.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {/* ignore */}
  }, [width]);

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
    const next = s.startW + (e.clientX - s.startX);
    setWidth(Math.min(MAX, Math.max(MIN, next)));
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
    window.addEventListener("touchmove", onTouchMove as any, { passive: false });
    window.addEventListener("touchend", onTouchEnd as any);
  };

  const onTouchMove = (e: TouchEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const t = e.touches[0];
    const next = s.startW + (t.clientX - s.startX);
    setWidth(Math.min(MAX, Math.max(MIN, next)));
  };

  const onTouchEnd = () => {
    dragRef.current = null;
    document.body.classList.remove("select-none");
    window.removeEventListener("touchmove", onTouchMove as any);
    window.removeEventListener("touchend", onTouchEnd as any);
  };

  // Limpieza defensiva
  useEffect(() => {
    return () => {
      document.body.classList.remove("select-none");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove as any);
      window.removeEventListener("touchend", onTouchEnd as any);
    };
  }, []);

  // Indicador de vida opcional (para descartar "pantalla blanca" sin errores)
  const SHOW_DEBUG = false; // pon true si quieres ver la barrita arriba

  return (
    <div className="flex min-h-screen">
      {SHOW_DEBUG && (
        <div className="fixed top-0 left-0 z-[9999] text-xs bg-emerald-600 text-white px-2 py-1">
          shell ok — width: {width}px
        </div>
      )}

      {/* Sidebar (el propio componente aplica style={{ width }}) */}
      {renderSidebar(width)}

      {/* Handler */}
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

"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Mantiene tu estructura flex original:
 * [ Sidebar | handler 6px | columna derecha (Topbar + Main) ]
 * Sin wrappers extra alrededor del Sidebar.
 */
export default function ClientShell({
  renderSidebar,
  renderTopbar,
  children,
}: {
  renderSidebar: (width: number) => ReactNode; // Sidebar ya pinta style={{ width }}
  renderTopbar: ReactNode;
  children: ReactNode;
}) {
  const STORAGE_KEY = "bsop:sidebarWidth";
  const MIN = 224;
  const MAX = 480;
  const HANDLE_W = 6;

  // Evita mismatch de hidratación: no lees localStorage hasta que montas
  const [width, setWidth] = useState<number>(260);
  const mountedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const n = saved ? Number(saved) : 260;
      setWidth(Number.isFinite(n) ? Math.min(MAX, Math.max(MIN, n)) : 260);
      mountedRef.current = true;
    } catch {
      mountedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    try { window.localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
  }, [width]);

  // Drag
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

  // Touch
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startW: width };
    document.body.classList.add("select-none");
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = drag

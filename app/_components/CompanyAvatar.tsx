"use client";

import { useEffect, useState } from "react";

type Props = {
  src?: string | null;
  name?: string;
  /** tamaño base en px para alto; el ancho se ajusta si es rectangular */
  size?: number;
};

type Shape = "circle" | "square" | "landscape" | "portrait";

export default function CompanyAvatar({ src, name, size = 36 }: Props) {
  const [shape, setShape] = useState<Shape>("square");
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: size, h: size });

  useEffect(() => {
    if (!src) {
      setShape("square");
      setDims({ w: size, h: size });
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const ar = w / h;

      // 1) Estimación por relación de aspecto
      let s: Shape = Math.abs(ar - 1) < 0.12 ? "square" : ar > 1 ? "landscape" : "portrait";

      // 2) Detección de círculo: esquinas transparentes + casi 1:1
      try {
        const c = document.createElement("canvas");
        c.width = Math.min(w, 64);
        c.height = Math.min(h, 64);
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          const a = (x: number, y: number) => data[(y * c.width + x) * 4 + 3];
          const corners = [a(0, 0), a(c.width - 1, 0), a(0, c.height - 1), a(c.width - 1, c.height - 1)];
          const cornersTransparent = corners.filter((v) => v < 8).length >= 3;
          if (cornersTransparent && Math.abs(ar - 1) < 0.2) s = "circle";
        }
      } catch {
        // CORS u otros: nos quedamos con la estimación por AR
      }

      setShape(s);

      // Dimensiones de render
      if (s === "circle" || s === "square") setDims({ w: size, h: size });
      else if (s === "landscape") setDims({ h: size, w: Math.round(size * Math.min(2.0, ar)) });
      else setDims({ w: size, h: Math.round(size * Math.min(2.0, 1 / ar)) });
    };

    img.onerror = () => {
      setShape("square");
      setDims({ w: size, h: size });
    };

    img.src = src;
  }, [src, size]);

  const initials =
    (name || "")
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "—";

  const radius = shape === "circle" ? "rounded-full" : "rounded-lg";

  return (
    <div
      className={`bg-white border shadow-sm grid place-items-center overflow-hidden ${radius}`}
      style={{ width: dims.w, height: dims.h }}
      title={name || "Logo"}
    >
      {src ? (
        <img src={src} alt={name || "Logo"} className="h-full w-full object-contain" />
      ) : (
        <span className="text-[11px] text-slate-600">{initials}</span>
      )}
    </div>
  );
}

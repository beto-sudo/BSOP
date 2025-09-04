// app/api/utils/image-proxy/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      // Importante: no enviamos credenciales; solo hacemos passthrough
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `Fetch failed (${upstream.status})` }, { status: 502 });
    }

    // Pasamos el content-type original si viene; si no, default
    const ct = upstream.headers.get("content-type") || "application/octet-stream";
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "no-store",
        // No hace falta CORS aquí, la imagen ya es same-origin (esta ruta)
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Proxy error" }, { status: 500 });
  }
}

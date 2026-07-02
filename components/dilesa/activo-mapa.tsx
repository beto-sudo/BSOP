'use client';

/**
 * ActivoMapa — visor del/los KMZ de un activo del portafolio (iniciativa
 * `dilesa-portafolio-predios` · S4).
 *
 * Lee los adjuntos rol `kmz` del activo (erp.adjuntos vía proxy autenticado),
 * los des-zipea en el cliente (jszip), convierte el KML a GeoJSON
 * (@tmcw/togeojson) y pinta los polígonos sobre OpenStreetMap con leaflet.
 * Acepta también .kml planos. Fallback: marcador con lat/long del activo.
 *
 * SOLO cliente — el caller lo monta con `next/dynamic` y `ssr: false`
 * (leaflet toca `window` al importarse). Este componente es la base que la
 * iniciativa hermana `mapas-interactivos` generaliza después.
 */

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import JSZip from 'jszip';
import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import type { FeatureCollection } from 'geojson';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import 'leaflet/dist/leaflet.css';

type Capa = {
  id: string;
  nombre: string;
  geojson: FeatureCollection;
};

/** Extrae el KML de un blob KMZ (zip) o KML plano y lo convierte a GeoJSON. */
async function blobToGeoJSON(blob: Blob, filename: string): Promise<FeatureCollection | null> {
  let kmlText: string | null = null;
  if (/\.kml$/i.test(filename)) {
    kmlText = await blob.text();
  } else {
    const zip = await JSZip.loadAsync(blob);
    const entry = Object.values(zip.files).find((f) => /\.kml$/i.test(f.name) && !f.dir);
    if (entry) kmlText = await entry.async('text');
  }
  if (!kmlText) return null;
  const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
  const gj = kmlToGeoJSON(dom) as FeatureCollection;
  return gj.features?.length ? gj : null;
}

/** Ajusta el encuadre a las capas cargadas (o al marcador de fallback). */
function FitBounds({ capas, fallback }: { capas: Capa[]; fallback: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    const group = L.featureGroup(capas.map((c) => L.geoJSON(c.geojson)));
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    } else if (fallback) {
      map.setView(fallback, 16);
    }
  }, [map, capas, fallback]);
  return null;
}

export function ActivoMapa({
  activoId,
  latitud,
  longitud,
  nombre,
}: {
  activoId: string;
  latitud: number | null;
  longitud: number | null;
  nombre: string;
}) {
  const [capas, setCapas] = useState<Capa[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .schema('erp')
        .from('adjuntos')
        .select('id, nombre, url, rol')
        .eq('entidad_tipo', 'activo')
        .eq('entidad_id', activoId)
        .eq('rol', 'kmz')
        .is('sustituido_at', null)
        .order('created_at', { ascending: false });
      if (!vivo) return;
      if (error || !data?.length) {
        setAviso(
          error
            ? 'No se pudieron consultar los KMZ del activo.'
            : 'Sin KMZ cargado — súbelo en Documentos con el rol "KMZ / ubicación".'
        );
        setLoading(false);
        return;
      }
      const cargadas: Capa[] = [];
      for (const adj of data) {
        try {
          const resp = await fetch(getAdjuntoProxyUrl(adj.url));
          if (!resp.ok) continue;
          const gj = await blobToGeoJSON(await resp.blob(), adj.nombre ?? '');
          if (gj) cargadas.push({ id: adj.id, nombre: adj.nombre ?? 'KMZ', geojson: gj });
        } catch {
          // KMZ corrupto/no parseable: se omite y se avisa abajo.
        }
      }
      if (!vivo) return;
      setCapas(cargadas);
      setAviso(
        cargadas.length === 0
          ? 'El KMZ cargado no se pudo interpretar (¿archivo corrupto o sin geometría?).'
          : cargadas.length < data.length
            ? 'Algún KMZ no se pudo interpretar; se muestran los demás.'
            : null
      );
      setLoading(false);
    })();
    return () => {
      vivo = false;
    };
  }, [activoId]);

  const fallback = useMemo<[number, number] | null>(
    () => (latitud != null && longitud != null ? [latitud, longitud] : null),
    [latitud, longitud]
  );

  if (loading) {
    return <div className="h-72 animate-pulse rounded-lg bg-[var(--border)]/40" />;
  }

  if (capas.length === 0 && !fallback) {
    return <p className="text-sm text-[var(--text)]/60">{aviso ?? 'Sin datos de ubicación.'}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="h-72 overflow-hidden rounded-lg border border-[var(--border)]">
        <MapContainer
          center={fallback ?? [28.7, -100.52]}
          zoom={fallback ? 16 : 13}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {capas.map((c) => (
            <GeoJSON
              key={c.id}
              data={c.geojson}
              style={{ color: '#2563eb', weight: 2, fillOpacity: 0.15 }}
            />
          ))}
          {capas.length === 0 && fallback ? (
            <CircleMarker center={fallback} radius={8} pathOptions={{ color: '#2563eb' }}>
              <Popup>{nombre}</Popup>
            </CircleMarker>
          ) : null}
          <FitBounds capas={capas} fallback={fallback} />
        </MapContainer>
      </div>
      {aviso ? <p className="text-xs text-[var(--text)]/50">{aviso}</p> : null}
    </div>
  );
}

export default ActivoMapa;

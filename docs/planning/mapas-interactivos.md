# Iniciativa — Mapas interactivos (capa geográfica cross-módulo)

**Slug:** `mapas-interactivos`
**Empresas:** todas (capa transversal; foco inicial DILESA)
**Schemas afectados:** principalmente UI (componente de mapa reutilizable). Lectura de geo que ya existe (`dilesa.activos.latitud/longitud`, ubicaciones de proyectos/construcción/ventas); posible columna `geo_geojson` jsonb + centroide/bbox cacheados donde haga falta (sin PostGIS por ahora). Storage `adjuntos` para KMZ/KML.
**Estado:** proposed
**Próximo hito:** Cerrar alcance v1 — decidir librería (react-leaflet + OpenStreetMap vs MapLibre), el contrato del componente `<MapaBSOP>` reutilizable, y los 4 módulos consumidores + qué geo tiene cada uno hoy (gap de lat/long poblado).
**Dueño:** Beto
**Creada:** 2026-06-16
**Última actualización:** 2026-06-16 (promovida a proposed)

## Problema

BSOP no tiene visualización geográfica. Varios módulos manejan ubicaciones que solo se ven como texto o coordenadas sueltas: el **Portafolio** (activos con lat/long + KMZ de predios), **Proyectos/Anteproyectos** (fraccionamientos con plano y polígono), **Construcción/Obras** (viviendas por manzana/lote), e **Inventario de ventas** (lotes/casas en el plano del desarrollo). Ver todo esto en un mapa interactivo —con filtros y drill-down a la ficha— da una lectura operativa que hoy no existe.

## Outcome esperado (a cerrar)

Una **capa de mapas reutilizable** que cualquier módulo pueda montar:

- Componente `<MapaBSOP>` (react-leaflet o MapLibre, montado con `next/dynamic ssr:false`) que recibe puntos/polígonos + estilo + handler de click.
- **Pins por entidad** coloreados por estado/tipo, click → abre el detail drawer del módulo.
- **Overlay de KMZ/KML** parseado a GeoJSON en cliente (`@tmcw/togeojson` + `jszip`), sin PostGIS.
- Filtros compartidos con la lista del módulo (useUrlFilters).
- Aplicado a: **Portafolio** (activos + polígonos de terreno), **Proyectos** (polígono del fraccionamiento), **Construcción** (avance por vivienda sobre el plano), **Inventario de ventas** (disponibilidad sobre el plano).

## Alcance preliminar (a refinar en planning)

- **Sprint 0:** decidir librería + contrato del componente + auditar qué geo está poblada hoy (lat/long suele estar vacío → puede requerir una ola de geo-captura, que se apoya en la captura del Portafolio).
- **Sprint 1:** `<MapaBSOP>` + primer consumidor (Portafolio: pins + KMZ overlay).
- **Sprints siguientes:** un módulo consumidor por sprint (Proyectos, Construcción, Ventas).

## Riesgos / preguntas abiertas

- **Geo no poblada**: lat/long está vacío en casi todos los registros hoy → el mapa nace vacío sin una ola de captura. Depende de la captura del Portafolio (`dilesa-portafolio-expediente`) y de un plan de geo-referencia para proyectos/construcción.
- **Librería**: react-leaflet+OSM (gratis, sin API key) vs MapLibre (mejor para vector tiles). Decidir.
- **SSR en Next.js 16**: leaflet es client-only → `next/dynamic ssr:false`, ningún import al server bundle.
- **KMZ pesados/con estilos**: validar el parser con archivos reales antes de cerrar el contrato.
- **¿PostGIS?**: solo si aparecen queries espaciales (qué activos caen en un sector). Por ahora jsonb + render cliente; promover a `geometry` con ADR si se necesita.

## Bitácora

- **2026-06-16** — Promovida a `proposed`. Surge del análisis del módulo Portafolio: Beto pidió mapas interactivos no solo para Portafolio sino transversal a obras de construcción, proyectos e inventario de ventas. Se separó de `dilesa-portafolio-expediente` (que sólo carga el KMZ como archivo) para hacerse como capa reutilizable.

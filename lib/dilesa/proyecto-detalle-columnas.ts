/**
 * SELECT canónico de `dilesa.proyectos` para el detalle.
 *
 * Vive aquí (no en `components/dilesa/proyecto-detalle.tsx`) para
 * poder importarse desde route handlers server-only sin arrastrar el
 * árbol del client component al bundle del API route. Next.js bundlea
 * eagerly los imports de archivos con `'use client'` aunque solo
 * importes una constante.
 *
 * Si agregas columnas nuevas al type `ProyectoDetalle`, actualízalas
 * también aquí o no llegarán a `<AnteproyectoDetalle>` ni al PDF.
 */

export const PROYECTO_DETALLE_COLUMNAS = [
  'id, tipo, nombre, estado, clave_interna, proyecto_padre_id, proyecto_predecesor_id',
  'fecha_inicio, fecha_fin_estimada, fecha_licencia',
  'area_m2, area_vendible_m2, areas_verdes_m2, lotes_proyectados',
  'presupuesto_estimado, costo_terreno, costo_urbanizacion, costo_construccion, costo_comercializacion',
  'notas, plano_oficial_url, image_url, acreditacion_escritura, objetivo_trimestral',
  // Sprint C — paridad Coda v2
  'clasificacion_inmobiliaria, area_comercial_m2, area_residencial_m2, area_vialidades_m2',
  'precio_m2_excedente, costo_mo, tamano_lote_promedio',
  // Sprint 4B — análisis financiero
  'valor_comercial_referencia, valor_comercial_proyecto',
  'costo_urbanizacion_referencia',
  'costo_materiales_referencia, costo_materiales_proyecto',
  'costo_mo_referencia',
  'registro_ruv_referencia, registro_ruv_proyecto',
  'seguro_calidad_referencia, seguro_calidad_proyecto',
  'costo_comercializacion_referencia',
  'infraestructura_cabecera_necesaria, valor_predio, prototipos_referencia',
  // Sprint 4B refinamiento
  'clasificaciones_inmobiliarias, prototipo_referencia_id',
].join(', ');

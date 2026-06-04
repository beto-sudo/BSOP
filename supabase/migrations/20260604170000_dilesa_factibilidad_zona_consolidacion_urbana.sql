-- Agrega la tarea canónica "Factibilidad de Zona de Consolidación Urbana"
-- al checklist de anteproyectos DILESA.
--
-- Contexto: iniciativa `dilesa-proyectos-anteproyectos` (cerrada
-- 2026-05-26). El catálogo `dilesa.plantilla_proyecto_tareas` gobierna
-- las tareas que se instancian en cada anteproyecto. Beto pidió sumar
-- una factibilidad municipal nueva, hermana de "Factibilidad de Uso de
-- Suelo" (mismo tipo/subtipo/entidad/duración).
--
-- Decisiones (confirmadas con Beto 2026-06-04):
--   - Posición: orden 8, justo después de "Factibilidad de Uso de Suelo"
--     (orden 7). Las tareas en orden >= 8 se recorren una posición.
--   - Obligatoriedad: obligatoria.
--   - Backfill: los 5 anteproyectos vivos (3 en análisis + 2 completados).
--   - Dependencia: depende de la Escritura, igual que sus hermanas
--     Uso de Suelo / Agua / Energía.
--
-- Propiedades de la migración:
--   - IDEMPOTENTE: cada paso está guardado por NOT EXISTS / ON CONFLICT /
--     y el recorrido de orden se condiciona a que la tarea nueva no exista
--     todavía. Re-aplicarla es un no-op seguro.
--   - PREVIEW-SAFE: el backfill de instancias es SELECT-driven sobre
--     `dilesa.proyectos`; en un branch Preview sin datos de prod inserta
--     cero filas sin fallar. No hardcodea UUIDs generados (resuelve por
--     nombre).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Catálogo: hacer espacio en orden 8 (recorrer +1 las tareas de
--    anteproyecto activas en orden >= 8). Condicionado a que la tarea
--    nueva no exista aún → idempotente.
-- ════════════════════════════════════════════════════════════════════════════
UPDATE dilesa.plantilla_proyecto_tareas
SET orden_default = orden_default + 1,
    updated_at = NOW()
WHERE aplicacion = 'anteproyecto'
  AND deleted_at IS NULL
  AND activa = true
  AND orden_default >= 8
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.plantilla_proyecto_tareas x
    WHERE x.nombre = 'Factibilidad de Zona de Consolidación Urbana'
      AND x.aplicacion = 'anteproyecto'
      AND x.deleted_at IS NULL
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Insertar la nueva factibilidad canónica en orden 8.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO dilesa.plantilla_proyecto_tareas
  (nombre, aplicacion, tipo, subtipo, duracion_dias_habiles, orden_default,
   entidad_responsable, obligatoriedad, requiere_archivo, formato_archivo)
SELECT
  'Factibilidad de Zona de Consolidación Urbana', 'anteproyecto', 'Factibilidad',
  'Urbanismo', 15, 8, 'Municipio', 'obligatoria', true, 'PDF'
WHERE NOT EXISTS (
  SELECT 1 FROM dilesa.plantilla_proyecto_tareas
  WHERE nombre = 'Factibilidad de Zona de Consolidación Urbana'
    AND aplicacion = 'anteproyecto'
    AND deleted_at IS NULL
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Dependencia de catálogo: la nueva depende de la Escritura (igual que
--    sus hermanas Uso de Suelo / Agua / Energía).
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO dilesa.plantilla_proyecto_tareas_dependencias
  (plantilla_tarea_id, depende_de_plantilla_tarea_id)
SELECT nueva.id, escritura.id
FROM dilesa.plantilla_proyecto_tareas nueva
JOIN dilesa.plantilla_proyecto_tareas escritura
  ON escritura.nombre = 'Escritura/Contrato Compraventa del Terreno'
 AND escritura.aplicacion = 'anteproyecto'
 AND escritura.deleted_at IS NULL
WHERE nueva.nombre = 'Factibilidad de Zona de Consolidación Urbana'
  AND nueva.aplicacion = 'anteproyecto'
  AND nueva.deleted_at IS NULL
ON CONFLICT (plantilla_tarea_id, depende_de_plantilla_tarea_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Backfill a los anteproyectos vivos. SELECT-driven (Preview-safe) e
--    idempotente: solo toca anteproyectos que aún no tienen la tarea nueva.
-- ════════════════════════════════════════════════════════════════════════════

-- 4a) Recorrer +1 las instancias de plantilla en orden >= 8, solo en los
--     anteproyectos que todavía no tienen la nueva factibilidad.
UPDATE dilesa.proyecto_tareas t
SET orden = t.orden + 1
WHERE t.deleted_at IS NULL
  AND t.plantilla_tarea_id IS NOT NULL
  AND t.orden >= 8
  AND t.proyecto_id IN (
    SELECT p.id
    FROM dilesa.proyectos p
    WHERE p.tipo = 'anteproyecto'
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM dilesa.proyecto_tareas nt
        JOIN dilesa.plantilla_proyecto_tareas pl ON pl.id = nt.plantilla_tarea_id
        WHERE nt.proyecto_id = p.id
          AND nt.deleted_at IS NULL
          AND pl.nombre = 'Factibilidad de Zona de Consolidación Urbana'
      )
  );

-- 4b) Insertar la instancia nueva en orden 8 por cada anteproyecto que aún
--     no la tenga. Copia fecha_objetivo de la "Factibilidad de Uso de Suelo"
--     del mismo proyecto (misma dependencia y duración → misma ventana).
INSERT INTO dilesa.proyecto_tareas (
  empresa_id, proyecto_id, plantilla_tarea_id, titulo, descripcion,
  estado, prioridad, orden,
  tipo_snapshot, subtipo_snapshot, entidad_responsable_snapshot,
  aplicacion_snapshot, obligatoriedad_snapshot, se_entrega_a_snapshot,
  requiere_archivo_snapshot, formato_archivo_snapshot,
  duracion_dias_habiles_snapshot, fecha_objetivo_inicio, fecha_objetivo_fin
)
SELECT
  p.empresa_id, p.id, nueva.id, nueva.nombre, nueva.descripcion,
  'pendiente', 'alta', 8,
  nueva.tipo, nueva.subtipo, nueva.entidad_responsable,
  nueva.aplicacion, nueva.obligatoriedad, nueva.se_entrega_a,
  nueva.requiere_archivo, nueva.formato_archivo,
  nueva.duracion_dias_habiles, uso.fecha_objetivo_inicio, uso.fecha_objetivo_fin
FROM dilesa.proyectos p
CROSS JOIN (
  SELECT * FROM dilesa.plantilla_proyecto_tareas
  WHERE nombre = 'Factibilidad de Zona de Consolidación Urbana'
    AND aplicacion = 'anteproyecto' AND deleted_at IS NULL
  LIMIT 1
) AS nueva
LEFT JOIN dilesa.plantilla_proyecto_tareas uso_cat
  ON uso_cat.nombre = 'Factibilidad de Uso de Suelo'
 AND uso_cat.aplicacion = 'anteproyecto' AND uso_cat.deleted_at IS NULL
LEFT JOIN dilesa.proyecto_tareas uso
  ON uso.proyecto_id = p.id
 AND uso.deleted_at IS NULL
 AND uso.plantilla_tarea_id = uso_cat.id
WHERE p.tipo = 'anteproyecto'
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.proyecto_tareas existente
    WHERE existente.proyecto_id = p.id
      AND existente.plantilla_tarea_id = nueva.id
      AND existente.deleted_at IS NULL
  );

-- 4c) Dependencia entre instancias: la nueva depende de la Escritura del
--     mismo anteproyecto.
INSERT INTO dilesa.proyecto_tareas_dependencias (tarea_id, depende_de_tarea_id)
SELECT nt.id, et.id
FROM dilesa.proyecto_tareas nt
JOIN dilesa.plantilla_proyecto_tareas nueva_cat
  ON nueva_cat.id = nt.plantilla_tarea_id
 AND nueva_cat.nombre = 'Factibilidad de Zona de Consolidación Urbana'
JOIN dilesa.plantilla_proyecto_tareas escritura_cat
  ON escritura_cat.nombre = 'Escritura/Contrato Compraventa del Terreno'
 AND escritura_cat.aplicacion = 'anteproyecto'
 AND escritura_cat.deleted_at IS NULL
JOIN dilesa.proyecto_tareas et
  ON et.proyecto_id = nt.proyecto_id
 AND et.plantilla_tarea_id = escritura_cat.id
 AND et.deleted_at IS NULL
WHERE nt.deleted_at IS NULL
ON CONFLICT (tarea_id, depende_de_tarea_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;

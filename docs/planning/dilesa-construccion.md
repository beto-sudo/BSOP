# Iniciativa — Módulo Construcción DILESA

**Slug:** `dilesa-construccion`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (8 tablas nuevas + extender `productos`),
`erp` (extender `personas.tipo` con `'contratista'`)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-24
**Última actualización:** 2026-05-25 (Sprint 3 — UI lectura: 4 páginas
nuevas /dilesa/construccion (lista + detalle) y /dilesa/contratistas
(lista con KPIs + detalle con obras asignadas y contratos) + migración
de RBAC + sync de 4 lugares (NAV_ITEMS, ROUTE_TO_MODULE,
EXPECTED_DB_MODULE_SLUGS, core.modulos). Sprint 4 — captura — pendiente.)

## Problema

El módulo de Ventas DILESA (cerrado en Sprint 7a/7b) opera con
asunciones manuales sobre qué unidades están disponibles para vender,
porque **no existe un módulo de Construcción** que actualice el
inventario:

1. **Las 1,590 unidades importadas de Coda no tienen `producto_id`
   asignado** en BSOP (solo lote/manzana, sin prototipo). En el form
   de captura "Nueva Solicitud" la dropdown de unidad disponible
   muestra "M1-L3-LDLE · 655.77m²" sin el sufijo del prototipo.
2. **No hay disparador automático "construcción ≥ 20% → disponible
   para venta"** que Coda sí tiene desde hace años.
3. **Sin tracking de avance de obra en BSOP**, las Fases 14 y 15 del
   pipeline de venta (Preparada para Entrega, Entregada) no se pueden
   automatizar — quedan como captura manual sin fuente de verdad.

Esto se descubrió en pruebas del piloto Sprint 7c (captura por fase):
el bug del prototipo en la dropdown disparó la conversación con Beto.

**Conclusión operativa**: el orden lógico de los módulos era
Construcción → Ventas. Se hizo al revés (Ventas primero) porque el
flujo migrado de Coda dio momentum. Ahora se corrige.

## Outcome esperado

1. **Lectura completa del estado de obra en BSOP** — lista de
   construcciones por lote/contratista/proyecto con avance derivado,
   tareas pendientes/terminadas, fechas críticas (arranque, compromiso,
   proyectada, terminada, DTU, seguro calidad, extracción, paquete RUV).
2. **Captura del log de obra** — arrancar construcción (asigna
   prototipo + contratista + contrato), registrar tarea terminada
   (con MO + revisor), crear contrato de construcción con N lotes.
3. **Trigger SQL automático "20% → disponible"** — cuando una
   `dilesa.construccion` pasa de avance < 20 a ≥ 20, la
   `dilesa.unidades` correspondiente pasa a `estado='disponible'` +
   se setea `producto_id`. Sincronización automática Construcción →
   Inventario → Ventas.
4. **Reapertura natural del módulo de Ventas** — el bug del prototipo
   en la dropdown se resuelve solo (las unidades disponibles tendrán
   `producto_id`). Las 15 fases restantes del Sprint 7c pueden
   retomarse sin más cambios.

## Modelo conceptual

Replica la estructura de Coda (validada operativamente) con cambios
estructurales que aprovechan SQL:

```
CATÁLOGOS
  dilesa.etapas_construccion         (PRELIMINARES, CIMENTACION, ...)
  dilesa.tareas_construccion         (~500 tareas posibles del diccionario)
  dilesa.plantilla_tareas            (N:M producto × tarea × etapa
                                      con porcentaje_costo + tiempo)
  dilesa.productos.planos JSONB      (14 planos del prototipo)

ACTORES
  erp.personas (tipo='contratista')  ← FK
  dilesa.contratistas_datos          (satélite con 37 cols específicos:
                                      REPSE, retención 5%, KPIs)

CONTRATOS
  dilesa.contratos_construccion      ← 1 contratista + valor + fianzas
  dilesa.contrato_lotes              ← N:M contrato × construcciones

EJECUCIÓN (pivot central)
  dilesa.construccion                ← 1 fila por arranque
                                       (lote + prototipo + contratista)
                                       campos físicos limpios; ningún
                                       CSV en columnas (a diferencia
                                       de Coda)

LOG
  dilesa.construccion_tareas_terminadas
                                     ← append-only: tarea + fecha
                                       + MO + revisor + fecha_pagada
```

## Cambios estructurales respecto a Coda

1. **CSV strings → JOINs reales**. Coda tiene "Tareas Pendientes" y
   "Tareas Terminadas" como strings concatenados con comas (300+
   tareas en una celda). En BSOP queremos JOINs limpios y filtros
   indexables.
2. **Columnas calculadas → SQL functions / views**.
   `Construcción por Lote` tiene en Coda decenas de columnas
   calculadas (Avance%, Días sin avance, Días Retraso, Efectividad,
   MO Ejecutado, Fecha Proyectada). En BSOP serán:
   - `fn_calcular_avance_construccion(construccion_id) RETURNS numeric`
   - `v_construccion_summary` (vista con todos los derivados)
     No vivimos con columnas físicas que pueden desincronizarse.
3. **Contratistas en `erp.personas`** (no tabla separada DILESA-only).
   Tipo `'contratista'` agregado al CHECK. Permite reutilizar el
   día que ANSA u otra empresa los necesite. Datos fiscales/REPSE/KPIs
   en `dilesa.contratistas_datos`.
4. **Planos en JSONB** (no 14 columnas). Es un objeto
   `{ arq_planta_baja: url, arq_planta_alta: url, ... }` que se puede
   versionar y agregar planos nuevos sin migración.

## Caso del trigger "20% → disponible"

```sql
-- Función que recalcula avance al insertar/eliminar tareas terminadas
CREATE FUNCTION fn_actualizar_avance_unidad() RETURNS trigger AS $$
DECLARE
  v_construccion_id uuid := COALESCE(NEW.construccion_id, OLD.construccion_id);
  v_avance numeric;
  v_unidad_id uuid;
BEGIN
  SELECT fn_calcular_avance_construccion(v_construccion_id) INTO v_avance;
  SELECT unidad_id INTO v_unidad_id FROM dilesa.construccion WHERE id = v_construccion_id;

  -- Sync de avance + estado
  UPDATE dilesa.construccion SET avance_pct = v_avance WHERE id = v_construccion_id;

  -- Si pasó de <20 a >=20 → unidad disponible
  IF v_avance >= 20 THEN
    UPDATE dilesa.unidades
    SET estado = 'disponible',
        producto_id = (SELECT producto_id FROM dilesa.construccion WHERE id = v_construccion_id)
    WHERE id = v_unidad_id
      AND estado = 'planeada';  -- solo si todavía no disponible
  END IF;

  RETURN NULL;
END $$ LANGUAGE plpgsql;
```

## Alcance v1 — 5 Sprints

- [ ] **Sprint 1 — Schema base + ADR**
  - ADR `docs/adr/NNNN_dilesa_construccion_modelo.md`
  - Migración SQL `<timestamp>_dilesa_construccion_schema_base.sql`:
    - Extender `erp.personas` CHECK de `tipo` con `'contratista'`
    - Extender `dilesa.productos` con `planos JSONB`
    - 8 tablas nuevas en `dilesa`:
      - `etapas_construccion` (catálogo)
      - `tareas_construccion` (catálogo)
      - `plantilla_tareas` (N:M producto × tarea × etapa)
      - `contratistas_datos` (satélite de erp.personas)
      - `contratos_construccion` (cabecera de contrato)
      - `contrato_lotes` (N:M contrato × construcción)
      - `construccion` (pivot central — 1 por arranque)
      - `construccion_tareas_terminadas` (log append-only)
    - Todas con: PK uuid, FK empresa_id → core.empresas, RLS por
      `core.fn_has_empresa('dilesa')`, trigger `updated_at`, `deleted_at`,
      índices estratégicos.
    - SQL function `fn_calcular_avance_construccion(id uuid) RETURNS numeric`
      = SUM(plantilla_tareas.porcentaje_costo) WHERE tarea terminada.
    - Trigger `tg_construccion_avance_unidad` AFTER INSERT/DELETE en
      `construccion_tareas_terminadas` → ejecuta función, recalcula
      avance, dispara "20% → disponible" si aplica.
    - `NOTIFY pgrst, 'reload schema'` al final.
  - Regenerar `SCHEMA_REF.md` + `types/supabase.ts`.
  - Verificación local + PR (sin aplicar a prod hasta OK verbal).

- [ ] **Sprint 2 — Importación completa Coda**
  - Mapeo Coda → BSOP en `docs/planning/dilesa-construccion-mapeo-coda.md`
  - Scripts en orden:
    - `import_dilesa_construccion_catalogos.ts` — etapas, tareas,
      plantilla_tareas, planos (a `productos.planos` JSONB).
    - `import_dilesa_contratistas.ts` — contratistas a `erp.personas`
      - satélite `contratistas_datos`.
    - `import_dilesa_contratos_construccion.ts` — contratos + N:M lotes.
    - `import_dilesa_construccion.ts` — pivot central con todas las
      obras históricas (~estimar via Coda total rows).
    - `import_dilesa_tareas_terminadas.ts` — log completo, en
      batches por contrato (lección del Sprint 6: `.in()` URL limit).
  - Validación: contar filas migradas vs. Coda, spot-check de 5
    obras al azar, verificar que avance calculado coincide con el
    avance en Coda (la f órmula es la misma).
  - PR cierra Sprint 2.

- [ ] **Sprint 3 — UI lectura**
  - Migración: registrar `dilesa.construccion` y `dilesa.contratistas`
    en `core.modulos` con backfill defensivo de permisos (regla de
    "Liberación de módulo nuevo" del CLAUDE.md).
  - `/dilesa/construccion` (lista filtrable: proyecto, contratista,
    avance%, estado, supervisor). Columna "Avance" como barra.
  - `/dilesa/construccion/[id]` (detalle: timeline de etapas con
    tareas dentro, tareas pendientes/terminadas, contrato, contratista,
    fechas críticas, MO ejecutado vs por ejecutar, DTU/RUV).
  - `/dilesa/contratistas` (lista + KPIs) y
    `/dilesa/contratistas/[id]` (detalle con obras asignadas + saldo
    MO + REPSE + retención + cuentas bancarias).
  - RBAC 4-places sync (NAV_ITEMS + ROUTE_TO_MODULE + EXPECTED + migración).
  - PR cierra Sprint 3.

- [ ] **Sprint 4 — UI captura**
  - Form "Arrancar construcción": selecciona unidad disponible
    (sin construccion vigente) + prototipo del catálogo + contratista
    - contrato + fecha arranque. Al guardar: INSERT en `construccion`
    - UPDATE `unidades.estado='planeada'` (todavía no disponible —
      el trigger lo hará al pasar 20%).
  - Form "Registrar tarea terminada": selecciona construcción +
    tarea de la plantilla del prototipo asociado + fecha + revisor
    - MO. INSERT en `construccion_tareas_terminadas`. El trigger
      recalcula avance + dispara cambio de estado si aplica.
  - Form "Crear contrato de construcción": contratista + lotes
    (multi-select de construcciones sin contrato) + valor + fianzas.
  - Sub-slugs nuevos: `dilesa.construccion.arrancar`,
    `dilesa.construccion.tareas`, `dilesa.construccion.contratos`.
  - PR cierra Sprint 4.

- [ ] **Sprint 5 — Integración con ventas + cierre**
  - Verificación end-to-end: ejecutar manualmente "registrar tarea
    terminada" hasta que avance pase de 18 a 22 en una unidad → el
    trigger debe disparar `unidades.estado='en_construccion'` + setear
    `producto_id`.
  - Confirmar que el form `/dilesa/ventas/nueva` ahora muestra el
    prototipo en la dropdown (bug original resuelto).
  - Vista global de avance por proyecto en `/dilesa/proyectos/[id]`.
  - Reabrir Sprint 7c de ventas (captura por fase) — las 4 PRs
    pendientes (7c-2 a 7c-5) pueden retomarse.
  - Cierre de iniciativa.

## Fuera de alcance v1

- Cronograma Gantt visual (vista de calendario interactiva)
- Optimización de asignación de contratistas (algoritmo)
- Comisiones / pagos a contratistas (vive con el shift de hardcodes,
  Sprint posterior)
- Adjuntos por tarea (fotos del avance) — primero el core funcional
- Integración con presupuesto/CapEx del proyecto madre (ya hay
  `dilesa.proyecto_prorrateo`, pero la integración bidireccional
  Construcción → CapEx vive con el módulo de Finanzas que no existe).
- Notificaciones (email/WhatsApp) por hitos de obra
- App móvil para el supervisor en campo (PWA o nativa)

## Métricas de éxito

1. **Bug del prototipo en form de venta resuelto** — la dropdown
   muestra "M1-L3-LDLE-ISC · 105m²" con sufijo de prototipo correcto.
2. **Trigger activo en prod** — 0 captura manual de inventario;
   las unidades pasan a disponible automáticamente al cruzar 20%.
3. **Avance % en BSOP coincide con avance en Coda** para las obras
   migradas (validación post-Sprint 2).
4. **Sprint 7c-2 a 7c-5 reabiertos** sin más fixes — las 15 fases
   restantes de captura por fase se implementan sin estorbos.

## Riesgos / preguntas abiertas

1. **Cardinalidad del import**. Si Coda tiene 5,000+ obras × ~150
   tareas c/u = 750k filas en `tareas_terminadas`. Manejable pero
   requiere batching cuidadoso (lección del Sprint 6 con
   `.in()` URL limit ~200 IDs).
2. **Coexistencia Coda ↔ BSOP durante Sprint 2-3**. Mientras se
   migra, ¿quién es source of truth? Propuesta: Coda sigue siendo
   SoT hasta que el módulo de captura esté en prod (Sprint 4). El
   import es snapshot; deltas durante el sprint se reconcilian al
   final (mismo patrón que ventas Sprint 6).
3. **Reconciliación con `dilesa.unidades` existentes**. Las 1,590
   unidades en BSOP vs. las construcciones en Coda — debemos crear
   FK `construccion.unidad_id → unidades.id` usando el matching
   `identificador` (ej. "M13-L1-LDS"). Si hay obras de Coda sin
   unidad correspondiente en BSOP (lotes que se importaron mal o
   se borraron), reportar en el script para que Beto decida.
4. **Catálogo de tareas**. Coda tiene ~500 nombres de tareas como
   strings — ¿hay duplicados o variantes ortográficas? El import
   debe deduplicar limpio.
5. **Cambio de prototipo después de arrancar**. ¿Una construcción
   puede cambiar de prototipo en medio? (caso edge: arrancó como
   prototipo X, decidieron cambiar a Y por mercado). Por ahora
   asumimos NO — si se decide cambiar, se cancela la construccion
   actual y se crea una nueva.

### Decisiones cerradas en la promoción

- **Contratistas en `erp.personas`** (tipo='contratista') con
  satélite `dilesa.contratistas_datos`. Permite reuso cross-empresa
  futuro sin migrar.
- **Avance % = `SUM(plantilla_tareas.porcentaje_costo)` donde la
  tarea está en `tareas_terminadas`**. Refleja avance financiero
  real, no count plano. Misma fórmula que Coda usa hoy.
- **Umbral disponible-para-venta: 20% de avance**. Mismo que Coda.
  Trigger SQL automático; sin botón manual.
- **Importar TODO el histórico** (incluyendo obras terminadas hace
  años). Permite reportes históricos + KPIs de contratistas + base
  para análisis de tiempos de obra.
- **Planos del prototipo como JSONB** en `dilesa.productos.planos`.
  No tabla separada de 14 cols.
- **Tareas terminadas con MO ya integrada** (capex tracking
  automático del costo de obra ejecutado por contratista).

## Decisiones registradas

(append-only)

## Bitácora

(append-only, escrito por Claude Code al ejecutar)

### 2026-05-25 — Sprint 3 (UI lectura)

**PR:** feat(dilesa): construcción Sprint 3 — UI lectura
(branch `feat/dilesa-construccion-sprint-3`)

**Cambios:**

- Migración `20260525020000_dilesa_construccion_modulos.sql` —
  registra `dilesa.construccion` y `dilesa.contratistas` en
  `core.modulos` (seccion='operaciones') + backfill defensivo de
  permisos read+write para cada rol existente en DILESA. Idempotente.
- RBAC 4-places sync:
  - `components/app-shell/nav-config.ts` — entries Construcción +
    Contratistas en grupo Inmobiliario de DILESA.
  - `lib/permissions.ts` — entries `'/dilesa/construccion'` y
    `'/dilesa/contratistas'` en `ROUTE_TO_MODULE`.
  - `lib/permissions.test.ts` — slugs nuevos en
    `EXPECTED_DB_MODULE_SLUGS`.
- 4 páginas nuevas:
  - `app/dilesa/construccion/page.tsx` + `components/dilesa/construccion-module.tsx`
    — lista filtrable (proyecto, contratista, estado, rango de avance,
    búsqueda) con barra de avance visual coloreada (rojo <20, ámbar
    20-66, verde ≥66) y orden default por identificador.
  - `app/dilesa/construccion/[id]/page.tsx` — detalle con 4 secciones
    (Datos generales, MO, Avance por etapa colapsable, Contratos).
    Etapa colapsable agrupa las tareas de la plantilla del prototipo
    con flag terminada/pendiente, fecha terminada, revisor, MO pagada.
  - `app/dilesa/contratistas/page.tsx` + `components/dilesa/contratistas-module.tsx`
    — lista con KPIs derivados client-side (obras en curso/terminadas,
    MO ejecutado total) y filtros PF/PM, REPSE, activo/inactivo.
  - `app/dilesa/contratistas/[id]/page.tsx` — detalle con 4 secciones
    (Datos generales, KPIs strip, Obras asignadas con barras de avance
    - link, Contratos con # lotes cubiertos).

**Decisiones tácticas:**

- **Barra de avance inline (no componente Progress canónico)** — no
  hay `components/ui/progress.tsx` en el repo todavía. Implementado
  como `div` con width % escalado y color según umbral (consistente
  con el umbral 20% del trigger). Cuando aparezca un Progress base
  podemos refactorizar todas las barras (lista, detalle, drawer) a
  uno solo.
- **KPIs de contratistas calculados client-side** — Sprint 3 no
  introduce vistas SQL para KPIs porque las cardinalidades son chicas
  (~23 contratistas × ~1,372 obras). Si en Sprint 4 los filtros se
  vuelven más complejos o aparece "MO pendiente este mes" lo movemos
  a `v_contratista_kpis`.
- **Lookups en memoria + `.eq(empresa_id)`** — mismo patrón que
  `ventas-module.tsx`. Evita `.in(uuids[])` con > 200 IDs (que
  rebasaría 8KB URL en Cloudflare) y embeds de PostgREST que rompen
  cuando la tabla embebida existe en > 1 schema (caso `proyectos`
  en `dilesa` y `erp`).
- **Etapas filtradas a las que tienen tareas en la plantilla** del
  prototipo asignado a la obra (no mostrar etapas vacías para evitar
  ruido).
- **Cancelada NO suma como obra ni en KPIs de MO** — KPI "obras
  terminadas" cuenta solo `terminada/dtu/seguro_calidad/extraida`.
  Las canceladas se muestran aparte en el strip del contratista
  como referencia histórica con apariencia muted.

**Pendiente verificar Beto:**

- Aplicar la migración a prod (`supabase db push` está bloqueado por
  el classifier en sesiones autónomas — Beto la corre manualmente).
- Verificación visual en preview (las 4 páginas + barras de avance +
  flujo de click row → detail).

**Sprint 4 — captura (pendiente):** forms "Arrancar construcción",
"Registrar tarea terminada", "Crear contrato" + sub-slugs
`dilesa.construccion.arrancar`, `.tareas`, `.contratos`.

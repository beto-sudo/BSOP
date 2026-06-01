# Iniciativa — Módulo Construcción DILESA

**Slug:** `dilesa-construccion`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (8 tablas nuevas + extender `productos`),
`erp` (extender `personas.tipo` con `'contratista'`)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-24
**Última actualización:** 2026-06-01 (Sprint 6 — PDF del contrato de obra
generable/imprimible desde el detalle del contrato. Reabre la iniciativa
con un add-on: el documento legal "Contrato de Servicios a Precios
Unitarios" replicado de Coda + ANEXO 3 de precios unitarios derivados.)

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

### 2026-06-01 — ANEXO 3: precio unitario por actividad derivado del % de costo

El "ANEXO 3 — plantilla de precios unitarios por actividad y prototipo"
referido en la cláusula SÉPTIMA no tiene precios MO absolutos por
actividad capturados: la columna `dilesa.plantilla_tareas.costo_mo_plantilla`
está en 0 para las 1,746 filas, y en la tabla origen de Coda ("Plantilla
Tareas de Construcción Prototipos") las columnas `Costo MO` y `Costo MO
Plantilla` también están en $0.00. Lo único poblado es `porcentaje_costo`.

Decisión: el precio unitario de cada actividad en el PDF se **deriva**
como `porcentaje_costo × valor_contrato_mo(prototipo)`, donde el valor MO
del prototipo proviene de `dilesa.construccion.valor_contrato_mo` (=
`precio_mo_x_m2 × m2_construccion`) de un lote representativo de ese
prototipo en el contrato. Es la única reconstrucción posible y coincide
con el modelo del contrato (% del valor MO total). **Pendiente de validar
por Beto contra un Anexo 3 real de Coda** antes de tratar el PDF como
documento final firmable.

### 2026-06-01 — Datos de DILESA del contrato de obra ≠ compraventa

El contrato de obra cita representante (Adalberto Santos de los Santos)
y escritura constitutiva (177) distintos a los del Contrato de Promesa de
Compraventa (Norberto Gutiérrez Infante, escritura 167, en `constantes.ts`).
Se replicaron tal cual del doc vivo en Coda en un archivo separado
`lib/dilesa/contrato/constantes-obra.ts`. Reconciliar cuál es el vigente es
decisión legal de Beto.

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

### 2026-05-25 — Sprint 4 (UI captura)

**PR:** feat(dilesa): construcción Sprint 4 — UI captura
(branch `feat/dilesa-construccion-sprint-4`)

**Cambios:**

- Migración `20260525024233_dilesa_construccion_subslugs_captura.sql` —
  inserta los 3 sub-slugs de captura (`dilesa.construccion.arrancar`,
  `.tareas`, `.contratos`) en `core.modulos` (seccion='operaciones')
  con backfill defensivo de permisos: clona acceso del padre
  `dilesa.construccion` a cada hijo, así cualquier rol que tenía write
  sobre el módulo lectura conserva capacidad de captura sin
  intervención manual. Idempotente vía ON CONFLICT DO NOTHING.
  Sigue ADR-030 SS3 al pie de la letra.
- RBAC sync 3-places (sin tocar sidebar — los forms se acceden desde
  páginas padre, no aparecen como entries propias):
  - `lib/permissions.ts` — 3 entries nuevas en `ROUTE_TO_MODULE`
    mapeando cada URL de form a su sub-slug.
  - `lib/permissions.test.ts` — los 3 sub-slugs nuevos en
    `EXPECTED_DB_MODULE_SLUGS` (el test de drift bloquea CI si falta).
- 3 forms de captura:
  - `app/dilesa/construccion/arrancar/page.tsx` — selecciona proyecto
    → unidad elegible (estado planeada/lote_urbanizado, sin obra
    vigente) + prototipo + contratista + contrato opcional + supervisor
    opcional + fechas. Auto-genera código tipo Coda
    `<unidad>-<sufijo-prototipo>-<abrev-contratista>` con override
    manual. Insert único: si hay carrera por el UNIQUE en
    construccion.unidad_id, mensaje específico. Si se eligió contrato,
    crea la ligadura en `contrato_lotes` (best-effort — no rompe la
    obra si falla).
  - `app/dilesa/construccion/[id]/registrar-tarea/page.tsx` — captura
    MULTI-tarea (más frecuente del módulo). Muestra tareas pendientes
    agrupadas por etapa con checkbox + fields condicionales (fecha,
    MO pagada, revisor). "Marcar toda la etapa" para flujo masivo.
    Defaults de sesión (fecha + revisor) propagados a todas las filas.
    Bulk insert en `construccion_tareas_terminadas` — el trigger
    recalcula avance UNA vez por insert pero todos sobre la misma
    construccion (rápido). Releemos avance post-save para reportar en
    el toast si cruzó 20% (unidad disponible) o 100% (terminada).
  - `app/dilesa/construccion/contratos/nuevo/page.tsx` — selecciona
    contratista → obras suyas SIN contrato vigente (excluyendo
    canceladas), multi-select con marcar/limpiar todos. Filtro
    opcional por proyecto. Auto-código tipo Coda
    `<año>/N-DIE-<abrev>-CONTRATO#<seq>` con seq derivado del conteo
    actual + override manual. Insert contrato + bulk insert
    `contrato_lotes`. Soporta `?contratista=<id>` deep-link desde el
    detalle del contratista.
- Botones de entrada en páginas existentes (gated client-side por
  `permissions.modulos.get(...).write`):
  - `components/dilesa/construccion-module.tsx` (lista) — botón
    "Arrancar construcción" en el header de filtros.
  - `app/dilesa/construccion/[id]/page.tsx` (detalle obra) — botón
    "Registrar tareas" en el header de la sección Avance por etapa
    (solo si hay tareas en la plantilla).
  - `app/dilesa/contratistas/[id]/page.tsx` (detalle contratista) —
    botón "Crear contrato" en el header de la sección Contratos, con
    deep-link al form pre-seleccionando contratista.

**Decisiones tácticas:**

- **UX multi-tarea (no form-por-tarea).** Construcción es captura de
  alta frecuencia — un supervisor cierra 5-15 tareas por visita.
  Forzar form-por-tarea con submit + redirect entre cada una se vuelve
  doloroso rápido. Implementado como lista filtrada de pendientes con
  checkbox + fields inline solo en las marcadas. Trade-off: el state
  es un `Map<plantillaId, TareaForm>` que requiere effect para
  re-aplicar defaults a filas existentes cuando cambia el default
  global, pero el patrón mantiene la latencia de captura baja.
- **Sin sidebar entry para sub-slugs.** Los 3 forms son acción
  iniciada desde la página padre, no destino que el usuario busca por
  el sidebar. NAV_ITEMS sólo declara `dilesa.construccion` y
  `dilesa.contratistas` (umbrellas de lectura). Esto es lo que ADR-030
  SS2 espera para sub-slugs que son "captura desde padre".
- **Botones gated client-side via `usePermissions()`.** Mismo patrón
  que `ventas-module.tsx` — el botón se oculta si el usuario no tiene
  write sobre el sub-slug. RequireAccess en cada page proporciona el
  segundo gate por si entran vía URL directa.
- **UNIQUE strict en construccion.unidad_id.** El schema base puso
  UNIQUE sin filtrar deleted_at, así que una unidad no puede tener
  ni siquiera obra histórica soft-deleted más una nueva. El form
  filtra elegibles excluyendo TODAS las obras (incluso deleted),
  consistente con el constraint. Si emerge necesidad de "rearrancar"
  obra cancelada, requiere migración (relajar constraint o hard-delete
  la cancelada antes).
- **Best-effort en operaciones secundarias.** Si el INSERT de
  contrato_lotes falla después del INSERT de construccion (caso edge:
  RLS bug, FK race), no revertimos — la obra ya existe, el toast
  reporta el problema parcial y el operador puede asignar contrato
  desde el detalle después. Mismo patrón que `marcar-fase.ts` con
  los adjuntos.
- **Auto-código con override.** Replica el naming de Coda
  (`M13-L1-LDS-RMA-MAYA`) para mantener continuidad operativa pero
  permite override por si el operador quiere otra convención. El
  helper que arma el sugerido depende de los 3 inputs
  (unidad/prototipo/contratista) — se vuelve a calcular en cada
  cambio sin extra round-trip.
- **Pre-selección por `?contratista=` con suspense correcto.** El
  form de contratos usa useSearchParams (deep-link desde detalle de
  contratista), así que el body va dentro de RequireAccess — durante
  prerender estático RequireAccess está en loading state y los
  hooks dinámicos no corren (regla SS6 de ADR-030).

**Pendiente verificar Beto:**

- Aplicar la migración a prod (`supabase db push` bloqueado por
  classifier en sesiones autónomas — Beto la corre).
- Verificación visual en preview de los 3 forms + flujo completo:
  arrancar → registrar tareas hasta cruzar 20% → ver unidad pasar a
  en_construccion → form de venta nueva mostrar el prototipo.
- Spot-check: crear un contrato con 2-3 lotes desde el detalle de un
  contratista existente.

### 2026-05-25 — Sprint 4 refactor (post-Coda-review)

**PR:** mismo branch / mismo PR (#515 sigue abierto) — commit nuevo
encima del original de Sprint 4.

**Contexto del refactor:** Beto vio el screenshot del flujo cotidiano
en Coda. La operación real es "contratista llega con precio MO/m² →
arrancamos N lotes de un proyecto en un solo paso". El precio vive a
nivel contrato (no por lote) y el MO por tarea NO se captura — se
deriva. El Sprint 4 original había dividido eso en 2 forms separados
(Arrancar standalone + Crear contrato) más un campo MO opcional en
Registrar tarea, lo cual no refleja cómo Beto/José Pablo realmente
operan. El refactor colapsa los flujos en 2 acciones reales.

**Cambios:**

- `app/dilesa/construccion/contratos/nuevo/page.tsx` reescrito
  completo. Ahora es un form combinado:
  - **Cabecera única**: contratista + proyecto (filtra lotes elegibles)
    - precio MO × m² + fecha + fianzas + código auto-sugerido tipo Coda
      (`<año>/<seq>-DIE-<abrev>-CONTRATO#<seq>`).
  - **Multi-row de lotes** (mínimo 1, sin máximo): cada fila es lote +
    prototipo + fecha de arranque. Auto-calcula m² desde
    `productos.atributos.m2_construccion` y valor MO del lote
    (`precio_mo × m²`). "+ Agregar lote" / botón X por fila. Subtotal
    m² y subtotal valor MO al pie. Mix de prototipos permitido (igual
    que Coda — RMA+RMC+RMD juntos).
  - **Submit secuencial best-effort**: 1 INSERT contrato (con
    valor_total = SUM(precio_mo × m²)) → loop N veces (INSERT
    construccion con precio_mo_x_m2 + m2_construccion + valor_contrato_mo
    derivados + INSERT contrato_lote con monto_lote + UPDATE
    unidades.estado='planeada' si era 'lote_urbanizado'). Reporta éxitos
    - fallas en toast diferenciado por severidad.
- `app/dilesa/construccion/[id]/registrar-tarea/page.tsx`:
  - Quitado el campo "MO pagada (opcional)" del form (el state
    `manoObraPagada` y el grid de 3 cols → 2 cols).
  - El header de la página muestra `valor_contrato_mo` de la obra +
    una línea read-only "El MO por tarea se deriva = valor_contrato_mo
    × % costo plantilla".
  - Cada row de tarea muestra `MO {monto}` calculado read-only al lado
    del %. Si la obra no tiene valor_contrato_mo todavía, solo el %.
  - El INSERT en `construccion_tareas_terminadas` NO setea
    `mano_obra_pagada` (queda NULL — la vista SQL lo deriva).
- `app/dilesa/construccion/arrancar/page.tsx` + carpeta borrados —
  el flujo standalone "arrancar sin contrato" ya no existe.
- `lib/permissions.ts`: quitada la entry
  `'/dilesa/construccion/arrancar'` de `ROUTE_TO_MODULE`. Comentario
  explica por qué el sub-slug `dilesa.construccion.arrancar` se
  deprecó.
- `lib/permissions.test.ts`: quitado `dilesa.construccion.arrancar`
  de `EXPECTED_DB_MODULE_SLUGS`. El slug en DB queda vivo como
  vestigio inofensivo (no se referencia desde código, sin cleanup
  formal porque el agente no tiene `db push` libre).
- `components/dilesa/construccion-module.tsx`: botón "+ Arrancar
  construcción" → "+ Nuevo contrato + arranques" con href a
  `/dilesa/construccion/contratos/nuevo`. El gate cambia de
  `dilesa.construccion.arrancar` a `dilesa.construccion.contratos`.
- Migración nueva
  `20260525143208_dilesa_construccion_v_tareas_con_mo.sql` —
  CREATE OR REPLACE VIEW `dilesa.v_construccion_tareas_terminadas_con_mo`
  con `mo_calculado = COALESCE(mano_obra_pagada, valor_contrato_mo ×
porcentaje_costo / 100)`. SECURITY INVOKER para respetar RLS. Vista
  (no columna stored) porque el cálculo cambia si valor_contrato_mo
  o % se editan después; los rows históricos de Coda con
  mano_obra_pagada poblada se respetan vía COALESCE.

**Decisiones tácticas adicionales:**

- **MO derivado, no almacenado.** ADR-032 D3 ya lo declaraba como
  intención; el refactor lo materializa. La vista SQL es la fuente
  canónica para KPIs (MO total ejecutado por contratista, MO por
  obra). Si en algún momento Beto pide overrides puntuales por tarea,
  agregamos input opcional al form de tareas y el COALESCE ya está
  preparado.
- **División entre 100 en la vista** porque el seed actual de
  `plantilla_tareas.porcentaje_costo` viene en %-puntos (2.5, no
  0.025). Si el seed cambia a fracción, ajustar la vista.
- **Multi-row con dedup local.** Cada fila excluye las unidades ya
  elegidas en otras filas del mismo submit — evita duplicar lote
  dentro de un solo contrato (la UNIQUE en DB lo bloquearía igual,
  pero el filtro UI da feedback instantáneo).
- **Best-effort secuencial vs all-or-nothing.** Supabase REST no
  expone transacciones limpias desde browser. Opté por secuencial:
  cabecera primero (si falla, abortamos) y luego loop por lote
  reportando éxitos/fallas. Idempotencia depende de
  UNIQUE(construccion.unidad_id) — si el operador refresca y reintenta,
  los exitosos no se duplican. Alternativa "RPC con plpgsql" es
  más limpia pero requiere migración extra; lo dejé para Sprint 5
  si emerge necesidad.
- **Reset de lotes al cambiar proyecto.** Cuando el operador cambia
  el proyecto en la cabecera, las unidades/prototipos de las filas
  ya no aplican. Limpio ambos campos pero preservo la fila + fecha
  (UX: no se siente como reset hard).
- **El sub-slug deprecado queda en DB.** Idealmente borraría
  `dilesa.construccion.arrancar` de `core.modulos` + sus permisos
  asociados con una migración DELETE, pero `supabase db push` está
  bloqueado por classifier y agregar otra migración solo para limpieza
  es overkill. El código ya no lo referencia. Cleanup formal queda
  como nota — si Beto quiere correrlo después en sesión interactiva,
  basta con `DELETE FROM core.modulos WHERE slug =
'dilesa.construccion.arrancar'` (el `ON DELETE CASCADE` en
  permisos_rol/permisos_usuario_excepcion lo limpia transitivamente).

**Pendiente verificar Beto:**

- Aplicar la migración nueva `20260525143208_...v_tareas_con_mo.sql`
  a prod (`supabase db push`).
- Validar visualmente en preview el flujo:
  1. `/dilesa/construccion` → botón "Nuevo contrato + arranques"
     visible para roles con write sobre `dilesa.construccion.contratos`.
  2. Form combinado: contratista RMA + proyecto Maya + precio 3500 +
     elegir 2-3 lotes con distintos prototipos → ver subtotales →
     submit → verificar que contrato + N construcciones + N
     contrato_lotes existen + unidades pasaron a 'planeada'.
  3. Detalle de obra recién creada → "Registrar tareas" → ver header
     con MO contrato + tareas con MO derivado read-only → marcar 1
     tarea → verificar que `construccion_tareas_terminadas` quedó con
     `mano_obra_pagada = NULL` y la vista
     `v_construccion_tareas_terminadas_con_mo.mo_calculado` da el
     número esperado.
- Cleanup opcional: borrar slug deprecado `dilesa.construccion.arrancar`
  de `core.modulos` si quiere mantener DB limpia.

### 2026-05-30 — Sprint 5 (integración con ventas + cierre)

**PR:** [#593](https://github.com/beto-sudo/BSOP/pull/593)

**Cambios:**

- Sección "Obras de construcción" en `components/dilesa/proyecto-detalle.tsx`:
  tabla compacta con barra de avance coloreada (rojo <20%, ámbar 20-66%,
  verde ≥66%), contratista, estado, MO ejecutado, fecha de arranque.
  Click en fila navega a `/dilesa/construccion/[id]`.
- Datos: `dilesa.construccion` con embed `!inner` a `unidades` filtrado
  por `proyecto_id` + lookup de contratistas en `erp.personas`.
- Sección solo se muestra si el proyecto tiene obras (proyectos sin
  construcción, como anteproyectos, no la ven).

**Verificación de items del Sprint 5 (planning):**

| Item                                  | Estado                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Trigger "20% → disponible" end-to-end | ✅ Activo desde migración `20260525202809`                               |
| Form de ventas muestra prototipo      | ✅ `ventas/nueva` filtra `en_construccion`+`terminada` con `producto_id` |
| Vista global de avance por proyecto   | ✅ PR #593                                                               |
| Reabrir Sprint 7c de ventas           | ✅ Sprint 7c-2 (KYC/FICU) mergeado en PR #554                            |

**Cierre de iniciativa:** todos los 5 sprints planificados completados.
Fuera de alcance v1 documentado en planning (Gantt, comisiones, adjuntos
por tarea, integración CapEx, notificaciones, app móvil).

### 2026-06-01 — Sprint 6 (PDF del contrato de obra) — reapertura

**Contexto:** Beto reportó que el contrato de construcción no tenía dónde
imprimirse/generarse. Diagnóstico: el módulo solo tenía captura (form
"nuevo") + detalle de lectura; nunca existió generación de documento (lo
que Beto recordaba haber probado era la Promesa de Compraventa del flujo
de Ventas, que sí genera PDF). Decisión de Beto: implementar el PDF formal
con clausulado. Fuente del clausulado: doc vivo en Coda `canvas-KMlO5KM81i`
("Contrato de Construcción", último generado, folio 2026/2-DIE-ANA-CONTRATO#273).

**Cambios:**

- `lib/dilesa/contrato/constantes-obra.ts` — datos fijos de DILESA para el
  contrato de obra (representante, escrituras, domicilio, almacén, email
  compras, % retención, pena convencional, jurisdicción, 2 testigos).
- `lib/dilesa/pdf/contrato-obra.tsx` — componente React-PDF que replica el
  documento: encabezado, declaraciones I/II/III, 18 cláusulas, tabla de
  lotes (cláusula PRIMERA) con total, firmas (cliente + contratista + 2
  testigos) y ANEXO 3 (precios unitarios por actividad y prototipo).
  Reusa `header-footer.tsx` + `styles.ts` del flujo de Ventas.
- `app/api/dilesa/construccion/contratos/[id]/pdf/route.tsx` — route handler
  (`renderToBuffer`, attachment, `runtime=nodejs`). Lookups cross-schema en
  memoria (patrón ventas). Deriva el Anexo 3 por % de costo (ver Decisiones).
- `app/dilesa/construccion/contratos/[id]/page.tsx` — botón "Descargar
  contrato (PDF)" en el header del detalle.

**Sin migración, sin cambios de RBAC** — reusa el sub-slug existente
`dilesa.construccion.contratos`.

**Verificación:** typecheck + lint + format:check + 1,134 tests verdes.
Smoke test de render (data sintética, 8 páginas) OK. Pendiente: validación
de Beto en preview Vercel — especialmente el Anexo 3 derivado y los datos
de DILESA del encabezado.

**Alcance no incluido (posible Sprint 7):** Anexo 1 (checklist de recepción)
y Anexo 2 (materiales entregados); persistir el PDF generado como adjunto;
captura de testigos/superintendente por contrato.

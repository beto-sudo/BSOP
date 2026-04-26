# Iniciativa — Module States (empty / loading / error)

**Slug:** `module-states`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26

## Problema

Cada migración a `<ModulePage>` (ADR-004) decide ad-hoc qué mostrar mientras
carga, cuando no hay datos, o cuando el fetch revienta. ADR-004 R10 fija
que los banners viven entre `<ModuleFilters>` y `<ModuleContent>`, pero no
hay componente compartido ni copy estándar — cada módulo inventa el suyo.

Síntomas observados:

- Inventario y Ventas usan distinto skeleton (algunas filas vs spinner
  centrado vs nada y "salto" cuando llegan datos).
- El estado vacío con filtros aplicados a veces no distingue de "nunca
  hubo datos" — el usuario no sabe si limpiar filtros o crear una entidad.
- Errores de fetch caen en `console.error` o en un toast efímero; no hay
  banner persistente con retry.
- Cada PR de migración a `<ModulePage>` repite la misma decisión —
  superficie de inconsistencia que crece con cada módulo nuevo.

A 20 módulos en el horizonte, el costo de no tener pattern es ~20×
decisiones repetidas + drift visual + copy disperso.

## Outcome esperado

- Tres componentes compartidos en `components/module-page/`:
  `<EmptyState>`, `<TableSkeleton>`, `<ErrorBanner>`.
- Copy estándar (es-MX) documentado y reusable, parametrizado por
  entidad ("ventas", "movimientos", "terrenos", etc.).
- Tiempo de migración a `<ModulePage>` baja: la página nueva ya no
  inventa empty/loading/error, los importa.
- Auditoría visual de los 3 estados se vuelve binaria: ¿usa el
  componente compartido? sí/no.

## Alcance v1

### Componentes

- [ ] `<EmptyState>` — props: `icon` (lucide), `title`, `description`,
      `action` (CTA opcional como ReactNode). Renderiza centrado,
      padding consistente con `<ModuleContent>`.
- [ ] `<TableSkeleton>` — props: `rows` (default 5), `columns` (number
      o array de widths para reflejar el shape real de la tabla).
      Animación shimmer suave, mismo border-radius que la tabla real.
- [ ] `<ErrorBanner>` — props: `error` (Error | string), `onRetry`
      (función opcional), `dismissible` (bool, default false).
      Color/borde rojo coherente con el sistema. Si hay `onRetry`,
      muestra botón "Reintentar".

### Variantes documentadas

- [ ] **Vacío sin filtros (módulo virgen)** — copy: "Aún no hay
      [entidad]." + CTA opcional para crear (mismo botón que el
      `action` del header del módulo).
- [ ] **Vacío con filtros activos** — copy: "Ningún resultado coincide
      con los filtros." + CTA "Limpiar filtros" que dispara el
      `clear-all` del filter bar.
- [ ] **Cargando primera vez** — `<TableSkeleton>` con shape coherente
      con la tabla esperada (no spinner centrado).
- [ ] **Recargando con datos previos** — mantener tabla vieja, mostrar
      indicador discreto en KPI strip o filter bar (opacity / spinner
      pequeño). No reemplazar tabla por skeleton.
- [ ] **Error de fetch** — `<ErrorBanner>` con mensaje legible (no
      stack trace), botón "Reintentar" si la operación es idempotente.
- [ ] **Error parcial** (algunos KPIs OK, fetch secundario falló) — el
      banner aparece entre filters y content, los KPIs cargados se
      mantienen.

### Migración

- [ ] Migrar Ventas (`/<empresa>/ventas`) — baseline limpio, sirve de
      golden path.
- [ ] Migrar Inventario (`/rdb/inventario`) — primer módulo con
      `<ModulePage>` real, tiene los 3 estados en uso.
- [ ] Documentar en `docs/adr/006_module_states.md` la decisión y los
      3 componentes (subordinado a ADR-004 R10).
- [ ] Actualizar `docs/qa/ui-rubric.md` Section 1 y 2 con checks que
      apunten a los componentes nuevos.

### A11y mínimo (sin bloquear v1)

- [ ] `<TableSkeleton>` con `role="status"` y `aria-label="Cargando [entidad]"`.
- [ ] `<ErrorBanner>` con `role="alert"` y `aria-live="polite"`.
- [ ] `<EmptyState>` con heading semántico (`<h2>` o `<h3>`).

## Fuera de alcance

- Toasts / snackbar globales para feedback de mutaciones (eso vive en
  `action-feedback`, iniciativa #3).
- Skeletons para drawers / sheets / forms (postergar; v1 cubre módulos
  tabulares solo).
- Animaciones / transiciones sofisticadas entre estados.
- Internacionalización del copy — todo el ERP es es-MX, no hay i18n
  pendiente.
- Estados de loading de acciones individuales (botón "Guardando...");
  eso vive cerca del componente de acción, no acá.

## Métricas de éxito

- 100% de páginas migradas a `<ModulePage>` usan los 3 componentes
  compartidos al cierre de Fase 2 de `module-page`.
- Cero copy de empty/loading/error nuevo escrito ad-hoc en migraciones
  posteriores (verificable en code review con check binario).
- Reducción medible de líneas JSX: registrar antes/después en el PR de
  Inventario (target: -30 líneas por página migrada).
- Auditoría manual con la rúbrica reporta los 3 estados ✅ en cada
  módulo migrado.

## Riesgos / preguntas abiertas

- [ ] **Coordinación con `module-page` (Fase 2 in_progress).** Esta
      iniciativa puede arrancar en paralelo: los componentes se crean
      y se aplican a Ventas como primer migrado de Fase 2. No bloquea.
- [ ] **Páginas no-tabulares** (dashboards, formularios largos) —
      `<EmptyState>` y `<ErrorBanner>` son reusables, `<TableSkeleton>`
      no aplica. Documentar que los 3 son opt-in para no-tabulares.
- [ ] **Diseño visual del shimmer** — ¿gradiente animado o pulse
      simple? Decisión chica que vale screenshot review.
- [ ] **¿`<EmptyState>` con ilustración o solo icono lucide?** v1 con
      icono lucide para no traer assets nuevos. Ilustraciones se
      pueden agregar después por módulo si justifican.
- [ ] **Copy del CTA en empty con filtros** — ¿"Limpiar filtros" o
      "Quitar filtros" o "Mostrar todo"? Ver consistencia con el
      filter bar actual de Ventas.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_

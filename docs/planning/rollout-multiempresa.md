# Iniciativa — Rollout multi-empresa (des-DILESAizar lo golden antes de COAGAN/ANSA)

**Slug:** `rollout-multiempresa`
**Empresas:** todas (cross-empresa por diseño; foco en habilitar COAGAN, ANSA y Nigropetense)
**Schemas afectados:** principalmente UI (`components/compras`, `components/cxc`, `components/tesoreria`, shells por empresa); `erp` (`presupuesto_partidas` centro de costos, RPC `oc_crear`); `core.empresas` (branding/config como fuente única)
**Estado:** proposed
**Próximo hito:** Beto aprueba alcance v1 → arrancar Sprint 1 (runbook "alta de empresa operativa" + reducir los ~9 touchpoints derivándolos de `core.empresas`)
**Dueño:** Beto
**Creada:** 2026-06-12
**Última actualización:** 2026-06-12 (promovida desde la revisión general 2026-06-12 — ver [reporte](../strategy/REVISION-GENERAL-BSOP-2026-06-12.md))

## Problema

El mecanismo de estandarización del repo (ADR-011 módulos compartidos, checklist RBAC testeado, golden→rollout en INITIATIVES.md) **existe y funciona** — CxP lo prueba: 5 tabs compartidos RDB+DILESA con pages de ~20 líneas. Pero la revisión general confirmó que **los módulos golden más nuevos se construyeron amarrados a DILESA**, y la deuda vence ahora que viene el rollout a COAGAN/ANSA:

- **P2P en dos generaciones, ninguna replicable.** RDB gen-1 = fat pages de 1,439/1,778/1,119 líneas (pre-ADR-011). DILESA gen-2 = módulos en `components/compras/*` pero con 27 referencias `'dilesa'` hardcodeadas (slug de permiso, `.schema('dilesa')`, rutas, `<HiloGastoStepper empresa="dilesa">`). Copiar cualquiera a COAGAN/ANSA produce el tercer fork.
- **CxC nació dilesa-namespaced** pese a ser iniciativa "todas": el aging está copiado de CxP casi línea por línea (~135 verbatim) y toda la UI vive en `app/dilesa/cobranza/` + `components/dilesa/`. Tesorería (saldos-bancos, estados de cuenta) igual: módulos `erp`-genéricos archivados bajo `components/dilesa/`.
- **Centro de costos acoplado a `dilesa.proyectos`** a nivel DB: `erp.presupuesto_partidas.proyecto_id` es FK cross-schema a `dilesa.proyectos`; los selectores de UI asumen proyectos DILESA. COAGAN (ranchos/huertas) y ANSA (departamentos del DMS) no encajan.
- **Crear OC implementado 4 veces** (3 client-side, doble INSERT sin transacción, folios `OC-${Date.now()}` divergentes en 9 sitios).
- **Alta de empresa = ~9 touchpoints de código sin runbook**: `NAV_ITEMS`, `NAV_TO_EMPRESA`, `LOGO_BY_KEY`, `empresa-constants` (UUID + slug), union `EmpresaSlug`, `ROUTE_TO_MODULE`, `EXPECTED_DB_MODULE_SLUGS`, migración `core.modulos` + backfill de permisos, assets. La capa DB del alta ya está pulida; lo que falta documentar es "que la empresa opere módulos".
- **Branding triple-source con fallback a DILESA**: `core.empresas` tiene el branding completo capturable por UI, pero conviven dos mapas estáticos (`BRANDING_BY_SLUG`, `LOGO_BY_KEY`) limitados a `dilesa|rdb`. **Las minutas de junta de cualquier empresa caen a `consejo@dilesa.mx`** por fallback hardcodeado (viola SM6).

## Outcome esperado

- **Una empresa nueva opera un módulo compartido con un shell de ~20 líneas**, sin tocar el código del módulo — el patrón CxP generalizado a P2P, CxC y tesorería.
- **Runbook "alta de empresa operativa"**: lista ordenada de touchpoints (idealmente reducidos a 2-3 derivando de `core.empresas`).
- **Centro de costos resuelto** como decisión arquitectónica explícita (ADR), no por accidente de la primera OC de COAGAN.
- **Branding y buzones de consejo desde `core.empresas`** con fallback neutro BSOP que bloquea si falta config (SM6), nunca el de otra empresa.
- **COAGAN/ANSA con CxP + módulos compartidos operando** sobre shells baratos.

## Alcance v1 (sprints propuestos — pendientes de aprobación)

- [ ] **Sprint 1 — Runbook de alta + reducción de touchpoints.** Documento `docs/runbooks/alta-empresa-operativa.md` (lista ordenada + plantillas). Derivar `EMPRESA_ID_TO_SLUG`, branding y logos de `core.empresas` (que ya tiene `slug`, `isotipo_url`, `color_*`) en vez de las 3 unions estáticas paralelas.
- [ ] **Sprint 2 — Des-DILESAizar `components/compras/*`.** Slug RBAC derivado de prop (`${empresa}.compras.ordenes`), rutas template, binding proyecto/partida como capacidad opcional (patrón `usaPartidas` de CxP), `empresa` al `HiloGastoStepper`. COAGAN/ANSA entran con shells de ~25 líneas.
- [ ] **Sprint 3 — ADR centro de costos.** Decidir: (a) partidas planas sin proyecto para COAGAN/ANSA v1 (`proyecto_id` ya es nullable — solo abstraer el selector), o (b) generalizar a un catálogo de centros de costo en `erp`. Aterrizar antes de la primera OC de COAGAN.
- [ ] **Sprint 4 — Extraer `components/cxc/`.** Espejo de `components/cxp`: mover `abono-capture-drawer` + aging + estado de cuenta + recibo, parametrizados por `empresaId`/`empresa`. Originación (plan de pagos de venta) como adaptador por vertical, pensando en ANSA/Business Pro desde el día 1.
- [ ] **Sprint 5 — Branding + buzones desde `core.empresas`.** Consolidar `BRANDING_BY_SLUG`/`LOGO_BY_KEY` a la DB; `CONSEJO_EMAIL_BY_EMPRESA` a config por empresa (o `core.notification_definitions`); fallback que bloquea con CTA a Settings (SM6). Mover `saldos-bancos`/tesorería de `components/dilesa/` a `components/tesoreria/`.
- [ ] **Sprint 6 — RPC `oc_crear` transaccional.** `erp.oc_crear(p_empresa_id, p_requisicion_id, p_cotizacion_id, p_lineas jsonb, p_usuario_id)` con folio en DB (secuencia por empresa), guard de OC duplicada y audit trail. Unifica los 4 call sites + test del guard.
- [ ] **Sprint 7 — Higiene de estandarización.** Barrido de UUIDs literales → `empresa-constants` (22 archivos); pack de reglas ESLint (`no-restricted-syntax` para UUIDs de `core.empresas`, `Intl.NumberFormat` fuera de `lib/format`, `no-restricted-globals` para alert/confirm/prompt); 44 formatters locales → `lib/format`.
- [ ] **Sprint 8 — Secuencia de bootstrap por empresa.** Consolidar pre-requisitos hoy regados en 3 docs: `erp.empleados_puestos` para COAGAN/ANSA (gate de aprobación de pagos), 0 almacenes/OCs, manual por empresa. Para ANSA: decidir primero el contrato con Business Pro (qué captura BSOP vs qué sincroniza).

## Riesgos

- **Refactor de compras en producción** (DILESA lo usa diario). Mitigación: paridad funcional + los tests de `lib/compras/*` que ya existen; convergencia de RDB gen-1 como fase 2 opcional (su variante con inventario justifica la divergencia hoy).
- **Decisión de centro de costos prematura o tardía.** Mitigación: ADR explícito en S3 antes de cualquier captura COAGAN/ANSA.
- **Business Pro (ANSA) es fuente externa** que ningún planning doc modela aún. Mitigación: S8 lo trata como decisión propia antes de construir UI de ANSA.

## Métricas de éxito

- Alta de empresa operativa = N pasos documentados (objetivo: ≤3 touchpoints de código).
- `components/compras/*` y `components/cxc/*` sin literal `'dilesa'`.
- COAGAN con CxP operando sobre shells compartidos; cero fork nuevo.
- Cero minutas/branding que caigan al fallback de otra empresa.

## Decisiones registradas

- _(pendiente — se registran al ejecutar; el ADR de centro de costos es la primera)_

## Bitácora

- **2026-06-12** — Promovida desde la revisión general 2026-06-12 (dimensiones duplicacion-reuso + estandarizacion). Recoge el TOP de extracciones con mejor ROI pensando en que CxC/CxP/P2P se van a rollout a COAGAN/ANSA.

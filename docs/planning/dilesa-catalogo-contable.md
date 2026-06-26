# Iniciativa — Catálogo de cuentas contables (DILESA)

**Slug:** `dilesa-catalogo-contable`
**Empresas:** DILESA (golden; el schema es multi-empresa y queda listo para replicar a ANSA/COAGAN/RDB/Nigropetense cuando tengan su export CONTPAQi)
**Schemas afectados:** `erp` (tabla nueva `cuentas_contables`, jerárquica self-FK, RLS empresa-scoped set-membership; Sprint 2 agrega columna `cuenta_contable_id` a `erp.facturas` y `erp.gastos`). `core` (RBAC: módulo nuevo `dilesa.contabilidad` + sub-slug del catálogo, ADR-014/030). Loader Python desde el export CONTPAQi en `scripts/import-contpaqi/`. **Línea roja:** v1 NO toca partida doble / pólizas / balanza — solo el catálogo y la clasificación contable de egresos que ya pasan por CxP.
**Estado:** in_progress
**Próximo hito:** Sprint 3 — ligar el selector de cuenta en la captura de factura (CxP) + auto-sugerencia (categoría/partida → cuenta) + vista de egresos sin clasificar. Sprints 1 (catálogo en prod, #1046) y 2 (módulo Contabilidad + catálogo navegable + columna `cuenta_contable_id`) ya aplicados a prod.
**Dueño:** Beto
**Creada:** 2026-06-25
**Última actualización:** 2026-06-26 (Sprint 2 — módulo Contabilidad en el sidebar + catálogo navegable + `cuenta_contable_id` en facturas/gastos, aplicado a prod)

> Detonante: los gastos de DILESA ya se registran y pagan por CxP en BSOP, pero
> sin ninguna clasificación contable — `erp.facturas` y `erp.gastos` no tienen a
> qué cuenta del catálogo pertenecen. Beto quiere (a) tener el catálogo de
> cuentas de CONTPAQi cargado en BSOP como estructura y referencia, (b) empezar a
> ligar los egresos a su cuenta, y (c) que esto sea la base/planeación para, a
> futuro, ir migrando la contabilidad de CONTPAQi a BSOP módulo por módulo.

## Problema

La contabilidad vive en CONTPAQi, desconectada de la operación que ya está en
BSOP. En concreto:

- **Sin clasificación contable de lo que ya pagamos.** Cada CFDI/gasto que entra
  por CxP no sabe a qué cuenta contable corresponde. `erp.gastos.categoria_id`
  es un uuid huérfano (no hay tabla detrás).
- **Sin catálogo en BSOP.** No existe la estructura de cuentas (mayores,
  subcuentas, naturaleza, jerarquía) como dato consultable.
- **Sin puente hacia el futuro.** Cuando se quiera reemplazar CONTPAQi (meta
  lejana), no hay dónde anclar el mapeo de cuentas ni el código agrupador SAT.

## Decisiones de diseño (conversación de promoción, 2026-06-25)

Beto cerró el alcance v1 sobre tres ejes:

1. **Entregable v1 = catálogo + ligar CxP.** Cargar el catálogo y poder
   clasificar contablemente los egresos que ya se pagan. NO se diseña partida
   doble / pólizas / balanza todavía (eso es la meta "reemplazar CONTPAQi", con
   su propia iniciativa).
2. **Rumbo = espejo de control, reemplazo como meta.** BSOP clasifica y da
   visibilidad; CONTPAQi sigue siendo el libro fiscal por ahora; se migra módulo
   por módulo. El diseño lleva el rigor para crecer hacia allá (naturaleza,
   código agrupador SAT, `afectable`) sin morder contabilidad electrónica ahora.
3. **Solo DILESA de entrada.** El Excel es de DILESA; el schema es multi-empresa
   pero se carga una y se valida el patrón antes de replicar.

Micro-decisiones tácticas (CC, con criterio):

- **Cargar el catálogo completo (1,331 cuentas)** tal cual de CONTPAQi —
  fidelidad y reversibilidad. El selector de CxP filtra a `afectable` y prioriza
  las usadas; el árbol completo queda para consulta.
- **Número natural de CONTPAQi como clave** (`601-01-000`, máscara 3-2-3) por
  empresa, con el **código agrupador SAT** en columna aparte (`601.01`) — así el
  día que se reemplace CONTPAQi el mapeo ya existe. Se conserva el código crudo
  de 8 dígitos (`60101000`) para trazar al origen.
- **El catálogo lo edita Contabilidad/Dirección**; lectura para quien capture
  CxP (para poder clasificar).
- **`erp.sat_agrupador` (tabla de referencia del Anexo 24) se difiere.** En v1 el
  agrupador vive como columna `text` en `cuentas_contables`; la tabla de
  referencia nacional se crea cuando haga falta (contabilidad electrónica /
  balanza al SAT), no antes.

## Outcome esperado

El catálogo de cuentas de DILESA cargado y navegable en BSOP, y cada
factura/gasto de CxP **clasificable a una cuenta contable** desde la captura. La
estructura queda diseñada para crecer hacia contabilidad completa sin retrabajo.

## Modelo de datos (v1)

Schema `erp`, RLS empresa-scoped con set-membership (no `fn_has_empresa` por
fila, que da timeout — ver memoria `reference_rls_fn_has_empresa_per_row`).

- **`erp.cuentas_contables`** — una fila por cuenta del catálogo, por empresa.
  - `id`, `empresa_id` FK
  - `numero` (segmentado `601-01-000`, clave natural por empresa), `codigo_contpaqi` (crudo `60101000`)
  - `nombre`
  - `naturaleza` (`deudora`|`acreedora`), `tipo` (`activo`/`pasivo`/`capital`/`ingreso`/`costo`/`gasto`/`resultado`/`orden`)
  - `nivel` (int), `cuenta_padre_id` (self-FK, jerarquía)
  - `codigo_agrupador_sat` (`601.01`, nullable), `afectable` (bool: solo hojas se registran)
  - `activa`, `origen` (`contpaqi`), `notas`, timestamps, `deleted_at`
  - UNIQUE (`empresa_id`, `numero`)

Decode desde el export CONTPAQi: `naturaleza` de la columna de tipo
(A/B→activo·deudora/contra, D→pasivo·acreedora, F→capital·acreedora, G→deudora,
H→acreedora, L/K→orden); `tipo` del primer dígito del mayor (1 Activo … 8 Orden).

## Sprints

- **Sprint 1 — Catálogo (schema + carga).** Migración `erp.cuentas_contables`
  (tabla + índices + trigger updated_at + RLS + grants). Loader Python que lee el
  export CONTPAQi, **limpia el encoding legacy** (acentos en PUA: `días`→`d僘s`) y
  los **~80 desbordes de columna**, valida checksum (1,331 cuentas; la jerarquía
  cierra; naturaleza/tipo consistentes) y emite el SQL de carga idempotente
  (`ON CONFLICT (empresa_id, numero)`, JOIN a `core.empresas` para ser
  Preview-safe). Aplicar a prod con OK → regenerar `SCHEMA_REF.md` + types.
- **Sprint 2 — Ligar CxP/gastos.** `cuenta_contable_id` (nullable FK) en
  `erp.facturas` y `erp.gastos` + selector de cuenta (árbol, solo afectables,
  buscador) en la captura/edición + RBAC del módulo Contabilidad → Catálogo
  (ADR-014/030, backfill defensivo de permisos).
- **Sprint 3 — Consulta + (opcional) auto-mapeo.** Página del catálogo (árbol
  navegable + filtros por tipo/naturaleza). Opcional: mapeo
  `categoría/partida → cuenta` para auto-sugerir en CxP.

## Riesgos

- **Calidad del export.** Encoding legacy roto + ~80 filas con texto desbordado
  entre columnas. Mitigación: el loader transcodifica y extrae por regex; valida
  por checksum y que la jerarquía cierre antes de emitir SQL.
- **Aplicar a prod.** La migración de schema y la carga van a prod **solo con OK
  verbal de Beto** (política de migraciones). No regenerar `SCHEMA_REF.md` hasta
  aplicar (schema:check compara contra prod — ver `reference_ci_schema_check_prod`).
- **Scope creep a partida doble.** Línea roja explícita: v1 no la toca.
- **Catálogo genérico vs operativo.** Las 1,331 traen muchas cuentas que DILESA
  no usa; se cargan todas pero el selector de CxP prioriza las afectables/usadas.

## Métricas de éxito

- Catálogo de DILESA cargado 1:1 (1,331 cuentas, jerarquía íntegra, 0 huérfanos).
- ≥1 factura/gasto de CxP clasificada a su cuenta desde la UI (Sprint 2).
- 0 regresiones en CxP/otras empresas (cambio aditivo).

## Bitácora

- **2026-06-25** — Promoción de la iniciativa. Análisis del export CONTPAQi
  (`cuentas COMPLETO.xlsx`): 1,331 cuentas, 1,069 afectables, niveles 0-3, 8
  grupos mayores SAT. Arranca Sprint 1 (schema + loader).
- **2026-06-25** — Sprint 1 aplicado a prod y mergeado ([#1046](https://github.com/beto-sudo/BSOP/pull/1046)):
  `erp.cuentas_contables` + 1,331 cuentas cargadas (jerarquía 0 huérfanos,
  encoding CONTPAQi reconstruido). Aplicado con `psql -f` + `migration repair`
  (sin drift) en medio de la sesión paralela #1043, sin pisarse.
- **2026-06-26** — Sprint 2 (modo autónomo, aplicado a prod vía MCP por `op read`
  colgado headless): (1) módulo **Contabilidad** en el sidebar de DILESA
  (`dilesa.contabilidad`, sección Tesorería) + permisos clonados de `dilesa.cxp`
  (8 roles); (2) página `/dilesa/contabilidad` con el catálogo navegable
  (tabla indentada por nivel, filtros tipo/naturaleza, buscador, KPIs);
  (3) columna `cuenta_contable_id` (nullable, FK) en `erp.facturas` y
  `erp.gastos` — el enganche para clasificar; su UI de captura va en Sprint 3.

## Decisiones registradas

- **2026-06-25** — v1 NO incluye partida doble/pólizas/balanza (línea roja). El
  catálogo se diseña para crecer hacia allá (naturaleza + agrupador SAT +
  `afectable`), pero el reemplazo de CONTPAQi es meta lejana con iniciativa
  propia. Razón: entregar valor (clasificar CxP) sin asumir el costo/riesgo de la
  contabilidad fiscal completa.
- **2026-06-25** — `erp.sat_agrupador` (tabla de referencia Anexo 24) diferida;
  el agrupador vive como columna `text` hasta que se necesite contabilidad
  electrónica. Razón: evitar over-engineering en Sprint 1.

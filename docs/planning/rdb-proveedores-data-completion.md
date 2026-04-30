# Iniciativa — Proveedores RDB · Complemento de información (data completion)

**Slug:** `rdb-proveedores-data-completion`
**Empresas:** RDB (V1) — patrón replicable a DILESA/COAGAN/ANSA cuando tengan masa crítica
**Schemas afectados:** `erp` (3 tablas satélite nuevas: `personas_contactos`, `personas_cuentas_bancarias`, `personas_direcciones`)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-04-30
**Última actualización:** 2026-04-30

## Problema

El catálogo de proveedores activos de RDB se acaba de depurar (12 quedan activos, 18 inactivados) usando el archivo `PROVEEDORES RDB.csv` como fuente de verdad — pero el CSV trae **información que el schema actual no puede capturar**:

- **Cuentas bancarias del proveedor** (Banco / NumCuenta / CLABE): no existe tabla. `erp.cuentas_bancarias` es para cuentas **propias** de la empresa (tiene `saldo_actual`, no sirve para guardar la cuenta donde le pagamos a un proveedor).
- **Contacto principal** (nombre de la persona con la que se trata): no hay columna directa en `erp.personas`. Las columnas `contacto_emergencia_*` tienen otra semántica (RH, no comercial).
- **Cuentas contables** (Cuenta / SubCuenta / SSubCuenta / SSSubCuenta del CSV — claves estilo COI/CONTPAQ): no hay módulo de contabilidad en BSOP todavía.
- **Razón social separada**: existe `erp.personas_datos_fiscales` pero los 30 proveedores legacy de RDB no tienen fila ahí — todos heredados de Coda con captura libre.
- **Domicilio estructurado**: el CSV trae calle/colonia/ciudad/CP por separado, pero `erp.personas.domicilio` es un solo `text` libre. La iniciativa `proveedores-csf-ai` (done) ya creó el patrón de domicilio fiscal estructurado para altas nuevas via CSF — los legacy quedan en texto libre hasta que pasen por ese flujo.

Adicional: la depuración inicial dejó **3 datos del CSV no aplicados** por inconsistencias (RFCs erróneos del CSV: #3 Distribuidora Moctezuma, #4 Abastecedora Industrial — venía CURP en columna RFC, #9 Franziella — RFC repetido de DILESA), 1 nombre con typo corregido (#9 "Franzilela" → "Franziella"), 1 duplicado por consolidar (#4 hay dos registros con el mismo dueño), y 1 caso ambiguo de proveedor-vs-persona (#11 "Hielo ARSA" como nombre comercial de Arnulfo Sandoval, persona física).

## Outcome esperado

- Cada uno de los 12 proveedores activos de RDB tiene **datos fiscales completos y estructurados** (vía CSF AI cuando aplique, captura manual cuando el proveedor no entregue CSF).
- Cuentas bancarias del proveedor capturables en BSOP, con histórico (un proveedor puede tener N cuentas; una vigente como default para CxP).
- Contacto principal del proveedor capturable y editable.
- Patrón replicable a DILESA, COAGAN y ANSA cuando se requiera.
- Datos contables (Cuenta/SubCuenta) **diferidos** explícitamente a la futura iniciativa de contabilidad (no se persisten ahora, el CSV original queda como referencia).

## Alcance v1 (cerrado 2026-04-30)

Decisiones de schema en [ADR-028](../adr/028_personas_satellites.md) (reglas PS1-PS6): 3 tablas satélite ligadas a `erp.personas` (no a `erp.proveedores`) para reusabilidad cross-rol.

### Sprint 1 — Schema (DB)

- [x] Migración [`supabase/migrations/20260430160000_personas_satellites_contactos_cuentas_direcciones.sql`](../../supabase/migrations/20260430160000_personas_satellites_contactos_cuentas_direcciones.sql) generada con las 3 tablas:
  - `erp.personas_contactos` (multi-contacto, `principal` flag, partial unique)
  - `erp.personas_cuentas_bancarias` (FK opcional a `core.bancos`, `vigente` flag, check CLABE 18 dígitos, check al menos uno de `numero_cuenta`/`clabe`)
  - `erp.personas_direcciones` (tipo: operativo/entrega/cobro/oficina, `principal` flag, fiscal queda en `personas_datos_fiscales`)
  - RLS replicando patrón de `erp.personas_datos_fiscales` (SELECT/INSERT/UPDATE: `fn_has_empresa OR fn_is_admin`; DELETE: solo admin)
  - Triggers `core.fn_set_updated_at` en las 3
  - `NOTIFY pgrst, 'reload schema'`
- [x] ADR-028 creado.
- [ ] **Aplicar migración** (Beto, vía psql) + regenerar `supabase/SCHEMA_REF.md` y `types/supabase.ts`.

### Sprint 2 — UI captura (Proveedores RDB)

- [ ] Drawer de proveedor (`app/rdb/proveedores/...`) extendido con 3 secciones nuevas:
  - **Contactos** — lista + alta/edición + checkbox "principal" (queda solo uno)
  - **Cuentas bancarias** — lista + alta/edición + select `banco_id` con catálogo `core.bancos` + fallback `banco_nombre` libre + flag "vigente"
  - **Direcciones** — lista + alta/edición + select tipo + flag "principal"
- [ ] Server actions + helpers en `lib/proveedores/`.
- [ ] Tests de RLS y de invariantes (un solo principal/vigente por persona).
- [ ] Smoke en preview con un proveedor real antes de merge.

### Sprint 3 — Carga inicial de los 12 RDB (operativo, lo hace Beto + ops)

- [ ] Subir CSF (PDF) para los proveedores que la tengan → flujo `proveedores-csf-ai` (done) llena razón social, régimen, domicilio fiscal automáticamente.
- [ ] Captura manual desde el CSV original `PROVEEDORES RDB.csv`:
  - Cuentas bancarias para los 4 proveedores que las traen (Dinorah, Abastecedora Industrial, Mercado de Dulces, Smarty Chips/Aranda).
  - Contacto principal para los que tienen "Contacto" en CSV (Dinorah, Karen Aguilar, Carlos/Fernando, Franziella, Arnulfo, Israel/Marcela).
  - Direcciones operativas (calle/colonia/ciudad/CP) para los 12.
- [ ] Saneamiento de datos legacy:
  - Capturar RFC real de Distribuidora Moctezuma (CSV trae el de DILESA).
  - Capturar RFC real de Abastecedora Industrial (CSV trae CURP en columna RFC).
  - Confirmar identidad fiscal de Franziella Santos (CSV trae RFC de DILESA; `core.empresas` registra `SASF790624LUA`).
  - Confirmar materno de Arnulfo Sandoval ("Morales" o queda sin captura).
- [ ] Resolver duplicado #4 Jorge Amin / Abastecedora Industrial: decidir si se consolidan (delete del inactivo) o se mantienen separados como sociedad/persona.

### Sprint 4 — Closeout

- [ ] Replicar el patrón a DILESA si Beto autoriza (mismas tablas ya soportan multi-empresa por `empresa_id`; solo se necesita extender la UI a `app/dilesa/proveedores/...`).
- [ ] Cierre de iniciativa + bitácora final + outcome real vs métricas.

## Fuera de alcance

- **Módulo de contabilidad** (Cuenta/SubCuenta/SSubCuenta del CSV original) — esto requiere una iniciativa propia (`contabilidad-bsop` o similar). El CSV original (`PROVEEDORES RDB.csv`) queda como referencia para cuando se diseñen las cuentas contables; los datos están ahí esperando.
- **Pagos automatizados desde la cuenta bancaria capturada** — esto es CxP (`cxp` initiative existente), no parte de este alcance.
- **Validación SAT en línea de RFCs** — no entra en V1, pero sería un nice-to-have futuro.

## Riesgos

- **Confusión con `erp.cuentas_bancarias`**: la tabla existente es para cuentas propias de la empresa. La nueva `erp.proveedores_cuentas_bancarias` (o el nombre que se decida) es para cuentas de proveedores. Hay que documentarlo bien para que un futuro lector no las confunda.
- **Duplicados latentes**: #4 (Jorge Amin / Abastecedora Industrial) es uno detectado, puede haber más. La detección por RFC del flujo `proveedores-csf-ai` los va a expuner cuando se carguen las CSFs.

## Métricas de éxito

- 12/12 proveedores activos de RDB con datos fiscales completos (CSF cargada o capturada manualmente con razón social, régimen fiscal, domicilio fiscal estructurado, RFC validado).
- Cuentas bancarias capturadas para los proveedores que requieren transferencia (los que no son "Pago en tienda" o "Pedido por App").
- Contacto principal capturado para el 100% de los activos.
- Cero RFCs inválidos o duplicados en `erp.personas` para `empresa_id = RDB`.

## Bitácora

_(append-only)_

- **2026-04-30** — Iniciativa creada. Disparada por la depuración del catálogo de proveedores RDB usando `PROVEEDORES RDB.csv`: el CSV trae info que el schema actual no soporta (cuentas bancarias del proveedor, contacto principal, cuentas contables) más datos legacy con inconsistencias que requieren saneamiento. SQL de activación/desactivación + actualización de campos básicos (RFC, CURP, email, teléfono, domicilio libre, condiciones de pago, tipo_persona deducido por longitud de RFC) en `/tmp/proveedores_rdb_update.sql`.
- **2026-04-30** — SQL aplicado vía Supabase MCP (`execute_sql` en una sola transacción `BEGIN/COMMIT`). Verificación: 12 activos, 18 inactivos. Los 12 activos quedaron con: 7 morales (Aranda Chocolate, Arca Continental, Moctezuma, H-E-B, Walmart, El Mirador, Super Gutiérrez) + 5 físicas (Arnulfo Sandoval, Dinorah, Fernando Dario, Franziella, Jorge Amin). Datos pendientes de saneamiento (ver alcance v1): RFC real de Moctezuma + Abastecedora + Franziella, materno de Arnulfo Sandoval (perdido en el split — el CSV solo traía "Arnulfo Sandoval" sin segundo apellido y el `paterno` previo "Sandoval Morales" se reemplazó por "Sandoval" para alinear al CSV).
- **2026-04-30** — Iniciativa promovida `proposed → planned`. Alcance v1 cerrado en 4 sprints (Schema DB → UI RDB → carga manual operativa → closeout). ADR-028 creado documentando reglas PS1-PS6 (asociación a `erp.personas` no a `erp.proveedores`, multi-row con flag principal/vigente, fiscal vs operativo separados, `empresa_id` denormalizado, RLS heredado de `personas_datos_fiscales`, banco como FK opcional con fallback). Migración SQL Sprint 1 generada en `supabase/migrations/20260430160000_personas_satellites_contactos_cuentas_direcciones.sql`.
- **2026-04-30** — Sprint 1 DDL aplicada vía Supabase MCP (Beto autorizó después de fallar `op read` para `$SUPABASE_DB_URL`; el item de 1Password está en vault Personal, no Infrastructure). Verificación post-apply: 3 tablas con RLS=on, 4 policies cada una (SELECT/INSERT/UPDATE/DELETE), 4 indexes c/u (PK + persona_id + empresa_id + partial unique principal/vigente), 1 trigger updated_at c/u. `types/supabase.ts` regenerado con 9 referencias a las 3 tablas. `supabase/SCHEMA_REF.md` **pendiente** — el script `npm run schema:ref` necesita `$SUPABASE_DB_URL` que CC no tiene cargado; lo correrá Beto cuando encuentre el secret en su vault Personal.

## Decisiones registradas

_(append-only)_

- **2026-04-30** — Tipo de persona deducido por longitud de RFC: 12 chars = moral, 13 chars = física, sin RFC = deducir por nombre. Aplicado en el SQL de depuración inicial.
- **2026-04-30** — Datos contables (Cuenta/SubCuenta/...) explícitamente diferidos a futura iniciativa de contabilidad. El CSV original queda como referencia.
- **2026-04-30** — RFCs inválidos del CSV (3 casos: Moctezuma con RFC de DILESA, Abastecedora con CURP en columna RFC, Franziella con RFC de DILESA) **no se aplicaron**. Quedan como NULL en DB hasta tener el real, en lugar de cargar un dato sabidamente erróneo. Trade-off: el principio "tomar el CSV como bueno" se relaja cuando el dato es claramente un copy-paste error verificable contra `core.empresas`.
- **2026-04-30** — Schema: 3 tablas satélite ligadas a `erp.personas` (no `erp.proveedores`) — ver ADR-028 reglas PS1-PS6. Una persona puede ser empleado/cliente/proveedor a la vez; sus contactos/cuentas/direcciones operativas son atributos de la persona. Trade-off PS4: `empresa_id` denormalizado en cada satélite para RLS sin JOIN; si una persona se reasigna a otra empresa hay que actualizar todas las tablas (caso raro, vale la simplicidad).
- **2026-04-30** — Banco modelado como FK opcional a `core.bancos(id)` con fallback `banco_nombre text`. Razón: catálogo cubre bancos mexicanos conocidos (consistencia + posibilidad de patrones OCR de comprobantes), pero hay casos legítimos sin catálogo (cuentas en USD, bancos extranjeros).
- **2026-04-30** — Domicilio fiscal vs operativo separados: el fiscal (validado por SAT vía CSF) sigue en `erp.personas_datos_fiscales`. El operativo (donde se entrega/recoge mercancía) en `erp.personas_direcciones`. Pueden coincidir, la separación protege contra corromper el dato fiscal cuando el proveedor cambia de bodega.

# ADR-028 — Tablas satélite de `erp.personas` (contactos, cuentas bancarias, direcciones operativas)

**Estado:** Accepted
**Fecha:** 2026-04-30
**Iniciativa:** [`rdb-proveedores-data-completion`](../planning/rdb-proveedores-data-completion.md)
**Relacionados:** ADR previo de `proveedores-csf-ai` (datos fiscales en `erp.personas_datos_fiscales`).

## Contexto

El catálogo de proveedores RDB recién depurado (12 activos, 18 inactivos) reveló que el CSV operativo trae información que el schema actual no puede capturar:

- **Cuentas bancarias del proveedor** (Banco / NumCuenta / CLABE) — para CxP por transferencia.
- **Contacto principal** (nombre, teléfono, email de la persona con quien se trata) — distinto al contacto fiscal.
- **Domicilio operativo** (donde se entrega/recoge mercancía) — distinto al domicilio fiscal de la CSF.

`erp.cuentas_bancarias` existe pero es para cuentas **propias de la empresa** (tiene `saldo_actual`, está pensado para conciliaciones bancarias). No sirve para guardar cuentas de un tercero.

`erp.personas_datos_fiscales` cubre ya razón social, régimen fiscal y domicilio fiscal — ese hueco está cerrado por el flujo `proveedores-csf-ai`.

Faltan los 3 anteriores. Decisión: ¿columnas en `erp.personas` vs tablas satélite vs tabla genérica `erp.proveedores_*`?

## Decisión

Crear **3 tablas satélite** ligadas a `erp.personas` (no a `erp.proveedores`):

1. `erp.personas_contactos` — multi-contacto por persona, uno marcado como `principal`.
2. `erp.personas_cuentas_bancarias` — multi-cuenta por persona, una `vigente` (FK opcional a `core.bancos`).
3. `erp.personas_direcciones` — multi-dirección por persona, una `principal`, con tipo (`operativo`, `entrega`, `cobro`, `oficina`). El domicilio **fiscal** sigue en `erp.personas_datos_fiscales`.

## Reglas (PS1-PS6)

- **PS1: Asociación a `erp.personas`, no a `erp.proveedores`.** Una persona puede ser empleado, cliente y proveedor a la vez. Sus contactos, cuentas y direcciones operativas son atributos de la persona, no de su rol comercial. Esto evita duplicación cuando una persona tiene múltiples roles, y reusabilidad cuando los empleados (nómina) o clientes (devoluciones) necesiten cuenta bancaria.
- **PS2: Multi-row con flag de "principal/vigente".** Cada tabla soporta múltiples filas por persona, con un boolean (`principal` para contactos/direcciones, `vigente` para cuentas bancarias) que marca cuál es la activa. Constraint partial-unique evita más de un principal/vigente por persona.
- **PS3: Domicilio fiscal vs operativo separados.** El fiscal (validado por SAT vía CSF) vive en `erp.personas_datos_fiscales`. El operativo (donde físicamente se recoge mercancía) vive en `erp.personas_direcciones`. Pueden coincidir en muchos casos, pero la separación evita corromper el dato fiscal cuando el proveedor cambia de bodega.
- **PS4: `empresa_id` denormalizado en cada tabla.** Misma decisión que `erp.personas_datos_fiscales`: simplifica RLS sin necesidad de JOIN a `personas`. Trade-off: si una persona se reasigna a otra empresa (caso raro), hay que actualizar todas las tablas satélite.
- **PS5: RLS heredado del patrón `erp.personas_datos_fiscales`.** SELECT/INSERT/UPDATE: `core.fn_has_empresa(empresa_id) OR core.fn_is_admin()`. DELETE: solo admin (audit-friendly — el patrón es `activo=false` o `vigente=false` antes de borrar físicamente).
- **PS6: Banco como FK al catálogo, con fallback a texto libre.** `erp.personas_cuentas_bancarias.banco_id` referencia `core.bancos(id)` para los bancos conocidos (consistencia + posibilidad de patrones OCR de comprobantes); `banco_nombre` queda como fallback opcional para bancos no catalogados o cuentas en USD/extranjero.

## Alternativas consideradas

- **Columnas planas en `erp.personas`** (`contacto_principal_*`, `banco`, `clabe`, `direccion_operativa_*`) — descartado por PS2 (no soporta múltiples por persona).
- **Tablas en `erp.proveedores_*`** — descartado por PS1 (no reusable para empleados/clientes).
- **Tabla única `erp.personas_atributos`** estilo EAV (entity-attribute-value) — descartado por costo en queries y en typing TS (cada atributo serializado como JSON).

## Consecuencias

- 3 tablas nuevas en `erp` con misma estructura RLS y triggers `updated_at`.
- UI debe presentar las 3 secciones en el drawer de proveedor (RDB v1, replicable a otros módulos).
- Server actions / RPCs nuevas para CRUD de las 3 tablas.
- Documentación: SCHEMA_REF.md regenerado, types/supabase regenerado.
- Cuando llegue la iniciativa de **contabilidad** (futura), las cuentas contables del proveedor (Cuenta/SubCuenta del CSV original) probablemente vivirán en su propia tabla satélite siguiendo este mismo patrón (ej. `erp.personas_cuentas_contables` o, si son del rol comercial específicamente, `erp.proveedores_cuentas_contables`).

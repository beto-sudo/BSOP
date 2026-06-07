# Iniciativa — Tesorería (sección + Saldos Bancos)

**Slug:** `tesoreria`
**Empresas:** todas (golden DILESA)
**Schemas afectados:** `erp` (nueva `cuenta_saldos` + vista `v_cuenta_saldo_actual`; carga `cuentas_bancarias`), `core.modulos` (sección `tesoreria` nueva + reubicar CxC/CxP + slug módulo Saldos Bancos + backfill de permisos)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-06-07
**Última actualización:** 2026-06-07 (promovida a `planned` — alcance v1 cerrado con Beto: golden DILESA; solo crear la sección + el módulo Saldos Bancos nuevo (CxC/CxP solo se reubican bajo la sección, sin tocar sus UIs); el módulo es dependencia previa del lanzamiento del correo al Consejo (`dilesa-resumen-consejo`).)

## Problema

Tres huecos que convergen:

1. **No hay saldos bancarios en BSOP.** `erp.cuentas_bancarias` está
   **vacía** (cero cuentas) y `saldo_actual` no lleva historial. El
   correo diario al Consejo (`dilesa-resumen-consejo`) necesita el bloque
   de Saldos Bancos, y la operación necesita saber "cuánto hay en el banco
   hoy" sin abrir Coda.
2. **CxC y CxP no tienen un hogar común.** Ambos subledgers ya existen con
   UI (`/dilesa/cobranza` hub de 2 tabs, `/dilesa/cxp` hub de 5 tabs) pero
   cuelgan de la sección "Administración" del sidebar, mezclados con
   Tareas/Juntas/Documentos. Falta la sección **"Tesorería"** que los
   agrupe con Saldos Bancos.
3. **Conciliación bancaria está lejos.** La iniciativa
   `conciliacion-bancaria` está `proposed` y bloqueada hasta que CxC+CxP
   emitan movimientos. Hasta entonces hace falta una **captura manual de
   saldos con historial** que sea la fuente de verdad — y de la que el día
   de mañana la conciliación pueda derivar/contrastar.

## Outcome esperado

1. **Sección "Tesorería"** en el sidebar (taxonomía ADR-014) que agrupa
   CxC + CxP + Saldos Bancos. CxC/CxP se **reubican** ahí (cambia su
   `seccion` y su lugar en el nav); sus UIs no se tocan.
2. **Módulo "Saldos Bancos"** nuevo (`dilesa.saldos-bancos`): captura de
   saldo por cuenta con **historial** (snapshots fechados) + vista del
   último saldo por cuenta. Golden DILESA: carga las 4 cuentas reales
   (BBVA Bancomer, BBVA Dólares, Casa de Bolsa Finamex, Monex).
3. **Fuente de verdad de saldos** que alimenta hoy el correo al Consejo
   (`v_cuenta_saldo_actual` → bloque #1) y mañana se reemplaza/contrasta
   por la derivación automática de `conciliacion-bancaria`.

## Decisiones registradas (cierre de alcance v1 con Beto, 2026-06-07)

- **D1 — Golden DILESA.** La sección y el módulo arrancan en DILESA con
  las 4 cuentas reales; modelo + RBAC quedan listos para rollout a las
  demás empresas después (patrón usual del repo).
- **D2 — Solo sección + Saldos Bancos.** Esta iniciativa **no** construye
  ni reescribe las UIs de CxC/CxP — solo crea la sección Tesorería, mueve
  CxC/CxP a ella (nav + `core.modulos.seccion`) y agrega el módulo Saldos
  Bancos nuevo.
- **D3 — Es dependencia previa del correo al Consejo.** Beto eligió
  "esperar al módulo": el correo `dilesa-resumen-consejo` **no se lanza**
  (ni se apaga Coda) hasta que Saldos Bancos esté capturando, para tener
  paridad total de los 7 bloques de una. (Reemplaza el D1 original de
  resumen-consejo, que era captura manual mínima interna.)

## Modelo conceptual

### Schema (Sprint 1)

```sql
-- Historial de saldos: 1 snapshot por captura por cuenta
CREATE TABLE erp.cuenta_saldos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES core.empresas(id),
  cuenta_id     uuid NOT NULL REFERENCES erp.cuentas_bancarias(id),
  fecha         date NOT NULL,          -- fecha del saldo (no necesariamente hoy)
  saldo         numeric NOT NULL,
  capturado_por uuid,                   -- usuario
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON erp.cuenta_saldos (cuenta_id, fecha DESC);

-- Último saldo conocido por cuenta (lo que lee el correo)
CREATE VIEW erp.v_cuenta_saldo_actual WITH (security_invoker = on) AS
SELECT DISTINCT ON (cs.cuenta_id)
  cs.cuenta_id, cs.empresa_id, cb.banco, cb.nombre, cb.moneda_id,
  cs.saldo, cs.fecha AS fecha_saldo, cs.created_at AS capturado_at
FROM erp.cuenta_saldos cs
JOIN erp.cuentas_bancarias cb ON cb.id = cs.cuenta_id
ORDER BY cs.cuenta_id, cs.fecha DESC, cs.created_at DESC;
```

> `cuentas_bancarias.saldo_actual` queda como caché opcional del último
> snapshot; la verdad vive en el historial + la vista. Diseñado para que
> cuando llegue `conciliacion-bancaria`, el saldo derivado de movimientos
> conviva con (o reemplace) la captura manual sin romper el contrato del
> correo.

### Sección + RBAC (Sprint 2)

Sigue las 4 reglas de "Liberación de módulo nuevo" del `CLAUDE.md`:

1. **Sidebar (`NAV_ITEMS`)** — nueva `NavSection { label: 'Tesorería' }`
   en DILESA con CxC + CxP (movidos desde "Administración") + Saldos
   Bancos.
2. **`ROUTE_TO_MODULE`** — `/dilesa/saldos-bancos` → `dilesa.saldos-bancos`.
3. **`EXPECTED_DB_MODULE_SLUGS`** — agregar `dilesa.saldos-bancos`.
4. **Migración SQL** — nueva `seccion='tesoreria'` (ADR-014); `UPDATE
core.modulos SET seccion='tesoreria'` para los 9 slugs
   `dilesa.cobranza*` + `dilesa.cxp*`; `INSERT` del módulo
   `dilesa.saldos-bancos` con **backfill defensivo** de permisos clonando
   de un módulo análogo (CxP) por rol; `NOTIFY pgrst`.

> Módulo plano (sin tabs) → 1 slug, igual que `dilesa.cobranza`/`dilesa.cxp`
> son slugs planos dentro de su sección. "Tesorería" es la **sección**, no
> un prefijo de slug.

### UI Saldos Bancos (Sprint 3)

- Página `/dilesa/saldos-bancos` (desktop-only, `<RequireAccess
modulo="dilesa.saldos-bancos">`).
- Tabla: una fila por cuenta con último saldo + fecha + moneda + antigüedad
  del dato (para hacer visible un saldo stale, como Finamex en Coda).
- Captura: form/drawer que registra un snapshot nuevo (`cuenta_saldos`
  INSERT) — no edita el anterior, lo apila (audit trail).
- Historial por cuenta: tabla de snapshots (fecha, saldo, quién).
- Multi-moneda: BBVA Dólares es USD — no se suman monedas distintas;
  cada cuenta muestra su moneda. Total por moneda, no global.

## Sprints

### Sprint 1 — Schema + datos

`erp.cuenta_saldos` + `v_cuenta_saldo_actual` + carga de las 4 cuentas
DILESA en `cuentas_bancarias` con su `moneda_id`. Migración aplicada con
OK de Beto. `SCHEMA_REF.md` + `types/supabase.ts`.

### Sprint 2 — Sección Tesorería + reubicar CxC/CxP + RBAC del módulo

Sección `tesoreria` + `UPDATE` de los 9 módulos CxC/CxP +
`dilesa.saldos-bancos` (las 4 reglas + backfill de permisos) + nav-config
`NavSection 'Tesorería'`. Migración con OK de Beto.

### Sprint 3 — UI Saldos Bancos

Página + captura (snapshot) + último saldo por cuenta + historial.
RequireAccess + desktop-only + tests.

### Sprint 4 — Closeout + handoff

Doc breve para operadores (captura diaria de saldos) + handoff a
`dilesa-resumen-consejo` (que consume `v_cuenta_saldo_actual` para el
bloque #1, desbloqueando el lanzamiento del correo). Barrido de Reminders.

## Dependencia con `dilesa-resumen-consejo`

El bloque #1 (Saldos Bancos) del correo lee `erp.v_cuenta_saldo_actual`.
El **lanzamiento** del correo (y el apagado de Coda) **espera** a que esta
iniciativa entregue Sprints 1–3 (datos + captura). Los Sprints 0–1 del
correo (vistas margen/inventario + fix RUV/Seguro + plantilla de las 6
secciones derivables) avanzan en paralelo sin bloqueo.

## Riesgos

1. **`erp.*` sin RLS de empresa** (políticas `USING(true)`; ver
   `project_erp_rls_empresa_isolation`). Los saldos bancarios son
   sensibles — el aislamiento por empresa vive en capa app. Cuidar el
   gate de empresa en los queries del módulo, consistente con el resto de
   `erp`. No es regresión (todo `erp` es así), pero conviene anotarlo.
2. **Captura manual stale** — un saldo sin actualizar (como Finamex en
   Coda desde noviembre). Mitiga mostrar la antigüedad del último
   snapshot en la UI y en el correo.
3. **Multi-moneda** — no sumar USD + MXN. Total por moneda.
4. **Reubicar CxC/CxP** — mover su `seccion` y su lugar en el nav no debe
   romper sus `ROUTE_TO_MODULE`/sub-slugs existentes (las URLs no cambian,
   solo el agrupamiento). Verificar que los tests de sync de permisos
   sigan verdes.
5. **Migración de seccion** — al introducir `tesoreria` como valor de
   `seccion`, confirmar que no haya CHECK/enum que lo rechace (ADR-014).

## Métricas de éxito

- 4 cuentas DILESA con saldo capturado + historial creciente.
- Sección Tesorería visible para roles autorizados, con CxC/CxP +
  Saldos Bancos agrupados.
- `dilesa-resumen-consejo` consume `v_cuenta_saldo_actual` y queda
  desbloqueado para lanzar los 7 bloques.

## Bitácora

- **2026-06-07 (promoción)** — Surgió al planear `dilesa-resumen-consejo`:
  el bloque de bancos era un gap duro (`cuentas_bancarias` vacía). Beto
  decidió no resolverlo con captura mínima interna sino crear una sección
  Tesorería que agrupe CxC/CxP + un módulo Saldos Bancos con historial,
  puente hasta `conciliacion-bancaria`. Alcance v1 cerrado (D1 golden
  DILESA, D2 solo sección + Saldos Bancos, D3 dependencia previa del
  correo). Diagnóstico de nav/módulos: CxC=`dilesa.cobranza*`,
  CxP=`dilesa.cxp*`, hoy en `seccion='administracion'`; secciones DILESA
  existentes = administracion/operaciones/rh. Promovida a `planned`.

## Decisiones registradas

- **2026-06-07 — D1 golden DILESA / D2 solo sección + Saldos Bancos / D3
  dependencia previa del correo al Consejo.** Ver "Decisiones registradas
  (cierre de alcance v1)" arriba.

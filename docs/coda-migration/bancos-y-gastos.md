# Bancos + Gastos — Deep Audit y Propuesta de Rediseño

> Deep audit de los 2 módulos cross-empresa Tier 2 con más leverage.
>
> **Fuentes**: Coda REST API (2026-04-18) + inspección de schema actual en Supabase.
> **Objetivo**: definir el schema + UX óptimos en BSOP, extendiendo las tablas ya creadas (0 rows).

---

## 1. Estado actual en Coda

### SR Group — Gastos (3,496 rows)

```
Tabla: Gastos (grid-j66Im4cf5H)
Parent: "Gastos"

Columns:
  Fecha             date
  Descripción       text
  Monto             currency
  Categoría         lookup → Sub-Categoría Gasto.Categoría
  Sub-Categoría     lookup → Sub-Categoría Gasto
  Imagen            image[]          ← attachment / comprobante
  #Pago             formula          (contador)
  Año               formula          (extraído de Fecha)
  Mes               formula          (extraído de Fecha)
  50/30/20 Rule     formula          (Need / Want / Savings, heredado de Sub-Categoría)
```

**Sub-Categorías**: 73 filas con estructura `(sub_categoria, categoria, clasificacion_50_30_20)`. Categorías con emojis embebidos: Salud🏥, Transporte 🚘, Diversión🎟️, Servicios🧾, Rancho🚜, Educación🎓, Personal👥, Hogar🏠, etc.

### SR Group — Bancos personales (emails forwarded)

Tres tablas de movimientos con **el mismo flow manual**:

| Tabla | Rows | Moneda | Particularidad |
|---|---:|---|---|
| Movimientos AMEX | 2,610 | USD → MXN | Emails de `americanexpress.com` |
| Movimientos Banamex | 2,421 | MXN | Emails de Citibanamex |
| Movimientos IBC | 1,523 | USD → MXN | Emails de Interamerican Bank |

```
Schema común (Banamex — MXN):
  Fecha             date
  Descripción       text         ← email forward COMPLETO (HTML-stripped)
  Monto             currency     ← inicialmente $0.00, Beto lo llena a mano
  Tipo de Gasto     lookup       ← categoría
  Sub-Categoría     lookup
  Registrado        checkbox     ← false hasta que Beto procesa
  *Traspasa         button       ← flow manual
  *Registra         button
  *Traspasa Gasto   button       ← dispara creación de row en Gastos + marca Registrado=true
  Ingreso Sueldo    button       ← para abonos tipo sueldo

Schema AMEX / IBC (USD):
  + Monto Dolares, Tipo de Cambio, Monto Pesos (formula)
  + Quien Carga (AMEX only)
```

**Flow Coda actual**:
1. Bank envía email → forward a Coda → nueva row (Monto=$0, Registrado=false)
2. Beto abre "Registros Pendientes X" (view filtrada por Registrado=false)
3. Lee descripción (el monto está EN EL TEXTO del email, ej. "$43.28"), lo captura en Monto
4. Elige Tipo + Sub-Categoría
5. Click "Traspasa Gasto" → crea fila en `Gastos` + marca `Registrado=true`

### ANSA — BBVA Bancomer (569 rows)

**Flow DIFERENTE**. No son emails, es export de estado de cuenta:

```
Schema:
  Dia              text "DD-MM-YYYY"
  Concepto/Ref     text           ← línea del banco, sin HTML
  Cargo            currency       ← salidas
  Abono            currency       ← entradas
  Saldo            currency       ← saldo corrido
```

No hay procesamiento / categorización. Solo historial.

### Registros Pendientes × 3

Son **tablas view-like** con FK a Movimientos. Exponen los mismos campos + los botones. No son fuentes de datos — son UI filtradas en Coda.

---

## 2. Pain points observados

1. **Flujo manual**: cada movimiento AMEX/Banamex/IBC requiere que Beto lea el email, extraiga el monto, lo capture, asigne categoría, y apriete botón. **1,405 rows pendientes acumuladas** (Registros Pendientes Banamex 796 + IBC 331 + AMEX 193 + 85 facturas pendientes).
2. **Monto no está estructurado**: vive dentro del texto de la descripción. Humano tiene que leer.
3. **Categorías como emojis en el nombre**: dificulta agrupación / reporting / filtrado.
4. **3 tablas separadas por banco**: cada cuenta es su propia tabla. Cruzar = imposible sin exportar.
5. **BBVA es otro schema**: no hay forma de agregar AMEX+Banamex+IBC+BBVA en un mismo reporte.
6. **No hay conciliación**: no se cruza contra facturas o gastos reales.
7. **Emoji mess en descripción**: los emails son dumps gigantes con ruido visual y trackers.

---

## 3. Estado actual en BSOP (Supabase)

Todas las tablas YA EXISTEN pero están **vacías** (0 rows):

```sql
erp.cuentas_bancarias          0 rows    -- base accounts
erp.movimientos_bancarios      0 rows    -- unified bank movements
erp.conciliaciones             0 rows    -- bank movement ↔ gasto/factura
erp.gastos                     0 rows    -- expense ledger
erp.facturas                   0 rows    -- SAT invoices
```

Esto significa: **schema listo, sin datos, sin UI**. La migración necesita definir columnas + construir UI + importar rows.

---

## 4. Propuesta de rediseño (extendiendo schema existente)

### 4.1 `erp.cuentas_bancarias` — 1 fila por cuenta

```sql
-- Seed con 6-8 cuentas
id                uuid pk
empresa_id        uuid fk → core.empresas
nombre            text                 -- "AMEX Beto Personal", "BBVA Empresa ANSA", etc
banco             text                 -- "American Express", "Citibanamex", "BBVA", "IBC"
numero_cuenta     text                 -- últimos 4 dígitos
moneda            text                 -- "MXN" | "USD"
tipo              text                 -- "tarjeta_credito" | "debito" | "cheques" | "inversion"
activa            boolean default true
emisor_fuente     text                 -- "email_amex" | "email_banamex" | "email_ibc" | "export_bbva" | "manual"
email_forward     text                 -- dirección a la que reenviar emails (para parser)
created_at/updated_at
```

### 4.2 `erp.movimientos_bancarios` — 1 fila por movimiento

```sql
id                uuid pk
cuenta_id         uuid fk → erp.cuentas_bancarias
empresa_id        uuid fk → core.empresas       -- denormalizado para RLS
fecha             date NOT NULL
fecha_hora        timestamptz                    -- si está disponible
descripcion_raw   text                           -- email completo / línea export
descripcion_parsed text                          -- merchant extraído (ej. "TARGET COM 800 591 3869")
cargo             numeric(14,2)                  -- salida, siempre positivo
abono             numeric(14,2)                  -- entrada, siempre positivo
moneda            text                           -- MXN / USD
tipo_cambio       numeric(10,4)                  -- si moneda ≠ MXN
monto_mxn         numeric(14,2) generated ...    -- monto normalizado
saldo             numeric(14,2)                  -- si viene en el export
autorizacion      text                           -- número de autorización del banco
tipo              text                           -- "cargo_tarjeta" | "retiro" | "deposito" | "spei_entrada" | "spei_salida" | "pago" | "comision" | ...
categoria_id      uuid fk → erp.categorias_gasto -- categorizado manual o automático
subcategoria_id   uuid fk → erp.subcategorias_gasto
fuente            text                           -- "email" | "export" | "manual"
fuente_email_id   text                           -- Message-ID para dedup
categorizado      boolean default false
gasto_id          uuid fk → erp.gastos           -- si generó un gasto
factura_id        uuid fk → erp.facturas         -- si está conciliado con factura
notas             text
created_by        uuid
created_at/updated_at

UNIQUE (cuenta_id, fuente_email_id) WHERE fuente_email_id IS NOT NULL  -- dedup de emails
INDEX (empresa_id, fecha DESC)
INDEX (cuenta_id, fecha DESC)
INDEX WHERE categorizado = false                  -- "pendientes por categorizar"
```

### 4.3 `erp.categorias_gasto` + `erp.subcategorias_gasto`

```sql
-- Reemplaza el lookup de Coda (emojis dentro del nombre)
erp.categorias_gasto
  id              uuid pk
  empresa_id      uuid fk | NULL   -- NULL = categoría global
  nombre          text             -- "Salud"
  emoji           text             -- "🏥"
  color           text             -- hex para UI
  orden           int

erp.subcategorias_gasto
  id              uuid pk
  categoria_id    uuid fk
  nombre          text             -- "Padel"
  clasificacion   text             -- "Need" | "Want" | "Savings" | NULL
```

**Beneficio**: emoji separado del nombre → filtrado limpio + emoji visible en UI.

### 4.4 `erp.gastos` — ya existe, a extender

```sql
-- Columnas clave a asegurar:
id                uuid pk
empresa_id        uuid fk
fecha             date
concepto          text             -- descripción corta
descripcion       text             -- extendida
monto             numeric(14,2)
moneda            text
tipo_cambio       numeric(10,4)
monto_mxn         numeric(14,2) generated
categoria_id      uuid fk
subcategoria_id   uuid fk
movimiento_id     uuid fk → movimientos_bancarios  -- inverso
factura_id        uuid fk → facturas
comprobante_url   text              -- adjunto (signed URL pattern)
created_by        uuid
created_at/updated_at
```

---

## 5. Pipeline de ingesta (lo que automatiza lo manual)

### 5.1 Email → movimiento (AMEX/Banamex/IBC)

**Nuevo**: endpoint `POST /api/bancos/email-webhook`
- Configurar forwarding del email del banco a una dirección de Resend/Postmark inbound
- Ese servicio hace POST al endpoint con el email parseado
- Endpoint:
  1. Identifica cuenta por `From:` header
  2. Ejecuta parser específico por banco (regex para extraer `$MONTO`, `merchant`, `fecha_operacion`)
  3. Inserta en `movimientos_bancarios` con `fuente='email'`, `fuente_email_id=<Message-ID>`
  4. Categorización automática por reglas (ej. "TARGET COM" → "Hogar/Despensa")
  5. Si categoría clara → `categorizado=true`, crea `gasto` automáticamente
  6. Si no → queda pendiente de revisión

**Parsers por banco**:
```typescript
// lib/bancos/parsers/amex.ts
// lib/bancos/parsers/banamex.ts
// lib/bancos/parsers/ibc.ts
// lib/bancos/parsers/bbva.ts  (opcional, por si BBVA manda emails también)
```

Cada parser extrae `{ merchant, monto, moneda, autorizacion, fecha_operacion }` del raw text.

### 5.2 Export bancario → batch import (BBVA ANSA)

**Nuevo**: UI de upload en `/<empresa>/bancos/<cuenta>/import`
- CSV / OFX / PDF-parse
- Dedup contra `movimientos_bancarios` (por fecha + monto + concepto hash)
- Preview antes de importar

### 5.3 Reglas de categorización automática

**Nueva tabla** `erp.reglas_categorizacion`:
```sql
id, empresa_id, cuenta_id | NULL, patron_regex, categoria_id, subcategoria_id, activa
```

Se aplica en el webhook + en un cron que limpia los "sin categorizar" periódicamente.

---

## 6. UI BSOP propuesta

### `/<empresa>/bancos` — dashboard

```
┌─ Saldos por cuenta ───────────────────────────────────────┐
│ AMEX Beto        $ -12,450   ⚠️ 3 pendientes de categorizar│
│ Banamex Cheques  $ 234,800   ✅                            │
│ IBC USD          $   5,200   ⚠️ 12 pendientes              │
│ BBVA Empresa     $1,200,435  ✅                            │
└─────────────────────────────────────────────────────────────┘

┌─ Movimientos recientes (7 días) ──────────────────────────┐
│ [filtros: cuenta, fecha, estado, tipo]                    │
│                                                            │
│ Fecha      Cuenta   Descripción          Monto    Categoría│
│ ...                                                        │
└─────────────────────────────────────────────────────────────┘

┌─ Pendientes de categorizar [1,405] ───────────────────────┐
│ [tabla con quick-actions: categorizar, marcar ignorar]    │
└─────────────────────────────────────────────────────────────┘
```

### `/<empresa>/gastos` — ledger

```
┌─ Gastos del mes — $ 68,450 ───────────────────────────────┐
│ Categoría    Monto       %     Barra                       │
│ Salud        $22,500    33%    ████████                    │
│ Transporte   $15,200    22%    █████                       │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘

┌─ Lista de gastos [filtros]                                │
│ Fecha  Concepto  Monto  Categoría  Origen  Comprobante    │
│                                  (auto/manual) (img)       │
└─────────────────────────────────────────────────────────────┘

[+ Registrar gasto manualmente]
```

### `/<empresa>/conciliaciones`

Cross entre `movimientos_bancarios` × `gastos` × `facturas`. Detecta y propone matches automáticos (fecha±2d + monto exacto).

---

## 7. Orden de implementación

**Semana A — Base**
1. Migration: seed de `erp.cuentas_bancarias` con 6-10 cuentas reales
2. Migration: `erp.categorias_gasto` + `erp.subcategorias_gasto` + seed inicial desde Coda (~25 categorías × 73 subcategorías)
3. Script: `scripts/migrate_sr_gastos.ts` — copia `Gastos` de Coda → `erp.gastos` (3,496 rows)

**Semana B — Ingesta bancaria**
4. Endpoint: `POST /api/bancos/email-webhook` con parsers AMEX/Banamex/IBC
5. Script: `scripts/migrate_sr_movimientos.ts` — copia históricos 6,554 rows
6. UI read-only: `/sr-group/bancos` (ver saldos + movimientos)

**Semana C — Categorización + conciliación**
7. `erp.reglas_categorizacion` + UI de config
8. UI write: "categorizar pendiente" → crea gasto
9. Algoritmo de conciliación automática

**Semana D — Cross-empresa**
10. UI para ANSA (BBVA import via CSV/PDF)
11. UI DILESA cuando decida migrar
12. Cutover parcial: AMEX primero, luego Banamex, luego IBC (un banco por semana)

**Duración total estimada**: 3-4 semanas con 1 operador + agents.

---

## 8. Decisiones pendientes antes de empezar

| Pregunta | Opciones | Mi sugerencia |
|---|---|---|
| ¿Seguir con emails forwarded o usar API bancaria (Plaid / Belvo)? | Plaid no cubre MX bien. Belvo sí pero tiene costo. | **Emails por ahora**, evaluar Belvo en 6 meses |
| ¿Categorías globales o por empresa? | Global reutilizable vs custom | **Mixto**: seed global + override por empresa |
| ¿Gasto vs movimiento: 1-a-1 o N-a-1? | Un movimiento puede dividirse en N gastos | **N-a-1** (un movimiento genera varios gastos si se divide) |
| ¿Soft-delete o hard? | Audit requiere soft-delete | **Soft** (`deleted_at timestamptz`) |
| ¿Currency store bruto o normalizado? | Separar `moneda+monto+TC` vs solo `monto_mxn` | **Ambos**: campos brutos + `monto_mxn` generated |

---

_Este documento es el punto de partida cuando aterricemos Bancos. Tras aprobación, se materializa en migrations + PRs incrementales._

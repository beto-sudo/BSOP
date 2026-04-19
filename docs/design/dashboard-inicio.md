# Dashboard de Inicio — Propuesta de Diseño

> Home personalizado con pendientes + KPIs por usuario y rol.
>
> **Objetivo**: cada persona al entrar a BSOP ve en 5 segundos qué tiene que hacer hoy y cómo van las métricas de sus empresas.

---

## 1. Quién lo ve

BSOP tiene estos tipos de usuario (según `core.usuarios.rol` + `core.usuarios_empresas`):

| Perfil | Ejemplo | Qué le importa |
|---|---|---|
| **Admin global** | Beto | Todo, cross-empresa |
| **Operativo RDB** | cajero, hostess, admin RDB | Turno actual, cortes del día, stock crítico, reservas |
| **Financiero SR** | Beto (hat financiero), contador | Movimientos sin categorizar, gastos del mes, vencimientos fiscales |
| **Operativo DILESA** | supervisor obra, admin DILESA | Avance lotes, entregas esta semana, RUV pendientes |
| **Operativo ANSA** | asesor ventas, servicio | Citas del día, unidades disponibles, ventas del mes |
| **Familia / Grupo SR** | miembros familiares | Salud, viajes, contenido personal |

El dashboard adapta lo que muestra según:
1. Rol (admin vs usuario regular)
2. Empresas asignadas en `core.usuarios_empresas`
3. Módulos accesibles en `core.permisos_rol`

---

## 2. Layout global

```
┌──────────────────────────────────────────────────────────────────────┐
│  Sidebar                  Header (BSOP / greeting / clock / theme)   │
│                                                                       │
│  ┌──────────────────────── MAIN ──────────────────────────────────┐  │
│  │                                                                 │  │
│  │  Row 1 — SALUDO + ATENCIÓN INMEDIATA                           │  │
│  │  ┌──────────────────┬──────────────────┬──────────────────┐    │  │
│  │  │ Hola, Beto       │ 3 tareas hoy     │ 2 juntas         │    │  │
│  │  │ Martes 21 abr    │ 1 vencida  ⚠️    │ 09:00 / 14:00    │    │  │
│  │  └──────────────────┴──────────────────┴──────────────────┘    │  │
│  │                                                                 │  │
│  │  Row 2 — TUS PENDIENTES (sección grande)                       │  │
│  │  [tabs]  Tareas  Juntas  Aprobaciones  Categorizar  Recepción  │  │
│  │  ┌─────────────────────────────────────────────────────────┐   │  │
│  │  │  [tabla de pendientes según tab activo]                 │   │  │
│  │  │  Cada row: descripción + empresa + fecha + quick action  │   │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  │                                                                 │  │
│  │  Row 3 — KPIs POR EMPRESA (grid adaptativo)                    │  │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐      │  │
│  │  │ RDB       │ │ DILESA    │ │ ANSA      │ │ SR Group  │      │  │
│  │  │ [ KPIs ]  │ │ [ KPIs ]  │ │ [ KPIs ]  │ │ [ KPIs ]  │      │  │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘      │  │
│  │                                                                 │  │
│  │  Row 4 — ACTIVIDAD RECIENTE / PULSO (opcional)                 │  │
│  │  - Últimas 5 juntas con resumen                                │  │
│  │  - Tareas completadas hoy por el equipo                        │  │
│  │  - Alertas (stock crítico, vencimientos, robos caja)           │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Row 1 — Atención inmediata (4 tarjetas)

Siempre visibles, siempre priorizadas:

| Tarjeta | Fuente | Ejemplo |
|---|---|---|
| **Saludo + fecha** | `core.usuarios.nombre` | "Buenos días, Beto · Martes 21 de abril" |
| **Tareas del día** | `erp.tasks WHERE asignado_a = me AND fecha_vence <= today AND estado NOT IN (completado, cancelado)` | "3 tareas · 1 vencida ⚠️" |
| **Juntas hoy** | `erp.juntas WHERE fecha_hora::date = today AND asistentes @> me` | "2 juntas · 09:00 y 14:00" |
| **Acción ejecutiva** | depende de rol | Admin: "10 sin categorizar" · Cajero: "abrir caja" · Supervisor: "3 lotes en inspección" |

Cada tarjeta es clickeable → lleva a la sección correspondiente.

---

## 4. Row 2 — Tus pendientes (tabs)

Estructura tipo inbox. Un tab por tipo. Cada tab muestra el **count** en el label.

```
[ Tareas (12) ] [ Juntas (3) ] [ Aprobaciones (2) ] [ Categorizar (45) ] [ Recepciones (0) ]
```

### Tab: Tareas
- Fuente: `erp.tasks` asignadas al usuario + sin cerrar
- Columnas: estado badge · título · empresa · prioridad · fecha venc · [botón Completar]
- Orden: vencidas primero, luego por fecha de vencimiento
- Filtro rápido: "hoy" / "esta semana" / "todas"

### Tab: Juntas
- Fuente: `erp.juntas_asistencia` próximas (next 7 days)
- Columnas: fecha + hora · título · empresa · lugar · [botón Abrir]
- Separador: "Hoy" · "Esta semana" · "Después"

### Tab: Aprobaciones (según rol)
- Fuente: `erp.aprobaciones WHERE aprobador = me AND estado = 'pendiente'`
- Columnas: entidad (OC, Requisición, Gasto, etc) · monto/total · solicitante · fecha
- Quick action: [Aprobar] [Rechazar] [Ver detalle]

### Tab: Categorizar bancos (admin financiero)
- Fuente: `erp.movimientos_bancarios WHERE categorizado = false AND empresa_id ∈ user_empresas`
- Agrupado por cuenta
- Quick action: selecciona categoría inline → marca categorizado

### Tab: Recepciones (admin compras)
- Fuente: `erp.ordenes_compra WHERE estado = 'por_recibir' AND fecha_entrega <= today + 3`
- Quick action: marcar recibida

---

## 5. Row 3 — KPIs por empresa (grid)

Un card por empresa a la que el usuario tiene acceso. Cada card tiene 4-6 KPIs.

### RDB card

```
┌─ 🌲 Rincón del Bosque ─────────────────────────┐
│                                                  │
│  Ventas hoy         $ 24,580    ↑ 12% vs ayer   │
│  Corte actual       Abierto 08:30h              │
│  Reservas hoy       18 (6 tarde)                │
│  Stock crítico      3 productos ⚠️              │
│  Top producto       Padel 1h Premium            │
│                                                  │
│  [→ Ver RDB completo]                           │
└──────────────────────────────────────────────────┘
```

Fuentes:
- Ventas hoy: `rdb.waitry_pedidos WHERE fecha::date = today`
- Corte: `erp.cortes_caja WHERE estado = 'abierto'`
- Reservas: `playtomic.bookings WHERE starts_at::date = today`
- Stock crítico: `erp.inventario WHERE stock <= min_stock`

### DILESA card

```
┌─ 🏗️ DILESA ────────────────────────────────────┐
│                                                  │
│  Lotes en obra      27  (14 LDS, 8 LDV, 5 LDE) │
│  Entregas semana    3 pendientes                │
│  DTUs por vencer    2 (CUV-12849 en 15 días)   │
│  Escrituras mes     8 cerradas                  │
│  Gastos obra mes    $ 1.2M                      │
│                                                  │
│  [→ Ver DILESA completo]                        │
└──────────────────────────────────────────────────┘
```

### ANSA card

```
┌─ 🚗 ANSA ──────────────────────────────────────┐
│                                                  │
│  Citas hoy          12 (8 servicio, 4 venta)   │
│  Inventario vehicles 87 (Jeep: 22, Ram: 18...)  │
│  Ventas mes         14 unidades · $ 5.8M       │
│  Cobranza pendiente $ 2.3M                      │
│                                                  │
│  [→ Ver ANSA completo]                          │
└──────────────────────────────────────────────────┘
```

### SR Group card (admin)

```
┌─ 💼 SR Group ──────────────────────────────────┐
│                                                  │
│  Sin categorizar    45 movimientos ⚠️          │
│  Gastos mes         $ 68,450                    │
│  Facturas emitidas  5 este mes                  │
│  Pagos provisionales ISR Abril — pendiente     │
│                                                  │
│  [→ Ver SR Group]                               │
└──────────────────────────────────────────────────┘
```

### Family card (opcional, visible para miembros familia)

```
┌─ 👨‍👩‍👧‍👦 Familia / Grupo SR ──────────────────┐
│                                                  │
│  Próximo viaje      SD → Seattle · Mayo 10     │
│  Salud Beto         HR 68 · Sleep 7.2h (ayer)  │
│  Cumpleaños próximo Grecia · 26 mar (en 3d)    │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 6. Row 4 — Pulso / actividad (opcional)

Feed horizontal estilo timeline. Solo admin o si usuario tiene >1 empresa.

```
Últimas actualizaciones
───────────────────────────────────────────
• Hace 15 min · Ale completó "Revisión contrato Lomas del Sol"
• Hace 1 h     · Corte RDB turno mañana · $ 8,450
• Hace 3 h     · Junta Comité Ejecutivo agregada · viernes 09:00
• Ayer         · 45 movimientos IBC ingeridos (pendientes de categorizar)
```

Fuente: `core.audit_log` cuando esté operativo.

---

## 7. Lógica de personalización

```typescript
// Pseudo-código del servidor que arma el dashboard
async function getDashboard(userId: string) {
  const user = await getUserWithEmpresas(userId);

  return {
    row1: await buildAtencionInmediata(user),   // siempre
    row2: {
      tareas:       await fetchTasks(user),
      juntas:       await fetchJuntas(user),
      aprobaciones: hasPermission(user, 'aprobaciones.ver')
                       ? await fetchAprobaciones(user) : null,
      categorizar:  hasEmpresa(user, 'sr-group')
                       ? await fetchPendientesCategorizar(user) : null,
      recepciones:  hasPermission(user, 'compras.ver')
                       ? await fetchRecepciones(user) : null,
    },
    row3: await Promise.all(
      user.empresas.map(e => buildEmpresaCard(e, user))
    ),
    row4: user.isAdmin ? await fetchActivity(user) : null,
  };
}
```

### Reglas de visibilidad

| Componente | Visible si |
|---|---|
| Row 1 · Tareas hoy | tiene tareas asignadas (siempre, pero se oculta si 0) |
| Row 1 · Juntas hoy | tiene juntas próximas |
| Row 1 · Acción ejecutiva | `user.isAdmin` O tiene permisos específicos |
| Row 2 · Aprobaciones | `permisos_rol.aprobaciones.ver = true` |
| Row 2 · Categorizar | tiene acceso a SR Group + empresa financiera |
| Row 2 · Recepciones | tiene acceso a compras |
| Row 3 · RDB | user ∈ usuarios_empresas(rdb) |
| Row 3 · DILESA | user ∈ usuarios_empresas(dilesa) |
| Row 4 · Actividad | user.isAdmin |

---

## 8. Datos que faltan en Supabase (para construir esto bien)

Antes de poder construir el dashboard 100% funcional:

| KPI | Falta | Estado |
|---|---|---|
| Ventas hoy RDB | ✅ existe (`rdb.waitry_pedidos`) | ready |
| Corte actual RDB | ✅ existe (`erp.cortes_caja`) | ready |
| Reservas hoy Playtomic | ✅ existe (`playtomic.bookings`) | ready |
| Stock crítico | ⚠️ necesita columna `min_stock` en `erp.productos` | schema change |
| Lotes DILESA | ❌ `erp.lotes` está en 0 rows | migración pendiente |
| Entregas DILESA | ❌ schema "entregas" no existe como tabla aparte | diseñar |
| DTUs por vencer | ❌ RUV no migrado | muy lejos |
| Citas ANSA hoy | ❌ `erp.citas` en 0 rows | migración pendiente |
| Inventario vehículos | ❌ `erp.vehiculos` en 0 rows | migración pendiente |
| Ventas mes ANSA | ❌ `erp.ventas_autos` en 0 rows | migración pendiente |
| Cobranza pendiente | ❌ `erp.cobranza` en 0 rows | migración pendiente |
| Sin categorizar SR | ❌ `erp.movimientos_bancarios` en 0 rows | ver `bancos-y-gastos.md` |
| Gastos mes SR | ❌ `erp.gastos` en 0 rows | ver `bancos-y-gastos.md` |

**Orden que propone el dashboard**:
1. **MVP v1**: lo que YA hay — tareas, juntas, RDB ventas/corte/reservas, Familia salud/viajes
2. **v2** (post-migración bancos/gastos): agregar KPIs SR Group + categorizar
3. **v3** (post-migración ANSA citas): agregar card ANSA completo
4. **v4** (post-migración DILESA inmobiliario): agregar card DILESA completo

---

## 9. Implementación técnica

### Archivos nuevos

```
app/page.tsx                           -- orchestrator (refactorizar el actual)
components/dashboard/
  ├── dashboard.tsx                    -- orchestrator visual
  ├── types.ts
  ├── attention-row.tsx                -- row 1
  ├── pending-tabs.tsx                 -- row 2
  ├── empresa-card.tsx                 -- row 3 genérico
  ├── rdb-kpis.tsx                     -- row 3 específico
  ├── dilesa-kpis.tsx
  ├── ansa-kpis.tsx
  ├── sr-kpis.tsx
  ├── family-kpis.tsx
  ├── activity-feed.tsx                -- row 4
  └── use-dashboard-data.ts            -- fetch hook
```

### Endpoint

```
GET /api/dashboard
  → returns all rows prebuilt server-side
  cache: 30 segundos (revalidate on mutation vía tags)
```

Usa `next/cache` con tags `dashboard:<userId>` para invalidar cuando cambian tareas/juntas/corte/etc.

### Performance

- Row 1 y Row 2: must be fast (~200ms total) — hits small indexed queries
- Row 3 por empresa: paralelizable, cacheado 60s
- Row 4: cacheado 5min

---

## 10. Preguntas para Beto

1. **¿Te gusta el layout 4-rows o prefieres algo distinto?** (ej. 2 columnas, side-by-side, card-grid)
2. **¿Qué KPIs por empresa son los que MÁS te importan?** (para priorizar)
3. **¿Habilitar widgets custom por usuario?** (cada quien reordena / esconde)
4. **¿Empezamos con MVP v1** (lo que ya hay) **mientras migramos bancos/gastos/citas en paralelo**?
5. **¿Familia debe ser su propia card o se mezcla con SR Group?**

---

_Mi recomendación:_

- **Empezar con MVP v1 esta semana/siguiente** — se puede construir ya con tareas + juntas + RDB + Familia/Salud. Se lanza como una página de inicio decente desde el día 1.
- **v2-v3-v4 en paralelo** — conforme van cerrando las migraciones Coda, se van encendiendo las cards vacías.
- **Layout flexible desde el inicio** — construir como componentes independientes para que en el futuro puedas reordenar/esconder sin refactor.

Si lo apruebas, puedo lanzar un agent que construya el MVP v1 con cero riesgo (solo lee tablas que ya existen, no toca schema).

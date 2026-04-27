# Iniciativa — Activity log pattern (`<ActivityLog>`)

**Slug:** `activity-log-pattern`
**Empresas:** todas
**Schemas afectados:** n/a (UI; consume `audit_log` u equivalente backend)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27

> **Bloqueada hasta cierre de `file-attachments`.** Alcance v1 detallado
> se cierra cuando arranque su turno.

## Problema

Cortes ya implementa "quién cambió qué cuándo" en su detail page. El
backend tiene `audit_log` como pattern. A medida que más módulos
necesitan trazabilidad (terrenos DILESA con cambio de etapa,
proveedores con actualización de datos fiscales, levantamientos con
auto-aplicación, etc.), el patrón se va a multiplicar.

Si esperamos a la 3a implementación, ya hay deriva. Mejor abstraer
ahora que solo hay 1 implementación de referencia.

## Outcome esperado

- Componente `<ActivityLog entity entityId>` que carga eventos de
  audit y los renderiza con timeline visual.
- Convención de tipos de evento: `created`, `updated`,
  `status_changed`, `archived`, `restored`, `deleted`, plus eventos
  específicos por dominio.
- Render por tipo de evento: copy parametrizado, ícono semántico,
  timestamp relativo (`formatRelativeDays` ya existe en `lib/format/`).
- Integración con `<DetailPage>` y `<DetailDrawer>` como sección
  estándar.
- ADR documentando contrato con backend (qué columnas espera de
  `audit_log`, cómo se serializa el `meta` de cada evento).

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Auditar la implementación actual de cortes.
- [ ] Definir contrato de evento (event_type, actor, timestamp,
      meta).
- [ ] Componente `<ActivityLog>` con timeline visual.
- [ ] Helper `useActivityLog(entity, entityId)` que fetcha + cachea.
- [ ] Renderizadores por tipo de evento (`renderEvent(event) => ReactNode`).
- [ ] Migrar Cortes al componente compartido.
- [ ] Adoptar en 1 módulo nuevo (probable terrenos DILESA o
      levantamientos).
- [ ] ADR.

## Fuera de alcance

- Filtros del activity log (por usuario, por tipo, por rango de
  fecha). Postergable.
- Comments / threading sobre eventos. Eso es feature distinta
  (similar a `tasks-updates-sheet.tsx` actual).
- Diff visual de campos cambiados (before/after side by side).
  Útil pero no v1.
- Real-time updates (websocket / polling). Postergable.

## Métricas de éxito

- 100% de detail pages que muestran activity usan `<ActivityLog>`.
- Cero implementaciones nuevas de timeline de eventos.
- Backend `audit_log` consumido vía contrato tipado, no SQL ad-hoc.

## Riesgos / preguntas abiertas

- [ ] **Contrato con backend** — el `audit_log` actual probablemente
      no tiene shape uniforme entre módulos (cortes lo armó a
      medida). Definir si el componente UI dicta el shape o si se
      adapta a lo que viene.
- [ ] **Volumen de eventos** — entidades con muchos eventos pueden
      saturar. Paginación / scroll infinito en v1 sí.
- [ ] **Permisos** — algunos eventos son sensibles (cambios de monto,
      decisiones de aprobación). El componente debe respetar
      `<RequireAccess>` opcional por evento.
- [ ] **Coordinación con `<DataTable>`** — ¿es activity-log una vista
      de tabla degenerada? Probable que NO — el shape (timeline,
      agrupado por día/hora, mixed event types) no encaja con
      `<DataTable>`.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_

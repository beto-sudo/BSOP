# Iniciativa — Badge system (tokens semánticos)

**Slug:** `badge-system`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27

> **Bloqueada hasta cierre de `forms-pattern`.** Alcance v1 detallado se
> cierra cuando arranque su turno.

## Problema

Cada módulo armó sus propios badges con sus propios colores:

- `EstadoBadge` (tasks) — pendiente / en_progreso / completado /
  cancelado.
- `PrioridadBadge` y `PrioridadTextBadge` (tasks) — alta / media /
  baja / crítica.
- `TipoBadge`, `TipoOperacionBadge`, `VencBadge` (documentos).
- `EtapaBadgeLarge` (DILESA terrenos).
- `Badge variant="..."` (shadcn base, usado directamente en cortes,
  ventas, productos).
- `<Chip>` ad-hoc en algunos lados.

Síntomas:

- Mismo concepto semántico ("ok / aviso / error / info / neutral")
  expresado con colores distintos según quién lo escribió.
- Variants de `<Badge>` shadcn (`default`, `secondary`, `destructive`,
  `outline`) no cubren los 5+ estados que necesitamos en realidad.
- Mapping `estado → variant` se repite en cada módulo
  (`statusVariant(corte.estado)`, `estadoVariant(task.estado)`, etc.).
- El ADR-006 (`<EmptyState>`), ADR-008 (action-feedback) y ADR-010
  (`<DataTable>` con `column.type='badge'`) ya tocaron badges pero
  delegaron la decisión de color al caller. Compilada esa deuda en
  varios PRs, vale resolverla con un sistema central.

## Outcome esperado

- Tokens semánticos: `success | warning | error | info | neutral |
pending | active`. Cada uno con color de fondo, texto y borde
  consistentes.
- Componente `<Badge tone="success" size="md">Activo</Badge>` o
  similar, parametrizado.
- Mapping helpers tipados: `mapEstadoToTone(estado)` para los estados
  comunes (corte, task, etapa, documento). Un helper por dominio,
  no copy-paste de switch en cada sitio.
- Wrappers específicos (`<EstadoBadge>`, `<PrioridadBadge>`, etc.)
  internamente usan `<Badge tone>` + el helper de mapping. API externa
  se preserva.
- ADR documentando los tonos y cuándo usar cada uno.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Definir los 7 tonos canónicos + paleta (alineada con tokens
      `--color-*` existentes en el sistema).
- [ ] `<Badge>` actualizado con prop `tone` (preservar `variant` de
      shadcn para compat, deprecar a futuro).
- [ ] `<BadgeIcon>` opcional (algunos badges llevan ícono — visible
      en `EstadoBadge` y `EtapaBadgeLarge`).
- [ ] Helpers de mapping en `lib/badges/` o equivalente:
      `taskEstadoTone`, `tareaPrioridadTone`, `corteEstadoTone`,
      `etapaTerrenoTone`, `documentoTipoTone`.
- [ ] Migrar wrappers existentes a usar `<Badge tone>` internamente.
- [ ] Auditar usos directos de `<Badge variant="...">` en módulos
      y migrar a `tone` semántico.
- [ ] ADR (probable ADR-012).

## Fuera de alcance

- Animaciones de transición entre tonos (cambio de estado).
- Dark mode toggle — el repo es dark-only hoy (verificar; si no,
  tema aparte).
- Iconos custom por badge — usar lucide-react existente.

## Métricas de éxito

- Cero usos directos de `<Badge variant="destructive">` o equivalente
  en módulos — todos pasan por `tone` o helper de mapping.
- Cero `switch (estado) { case 'completado': return 'green' }` ad-hoc
  en código de módulo.
- Visual audit: pasar por las 25 tablas migradas y confirmar que los
  badges del mismo tono se ven idénticos en todas.

## Riesgos / preguntas abiertas

- [ ] **¿Cuántos tonos son suficientes?** Más tonos = más decisiones
      del caller. Menos tonos = menos expresividad. Mi voto previo:
      7 (success, warning, error, info, neutral, pending, active).
      Cerrar al arrancar.
- [ ] **Coexistencia con `<Badge variant>` shadcn** — deprecar como
      en `useSortableTable` (mantener exportado, marcar `@deprecated`).
- [ ] **Naming**: `tone` vs `intent` vs `kind` vs `status`. `tone` es
      común en design systems modernos.
- [ ] **Tamaños**: `sm | md | lg` o solo uno. v1 probable 2 tamaños
      (`md` default, `lg` para badges hero como `EtapaBadgeLarge`).

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_

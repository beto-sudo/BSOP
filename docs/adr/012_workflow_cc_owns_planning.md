# ADR-012 — Claude Code dueño de planeación + ejecución (deprecación del split Cowork)

**Fecha:** 2026-04-27
**Estado:** aceptado
**Iniciativa(s):** afecta a todas (decisión de proceso)

## Contexto

El repo originalmente usaba dos agentes en paralelo para gestionar iniciativas:

- **Cowork** escribía planning docs (Problema / Outcome / Alcance v1 / Fuera de alcance / Métricas / Riesgos) y mantenía la sección `## Activas` de `docs/strategy/INITIATIVES.md`.
- **Claude Code** ejecutaba: código, Bitácora, Decisiones registradas, Sprints/hitos, ADRs durante ejecución.

La división conceptual era "QUÉ + POR QUÉ" (Cowork) vs "CÓMO + CUÁNDO" (CC). En la práctica el split generó tres tipos de fricción:

1. **Desincronización temporal entre chats**. Los dos agentes vivían en sesiones separadas sin verse. Mientras Cowork planeaba `empleados-multi-puesto` (2026-04-27), CC cerraba Sub-PR 3 y Sub-PR 4 de `shared-modules-refactor` sin que Cowork lo supiera, y viceversa. La única forma de mantener coherencia era que Beto repitiera contexto entre chats — costo cognitivo crónico.
2. **Race condition en working tree compartido**. Ambos operaban sobre `/Users/Beto/BSOP`. Ediciones de Cowork a `docs/strategy/INITIATIVES.md` se colaron dentro del commit `22e5a1e` de Sub-PR 3 sin intención del autor humano.
3. **Lock contention en `.git/index.lock`**. Durante operaciones git de CC, Cowork no podía hacer commits ni abrir PRs desde su lado. Falla observada en al menos dos sesiones distintas.

Adicionalmente, la división "QUÉ vs CÓMO" eran secciones del mismo doc de planning. Partir la autoría agregaba complejidad de coordinación sin agregar separación real de responsabilidades.

## Opciones consideradas

- **A: Mantener split + Cowork opera vía GitHub API (sin tocar working tree local).** Resuelve los locks y el race en filesystem, pero no resuelve la desincronización temporal entre chats — el problema raíz queda intacto.
- **B: Mantener split + Cowork solo entrega bloques de markdown.** Beto pega manualmente las secciones en CC. Cero git desde Cowork, pero introduce copy-paste manual por iniciativa y tampoco resuelve la desincronización.
- **C: Matar el split. CC owns planeación + ejecución end-to-end.** Cero contención, un solo canal, sin desincronización por diseño. Costo: Beto pierde Cowork como "thinking partner separado" para BSOP.

## Decisión

Elegimos **C**. Claude Code pasa a ser dueño de planeación + ejecución end-to-end. Cowork BSOP UI queda deprecado para este repo.

## Consecuencias

- **Pro**: cero race conditions en working tree, cero locks compartidos, cero desincronización temporal entre chats.
- **Pro**: planning + ejecución viven en el mismo agente que ya conoce el código y el git state actual del repo.
- **Pro**: una sola fuente de verdad para el flujo de trabajo (`CLAUDE.md` de este repo), sin secciones que dependan de qué agente las edita.
- **Contra**: Beto pierde Cowork como canal "thinking partner separado" para BSOP. Mitigación: el rol de "estresar idea con preguntas antes de promover" se mueve dentro del mismo chat de CC. Cuando Beto suelta una idea cruda, CC la cuestiona (¿qué problema resuelve?, ¿qué pantallas/schemas toca?, ¿métrica de éxito?, ¿riesgos?) antes de proponer promoverla.
- **Neutral**: Cowork queda libre para otros usos no-BSOP (file management, multi-app workflows, planeación de cosas que no son código).

## Migración

- `CLAUDE.md` actualizado: la sección "División de roles (Cowork vs Claude Code)" se reescribe como "Roles" (CC + Beto). Se eliminan las menciones a Cowork como autor de planning y la excepción "si Cowork no está disponible".
- `docs/strategy/INITIATIVES.md` actualizado: el header dice "Mantenido por Claude Code"; la sección "Cómo se actualiza este archivo" colapsa los bullets de Cowork + CC en uno solo. La mención operativa a Cowork en la fila de la iniciativa `analytics` se mantiene — es contenido de esa iniciativa, no del proceso de planning.
- Project Cowork "BSOP UI" puede archivarse o borrarse a discreción de Beto.

## No aplica retroactivamente

Los planning docs ya creados por Cowork (incluyendo `empleados-multi-puesto` promovido en este mismo PR) quedan tal cual. No se atribuye autoría retroactiva ni se reescribe el header de planning docs viejos.

# Iniciativa — Briefing diario automatizado (server-side)

**Slug:** `daily-briefing-automation`
**Empresas:** cross (es personal de Beto, pero corre en la infra de BSOP; no toca data de empresa)
**Schemas afectados:** **Sin schema nuevo en v1.** Lee `public.health_metrics` (service role) reusando los helpers de `lib/health` + `components/health/helpers`. Escribe uso/costo en `core.ai_invocaciones` vía la capa `lib/ai` (ADR-046). Nuevo `usoId` `daily-briefing` en el registry de IA (modalidad `generacion-texto` con web search). Sin RBAC (es un cron, no un módulo de UI).
**Estado:** in_progress
**Próximo hito:** v1 + fase 2 en prod (Salud + Cumpleaños/Calendar + Correo/Gmail + FX/Noticias/IA/Péptidos). Pendiente único: decidir Apple Reminders (migrar a `erp.tasks` o dejar fuera). Opcional: persistencia del `.md` para comparación semanal.
**Dueño:** Beto
**Creada:** 2026-06-27
**Última actualización:** 2026-06-27 (fase 2: Gmail + Calendar vía service account con DWD, solo lectura)

> Detonante: el briefing matutino de Beto era una **scheduled action de Claude Desktop** (SKILL.md v4) que corría en su Mac con MCPs + OAuth de conectores + `op read`. Dependía de que la compu estuviera despierta y de tokens que caducan → se atoraba en silencio. Último briefing recibido: **5-jun-2026**; 22 días caído al momento de migrar. Beto pidió sacarlo de su máquina a infra durable.

## Problema

El briefing dependía de dos cosas frágiles por diseño:

1. **La Mac de Beto despierta** — la scheduled action corre dentro de Claude Desktop; compu dormida/apagada = no dispara.
2. **OAuth personal de los conectores** (Gmail, Calendar, Supabase MCP) — esos tokens caducan; al caducar, la corrida se cae sin aviso hasta re-autenticar. Son "los permisos que no perduran".

Resultado: huecos largos sin briefing. Beto quería lo mismo pero corriendo solo, sin su compu ni tokens que expiren.

## Outcome

El briefing llega a `beto@anorte.com` a las **7am de Matamoros todos los días**, generado 100% server-side en Vercel, con credenciales durables (env vars, no OAuth personal). Mismo tono y orden que el SKILL original, con las secciones que se pueden mover sin setup adicional.

## Alcance

### v1 (este PR) — lo que se mueve sin que Beto configure nada

- **Cron Vercel** `/api/cron/daily-briefing`, schedule `0 12,13 * * *` (7am Matamoros, guard de hora local auto-DST como `dilesa-resumen-consejo`).
- **❤️ Salud** — lee `public.health_metrics` (45d) con service role y reusa `groupDailySleep`/`groupDailyAverage`/`summarizeDailyWindow` (misma lógica de dedup HAE que el dashboard; evita el bug de noches de 20-24h). Server-side las 3 lecturas corren en paralelo sin el cuelgue del MCP de Supabase. Números **autoritativos** pasados al modelo (no recalcula).
- **💱 FX · 🌎 Noticias · 🤖 Tech&IA · 🧬 Péptidos** — Claude los redacta con la **web-search tool de Anthropic** (nuevo `runGenerateText` en `lib/ai`, modalidad `generacion-texto`, ADR-046). Sesgo a operaciones + filtro cardiovascular en péptidos, igual que el SKILL.
- **Entrega** — markdown→HTML (convertidor propio en `lib/briefing/markdown.ts`) → **Resend** (dominio `bsop.io`, mismo canal que el resto de los correos).

### Fuera del v1 (requieren setup o son imposibles server-side)

- **✅ Pendientes (Apple Reminders)** — Apple NO tiene API en la nube (EventKit es local-only). No puede salir de la Mac. Decisión de Beto: **fuera del v1**. Opción futura: migrar esos pendientes a `erp.tasks` (sí tiene API).
- **🎂 Cumpleaños (Calendar) · 📧 Correo (Gmail)** — requieren un **service account de Google** (domain-wide delegation) para leer sin OAuth personal que caduque. Decisión de Beto: **fase 2**.

## Riesgos

- **Costo de web search** — la tool de Anthropic cobra por búsqueda aparte del token-pricing; el costo en tokens sí queda en `core.ai_invocaciones`, el de búsqueda no. Es 1 corrida/día con tope `WEB_SEARCH_MAX_USES=8` → costo acotado.
- **Calidad de transcripción de salud** — los números van como bloque autoritativo y el modelo los transcribe; mitigado con instrucción explícita "no recalcules". Si se detecta drift, pasar a render determinista de la tabla en TS.
- **Límite de filas (>1000) en la lectura de salud** — 45d de etapas de sueño podrían acercarse; si pega, paginar con `.range()`. Monitorear.
- **DST** — cubierto con el patrón de 2 horas UTC + guard de hora local (igual que `dilesa-resumen-consejo`).

## Métricas de éxito

- El correo llega 7/7 días sin intervención de Beto ni de su Mac.
- Cero corridas atoradas por tokens caducados (no hay OAuth personal en el camino).
- La sección de salud cuadra con el dashboard de `/health`.

## Sprints

- **S1 (v1) — DONE (#1109):** `lib/ai/runGenerateText` + web search; `lib/briefing/{health,prompt,build,markdown,email,fecha}`; cron route; `vercel.json`. Salud + FX/noticias/IA/péptidos + Resend.
- **S2 — Google service account — DONE (este PR):** Gmail (resumen de correo) + Calendar (cumpleaños + agenda) vía SA con DWD, solo lectura. Reincorpora §3 y §7 del SKILL.
- **S3 — Reminders:** decidir migración a `erp.tasks` vs dejar fuera. Persistencia opcional del `.md` (tabla `core.briefings` o storage) para comparación semanal.

## Bitácora

- **2026-06-27** — v1 construido y en prod (#1109). Capa `lib/ai`: nueva modalidad `generacion-texto` + `usoId` `daily-briefing` + `runGenerateText(webSearchMaxUses)`. Módulos `lib/briefing/*` (salud reusa helpers vetados; convertidor md→HTML propio; prompt derivado del SKILL.md). Cron `/api/cron/daily-briefing` (`0 12,13 * * *`, guard 7am Matamoros). Smoke e2e OK (correo real enviado).
- **2026-06-27** — Fase 2 (S2): Gmail + Calendar. GCP proyecto `bsop-470900`, APIs habilitadas, SA `briefing-reader@…` con DWD (scopes `gmail.readonly` + `calendar.readonly`), llave en Vercel `GOOGLE_SA_KEY` + 1Password `GOOGLE_SA_BRIEFING`. `lib/briefing/google.ts` (auth JWT-bearer puro Node, sin dependencia; lectura fail-open). Prompt reincorpora Cumpleaños (§3) y Correo (§7); solo Reminders queda fuera. Smoke e2e OK (3 cumpleaños + 12 correos leídos, correo enviado).

## Decisiones registradas

- **2026-06-27 — Vercel Cron, no GitHub Actions ni Supabase pg_cron.** Mismo patrón ya probado 5× en el repo (incluye el correo diario al Consejo). GitHub Actions: scheduler impuntual + mezclaría correos con CI. Supabase pg_cron: solo valdría si el briefing fuera SQL puro sin render de email.
- **2026-06-27 — Salud reusa helpers de `lib/health`, sin migración.** Las queries del SKILL son CTEs no expresables por supabase-js; en vez de una RPC nueva (migración + regen + Docker) se reusa `groupDailySleep`/`summarizeDailyWindow` (misma lógica vetada). Si el volumen de filas obliga, se evalúa RPC en fase posterior.
- **2026-06-27 — Números de salud autoritativos en el prompt.** El modelo transcribe, no recalcula (regla "no inventar datos de salud" del SKILL). Si hay drift, migrar a render determinista de la tabla.
- **2026-06-27 — Reminders fuera del v1; Gmail/Calendar a fase 2.** Decisión de Beto. Reminders no tiene API en nube; Gmail/Calendar esperan service account de Google.
- **2026-06-27 — Auth de Google con JWT-bearer puro Node (sin `googleapis`).** El SA firma un JWT con `node:crypto` y lo intercambia por access token impersonando a beto@anorte.com. Evita meter la dependencia pesada `googleapis`/`google-auth-library` al bundle por 2 endpoints REST. Llave en Vercel (sensitive, no `vercel env pull`) + respaldo 1Password.

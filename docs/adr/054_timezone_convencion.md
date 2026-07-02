# ADR-054 — Convención de timezone: "hoy" es Matamoros, no UTC

- **Estado:** aceptado
- **Fecha:** 2026-07-01
- **Iniciativa:** `fechas-tz`
- **Detonante:** el 30-jun-2026 a las 20:00 (CDT) el resumen al consejo salió
  con las ventas acumuladas del mes en cero — el corte de mes se calculaba con
  el calendario UTC, que a esa hora ya iba en julio ([#1165]). El barrido
  encontró 70 ocurrencias del mismo antipatrón ([#1166]).

## Contexto

La operación vive en `America/Matamoros` (frontera: CST UTC-6 en invierno,
CDT UTC-5 en verano, siguiendo el DST de EE.UU.). Los servidores (Vercel) y
Postgres (Supabase) corren en UTC. Entre las ~18:00/19:00 locales y la
medianoche, **el día/mes UTC ya es el siguiente** — exactamente la franja de
más captura y de los reportes nocturnos.

`Date.prototype.toISOString()` devuelve UTC **también en el navegador**: un
default de formulario `new Date().toISOString().slice(0, 10)` muestra "mañana"
a un operador capturando de noche, sin importar la TZ de su máquina.

## Decisión

1. **Fecha calendario de negocio = `America/Matamoros` (DST real).**
   - **TypeScript:** helpers de [`lib/fecha-mx.ts`](../../lib/fecha-mx.ts):
     `hoyISOMatamoros()` ("hoy"), `fechaISOMatamoros(d)` (instante → fecha
     local), `inicioMesMatamoros(d)` (corte de mes), `sumarDiasISO` /
     `restarMesesISO` (aritmética de calendario pura sobre strings
     `YYYY-MM-DD`, sin pasar por `toISOString`).
   - **SQL:** `(ts AT TIME ZONE 'America/Matamoros')::date` para derivar fecha
     local de un `timestamptz`. **No usar `CURRENT_DATE`** como "hoy" de
     negocio en defaults/funciones — es el día UTC.
2. **Instantes = `timestamptz` UTC, siempre.** `created_at`, `updated_at`,
   `synced_at`, ventanas de sync, tokens: `new Date().toISOString()` completo
   es correcto y NO está restringido. La regla es sobre el **recorte a
   calendario**, no sobre ISO strings.
3. **Offset fijo `Etc/GMT+6` SOLO donde el dominio lo define** (excepciones
   documentadas, no default):
   - **Playtomic (RDB):** Playtomic Manager exporta el CSV en UTC-6 fijo y el
     club opera así (`parsePlaytomicDate`, `playtomic-sync`).
   - **Hold-cola DILESA:** plazos operativos en UTC-6 estable para que un hold
     no cambie de vencimiento al cruzar DST (razonado en
     `lib/dilesa/hold-cola.ts`).
   - Residual conocido: 1 hora de tensión (23:00-24:00 locales en verano)
     entre datos Playtomic UTC-6 fijo y vistas SQL con `America/Matamoros`.
     Aceptado; el corte operativo de RDB lo da el **corte de caja abierto**,
     no la fecha calendario.
4. **Crons Vercel** (UTC, sin DST): patrón **dos-horas-UTC candidatas + guard
   de hora local** (`relojMatamoros`), como `dilesa-resumen-consejo` y
   `daily-briefing`. Un cron que corre lejos de medianoche local (p.ej.
   encuestas a las ~10:00) no necesita doble hora, pero sí deriva "hoy" con
   `hoyISOMatamoros()`.
5. **Enforcement:** guard `no-restricted-syntax` en `eslint.config.mjs`
   prohíbe `new Date().toISOString().slice(...)/.split('T')` en `app/**`,
   `lib/**`, `components/**` (tests excluidos).

## Consecuencias

- El "hoy" de un formulario y el "hoy" de un cron nocturno coinciden con el
  calendario del operador, todo el año.
- Ingesta externa intacta: Waitry entrega `{date, timezone}` y el trigger
  `rdb.process_waitry_inbound` lo convierte a UTC — instantes, no fechas.
- Los defaults `DEFAULT CURRENT_DATE` existentes en columnas `date` de `erp` /
  `dilesa.construccion` quedan como deuda registrada en la iniciativa
  `fechas-tz` (S4b): migrarlos a
  `(now() AT TIME ZONE 'America/Matamoros')::date` toca tablas financieras →
  gate `finanzas-ok`.
- Display client-side (`toLocaleDateString` sin `timeZone`) se corrige
  oportunista; no es parte del guard.

[#1165]: https://github.com/beto-sudo/BSOP/pull/1165
[#1166]: https://github.com/beto-sudo/BSOP/pull/1166

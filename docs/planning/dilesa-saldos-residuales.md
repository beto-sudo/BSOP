# Iniciativa — Resolución de saldos residuales en dictaminación (DILESA)

**Slug:** `dilesa-saldos-residuales`
**Empresas:** DILESA
**Schemas afectados:** `dilesa.ventas` — **campos nuevos de resolución del saldo residual** (tipo `cobrar`|`absorber`, monto, autorizado_por, fecha). Motor `lib/dilesa/cuadratura.ts` (exponer el residual de **precio** como saldo accionable — hoy solo el de **gastos** lo es vía `coberturaGastos.pagareNecesario`) + gate de resolución en `app/dilesa/ventas/[id]/capturar/8-dictaminada/page.tsx` (reusa `<CreditoDirectoCaptura>` para el camino pagaré) + `components/dilesa/cuadratura-panel.tsx` (muestra la resolución en vez de la nota suave) + reconciliación de la NC en `app/api/dilesa/ventas/[ventaId]/cerrar-fase13`. La nota de crédito se mantiene **derivada** (Facturado − Valor Real). Addendum a [ADR-048](../adr/048_cierre_financiero_dictaminacion.md). Sin backfill de cerradas.
**Estado:** proposed
**Próximo hito:** Beto da luz verde a ejecutar → Sprint 1 (motor: saldo residual de precio accionable + gate de resolución «siempre explícito» en fase 8). Opcional antes: dimensionar en prod cuántas activas traen residual hoy.
**Dueño:** Beto
**Creada:** 2026-06-25
**Última actualización:** 2026-06-25 (promovida — alcance v1 cerrado con las 3 decisiones de forma; pendiente luz verde de Beto para ejecutar)

> Detonante operativo: la venta **JUAN ANTONIO HERNANDEZ MUÑOZ** (M3-L9-LDLE, Infonavit Tradicional) — el precio (920,000) lo cubren crédito (762,265) + enganche (156,943), dejando **$792 de saldo de precio** que DILESA absorbe otorgando una nota de crédito. Beto: en la dictaminación debe haber un campo para **cuadrar** ese residual — si no lo va a pagar el cliente (pagaré), se mete como nota de crédito para que Ale cuadre y avance la fase, y ese monto se considere en la NC que se otorga al facturar.

## Problema

El cierre financiero de la fase 8 (dictaminación, [ADR-048](../adr/048_cierre_financiero_dictaminacion.md)) ya resuelve **un** saldo: el faltante de **gastos notariales** (`coberturaGastos.pagareNecesario`), que dispara la captura de crédito directo (pagaré) y bloquea el cierre hasta que esté configurado + el pagaré firmado subido. Pero hay un segundo residual que **no** tiene tratamiento:

- **El saldo de _precio_** (`saldoPrecioPorCubrir` en [`cuadratura.ts`](../../lib/dilesa/cuadratura.ts)) — lo que el crédito + el enganche no alcanzan a cubrir del precio de escrituración. Hoy se pinta como un "Saldo por cubrir" ámbar en `cuadratura-panel.tsx` con la nota suave _"si no lo completa antes de escriturar, lo absorbe el bono de DILESA"_, pero **no tiene decisión explícita, ni gate, ni captura**. Ale no tiene dónde cuadrarlo: solo avanza con la nota informativa.

Dos consecuencias:

1. **No hay decisión explícita ni rastro.** El sistema no distingue _"el cliente todavía lo debe (por cobrar)"_ de _"DILESA lo absorbió (nota de crédito)"_ — las dos hoy se ven idénticas (descuento real). Es una distinción contable real que nadie está registrando.
2. **El cierre no obliga a cuadrar el residual.** Como el gate solo mira el saldo de gastos, una venta con residual de **precio** (como JUAN ANTONIO, $792) avanza sin que Dirección decida conscientemente qué pasa con ese dinero.

**Importante — no falta aritmética, falta gobierno.** El monto absorbido **ya cae solo en la NC derivada**: `NC = Facturado − Valor Real`, y el Valor Real solo cuenta el efectivo que sí entró (crédito + enganche), así que el faltante absorbido ya infla el descuento real → y por ende la NC. Lo que falta es la **decisión explícita + su cuadre + el rastro**, no recalcular la NC.

## Decisiones de forma (cerradas con Beto, 2026-06-25)

Tres forks resueltos antes de promover:

1. **Monto de la NC → derivada + reconciliación.** La NC se sigue calculando sola (`Facturado − Valor Real`, que ya incluye lo absorbido). El campo de dictaminación solo **autoriza/registra** la absorción; **F13 valida** que cuadre con el CFDI de NC real. Una sola fuente de verdad, menos riesgo de descuadre. (Se descartó capturar el monto a mano.)
2. **Cuándo bloquea → siempre explícito.** Todo residual real (por encima del ruido de redondeo) obliga a Dirección a elegir **Cobrar** o **Absorber** antes de cerrar la fase 8. Anclado a la tolerancia que ya maneja el motor (~$5, `TOLERANCIA_SALDO`) como piso, para no trabar ventas por centavos de redondeo.
3. **Camino "el cliente paga" → pagaré formal.** Se reusa la captura de crédito directo (`<CreditoDirectoCaptura>`, pagaré con plan de pagos y tasas) también para el saldo de **precio**, no solo el de gastos. (Se descartó la vía CxC simple para esta versión.)

## Outcome esperado

En la fase 8, cuando quede saldo residual de precio, Dirección lo **resuelve explícitamente**: **Cobrar** (→ crédito directo / pagaré) o **Absorber** (→ nota de crédito autorizada, con quién/cuándo/monto). Eso cuadra la operación, deja rastro auditable, y formaliza el monto para que la NC de facturación (F13) lo honre y reconcilie. Se acaba la nota suave "lo absorbe el bono" sin decisión detrás.

## Alcance

**Sprint 1 — Motor + gate (núcleo).**

- Motor (`lib/dilesa/cuadratura.ts`): exponer el residual de precio como **saldo accionable** que el gate y el panel leen (paralelo a `pagareNecesario` para gastos). Tests.
- Fase 8 (`8-dictaminada/page.tsx`): control de Dirección _"Resolver saldo de $X"_ con dos vías (Cobrar / Absorber); el camino Cobrar extiende `<CreditoDirectoCaptura>` para que se dispare también con el saldo de precio. Gate "siempre explícito": residual > tolerancia ⇒ no deja "Cuadrar y cerrar fase" hasta resolverlo.
- Panel (`cuadratura-panel.tsx`): mostrar la resolución (_"Absorbido · NC autorizada por Dirección"_ / _"Por cobrar · pagaré"_) en vez de la nota suave.

**Sprint 2 — Persistencia + reconciliación en F13.**

- Schema: campos de resolución en `dilesa.ventas` (`saldo_residual_tipo` `cobrar`|`absorber`, `saldo_residual_monto`, `saldo_residual_autorizado_por`, `saldo_residual_fecha`), auditable. **Migración que aplica Beto** (toca finanzas/prod — no va en modo autónomo).
- F13 (`cerrar-fase13`): el check de NC existente reconcilia contra la absorción autorizada en fase 8 (que el CFDI de NC ≥ lo absorbido + lo derivado).
- Addendum a [ADR-048](../adr/048_cierre_financiero_dictaminacion.md) documentando la resolución del residual de precio.

**Fuera de alcance (v1):** backfill de ventas cerradas (el residual histórico ya cae en el descuento real, no se reabre); la vía CxC simple para el cobro (se usa pagaré formal).

## Riesgos

- **Modelo financiero sensible.** Toca la fase 8 (cierre) y la NC que valida Michelle. Cualquier cambio al motor exige verificación contra las activas que hoy cuadran antes de mergear.
- **Gate más estricto ("siempre explícito").** Podría trabar a Ale en residuales de centavos si no se ancla bien la tolerancia — mitigado usando el `TOLERANCIA_SALDO` (~$5) ya existente como piso.
- **Migración de prod (finanzas).** Los campos de resolución los aplica Beto con OK explícito; el código se construye y la migración queda como archivo (patrón `feedback_autonomous_prod_migrations`).
- **No romper el camino de gastos.** El gate de gastos (`pagareNecesario`) ya existe y funciona; el residual de precio se suma como segunda condición sin tocar la primera.

## Métricas de éxito

- 0 ventas que cierran la fase 8 con saldo residual de precio sin resolución explícita.
- Cada absorción queda con rastro (tipo, monto, autorizado_por, fecha) y reconcilia con la NC de F13.
- Las ventas que hoy cuadran siguen cuadrando (el residual de gastos intacto).
- Ale puede cuadrar y avanzar el caso JUAN ANTONIO (y similares) sin la nota suave.

## Bitácora

- **2026-06-25** — Promovida. Detonante: caso JUAN ANTONIO HERNANDEZ (M3-L9-LDLE, $792 de saldo de precio absorbido por bono). Diagnóstico: el cierre de fase 8 (ADR-048) solo gatea el residual de **gastos** (`pagareNecesario`), no el de **precio** (`saldoPrecioPorCubrir`), que hoy solo se muestra como nota suave. Cerradas las 3 decisiones de forma con Beto (NC derivada + reconciliación · siempre explícito · pagaré formal). Pendiente: luz verde de Beto para ejecutar; opcional dimensionar en prod cuántas activas traen residual.

## Decisiones registradas

- **2026-06-25 — La NC se mantiene derivada (`Facturado − Valor Real`), no se captura a mano.** El campo de dictaminación autoriza/registra la absorción; F13 reconcilia contra el CFDI de NC real. Razón: el monto absorbido ya cae en el descuento real → la NC derivada ya lo incluye; capturarlo a mano duplicaría la verdad y abriría descuadres.
- **2026-06-25 — Gate "siempre explícito" anclado a `TOLERANCIA_SALDO` (~$5).** Todo residual de precio por encima del ruido de redondeo obliga a Dirección a elegir Cobrar o Absorber antes de cerrar la fase 8. No hay umbral de auto-absorción silenciosa (se descartó el gate con tolerancia de $2,000): Beto quiere que ningún monto real se absorba sin decisión.
- **2026-06-25 — El cobro del residual de precio reusa el crédito directo (pagaré formal)**, no una vía CxC simple. Misma maquinaria que el residual de gastos (`<CreditoDirectoCaptura>`), extendida para dispararse también con el saldo de precio.

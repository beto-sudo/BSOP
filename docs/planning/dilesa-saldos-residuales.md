# Iniciativa — Resolución de saldos residuales en dictaminación (DILESA)

**Slug:** `dilesa-saldos-residuales`
**Empresas:** DILESA
**Schemas afectados:** `dilesa.ventas` — **campos nuevos de resolución del saldo residual** (tipo `cobrar`|`absorber`, monto, autorizado*por, fecha). Motor `lib/dilesa/cuadratura.ts` (exponer el residual de **precio** como saldo accionable — hoy solo el de **gastos** lo es vía `coberturaGastos.pagareNecesario`) + gate de resolución en `app/dilesa/ventas/[id]/capturar/8-dictaminada/page.tsx` (reusa `<CreditoDirectoCaptura>` para el camino pagaré) + `components/dilesa/cuadratura-panel.tsx` (muestra la resolución en vez de la nota suave) + reconciliación de la NC en `app/api/dilesa/ventas/[ventaId]/cerrar-fase13`. La nota de crédito se mantiene **derivada** (Facturado − Valor Real). Addendum a [ADR-048](../adr/048_cierre_financiero_dictaminacion.md). Sin backfill de cerradas.
**Estado:** in_progress
**Próximo hito:** Sprint 3 — gobierno del faltante de GASTOS (gemelo del de precio): motor `requiereResolucionSaldoGastos` + migración `saldo_gastos*\*` + control de Dirección + label del panel. PR sin auto-merge; la migración la aplica Beto.
**Dueño:** Beto
**Creada:** 2026-06-25
**Última actualización:** 2026-06-30 (REABIERTA — Sprint 3: el faltante de GASTOS solo tenía el camino "pagaré" forzado y ninguna opción de absorber → deadlock; en el panel el residual sin sobreprecio capturado se pintaba como "sobreprecio" y "Cuadra ✓" en falso. Análisis multi-agente + Codex confirmó: la aritmética ya es correcta, falta el gobierno. Construido; migración pendiente de aplicar por Beto)

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

**Sprint 1 — Motor + schema + gate + UI (núcleo) ✅ entregado (PR sin auto-merge).**

- Motor (`lib/dilesa/cuadratura.ts`): expone `requiereResolucionSaldoResidual` (= hay desglose y `saldoPrecioPorCubrir` > `TOLERANCIA_SALDO`); señal pura, sin tocar cálculos. Tests.
- Schema (migración `20260625204005`): 4 columnas nullable en `dilesa.ventas` (`saldo_residual_resolucion` `cobrar`|`absorber`, `_monto`, `_autorizado_por`, `_at`). **La aplica Beto** (toca prod — `db push` con OK explícito).
- Fase 8 (`8-dictaminada/page.tsx`): control de Dirección _"Resolver saldo del cliente"_ con dos vías (Absorber con NC / Cobrar con pagaré); persiste la decisión. Gate "siempre explícito": residual > tolerancia ⇒ no deja cerrar hasta resolverlo. En ambos forms (cierre y "ya cerrada").
- Panel (`cuadratura-panel.tsx`): muestra la resolución (_"Absorbido por DILESA (NC)"_ / _"Por cobrar (pagaré)"_) en vez de la nota suave; cableado en la pestaña Cuadratura del expediente.

**Sprint 2 — Reconciliación en F13 + pagaré formal del residual de precio.**

- F13 (`cerrar-fase13`): el check de NC reconcilia contra la absorción autorizada en fase 8 (que el CFDI de NC ≥ lo absorbido + lo derivado).
- **Pagaré formal para el residual de _precio_** (camino "Cobrar"): reusar `<CreditoDirectoCaptura>` con la asignación correcta gastos↔precio en el motor (separada de S1 para no rushear sobre la cuadratura que ya cuadra).
- Addendum a [ADR-048](../adr/048_cierre_financiero_dictaminacion.md) documentando la resolución del residual de precio.

**Sprint 3 — Gobierno del faltante de GASTOS (gemelo del de precio).**

El residual de **precio** quedó gobernado en S1/S2, pero el faltante de **gastos**
(`coberturaGastos.pagareNecesario`) seguía con dos defectos: (a) en el cierre de fase 8
solo existía el camino **pagaré forzado** (`pagareNecesario > 0 ⇒ exige crédito directo`)
y **ninguna opción de absorber** → si Dirección quería que DILESA lo absorbiera (Máxima
Aportación), la fase quedaba en **deadlock**; (b) en el panel, cuando no hay sobreprecio
capturado, el motor parte el faltante como `sobreprecioCobertura` (sobreprecio **fantasma**)
y la card decía **"Cuadra ✓ $0"** escondiendo un hueco real (caso José Cruz M3-L8: $8,230).

Una revisión multi-agente + Codex confirmó que **la aritmética ya es correcta** (`valorReal`/
NC/comisión no dependen del split; el monto absorbido ya cae en la NC derivada vía el cheque
a notaría) — **falta el gobierno + el label**, no recalcular. Alcance:

- Motor (`cuadratura.ts`): expone `requiereResolucionSaldoGastos` (= hay desglose y
  `pagareNecesario` > `TOLERANCIA_SALDO`); **señal pura, cero aritmética nueva**. Tests
  (Arizpe/MAYRA/José Cruz/Juan Antonio + camino "depositar"). Corrige un comentario falso
  (`sobreprecioCobertura ≤ sobreprecioGastos`, que Arizpe desmiente).
- Schema (migración `20260630224829`): 4 columnas nullable `saldo_gastos_*` (gemelas de
  `saldo_residual_*`). **La aplica Beto** (toca prod). PR **sin auto-merge** (el código rompe
  en prod sin las columnas).
- Fase 8 (`8-dictaminada/page.tsx`): control «Resolver saldo de gastos» (Absorber = Máxima
  Aportación / Cobrar = pagaré; el depósito del cliente baja `pagareNecesario` solo) + **gate
  reescrito, no agregado**: «absorber» satisface el cierre (mata el deadlock), «cobrar» exige
  el pagaré, y todo faltante > tolerancia obliga a decisión explícita.
- Panel (`cuadratura-panel.tsx`): la card de cobertura deja de pintar el residual sin
  sobreprecio capturado como "sobreprecio"/"Cuadra ✓"; muestra la resolución o el saldo a
  resolver. **No toca `saldoCobertura`/`operacionCubierta`** (que gobiernan gates 9-16).

**Fuera de alcance (v1):** backfill de ventas cerradas (el residual histórico ya cae en el descuento real, no se reabre); la vía CxC simple para el cobro (se usa pagaré formal). **(Sprint 3):** no se altera ninguna aritmética del motor (`partirDescuento`, `descuentoAplicado`, `valorReal`, NC, comisión intactos); no se reusan las columnas `saldo_residual_*` (una venta puede tener residual de precio Y de gastos a la vez); sin backfill de cerradas (solo cambia display si se abre el expediente).

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
- **2026-06-25 (Sprint 1 — motor + gate + UI)** — **[PR #1040](https://github.com/beto-sudo/BSOP/pull/1040):** Implementado el núcleo: (1) **motor** ([`cuadratura.ts`](../../lib/dilesa/cuadratura.ts)) expone `requiereResolucionSaldoResidual` (= hay desglose y `saldoPrecioPorCubrir` > `TOLERANCIA_SALDO`); señal pura, sin tocar ningún cálculo existente. (2) **Migración aditiva** `20260625204005` — 4 columnas nullable en `dilesa.ventas` (`saldo_residual_resolucion` cobrar|absorber, `_monto`, `_autorizado_por`, `_at`). (3) **Fase 8** ([`8-dictaminada/page.tsx`](../../app/dilesa/ventas/[id]/capturar/8-dictaminada/page.tsx)) gana el control de Dirección «Resolver saldo del cliente» (**Absorber con NC** / **Cobrar con pagaré**, persiste decisión + monto + autorizado*por + at) + **gate «siempre explícito»**: no cierra la dictaminación con residual sin resolver; en ambos forms (cierre y "ya cerrada"). (4) **Panel** ([`cuadratura-panel.tsx`](../../components/dilesa/cuadratura-panel.tsx)) muestra la resolución (\_Absorbido por DILESA (NC)* / _Por cobrar (pagaré)_) en vez de la nota suave; cableado en la pestaña Cuadratura del expediente. La **NC sigue derivada** (sin cambios de aritmética). 6/6 checks de CI verdes locales (2069 tests; +3 asserts del flag: Juan Antonio 792 → true, Ruben 1 → false, MAYRA 0 → false). **La migración NO está aplicada a prod** (el código rompe en prod sin las columnas → PR **sin auto-merge**, pendiente OK de Beto para `db push` + revisión del Preview). **Decisión de alcance de S1:** "Cobrar" registra la decisión (rastro + gate); el **pagaré formal** con monto/plan/tasas para un residual de **precio** queda para S2, porque reusar `<CreditoDirectoCaptura>` tal cual conflictúa con la asignación gastos↔precio del motor — no se rushea sobre la cuadratura que ya cuadra. Sigue: aplicar migración + Sprint 2 (reconciliación de la NC en F13 + addendum a ADR-048).
- **2026-06-25 (S1 en prod)** — [PR #1040](https://github.com/beto-sudo/BSOP/pull/1040) **mergeado** (CI 5/5 verde). Beto dio OK para aplicar + mergear. La migración `20260625204005` se aplicó a prod **vía MCP** (el `db push` se atoraba por drift heredado de otras sesiones: huérfanos remotos `203023`/`210939`); **ledger reconciliado 1:1** en la misma sesión (`repair applied 20260625204005` + `reverted 20260625211829`, el huérfano que generó el MCP). Las 4 columnas viven en `dilesa.ventas`; `SCHEMA_REF` + `types/supabase.ts` regenerados desde prod y en sync. El control «Resolver saldo del cliente» + el gate ya operan en la dictaminación. Sigue: Sprint 2.
- **2026-06-25 (Sprint 2 — pagaré del residual + reconciliación F13 + ADR addendum)** — [PR #1044](https://github.com/beto-sudo/BSOP/pull/1044) **mergeado** (código verde, 2070 tests). (1) **Motor** ([`cuadratura.ts`](../../lib/dilesa/cuadratura.ts)): el pagaré se asigna **gastos-primero** (`pagareAGastos = min(pagaré, pagareNecesario)`, el resto `pagarePrecio`). Un pagaré tomado para el residual de precio (camino "Cobrar") ya no sobre-fondea los gastos; eleva el Valor Real y **baja la NC** en ese monto. Ventas existentes idénticas (verificado: 45 tests previos intactos + 1 nuevo, Juan Antonio cobrando $792 → NC 13,361 → 12,569). (2) **Fase 8**: al elegir "Cobrar" aparece la captura del crédito directo cubriendo el total (gastos + precio); el gate exige el pagaré configurado + firmado para cerrar. Botoneras reordenadas antes de la captura. (3) **F13** ([`cerrar-fase13`](../../app/api/dilesa/ventas/[ventaId]/cerrar-fase13/route.ts)): si Dirección **absorbió**, la NC del CFDI debe cubrir la requerida por la cuadratura (que ya incluye lo absorbido); si queda corta, no cierra sin override de Dirección; rastro en `audit_log`. Acotado a ventas con absorción. (4) **Addendum a [ADR-048](../adr/048_cierre_financiero_dictaminacion.md)** (A1–A4). **Sin migración** (S2 es solo código). **Drift heredado resuelto**: prod tenía la columna `estimacion_id` de [PR #1043](https://github.com/beto-sudo/BSOP/pull/1043) (otra sesión, estimaciones→CxP) sin mergear → `schema:check` rojo. Per la regla `reference_ci_schema_check_prod` **no se absorbe schema ajeno**: #1043 estaba verde y sin review requerido → se aterrizó primero, rebase de #1044 → `schema:check` verde → **#1044 mergeado** (CI 3m3s). **S1 + S2 en prod — alcance v1 completo.**

- **2026-06-30 (Sprint 3 — gobierno del faltante de gastos)** — **REABIERTA.** Detonante: ventas reclasificadas productos↔sobreprecio (José Cruz M3-L8, Christopher M3-L16) dejaron ver que, sin sobreprecio capturado, el panel pinta el faltante de gastos como "sobreprecio" y dice "Cuadra ✓" en falso; y la fase 8 solo ofrecía pagaré (sin "absorber") → deadlock. **Análisis multi-agente (5 mapeadores → diseño → 3 verificadores adversariales) + revisión independiente de Codex (gpt-5.5):** veredicto NO-GO al SPEC grande (12 archivos/migración/gates que **re-rompían** invariantes vivos de `dilesa-descuento-perdonado-motor` — deadlock fase 8, doble conteo NC F13) y GO al cambio chico de **gobierno + label**. El número ya existe (`pagareNecesario`); la aritmética ya neutraliza el P&L. Construido: motor `requiereResolucionSaldoGastos` (señal pura) + migración `20260630224829` (`saldo_gastos_*`) + control fase 8 (absorber/cobrar, gate reescrito anti-deadlock) + label del panel. **6 checks de CI verdes locales** (typecheck + 2232 tests, +5 asserts nuevos: Arizpe/MAYRA/José Cruz `requiereResolucionSaldoGastos=true`, Juan Antonio `false`, camino "depositar" apaga el flag). **Migración NO aplicada a prod** → PR **sin auto-merge** (pendiente OK de Beto para `db push` + Preview). Sigue: aplicar migración + addendum a ADR-048 (resolución del residual de gastos).

## Decisiones registradas

- **2026-06-30 (S3) — No tocar la aritmética del motor; solo gobierno + label.** La revisión adversarial + Codex confirmó que `valorReal`/NC/comisión ya reflejan el desenlace correcto (lo absorbido cae en la NC derivada vía el cheque a notaría; un pagaré/depósito real ya sube el valor real). Recomponer `descuentoAplicado` o crear un `saldoGastosResidual` nuevo **reintroducía** el "descuento perdonado" fantasma que `dilesa-descuento-perdonado-motor` ya mató. El saldo de gastos **es** `pagareNecesario` (ya calculado); solo se expone como señal de gobierno.
- **2026-06-30 (S3) — Gate reescrito, no agregado (anti-deadlock).** El gate de fase 8 ya exigía pagaré por `pagareNecesario > 0`; agregar un segundo gate "resolución" encima dejaba "absorber" sin salida (el viejo seguía pidiendo pagaré). Se reescribió: `pagareNecesario` solo exige pagaré cuando la resolución **no** es `absorber`; «absorber» (Máxima Aportación) cierra sin pagaré; el depósito del cliente baja `pagareNecesario` solo.
- **2026-06-30 (S3) — Columnas `saldo_gastos_*` nuevas, no reusar `saldo_residual_*`.** Una venta puede tener residual de precio Y faltante de gastos a la vez; mezclarlos rompería la auditoría y la reconciliación de F13.
- **2026-06-25 — La NC se mantiene derivada (`Facturado − Valor Real`), no se captura a mano.** El campo de dictaminación autoriza/registra la absorción; F13 reconcilia contra el CFDI de NC real. Razón: el monto absorbido ya cae en el descuento real → la NC derivada ya lo incluye; capturarlo a mano duplicaría la verdad y abriría descuadres.
- **2026-06-25 — Gate "siempre explícito" anclado a `TOLERANCIA_SALDO` (~$5).** Todo residual de precio por encima del ruido de redondeo obliga a Dirección a elegir Cobrar o Absorber antes de cerrar la fase 8. No hay umbral de auto-absorción silenciosa (se descartó el gate con tolerancia de $2,000): Beto quiere que ningún monto real se absorba sin decisión.
- **2026-06-25 — El cobro del residual de precio reusa el crédito directo (pagaré formal)**, no una vía CxC simple. Misma maquinaria que el residual de gastos (`<CreditoDirectoCaptura>`), extendida para dispararse también con el saldo de precio.

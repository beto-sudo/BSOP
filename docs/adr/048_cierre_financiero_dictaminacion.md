# ADR-048 — Cierre financiero en la dictaminación: cuadratura + pagaré + re-firma de documentos

- **Status**: Accepted
- **Date**: 2026-06-23
- **Authors**: Beto, Claude Code
- **Iniciativa**: [`dilesa-cuadratura-sobreprecio`](../planning/dilesa-cuadratura-sobreprecio.md)
- **Companion to**: [ADR-045](045_cuadratura_desglose_gastos_escrituracion.md) (modelo de cuadratura); motor `lib/dilesa/cuadratura.ts`

---

## Contexto

El proceso de venta DILESA cuadra los números en fases separadas: la **cuadratura** vive en un tab del expediente (cualquier fase) y el **pagaré / crédito directo** se captura en la **fase 10 (Firmas Programadas)** con un saldo **estimado**. Pero el saldo exacto que define el pagaré solo se conoce en la **fase 8 (Dictaminada)**, cuando el notario entrega el **Anexo B** con los gastos notariales reales y el crédito exacto. Capturar el pagaré antes, con estimado, descuadra; y si los datos reales obligan a **ajustar el precio**, los documentos ya firmados (Solicitud de Asignación, Promesa de Compraventa) quedan obsoletos sin mecanismo de re-firma.

Flujo de fases (no cambia): `… 7 Solicitud Dictamen → 8 Dictaminada → 9 Validación Patronal → 10 Firmas Programadas → 11 Escriturada …` (17 fases, def en `lib/dilesa/captura/marcar-fase.ts`).

## Decisión

**D1 — La dictaminación (fase 8) es el punto de cierre financiero.** Concentra la **cuadratura completa** + el **pagaré / crédito directo**, porque ahí ya se tienen los datos exactos del crédito y de los gastos notariales (del Anexo B). El pagaré deja de capturarse en la fase 10.

**D2 — Separación de roles en la fase 8.** Gerencia de Ventas (o el notario vía magic link) **sube el dictamen** (Carta de Instrucción + Anexo B) y la IA **pre-llena** gastos y datos del crédito. **Dirección** revisa, ajusta lo necesario para cuadrar, define el pagaré y **cierra/avanza** la fase. Solo Dirección guarda y avanza (gate `EffectiveUser.direccionEmpresaIds` O admin).

**D3 — El magic link del notario ya no avanza la fase.** Sube el dictamen como adjunto; el avance lo hace Dirección al cuadrar. (Quita el UPDATE de `fase_posicion` en `app/api/dilesa/notario/dictamen/[token]/route.ts`.)

**D4 — No se mueven fases.** La fase 9 (Validación Patronal, cuyo tiempo se mide) y la fase 10 (Firmas Programadas: fecha/hora + **póliza de garantía**, que se programa e imprime ahí porque depende de la fecha de firma) se mantienen. Solo se mueve la **captura** del pagaré (de la 10 a la 8). Catálogo de fases, numeración y candados de escrituración intactos — esto reduce el riesgo (no toca el histórico de las ~1,300 ventas).

**D5 — Cambio de precio en la dictaminación ⇒ re-firma obligatoria.** Si Dirección ajusta el precio, el sistema **exige los 2 documentos nuevos firmados** (Solicitud de Asignación + Promesa de Compraventa) antes de permitir avanzar la fase 8: los PDF se **regeneran con el precio vigente** (descargables desde la página del cliente), el vendedor imprime y recaba firma, el gerente sube los escaneados en la misma fase. El documento anterior se marca como **sustituido** — no se borra (auditoría LFPIORPI) pero deja de ser el vigente.

**D6 — La congelación del precio (regla 2026-06-15) cede en la dictaminación.** El precio se congela al asignar para que reglas globales (ZCU, +6%) no re-tarifen ventas viejas; la dictaminación es la **excepción legítima** — ahí llegan los datos reales y Dirección puede ajustar el precio, condicionado a la re-firma de D5. Una sesión futura NO debe tratar este ajuste como violación de la congelación.

**D7 — El pagaré firmado también se recaba en la fase 8 (decisión Beto 2026-06-24).** D1/D4 movieron a la fase 8 la **definición** del pagaré (monto/plan/tasas), pero el **documento firmado** (adjunto rol `pagare`) había quedado como slot opcional en la fase 10 — un cabo suelto. Se **mueve el slot a la fase 8** y se vuelve **obligatorio para cerrar la dictaminación cuando la operación lleva crédito directo** (`coberturaGastos.pagareNecesario > 0`): no se cierra la fase 8 sin el pagaré firmado subido. El slot sale de la fase 10. El adjunto es por rol y vive en el expediente, así que sigue visible en la fase Escriturar; las ventas ya dictaminadas (fase ≥ 8) lo suben desde la vista "fase ya cerrada" de la 8. Razón: el cliente firma el pagaré en la dictaminación, cuando acepta el crédito directo — recabarlo ahí evita cerrar el cierre financiero sin el documento que lo respalda.

## Migración

Las ventas en **fase 10 (pagaré) que aún no programan firmas** se **regresan a la fase 8** (`regresarAFase`, ya existe) para cuadrar ahí, **conservando los documentos ya subidos**. Vuelven a pasar por dictaminación con el flujo nuevo. Las que ya programaron firmas o escrituraron no se tocan.

## Plan de PRs

- **PR A (núcleo):** mover el bloque de pagaré/crédito directo de la fase 10 a la fase 8 + cuadratura completa en la 8 + quitar el avance automático del magic link + gate de Dirección para cerrar la 8. Migración de las activas (regreso a fase 8).
- **PR B (re-firma de documentos):** detección de cambio de precio + exigencia de los 2 docs nuevos + flag `sustituido` en `erp.adjuntos` + impresión de los PDF vigentes desde el detalle del cliente.

## Consecuencias

- El pagaré se captura con el saldo **real**, no estimado → menos descuadres pre-escrituración.
- Dirección controla el cierre financiero (cuadratura + pagaré + precio) en un solo punto.
- Trazabilidad documental: el reemplazo es auditable (sustituido, no borrado).
- La fase 8 se vuelve la página de captura más compleja (dictamen + cuadratura + pagaré + re-firma); la fase 10 se simplifica (solo firma + póliza).
- No hay riesgo al histórico de fases (no se renumera ni se elimina ninguna).

## Alternativas consideradas

- **Eliminar la fase 10 y absorberla en la 8** (planteada primero): descartada — la validación patronal (fase 9) tarda y hay que medirla, y la programación de firmas debe ir **después** de validar con el patrón. Mantener las fases simplifica y evita renumerar.
- **Capturar el pagaré en la 10 con el dato real traído de la 8**: descartada — el cierre financiero (cuadrar y decidir el pagaré) es responsabilidad de Dirección en la dictaminación, no de quien programa firmas.

## Addendum (2026-06-25) — Resolución del saldo residual de PRECIO

- **Iniciativa**: [`dilesa-saldos-residuales`](../planning/dilesa-saldos-residuales.md)

El cierre de la fase 8 (D1) gateaba **un** saldo: el faltante de **gastos notariales** (`coberturaGastos.pagareNecesario` → captura de crédito directo). Quedaba sin tratamiento el residual de **precio** (`saldoPrecioPorCubrir`): lo que el crédito de institución + el enganche no alcanzan a cubrir del precio de escrituración (p.ej. JUAN ANTONIO M3-L9: $792). Se mostraba como nota suave _"lo absorbe el bono"_, sin decisión, gate ni rastro — y el sistema no distinguía _"el cliente lo debe (por cobrar)"_ de _"DILESA lo absorbió (NC)"_.

**A1 — La dictaminación resuelve también el residual de precio, "siempre explícito".** Cuando el residual supera el ruido de redondeo (`TOLERANCIA_SALDO` ~$5), Dirección debe **resolverlo** antes de cerrar la fase 8: **Absorber** (nota de crédito de DILESA) o **Cobrar** (el cliente lo paga con pagaré). Se persiste en `dilesa.ventas` (`saldo_residual_resolucion`/`_monto`/`_autorizado_por`/`_at`).

**A2 — La nota de crédito se mantiene DERIVADA.** El monto absorbido ya cae en `montoNotaCredito = Facturado − Valor Real` (el faltante baja el Valor Real → sube el descuento real → sube la NC). El campo de la fase 8 es **gobierno** (autoriza + deja rastro), no un monto que re-tarifa.

**A3 — El pagaré asigna gastos-primero (motor).** Un solo crédito directo (`monto_credito_directo`) puede cubrir el faltante de gastos **y** el residual de precio. El motor lo asigna: `pagareAGastos = min(pagaré, pagareNecesario)`, el resto `pagarePrecio` financia el precio. Así un pagaré tomado para el precio no sobre-fondea los gastos; eleva el Valor Real y **reduce la NC** (el cliente paga, DILESA no absorbe). En las ventas existentes (pagaré = faltante de gastos) la cuadratura es idéntica.

**A4 — F13 reconcilia la absorción.** Al cerrar la fase 13, si Dirección **absorbió** un residual, la NC del CFDI debe cubrir la requerida por la cuadratura (que ya incluye lo absorbido); si queda corta, no cierra sin autorización de Dirección (mismo override con motivo). Acotado a ventas con absorción — no cambia el flujo de las demás.

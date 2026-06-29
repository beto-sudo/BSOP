# Iniciativa — Cálculo de gastos notariales (DILESA)

**Slug:** `dilesa-gastos-notariales`
**Empresas:** DILESA (única que escritura vivienda; las tarifas son del notario que atiende >90% de la escrituración, pero se aplican a todas las ventas sin discriminar por notario)
**Schemas afectados:** `dilesa` (tablas nuevas `gastos_notariales_config` + `gastos_notariales_tabulador`, RLS empresa-scoped set-membership; Sprint 3 agrega columna `tiene_propiedad` a `dilesa.ventas` para elegir la columna del tabulador). `core` (Sprint 2: módulo RBAC nuevo para la pantalla de configuración, ADR-014). Helper `lib/dilesa/gastos-notariales/` (cálculo puro + carga de config). **Línea roja:** NO toca el motor de cuadratura (`lib/dilesa/cuadratura.ts`) ni `fn_calcular_precio_venta` — solo precarga el campo `dilesa.ventas.gastos_escrituracion` que ya existe, igual que hoy lo hace el análisis IA del PDF.
**Estado:** in_progress
**Próximo hito:** capturar el **valor catastral** (Beto investiga de dónde sale — predial/CLG) para cerrar el residual de la valuación; conseguir tarifas de fraccionamientos futuros + revisar los 7 casos especiales con Memo; Sprint 2 — UI de configuración de tarifas. Rediseño v2 (cotizador oficial, por categoría) en PR.
**Dueño:** Beto
**Creada:** 2026-06-26
**Última actualización:** 2026-06-29 (rediseño v2 según el cotizador oficial del notario)

> Detonante: en la fase 8 (dictaminar) el campo «Gastos de escrituración» es
> captura 100% manual. Beto creía que se extraía del Anexo B, pero el notario
> (Memo — Lic. Guillermo Nicolás López Elizondo, Distrito Notarial Río Grande)
> confirmó por correo (Alejandra Chavarría, 25-jun-2026, «Cálculo de Gastos
> Notariales») que **no sale de ningún documento oficial**: cada operación la
> calcula a mano en sus tablas de Excel. Ese correo trae el desglose completo +
> 3 tablas (presupuesto ejemplo, tabulador de compraventa, tabulador de apertura
> de crédito) que permiten **replicar el cálculo nosotros** y solo confirmarlo
> contra el número que pasa el notario.

## Problema

- **Dato manual y opaco.** El operador captura los gastos notariales a mano sin
  saber de dónde salen. Hoy en la fase 1 precargamos un proxy grueso
  (`gastos_notariales_6pct` = 6% del precio en `fn_calcular_precio_venta`) que
  **sobrestima ~25%**: para el ejemplo de Memo de $920,000 el 6% da $55,200 vs
  los **$44,208** reales.
- **Sin trazabilidad del cálculo.** No queda registro de cómo se llegó al monto,
  contra la regla de audit trail. Si el notario y nosotros diferimos, no hay
  desglose con qué cuadrar.
- **Tarifas vivas fuera del sistema.** Los tabuladores y cuotas fijas del notario
  se actualizan cada enero y viven solo en su Excel.

## Decisiones de diseño (conversación de promoción, 2026-06-26)

Beto cerró el alcance v1 sobre tres ejes:

1. **Tarifas en DB editable + UI.** Las cuotas fijas y los 2 tabuladores viven en
   `dilesa.gastos_notariales_*`, editables por Dirección desde la app (audit
   trail, actualización de enero sin redeploy). No hardcode.
2. **Precargar + confirmar.** El cálculo precarga el campo de gastos en la fase 8
   con el desglose visible (Municipio / Registro Público / Otros); Dirección
   confirma o ajusta contra el presupuesto del notario. Si ajusta, se marca como
   override. Consistente con el patrón actual de precarga por IA.
3. **Tarifas de Memo como set único.** Memo atiende >90% de la escrituración; sus
   tarifas se usan para todas las ventas sin discriminar por notario. Si entra
   otro notario con tarifas distintas, se extiende (la config es por
   `empresa_id`; un `notario_id` opcional se puede sumar después sin romper).

## Modelo de cálculo (reconstruido del correo + tablas, validado al peso)

`Total = Municipio + Registro Público + Otros`. Validado contra el ejemplo de
Memo ($920,000, 1 derechohabiente, sin propiedad previa, crédito ≤ $820k) =
**$44,208** exacto.

**Municipio** (subtotal ejemplo $30,437)

- ISAI = **3% × valor de escrituración** (variable)
- Certificación de planos $165 · Copias fotostáticas $56 · Avalúo previo $566 ·
  Valuación catastral $1,200 · Derechos $850 (cuotas fijas)

**Registro Público** (subtotal ejemplo $9,368)

- Cert. lib. gravamen (CLG) $575 · Aviso preventivo $0 (cuotas fijas)
- **Compraventa** = tabulador escalonado por valor de escrituración, columna
  «sin propiedad» (beneficio 50%) o «con propiedad» (cuota particular). El flag
  lo decide _¿algún derechohabiente ya tiene propiedad a su nombre?_ (default no).
- **Apertura crédito I** = $765 fijo si el crédito ≤ $820k; si pasa, entra el
  tabulador por monto de crédito.
- **Apertura crédito II** = $0, o un segundo cobro si hay co-acreditado.

**Otros** (subtotal ejemplo $4,403)

- CNPR = **$1,000 × nº de derechohabientes** (variable)
- Aviso definitivo $103 · Forma ISAI $400 · Copia certificada $1,500 · Plano
  $1,200 · Kinegrama $200 (cuotas fijas)

Inputs que ya tenemos en `dilesa.ventas`: `valor_escrituracion`,
`monto_credito_titular`, `monto_credito_cotitular` (→ nº derechohabientes y
apertura II). Input nuevo: `tiene_propiedad` (Sprint 3).

## Alcance y sprints

- **Sprint 1 — datos + cálculo + test.** Migración de las 2 tablas (config +
  tabulador) con RLS + seed de las tarifas 2026 de Memo. Helper TS puro
  `calcularGastosNotariales(input, config)` + test que valida el ejemplo de Memo
  al peso y los casos borde (con propiedad, 2 derechohabientes, ISAI). NO toca
  prod (la migración la aplica Beto).
- **Sprint 2 — UI de configuración.** Pantalla Configuración → Gastos notariales
  (solo Dirección): editar la config vigente y los tabuladores cada enero.
  Módulo RBAC nuevo (ADR-014).
- **Sprint 3 — integración fase 8.** Carga de config vigente + check «¿algún
  derechohabiente tiene propiedad?» + panel de desglose que precarga el campo de
  gastos; Dirección confirma o ajusta (override marcado). Persistir el desglose
  para auditoría.
- **Opcional Sprint 4 — Fase 1.** Reemplazar el proxy del 6% por este cálculo
  (con el precio como proxy del valor de escrituración) para precargar mejor
  desde el arranque.

## Riesgos y pendientes a confirmar con Memo (no bloquean Sprint 1)

- **Columna del tabulador de apertura (>$820k).** La hoja del notario trae tres
  columnas (PARTICULAR / CONSTRU / DILESA) y no es obvio cuál aplica a DILESA
  cuando el crédito pasa de $820k — caso real (la venta de $930k del screenshot
  cae ahí). Se seedea con la mejor interpretación (CONSTRU = beneficio 50%, mismo
  patrón que la columna de compraventa) y queda **editable**; confirmar con Memo.
- **Vigencia 2026.** Las cuotas fijas, los tabuladores y «aviso preventivo = $0»
  (específico de Memo) son los vigentes 2026; se revisan cada enero.

## Métricas de éxito

- El total calculado cuadra con el presupuesto del notario en las ventas nuevas
  (delta $0 en el caso normal; las diferencias se vuelven visibles y auditables).
- Se elimina la sobrestimación del 6% en la precarga.
- Las tarifas de enero se actualizan desde la app, sin tocar código.

## Bitácora

- **2026-06-26** — Promoción. Investigado el origen del dato (manual, confirmado
  por código y por el correo de Memo). Reconstruido y validado el modelo de
  cálculo contra el ejemplo del notario ($44,208 al peso). Alcance v1 cerrado con
  Beto (tarifas en DB + precargar/confirmar + set único de Memo). Arranca
  Sprint 1.
- **2026-06-26** — Sprint 1 en prod ([#1061](https://github.com/beto-sudo/BSOP/pull/1061)):
  migración aplicada (db push, ledger 1:1), helper de cálculo + test al peso.
  Corrección de Beto: en el tabulador de apertura DILESA usa la columna «DILESA»
  (no la CONSTRU provisional) y la apertura no depende de la propiedad.
- **2026-06-26** — Sprint 3 (integración fase 8): columnas `tiene_propiedad` +
  `gastos_notariales_desglose` en `dilesa.ventas` (en prod), helper
  `cargarConfigVigente`/`mapearConfig` (con test), componente
  `GastosNotarialesPanel` (desglose + confirmar/ajustar + check de propiedad)
  integrado en la pantalla de dictaminar (precarga suave del campo + snapshot del
  desglose al cerrar, en ambos formularios). Se hizo S3 antes que S2 porque da el
  valor visible; S2 (editar tarifas) es mantenimiento anual.
- **2026-06-29** — Rediseño v2 según el **cotizador oficial del notario** (Excel).
  El modelo v1 estaba incompleto: las tarifas dependen del **tipo de vivienda**
  (interés social = LDE / residencial medio = LDS, que cubre Lomas del Sol y del
  Valle), los topes superiores son **$35,422** (no 13,373/24,073), la valuación
  catastral es **valor catastral × % (0.2 / 0.18)** y hay conceptos nuevos (SIMAS,
  avalúo, forma ISAI municipal); CNPR es fijo. Migración v2 aplicada a prod:
  `dilesa.proyectos.categoria_notarial`, `dilesa.ventas.valor_catastral`, config
  por categoría + tabulador con topes reales. Motor + panel + tests reescritos;
  validado al peso contra los 2 ejemplos del cotizador (LDE $922k→$44,333; LDS
  $3.5M→$188,869). Validación del mes (junio): 9/19 comparables cuadran (residual
  = la valuación catastral aún sin capturar). Pendiente: capturar el valor
  catastral, tarifas de fraccionamientos futuros, 7 casos especiales con Memo.

## Decisiones registradas

- **2026-06-26** — Config por `empresa_id` (no global ni por-notario en v1). Memo
  atiende >90%; sus tarifas son el set único. Extensible a `notario_id` después
  sin romper el modelo.
- **2026-06-26** — El cálculo **precarga** `gastos_escrituracion`, no lo
  reemplaza ni candadea: Dirección sigue siendo la autoridad final y puede
  ajustar contra el notario. No toca cuadratura ni precio (línea roja).
- **2026-06-26** — Apertura de crédito usa la columna «DILESA» del tabulador (no
  CONSTRU) y NO depende de la propiedad previa (eso solo aplica a compraventa).
  Confirmado por Beto.
- **2026-06-29** — Tarifas por **tipo de vivienda** (no por fraccionamiento ni set
  único): interés social y residencial medio. Cada proyecto se clasifica en
  `categoria_notarial`. El tabulador de compraventa/apertura (Registro Público) es
  el mismo para ambas; difieren las cuotas de Municipio y Otros. CNPR es cuota
  fija (no por derechohabiente). Fuente: cotizador oficial del notario 2026.

# Iniciativa — Autoguardado de campos en la captura de fase (DILESA)

**Slug:** `dilesa-autoguardado-captura`
**Empresas:** DILESA
**Schemas afectados:** ninguno nuevo — escribe en las columnas/RPCs que ya existen (`dilesa.ventas`, `dilesa.venta_encuestas`, `fn_actualizar_descuentos_venta`, `fn_corregir_avaluo_venta`). Cambio de **momento** de escritura (al teclear, no al avanzar), no de modelo.
**Estado:** done
**Próximo hito:** — (iniciativa cerrada 2026-06-26)
**Dueño:** Beto
**Creada:** 2026-06-26
**Última actualización:** 2026-06-26 (CERRADA. Parte A — autoguardado de la fase 8 en prod [#1085](https://github.com/beto-sudo/BSOP/pull/1085); Parte B — chequeo E2E de persistencia (mock del PATCH, cero escritura en prod) verde [#1090](https://github.com/beto-sudo/BSOP/pull/1090). **9/9 fases con campos cableadas y verificadas**; 15/16 fuera por diseño.)

> Detonante: el barrido de las 17 fases (al arreglar la persistencia de **documentos** en
> fases 2 y 8, PRs #1067/#1070/#1071) dejó ver que los **campos** siguen el patrón viejo:
> se persisten solo al avanzar la fase. Beto: _"hay que ver todos los campos igual que los
> archivos para que persistan"_. La fase 10 ya tiene el molde (autoguardado debounced).

## Problema

Los campos de información de las pantallas de captura (fechas, montos, referencias, notas)
se persisten **solo al presionar el botón que avanza la fase** (`marcarFase` + `camposVenta`).
Si alguien captura datos pero no avanza —botón de otro rol (fase 8: Gerencia captura,
Dirección cierra), falta una precondición, o cambia de pantalla— **pierde lo tecleado**.
Es el mismo problema que ya se resolvió para los documentos, pero para los campos.

## Outcome esperado

Cada campo de captura **persiste al teclearse** (autoguardado debounced ~700 ms), con un
indicador `Guardando… / Guardado ✓`, sin botón extra. El avance de fase queda **separado** de
la captura (el botón solo avanza). En la fase 8, **Gerencia autoguarda los datos del dictamen**
y **Dirección sigue controlando** la cuadratura/cierre (ADR-048 intacto). Paridad con los
documentos: lo que se teclea no se pierde al salir.

## Alcance

Diseño y patrón en **[ADR-051](../adr/051_autoguardado_campos_captura_fase.md)**. Rollout por fases:

- **Sprint 1 — patrón + piloto + simples:** hook `useAutoguardadoCampos` + `<IndicadorAutoguardado>`
  - fases que solo capturan fechas/refs/notas (sin RPC ni gate financiero): **9** (piloto),
    **4, 7, 11, 15**.
- **Sprint 2 — campos con RPC auditada:** **3** (descuento → `fn_actualizar_descuentos_venta`),
  **5** (avalúo → `fn_corregir_avaluo_venta`). El autoguardado llama la RPC, no UPDATE directo.
- **Sprint 3 — financieras con gate:** **6** (montos de crédito), **8** (Gerencia autoguarda los
  datos del dictamen; cuadratura/pagaré/avance = Dirección), **12** (detonación manual),
  **16** (encuesta → `venta_encuestas`).

Fases sin campos (no entran): 2 (solo archivos), 13 (derivados del XML), 14, 17.

## Riesgos

- **Producción financiera.** Las fases 3/5/6/8/12 escriben cifras que alimentan la cuadratura,
  la NC y la utilidad. El autoguardado no debe saltarse RPCs auditadas (ADR-051 D3) ni
  recalcular con valores a medio teclear → debounce + de-dup + respetar el gate de cada fase.
- **Triggers de avance.** Separar captura de avance (D4) sin romper los triggers que hoy corren
  al insertar en `venta_fases`. Verificar fase por fase.
- **Escrituras de más.** Un autoguardado mal puesto puede disparar UPDATEs en bucle → el hook
  de-dup por firma y solo guarda si cambió respecto a lo persistido.

## Métricas de éxito

- 0 pérdidas de datos al salir de una pantalla de captura sin avanzar.
- La fase 8 conserva lo que captura Gerencia sin que Gerencia pueda cerrar.
- Un solo patrón (hook) en todas las fases; sin debounce re-implementado por pantalla.
- Las cifras financieras siguen pasando por sus RPCs auditadas (audit trail intacto).

## Bitácora

- **2026-06-26** — Promovida. Detonante: el barrido de las 17 fases (persistencia de documentos,
  PRs #1067/#1070/#1071) + directiva de Beto de extender el principio a los campos. Decisiones de
  Beto: (1) **promover a iniciativa** con rollout por fases; (2) **fase 8 — Gerencia autoguarda los
  datos del dictamen, Dirección cierra**. Diseño en **[ADR-051](../adr/051_autoguardado_campos_captura_fase.md)**.
- **2026-06-26 (Sprint 1)** — **[PR #1072](https://github.com/beto-sudo/BSOP/pull/1072) (mergeado):**
  hook `useAutoguardadoCampos` + `<IndicadorAutoguardado>` (`components/dilesa/captura/autoguardado-campos.tsx`)
  - piloto **fase 9** (fecha de validación patronal). **Sprint 1b (este PR):** fases **4** (valuador +
    fecha de solicitud de avalúo) y **7** (notario + fecha de solicitud de dictamen) — autoguardan al
    cambiar; el email al valuador/notario sigue disparándose solo al avanzar. Patrón confirmado:
    el `Section` local gana un `accion` para el indicador; cada fase añade un estado "guardado"
    (firma persistida que arranca = lo cargado, para no autoguardar el default "hoy"). **Falta del
    Sprint 1:** fase **11** (escritura/cheque/monto, 4 campos). La fase **15** (notas) queda fuera —
    sus notas van a `venta_fases` al avanzar, sin columna en `dilesa.ventas` donde autoguardar.
- **2026-06-26 (Sprint 1c — cierre + chequeo Playwright)** — fase **11** (4 campos de
  escritura/cheque → `dilesa.ventas`) autoguarda al cambiar. **Chequeo Playwright** (Beto):
  smoke `tests/e2e/smoke/auth-dilesa-captura-fases.spec.ts` que recorre las **17** pantallas de
  captura y verifica que cargan sin crash (sin overlay de Next, body con contenido). Alcance con
  el bot `e2e-bot` (viewer, 0 fases con escritura): confirma que ninguna ruta revienta al cablear
  el autoguardado; el form no se monta (gate `write`) y el harness es read-only contra prod, así
  que NO ejercita la persistencia. Para chequear el autoguardado real (interceptando el PATCH) haría
  falta darle `write` al bot — pendiente, decisión de Beto. **Sprint 1 cerrado** (9/4/7/11).
- **2026-06-26 (Sprint 2 — RPC auditada, [PR #1079](https://github.com/beto-sudo/BSOP/pull/1079))** —
  fase **3** (Formalizada): el **descuento** autoguarda por la misma RPC auditada del cierre
  (`fn_actualizar_descuentos_venta`, registra cada cambio en `audit_log`); la fecha del contrato
  no autoguarda (va a `venta_fases.notas`). Fase **5** (Avalúo Cerrado): **monto + fecha del avalúo**
  autoguardan (UPDATE directo pre-cierre); en corrección post-cierre se mantiene la RPC
  `fn_corregir_avaluo_venta`.
- **2026-06-26 (Sprint 3a — financieras, [PR #1080](https://github.com/beto-sudo/BSOP/pull/1080))** —
  fase **6** (Inscrita): montos + referencias de crédito autoguardan (la fecha de inscripción va a
  notas). Fase **12** (Detonada): fecha + monto autoguardan **solo para Dirección** (el form de
  captura manual es solo de Dirección). **Patrón general consolidado:** un estado "guardado" por
  fase (firma persistida = lo cargado), `habilitado` que hereda el gate de cada pantalla, los campos
  que van a `venta_fases.notas` al avanzar (fechas de contrato/inscripción) no autoguardan.
- **2026-06-26 (cierre parcial — qué queda)** — **Fuera del autoguardado por diseño:** fase **15**
  (notas) y fase **16** (encuesta) — captura **atómica de una sola persona sin separación de roles**
  (no hay pérdida cross-rol), y escriben a `venta_fases`/`venta_encuestas` con lógica de estado; un
  autoguardado parcial de encuesta no tiene buena semántica. **Pendiente: fase 8 (Dictaminada)** — la
  única con campos sin autoguardar. Se dejó deliberadamente para una sesión enfocada por ser la más
  delicada: sus campos alimentan la **cuadratura** y la captura de `valor_escrituracion` dispara la
  **re-firma**; tiene 2 forms (cierre + "ya cerrada") con gates distintos (ADR-048). **Diseño listo:**
  un hook que autoguarda los 7 campos del dictamen (montos/refs/gastos/valor/fecha) vía UPDATE
  directo, `habilitado: !!venta && (!yaCerrada || esDireccion)` — Gerencia autoguarda en la captura
  (D5), pero una fase YA cerrada solo la modifica Dirección (ADR-048). Hacer + revisar en preview
  (financiero, sin auto-merge).
- **2026-06-26 (Sprint 3b — fase 8, [PR #1085](https://github.com/beto-sudo/BSOP/pull/1085))** —
  **Parte A del handoff hecha.** La fase **8 (Dictaminada)** autoguarda los 6 campos financieros del
  dictamen (montos titular/co-titular, refs de crédito, gastos y valor de escrituración) por UPDATE
  directo a `dilesa.ventas`; indicador en las 3 Sections (los 2 forms del cierre + el de "ya
  cerrada"). Gate `!!venta && (!yaCerrada || esDireccion)` — Gerencia autoguarda durante el cierre
  (resuelve la pérdida cross-rol que motivó la iniciativa: Gerencia captura / la IA precarga pero no
  cierra), una fase ya cerrada solo la modifica Dirección (ADR-048). La **fecha del dictamen no
  autoguarda** (se fija al cerrar; consistente con ADR-051 D5, que lista montos/refs/gastos/valor).
  El `guardar` refresca firma + estado `venta` para no dejar stale la lógica de re-firma
  (`precioCambio`/`imprimirRefirma`/`confirmarRefirma`). **Sin auto-merge** (financiero → revisión en
  preview con venta real). Con esto, **9/9 fases con campos quedan cableadas**; 15/16 fuera por
  diseño. **Falta la Parte B**: chequeo de persistencia E2E auto-limpiante con write al bot e2e.
- **2026-06-26 (Parte B — chequeo E2E, [PR #1090](https://github.com/beto-sudo/BSOP/pull/1090))** —
  Test `tests/e2e/smoke/auth-dilesa-fase8-autoguardado.spec.ts`: teclear un campo del dictamen dispara
  el UPDATE de los 6 campos a `dilesa.ventas`. **Cero escritura en prod (decisión Beto)**: el test
  intercepta toda escritura a `dilesa.ventas` con `page.route` y la mockea (204) — el PATCH del
  autoguardado nunca toca la DB; limpieza por diseño, no por restore. El bot (rol no-Dirección, como
  Gerencia) ejercita el gate `!yaCerrada || esDireccion` en el form de cierre. Grant de write al bot en
  `fase08_dictaminada` **temporal** (otorgar→correr→revertir; con el mock nunca se ejerce — solo monta
  el form gated; SQL en el header del spec). **Verificado en prod**: test verde (2 passed), bot de
  vuelta a 0 escritura en todas las fases, venta de prueba intacta (`credito_cotitular_ref` sigue
  NULL). **Hallazgo**: las 11 ventas con el form de fase 8 abierto son reales/activas → se descartó
  tocar una con restore (riesgo de colisión + basura si crashea) a favor del mock. **Iniciativa cerrada.**

## Decisiones registradas

- **2026-06-26 (autoguardado transparente, no botón)** — debounce ~700 ms + indicador, sin botón
  "Guardar borrador" — para cumplir "que no se pierda" igual que los documentos (ADR-051 D1).
- **2026-06-26 (respeta la capa de escritura)** — el autoguardado usa el mismo camino que hoy:
  UPDATE directo para campos simples, **RPC auditada** para descuento (fase 3) y avalúo (fase 5).
  No salta el audit trail (ADR-051 D3).
- **2026-06-26 (fase 8: Gerencia autoguarda, Dirección cierra)** — decisión de Beto: los datos del
  dictamen autoguardan al teclearlos Gerencia; la cuadratura/pagaré/avance siguen solo-Dirección
  (ADR-048 intacto, ADR-051 D5).
- **2026-06-26 (qué NO autoguarda)** — (a) campos que viven en `venta_fases.notas` al avanzar
  (fecha de contrato F3, fecha de inscripción F6) — sin columna en `dilesa.ventas`; (b) fases de
  captura **atómica de una sola persona** sin separación de roles (F15 notas, F16 encuesta) — no hay
  pérdida cross-rol y la F16 escribe a `venta_encuestas` con estado, donde un guardado parcial es
  ambiguo. El autoguardado se reserva para campos con destino directo y/o riesgo de pérdida cross-rol.
- **2026-06-26 (chequeo E2E = mock del PATCH, no escritura real)** — el harness corre contra prod y las
  únicas ventas con el form de fase 8 abierto son reales/activas. En vez de tocar una con
  leer→modificar→restaurar (riesgo de colisión con el equipo + basura si el browser crashea antes del
  restore), el test intercepta el PATCH del autoguardado y lo mockea: verifica que dispara el UPDATE
  correcto sin escribir. Cumple la condición dura de Beto (cero basura) **por diseño**, no por restore.
  La persistencia física en Postgres no se ejercita (ya probada idéntica en 8 fases). El grant de write
  al bot es **temporal** (mínimo privilegio): con el mock el bot nunca escribe, así que su estado seguro
  es 0 escritura — no se deja un grant permanente.

## Handoff — Fase 8 (Dictaminada) + chequeo de persistencia (sesión limpia)

> Arranque dejado el 2026-06-26 para retomar en sesión limpia. Es la última fase con
> campos sin autoguardar; se separó por ser financiera (riesgo alto + contexto cargado).
> Beto autorizó **write al bot e2e** para el chequeo de persistencia **con condición dura:
> los tests NO dejan basura — restauran el estado original** (ver memoria
> `feedback_e2e_tests_auto_limpiantes`).

### Parte A — Autoguardado de la fase 8

Archivo: `app/dilesa/ventas/[id]/capturar/8-dictaminada/page.tsx`. Campos del dictamen
(estado del form, ~líneas 256-263): `fechaDictamen`, `montoTitular`, `montoCotitular`,
`creditoTitularRef`, `creditoCotitularRef`, `gastosEscrituracion`, `valorEscrituracion`.
Todos van a `dilesa.ventas` (los mismos que `onActualizarDatos` ya escribe por UPDATE).

Plan (mismo patrón que las otras 8 fases):

1. Importar `useAutoguardadoCampos` + `IndicadorAutoguardado`.
2. Estado `guardado` con los 7 campos; sincronizarlo en la carga (la carga ya setea los
   campos desde la venta, ~líneas 454-459 — agregar `setGuardado(...)`).
3. Hook que autoguarda los 7 por **UPDATE directo** a `dilesa.ventas`, con
   **`habilitado: !!venta && (!yaCerrada || esDireccion)`** — Gerencia autoguarda en la
   captura (ADR-051 D5); una fase YA cerrada solo la modifica Dirección (ADR-048). `esDireccion`
   ya está definido en la página.
4. Indicador en las Sections de datos (hay 2 forms: cierre `onSubmit` con "Datos del dictamen"
   ~1378 + "Confirmar datos del crédito" ~1413; "ya cerrada" `onActualizarDatos` con "Datos del
   crédito y escrituración" ~1212). Reusar el `Section` con `accion` (ya existe en la página).

**Matices a cuidar (por eso se separó):**

- `valorEscrituracion` dispara la **re-firma** (`precioCambio` compara contra
  `precio_documentos_firmados`). Autoguardarlo es correcto (Gerencia captura el valor real del
  Anexo B → si difiere, aparece la re-firma → Dirección la confirma), pero **verificar** que no
  pelea con `imprimirRefirma`/`confirmarRefirma` (que también escriben `valor_escrituracion`).
  Como esos chequean `necesitaPersistir`, deberían ser idempotentes; confirmarlo.
- La **cuadratura** (`useVentaCapturaResumen`) es un snapshot al cargar — no se refresca en vivo
  con el autoguardado. Es aceptable (Dirección recarga al cuadrar), pero mencionarlo en el copy.
- No tocar los botones/gates existentes de cuadratura, crédito directo, saldo residual, re-firma
  ni el cierre — siguen siendo de Dirección.
- **Hacer en PR propio, sin auto-merge** → revisar en preview con una venta real antes de mergear.

### Parte B — Chequeo de persistencia con write al bot (auto-limpiante)

1. **Dar write al bot** `e2e-bot@bsop.test` en las fases DILESA de forma **reversible**: migración
   o SQL que agrega `acceso_escritura` a su rol en `core.permisos_rol` para los slugs
   `dilesa.ventas.fase%` (hoy tiene 0 write / 18 read). Documentar cómo revertir.
2. **Test auto-limpiante** (extiende `tests/e2e/smoke/auth-dilesa-captura-fases.spec.ts` o uno
   nuevo): patrón **leer→modificar→verificar→restaurar** por campo —
   (a) leer el valor actual del input, (b) escribir un valor de prueba, (c) esperar el indicador
   "Guardado" + recargar y confirmar que persistió, (d) **restaurar el valor original** en un
   `finally`. Cumple la condición de Beto: cero basura en prod.
3. Alternativa más segura si se quiere aislar del todo: crear una **venta de prueba dedicada** en
   el setup y borrarla en el teardown (runbook de borrado en memoria
   `reference_dilesa_ventas_fechas_limpieza`), en vez de tocar ventas reales.

## Done

- **2026-06-26** — Iniciativa completa. Autoguardado de campos en las **9 fases con campos** (rollout
  por sprints 1-3b); la fase 8 (financiera) con gate Gerencia-autoguarda / Dirección-cierra (ADR-051
  D5 + ADR-048); + chequeo E2E de persistencia (mock del PATCH, cero escritura en prod). PRs
  #1072/#1079/#1080/#1085 (autoguardado) + #1090 (E2E). Outcome: lo que se teclea en cualquier captura
  de fase ya no se pierde al salir sin avanzar — paridad con los documentos. F15/F16 fuera por diseño
  (captura atómica de una sola persona, sin pérdida cross-rol).

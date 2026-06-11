# Iniciativa — Conciliación bancaria

**Slug:** `conciliacion-bancaria`
**Empresas:** todas (golden: DILESA)
**Schemas afectados:** `erp` (`estados_cuenta` nueva, `cuentas_bancarias` ficha, `cuenta_saldos`; v1: `movimientos_bancarios`, `conciliaciones`)
**Estado:** in_progress
**Próximo hito:** PR #838 al verde (auto-merge) + smoke test del flujo de subida con los estados de junio; completar baseline de mayo con Finamex y BBVA USD (los pasa Beto)
**Dueño:** Beto
**Creada:** 2026-06-01
**Última actualización:** 2026-06-11 (re-scope: v0 mensual desbloqueada; v1 movimientos sigue esperando CxC/CxP)

## Problema

Todo el dinero que entra (CxC), sale (CxP), los gastos y las
transferencias terminan en una cuenta bancaria. Pero hoy **no hay forma
de casar el estado de cuenta real del banco contra lo que el sistema
cree que pasó**:

- `erp.movimientos_bancarios` tiene un flag `conciliado`, pero nadie lo
  usa sistemáticamente.
- `erp.conciliaciones` existe pero **solo casa `movimiento ↔ gasto`**
  (legacy, sesgada).
- El mundo de cortes de caja POS (`erp.cortes_caja`, `movimientos_caja`,
  vouchers) concilia **caja**, no el **banco**.
- Los estados de cuenta PDF viven en el correo/Downloads de Beto, sin
  archivo sistemático ni datos estructurados.

Dolor concreto: **depósitos no identificados** (entró dinero al banco y
no se sabe de quién), pagos duplicados, y descuadres mes a mes que se
cierran a mano contra el estado de cuenta.

## Re-scope 2026-06-11 — dos niveles, dos relojes

La conciliación a nivel **movimiento** (v1) sigue bloqueada hasta que
CxC+CxP emitan movimientos bancarios. Pero hay una conciliación a nivel
**estado de cuenta mensual** (v0) que no depende de eso y entrega valor
inmediato: archivo ordenado + totales estructurados + 3 checks
automáticos. Beto aprobó arrancar v0 ya (2026-06-11) con los estados de
mayo 2026 como baseline.

### v0 — Estados de cuenta mensuales (desbloqueada, en curso)

- **Fase A — ficha de cuentas**: columnas de ficha en
  `erp.cuentas_bancarias` (numero_cliente, contrato, sucursal, telefono,
  contacto, titular, moneda text, notas) + datos reales de los estados +
  alta de Afirme (no existía) + snapshots baseline 31-may en
  `erp.cuenta_saldos`.
- **Tabla `erp.estados_cuenta`**: una fila por cuenta × mes con totales
  de carátula (saldo_inicial, depositos, retiros, saldo_final,
  saldo_inversiones) + PDF archivado en bucket `adjuntos`
  (`dilesa/estados_cuenta/<cuentaId>/...`) + `extraccion` jsonb (audit
  del payload IA).
- **Ingesta semi-automática**: tab "Estados de cuenta" en
  `/dilesa/saldos-bancos` → subes el PDF → Claude extrae la carátula
  (patrón `extraction-core` / CSF) → form prellenado → confirmas →
  guarda + archiva.
- **3 checks de conciliación** (computados, sin estado manual):
  1. **Checksum interno**: saldo_inicial + depositos − retiros =
     saldo_final (tolerancia $0.01).
  2. **Continuidad**: saldo_final del mes N−1 = saldo_inicial del mes N
     (misma cuenta).
  3. **Cruce vs captura**: saldo_final + saldo_inversiones vs snapshot
     de `erp.cuenta_saldos` en la fecha de corte.
- **RBAC**: sub-slugs `dilesa.saldos-bancos.saldos` y
  `dilesa.saldos-bancos.estados` (ADR-030), padre como umbrella.

### v1 — Nivel movimiento (sigue bloqueada)

Sin cambio de alcance: importar el estado línea por línea (CSV/layout/
API), casar contra `cxc_pago`/`cxp_pago`/`gasto`/`transferencia` vía la
referencia polimórfica de `movimientos_bancarios` (ADR-037 D4), bandeja
de no-identificados, reporte de descuadre. Arranca cuando CxC y CxP
emitan movimientos. Los PDFs/totales de v0 quedan como fuente de verdad
para validar el import de v1.

## Tercer vértice del triángulo de tesorería

```
   CxC (ingresos)  ──┐
                     ├──►  erp.movimientos_bancarios  ──►  Conciliación v1 (movimiento)
   CxP (egresos)   ──┘     (referencia polimórfica)              ▲ valida contra
                                                                  │
   Estados de cuenta PDF ──►  erp.estados_cuenta  ──►  Conciliación v0 (mensual)
```

## Decisiones registradas

- **2026-06-11 — D1: v0 mensual primero.** La conciliación por totales
  de carátula no depende de movimientos y resuelve archivo + control
  inmediato. v1 se construye encima sin tirar nada: `estados_cuenta` es
  el ancla contra la que se validará el import por movimiento.
- **2026-06-11 — D2: moneda como text en `cuentas_bancarias`.** El
  catálogo de monedas que `moneda_id` esperaba nunca existió; un text
  con CHECK ('MXN','USD') + fallback al heurístico por nombre es
  suficiente. Si algún día hay multi-divisa real, se promueve a catálogo.
- **2026-06-11 — D3: saldo_inversiones separado del saldo vista.** Monex
  opera el grueso en reporto overnight: al 31-may vista $1.0M + reporto
  $117.0M. Sin la separación, el cruce contra el saldo capturado
  ($118.0M total) daría falsos descuadres de $117M. El saldo real de la
  cuenta = saldo_final + saldo_inversiones.
- **2026-06-11 — D4: extracción IA con confirmación humana.** El PDF
  completo va a Claude (`@ai-sdk/anthropic` + `generateObject`, patrón
  extraction-core); el form llega prellenado y el humano confirma antes
  de guardar. Sin parsers frágiles por banco; el payload crudo queda en
  `extraccion` jsonb para audit.
- **2026-06-11 — D5: golden DILESA.** Las 5 cuentas DILESA (BBVA MN,
  BBVA USD, Monex, Finamex, Afirme). Rollout a otras empresas cuando el
  flujo pruebe valor un par de meses.
- **2026-06-11 — D6: archivo local espejo.** Los PDFs también se
  archivan en `~/Documents/DILESA/Finanzas/Estados de Cuenta/<año>/<año-mes>/`
  con naming `<YYYY-MM>_<BANCO>_<cuenta>.pdf` (staging pre-subida y
  respaldo fuera de Supabase).

## Decisiones pendientes (cerrar al promover v1)

- [ ] **Formato de importación v1**: ¿CSV manual por banco? ¿layout?
      ¿API (Belvo / banco directo)? Probable arrancar CSV por banco.
- [ ] **Reglas de auto-match v1**: tolerancia de monto, ventana de
      fechas, match por referencia/clave de rastreo. Los traspasos
      inter-cuenta (BBVA↔Monex↔Afirme) son el primer candidato: misma
      clave de rastreo en ambos estados.
- [ ] **Manejo de no-identificados**: ¿cargo/abono provisional?
      ¿bandeja de pendientes? ¿alta asistida?
- [ ] **Generalizar `erp.conciliaciones`**: hoy `movimiento ↔ gasto`;
      pasar a polimórfica con `monto_aplicado` para parciales N:M.
- [ ] **Relación con cortes de caja**: ¿la conciliación bancaria
      consume el resultado de los cortes POS o es independiente?

## Bitácora

- **2026-06-11** — Beto entrega los primeros 3 estados de cuenta (mayo
  2026: Afirme, BBVA MN, Monex; faltan Finamex y BBVA USD). Análisis
  completo: checksums de carátula verificados al centavo en los 3;
  detectada la mecánica vista+reporto de Monex (D3) y el RFC genérico
  XAXX010101000 en el CFDI de Afirme (pendiente operativo de Beto con el
  banco). PDFs archivados en local (D6). Re-scope v0/v1 aprobado por
  Beto ("Adelante con A y B"). Arranca construcción: migraciones
  `cuentas_bancarias_ficha`, `estados_cuenta`,
  `modulos_saldos_bancos_subslugs` + UI.
- **2026-06-11 (construcción v0 completa)** — PR #838 (auto-merge): Fase
  A (ficha + alta Afirme + snapshots baseline) y v0 (tabla
  `erp.estados_cuenta` + tab Estados de cuenta con extracción IA + 3
  checks). Las 3 migraciones aplicadas a prod con OK explícito de Beto y
  verificadas (5 cuentas con ficha, 3 snapshots 31-may, sub-slugs con
  permisos clonados a 8 roles). Ajuste sobre la marcha: `tipo` respetó el
  CHECK existente (cheques/inversion) y el nombre comercial fue a columna
  nueva `producto`. Baseline mayo cargado vía
  `scripts/seed_estados_cuenta_2026_05.ts` (3 PDFs en bucket `adjuntos` +
  filas con checksum verificado). 18 tests de helpers con las carátulas
  reales como fixtures.

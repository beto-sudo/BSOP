# Iniciativa — Servicios de la casa (SANREN)

**Slug:** `sanren-servicios`
**Empresas:** SANREN (hub patrimonial familiar — personal de Beto)
**Schemas afectados:** `sanren` (schema nuevo) — tablas `propiedades`, `servicios`, `recibos` + vista derivada `v_recibos`; RLS deny-all + lectura server-side con service-role (patrón Péptidos/Salud). `core` (RBAC del módulo, ver nota de routing en Sprint 3). Supabase Storage bucket `adjuntos` (recibos PDF + comprobantes de pago). Importer **read-only** desde Coda doc `MaXoDlRxXE` / tabla `grid-ItvEVXa37s` ("Recibos"). Sin librería de charts nueva (SVG a mano, patrón Playtomic/Health).
**Estado:** in_progress
**Próximo hito:** Sprint 2 — migrar los ~120 adjuntos (69 recibos PDF + 51 comprobantes de pago) de Coda al bucket `adjuntos` y ligarlos a cada recibo (puebla `recibo_adjunto_id`/`comprobante_adjunto_id`).
**Dueño:** Beto
**Creada:** 2026-06-21
**Última actualización:** 2026-06-21 (Sprint 1 en prod — schema `sanren` + 73 recibos importados con paridad exacta)

> Detonante: Beto lleva años el control de los recibos de servicios de su casa
> en un doc de Coda y quiere traspasar el historial completo a BSOP para
> continuar el seguimiento ahí, con gráficas y cálculos de tendencia por
> servicio. Es el primer ladrillo "duro" del hub SANREN (hoy `/family` es un
> placeholder que ya anuncia "casa, seguros, **recibos**, gastos…").

## Problema

El historial de recibos (Luz, Gas, Agua) vive en Coda, desconectado del resto
del patrimonio que ya está en BSOP. No hay:

- **Continuidad en BSOP.** La captura mensual sigue en Coda; SANREN en BSOP no
  tiene dónde registrar un recibo nuevo.
- **Analítica de tendencia.** Coda calcula consumo/costo por fórmula pero no hay
  gráficas de gasto/consumo por servicio en el tiempo, ni comparativos
  mes-a-mes / año-a-año.
- **Visibilidad del componente solar.** La casa tiene paneles (net metering): el
  recibo de Luz trae lectura de producción y el "saldo" sale negativo varios
  meses (produce más de lo que consume). Hoy ese ahorro no se mide de forma
  presentable.
- **Expediente documental unificado.** Los PDFs de recibo y los comprobantes de
  pago están en Coda, no en el bucket de BSOP.

## Decisiones de diseño (conversación de promoción, 2026-06-21)

Beto cerró el alcance v1 sobre cuatro ejes:

1. **Catálogo de servicios extensible** (no enum fijo). Arranca con Luz/Gas/Agua
   y permite sumar internet, teléfono, predial, TV/streaming, mantenimiento,
   etc. sin tocar código. ⇒ el tipo de servicio vive como dato (catálogo), no
   como `CHECK`/enum.
2. **Solar a fondo.** Producción, saldo neto a favor de CFE, ahorro estimado y
   gráficas solares son ciudadanos de primera clase (los datos ya están en
   Coda). ⇒ el modelo de Luz lleva lectura de producción; la vista deriva saldo
   neto y la analítica tiene un bloque solar dedicado.
3. **Multi-propiedad por diseño, una al cargar.** Se modela la dimensión
   `propiedad`; en v1 se carga solo la casa principal y queda listo para sumar
   otras (depto de los hijos, etc.) sin migración.
4. **Migrar todo a BSOP.** Los ~120 archivos (69 recibos PDF + 51 comprobantes)
   se descargan de Coda al bucket `adjuntos` y se ligan a cada recibo. El
   historial documental queda completo y Coda-servicios puede quedar read-only.

## Outcome esperado

Un módulo SANREN → **Servicios** donde Beto ve el historial completo de recibos
de la casa, **captura los nuevos** (con su PDF y comprobante), y consulta
**tendencias por servicio** (gasto, consumo, costo unitario) más un bloque
**solar** (generación vs consumo, saldo a favor, ahorro estimado). El historial
de Coda (datos + adjuntos) migra 1:1 y Coda-servicios deja de ser fuente de
verdad.

## Modelo de datos (v1)

Schema `sanren`, RLS deny-all (datos personales; lectura server-side
service-role, igual que `peptides`/`health.protocolo_*`).

- **`sanren.propiedades`** — la casa (y futuras propiedades).
  `id`, `nombre`, `tipo` (casa/depto/…), `direccion?`, `activo`, `notas`.
- **`sanren.servicios`** — catálogo de servicios contratados, por propiedad.
  `id`, `propiedad_id` FK, `tipo` (luz/gas/agua/…, catálogo), `proveedor`
  (CFE/Conagas/SIMAS/…), `numero_cuenta?`, `numero_medidor?`, `unidad_consumo`
  (kWh/m³/…), `tiene_produccion` (bool, solar), `domiciliado` (bool), `activo`,
  `notas`.
- **`sanren.recibos`** — un row por recibo.
  `id`, `servicio_id` FK, `periodo` (mes), `fecha_recibo`, `monto`, `moneda`
  (default MXN), `folio?`, `lectura_consumo?`, `lectura_produccion?` (solar),
  `pagado` (bool), `fecha_pago?`, `metodo_pago?`, `recibo_adjunto_id?`,
  `comprobante_adjunto_id?`, `notas?`, `coda_row_id` (idempotencia del import).
- **`sanren.v_recibos`** — derivaciones que hoy hace Coda por fórmula, con
  window functions (`LAG` por servicio, ordenado por fecha): `consumo_periodo`,
  `produccion_periodo`, `costo_unitario`, `saldo_neto` (consumo − producción),
  `delta_mom`, `delta_yoy`. (Mismo patrón con que `v_proyecto_avances` reemplazó
  46 fórmulas Coda en DILESA.)

## Alcance

**Sprint 1 — Schema + import de datos.** Tablas + vista + RLS; seed de la casa
principal y de los 3 servicios (Luz/Gas/Agua). Importer read-only de las 73
filas de Coda con limpieza (ver § Limpieza). Certificar **paridad por totales**
(suma de monto y de consumo por servicio y por año vs Coda). Migración como
archivo; se aplica a prod con OK verbal de Beto, y se reconcilia el ledger en la
misma sesión si se aplica por MCP.

**Sprint 2 — Migración de adjuntos.** Descargar los 69 recibos PDF + 51
comprobantes de Coda (URLs `expiringUrl` vía `valueFormat=rich`) y subirlos al
bucket `adjuntos` con `buildAdjuntoPath()` (ADR-022); ligar a cada recibo.
Precedente: el import de DILESA migró 11,878 adjuntos del mismo Coda.

**Sprint 3 — UI del módulo + RBAC.** Página `/servicios` (mapea a empresa/módulo
`sanren`, igual que `/health` y `/peptides`): listado (`<DataTable>` + filtros
URL-sync + `<DateRangeFilter>`), captura de recibo nuevo (form + upload de PDF y
comprobante), KPIs (`<ModuleKpiStrip>`: gasto del mes, YTD, Δ vs mes anterior).
RBAC: agregar `/servicios` al nav SANREN y a `ROUTE_TO_MODULE`; verificar si
basta el module-slug `sanren` existente o requiere sub-slug (ADR-014/030).
Acceso: Beto (admin) y, opcional, Graciela.

**Sprint 4 — Tendencias y analítica solar.** Gráficas SVG (patrón
Playtomic/Health, sin librería nueva): gasto mensual por servicio, consumo,
costo unitario, y bloque **solar** (generación vs consumo + saldo a favor
acumulado + ahorro estimado). Comparativos YoY/MoM. Para el ahorro solar "real"
se necesita la **tarifa CFE** de Beto (¿DAC?) y si hay banco de energía anual —
se resuelve aquí; hasta entonces el ahorro es estimado. No bloquea S1–S3.

**Fuera de alcance v1:**

- Otros servicios concretos (internet/predial/…) — el modelo los soporta; se
  cargan cuando Beto los quiera, sin código nuevo.
- Otras propiedades — soportadas por el modelo; se cargan después.
- Seguros / gastos / otros sub-dominios del hub SANREN — iniciativas aparte.
- Recordatorios de vencimiento / domiciliación — posible fase 2 si surge.

## Datos de origen (Coda)

Doc `MaXoDlRxXE`, tabla `grid-ItvEVXa37s` ("Recibos"): **73 filas**, ene-2024 a
jun-2026. 3 servicios: **Luz (CFE)**, **Gas (Conagas, gas natural)**, **Agua
(SIMAS)**.

Columnas de datos (capturadas): `Tipo de Servicio` (select), `Fecha Recibo`,
`Cantitad` (monto; marcado USD en Coda pero **son MXN**), `Numero` (folio,
52/73), `Lectura Consumo` (59/73), `Lectura Producción` (15/73 — solar),
`Recibo` (PDF, 69/73), `Pago` (comprobante, 51/73), `Notes` (3/73).
Columnas calculadas por fórmula Coda (se reconstruyen en `v_recibos`): consumo
del periodo, producción del periodo, costo por unidad, saldo del periodo.

### Limpieza al importar

- **Moneda:** `Cantitad` está marcada USD por config errónea de Coda → son
  pesos (MXN).
- **Consumo del primer recibo de cada serie:** Coda lo deja como la lectura
  completa (no hay lectura anterior) → en BSOP `consumo_periodo` debe quedar
  NULL en el primer recibo de cada servicio, no el valor basura.
- **1 monto vacío** (recibo más reciente sin monto aún) → permitir `monto` NULL
  o marcar pendiente.
- **`Numero` inconsistente** → guardar tal cual como `folio`, sin forzar formato.

## Riesgos

- **Adjuntos con URL temporal.** Coda expone los attachments con URLs que
  expiran; hay que bajarlos en la misma corrida del import (mitigado por el
  precedente DILESA). _S2._
- **Ahorro solar "real" depende de la tarifa CFE** (DAC / banco de energía
  anual). Sin ese dato el ahorro es estimado. _S4, no bloquea el resto._
- **Continuidad de captura.** Definir el cutover: tras S3, Beto captura en BSOP
  y Coda-servicios queda read-only (patrón de retiro progresivo).
- **Aplicación de migración a prod.** Schema personal (no financiero) pero
  cambio en prod → OK verbal de Beto antes de `db push`; reconciliar ledger si
  se aplica por MCP.

## Métricas de éxito

- 73/73 recibos migrados con paridad de totales (monto y consumo por
  servicio/año) vs Coda; ~120 adjuntos ligados.
- Beto captura un recibo nuevo end-to-end en BSOP (con PDF + comprobante).
- Tendencias por servicio + bloque solar visibles; Coda-servicios apagado como
  fuente de verdad.

## Bitácora

- **2026-06-21** — Promoción. Exploración read-only de la tabla Coda (73 filas,
  3 servicios, 2024-2026; perfil de columnas + suciedad documentado arriba).
  Alcance v1 cerrado con Beto (catálogo extensible · solar a fondo ·
  multi-propiedad por diseño · migrar adjuntos). Estado `planned`; siguiente:
  Sprint 1. PR [#970](https://github.com/beto-sudo/BSOP/pull/970).
- **2026-06-21** — Sprint 1 en prod. Migración
  `20260621211906_sanren_servicios_schema.sql` aplicada con `supabase db push`
  (ledger limpio, sin reconciliación): schema `sanren` (propiedades/servicios/
  recibos + `v_recibos`, RLS deny-all, grants solo a `service_role`, `sanren`
  expuesto en `pgrst.db_schemas`). Import de las 73 filas con
  `scripts/import_sanren_recibos.ts --apply` → **paridad exacta** de Σ monto por
  servicio (luz $55,663.15 · gas $25,190.00 · agua $74,170.00). Hallazgos: SIMAS
  facturó 2 veces en dic-2024 → el modelo ya **no** fuerza un recibo por mes
  (idempotencia por `coda_row_id`); CFE es **bimestral** (15 recibos vs 29 de
  gas/agua); el efecto solar es nítido en `v_recibos` (saldo neto negativo =
  excedente; gasto de luz/año 2024 $44,137 → 2025 $11,411 → 2026 $115 parcial).
  `sanren` agregado a `db:types` + `gen-schema-ref` + workflow `db-types.yml`;
  `SCHEMA_REF.md` y `types/supabase.ts` regenerados. Estado → `in_progress`;
  siguiente: Sprint 2 (adjuntos).

## Decisiones registradas

- **2026-06-21** — Schema propio `sanren` (no reusar `peptides`): SANREN es el
  paraguas patrimonial y crecerá con más sub-dominios (servicios hoy; seguros,
  gastos, propiedades después). Razón: aislamiento temático + RLS deny-all
  consistente con el patrón de datos personales.
- **2026-06-21** — Derivaciones (consumo/costo/saldo) en **vista DB**, no
  columnas materializadas: replica las fórmulas Coda con `LAG`, fuente única de
  verdad, sin riesgo de desincronía. Mismo patrón que `v_proyecto_avances`.
- **2026-06-21** — Gráficas en **SVG a mano** (patrón Playtomic/Health), sin
  agregar librería de charts. Razón: cero deps nuevas, control total del theme.

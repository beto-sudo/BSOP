# Iniciativa — Conciliación fiscal SAT (espejo read-only de CFDI)

**Slug:** `sat-conciliacion-cfdi`
**Empresas:** todas (cross-empresa; los 5 RFCs del portafolio). Piloto y primer rollout completo en DILESA; luego ANSA/COAGAN/RDB/Nigropetense empresa-por-empresa.
**Schemas afectados:** `erp` — **modelo canónico de CFDI** (ADR de schema, refinado por gpt-5.5): `cfdi_documentos` (1 fila por `uuid_sat` global, append-only — el universo fiscal crudo) + `cfdi_participaciones` (`empresa_id`, `uuid_sat`, `sentido` emitido/recibido, `sat_estatus`/`sat_es_cancelable`/`sat_estatus_cancelacion`/`sat_validado_at`; UNIQUE `(empresa_id, uuid_sat, sentido)` — un CFDI intercompañía vive legítimamente en dos universos con rol distinto) + `sat_descarga_solicitudes` (máquina de estados async). `erp.facturas` (subledger CxP) se **promueve desde** las participaciones de sentido `recibido` que son CxP real: extiende con flag `origen`, `sello_emisor`/`no_certificado`, desglose de impuestos **por concepto** (base por tasa, exento, IEPS, retenciones, `TipoFactor`, `ObjetoImp`) + 23505 idempotente. `core` (`core.sat_efos` —lista 69-B con estatus/fecha/firmeza/presunto-definitivo-desvirtuado/periodo, **no booleano**—; módulo RBAC nuevo "Conciliación fiscal" + sub-slugs, ADR-014/030). Nueva capa `lib/sat/` (cliente SOAP/PAC tras interfaz tipada + drift-guard en CI). `lib/cxp/cfdi-parser.ts` (ampliar `CfdiParsed`: sello, certificado, impuestos por concepto, relaciones completas) y `lib/cxp/ingestarCfdi` (helper puro extraído del upload-xml). Supabase Storage (XMLs descargados). Crons Vercel con **actor explícito** (`system:sat-sync` + correlation IDs, no `auth.uid()`). **Credenciales (e.firma) NO viven en Postgres** (ver Sprint 0). **Línea roja:** NO timbra (no emite CFDI/REP/Carta Porte), NO reemplaza CONTPAQi (DILESA)/Business Pro (ANSA)/POS (RDB), NO muta saldos de forma automática (sí puede **bloquear** acciones de workflow riesgosas con override de Dirección auditado).
**Estado:** planned
**Próximo hito:** Sprint 0 (sin código) — ADR de arquitectura de credenciales fiscales como **threat model concreto** (custodiar en 1Password vs delegar a PAC) + cotización de PAC + **spike real del SOAP de descarga masiva con un RFC** (la consulta de Metadata para dimensionar el backfill **requiere e.firma**, no es gratis ni pública — hay que probarla, no prometerla) + bundling del cliente SOAP/XML-DSig en Vercel.
**Dueño:** Beto
**Creada:** 2026-06-27
**Última actualización:** 2026-06-27 (promoción vía panel multi-ángulo de 9 agentes + segundo pase crítico con gpt-5.5)

> Detonante (2026-06-27): Beto quiso investigar qué conexiones se pueden hacer con
> el SAT y qué habilitan. La investigación + un panel multi-ángulo (6 críticos:
> fiscal, seguridad, arquitectura, producto, negocio, pre-mortem) reencuadró la
> idea: el valor no está en _timbrar desde BSOP_ (scope creep que compite con
> sistemas maduros), sino en una **capa de conciliación read-only** que tape
> huecos de integridad sobre cifras que **ya se reportan al Consejo**. Tres
> hallazgos verificados en el repo sostienen el caso: (1) el índice
> `erp_facturas_uuid_sat_idx` es PLANO, no UNIQUE
> ([erp_schema_v3.sql:813](../../supabase/migrations/20260414000000_erp_schema_v3.sql))
> → un cron automático duplicaría facturas; (2) la Cuadratura DILESA reporta
> `valorFacturadoReal` del CFDI local SIN cross-check contra el SAT
> ([cuadratura.ts:671](../../lib/dilesa/cuadratura.ts)) → un CFDI cancelado en el
> SAT sigue contando como facturado; (3) el parser no extrae el Sello del emisor,
> que `ConsultaCFDIService` exige para validar estatus.

## Problema

BSOP no tiene conexión viva con el SAT ni con ningún PAC: solo ingiere CFDI ya
timbrados afuera (DILESA/CONTPAQi, ANSA/Business Pro) vía **upload manual** de XML
que un humano matchea con intención. Eso deja huecos de integridad reales:

- **Cifras sin cross-check.** La Cuadratura DILESA reporta al Consejo un Valor
  Facturado tomado del CFDI local; si el cliente cancela ese CFDI en el SAT,
  nadie se entera y la cifra queda inflada.
- **Sin conciliación universo-SAT ↔ BSOP.** Facturas que te emitieron y nadie
  registró, o canceladas, pasan invisibles. El audit trail de proveedores no
  cruza contra 69-B/EFOS (operaciones simuladas).
- **Dedup frágil.** El dedup de `uuid_sat` es solo app-level sobre un índice
  plano: cualquier automatización en paralelo al upload manual duplicaría
  facturas por TOCTOU.

El problema NO es "leer CFDI" (eso ya se hace bien). Es que falta una capa de
**espejo/conciliación read-only** contra el SAT, manteniendo el control
financiero fuerte (nada de mutar dinero por lo que diga un servicio
eventualmente-consistente).

## Outcome esperado

BSOP como **consumidor confiable de CFDI** (descarga + valida + concilia + cruza
listas), no productor. Por empresa, una **Bandeja de Conciliación Fiscal**
read-only muestra —agrupado por calidad de match— todo lo que el SAT dice que
existe vs. lo que BSOP capturó; cancelaciones y EFOS se **detectan, avisan y
bloquean acciones de workflow riesgosas** (p.ej. no dejar programar el pago de un
CFDI cancelado o de un EFOS definitivo sin override de Dirección auditado) — pero
**nunca mutan saldos solas**: el efecto financiero lo confirma un humano de
Dirección vía RPC auditada; y la integridad del Valor Facturado de DILESA queda
cubierta. El timbrado (emisión de
CFDI/REP/Carta Porte) es **iniciativa(s) futura(s) separada(s)**.

## Decisiones registradas

- **2026-06-27 — Alcance READ-ONLY, BSOP no timbra.** El reencuadre central del
  panel: emitir es donde la iniciativa se hunde por scope creep (meses, CSD,
  competir con CONTPAQi/Business Pro). El nombre del slug lo ancla. REP-emisión,
  Carta Porte y timbrado salen a iniciativas futuras.
- **2026-06-27 — Piloto y primer rollout en DILESA (decisión de Beto).** Override
  consciente de la recomendación del panel ("bajo volumen primero"). Mitigación:
  DILESA arranca en **modo Metadata-conciliación** (observar/conciliar sin aplicar
  efectos a la cuadratura) hasta validar auth/async/dedup; recién entonces se
  habilita el patrón aviso-y-confirma sobre la cifra del Consejo.
- **2026-06-27 — 1Password como custodio candidato de la e.firma (si self-host).**
  Mejor que Supabase Vault (`decrypted_secrets` legible por el service-role) y que
  el sobre-cifrado en env para custodia **en reposo**: vault dedicada `Fiscal-SAT`
  (1 item por RFC: `.key` attachment + contraseña + `.cer` público) + Service
  Account scoped, encaja con la regla de secrets canónica + protocolo Beto-first.
  **Matiz de gpt-5.5 (importante): 1Password NO es un HSM y NO cierra el riesgo en
  runtime** — el `.key` termina en memoria de Vercel/microservicio y el token del
  Service Account se vuelve la llave indirecta. Ataca custodia en reposo, no el
  transporte ni el runtime. Por eso el ADR de Sprint 0 debe ser un **threat model
  concreto** (robo de token, SSRF, crash dumps, logs, rotación, revocación) que
  compare PAC vs self-host, no una preferencia por 1Password.
- **2026-06-27 — Detección → enforcement → aplicación (tres niveles, refinado por
  gpt-5.5).** El job marca/avisa con debounce ≥2 lecturas (el WS es
  eventualmente-consistente). De ahí se separan DOS tipos de efecto: (a)
  **enforcement de workflow** —bloquear una acción operativa riesgosa (programar el
  pago de un CFDI cancelado / EFOS definitivo)— **sí es automático**, con override
  de Dirección auditado: no toca saldos, protege el flujo y refuerza el control
  financiero; (b) **aplicación financiera** —mutar `estado_cxp` o
  `valorFacturadoReal`— **siempre la confirma un humano** de Dirección vía RPC
  auditada con override de admin + `audit_log`. "Read-only fiscal" no significa
  "solo dashboards".
- **2026-06-27 — Identidad canónica del CFDI multi-empresa (gpt-5.5).** Un CFDI
  intercompañía (DILESA le factura a COAGAN) tiene **un** `uuid_sat` que vive en
  **dos** universos: emitido para DILESA, recibido para COAGAN. Modelar
  `cfdi_documentos(uuid_sat)` canónico + `cfdi_participaciones(empresa_id,
uuid_sat, sentido)` con UNIQUE `(empresa_id, uuid_sat, sentido)`, en vez de
  `(empresa_id, uuid_sat)` a secas. Fijarlo **antes** de construir staging, bandeja
  y dedup — descubrirlo después de tener UI sale caro.
- **2026-06-27 — Backfill ≠ steady-state.** El cap RMF 2026 de **2,000 XML/día por
  RFC** (no el límite por-solicitud de 200k) haría inviable un backfill profundo
  como evento único. Se trata como proyecto acotado con fecha de corte por empresa
  y presupuesto diario; el steady-state es un delta diario holgado. **Pendiente
  (gpt-5.5): citar el límite con fuente normativa versionada (regla RMF + fecha) y
  confirmarlo en el spike del SOAP — no dejarlo como número sin cita.**

## Decisiones abiertas (las resuelve Sprint 0, con datos)

- **FORK RAÍZ — custodiar vs delegar.** ¿BSOP custodia las e.firmas en 1Password y
  construye el WS SOAP+XML-DSig ($0/doc, mantenimiento + custodia), o delega
  descarga+validación a un PAC-agregador (paga por doc, pero **igual hay que
  subirle el `.cer`+`.key`+contraseña** — el riesgo se traslada, no desaparece, y
  un breach del PAC compromete los 5 RFCs)? El panel no llegó a consenso. Se
  decide con la cotización del PAC + el conteo real de CFDI por empresa (vía
  Metadata, que **requiere ya una e.firma cargada** — se obtiene en el spike de
  Sprint 0, no es un endpoint público gratis) + el threat model en mano.
- **FIEL vs CIEC.** Seguridad prefiere CIEC (menor privilegio, revocable); falta
  verificar si CIEC habilita todos los filtros del WS de descarga masiva v1.5.
- **Profundidad del backfill por empresa.** Nadie sabe cuántos CFDI tiene ANSA en
  5 años — el dato sale del spike de Metadata de Sprint 0 (con e.firma). Default
  propuesto: fecha de corte reciente, no histórico completo indiscriminado. Para
  **ANSA** (gpt-5.5) el valor probablemente no es la cuadratura manual sino
  **detectar divergencias** entre Business Pro ↔ SAT ↔ cobranza/pagos.

## Sprints

- **Sprint 0 — ADR de credenciales + transporte (sin código).** Cierra el fork
  raíz antes de escribir SOAP/PAC. Entregables:
  `docs/adr/NNNN_arquitectura_credenciales_fiscales.md` como **threat model** (PAC
  vs self-host: robo de token, SSRF, crash dumps, logs, rotación, revocación);
  cotización PAC (Prodigia/Facturapi/SW); **spike real del SOAP de descarga masiva
  con un RFC y una e.firma** (probar auth + Metadata para dimensionar el backfill y
  documentar límites con fuente normativa versionada — NO asumir conteo gratis);
  diseño de `lib/sat/` (interfaz tipada `descargarCfdi`/`validarEstatus` +
  drift-guard CI) + bundling de la cripto SOAP en Vercel (plan B: microservicio
  aislado). Conexiones: decisión sobre #1, #2.
- **Sprint 1 — Modelo canónico + parser fiscal completo + lo gratis (#2 + #5).**
  Habilitadores bloqueantes (gpt-5.5: fijar el modelo y el parser **antes** de UI,
  o se construye la bandeja sobre algo que se va a tirar). Tablas `cfdi_documentos`
  - `cfdi_participaciones` (UNIQUE `(empresa_id, uuid_sat, sentido)`) + 23505
    idempotente en `cxp_factura_alta`; flag `origen`; **parser fiscal completo**
    (sello, `no_certificado`, impuestos **por concepto**: base por tasa, exento,
    IEPS, retenciones, `TipoFactor`, `ObjetoImp`, relaciones completas) + columnas
    `sat_*`; helper `lib/cxp/ingestarCfdi` extraído; validación de estatus (#2
    ConsultaCFDIService, gratis y sin e.firma — el único servicio público) como
    `CfdiCheck` cacheado con cola+backoff (solo ejercicio vigente + anterior);
    `core.sat_efos` (CSV datos abiertos SAT, modelado **no booleano**) + cruce 69-B
    por RFC en el alta (#5).
- **Sprint 2 — Descarga masiva (piloto DILESA, modo Metadata) + Bandeja.** Probar
  end-to-end la máquina de estados async, el dedup de dos dimensiones, el staging
  y la conciliación con el RFC de DILESA en modo observación. Máquina de estados
  `sat_descarga_solicitudes` + crons desacoplados (respeto a topes: 72h, 2
  descargas/paquete, 5002 lifetime, 2000 XML/día); parser de METADATA +
  estrategia Metadata-first; **descarga y relación de CFDI tipo P/REP** (no se
  emiten, pero se descargan y ligan para IVA/DIOT) + relación de **sustitución** en
  cancelaciones; **Bandeja de Conciliación Fiscal** (cola por calidad de match:
  auto-conciliado/probable/huérfano); observabilidad (frescura por empresa,
  heartbeat, alertas al canal de Beto); crons con actor explícito `system:sat-sync`
  - correlation IDs; patrón enforcement/aplicación + RPC auditada (gated Dirección
  - override admin). Conexiones: #1, #2.
- **Sprint 3 — Backfill acotado + escalado multi-empresa.** Fecha de corte por
  empresa + dashboard de avance; backfill por RFC con presupuesto diario; escalar
  el patrón probado a ANSA/COAGAN/RDB/Nigropetense (`empresa_id` como partición de
  primera clase + tests de aislamiento); habilitar efectos sobre la cuadratura
  DILESA (salir de modo observación). Pipeline de INGRESO limitado a DILESA (cruce
  CFDI de escrituración vs expediente de venta). Conexiones: #1, #5.
- **Fase 2 (declarada) — DIOT + conciliación fiscal mensual.** Convierte la data
  de egresos de archivo a cumplimiento de IVA. Flag de deducibilidad/acreditabilidad
  por factura; generador de DIOT por empresa/periodo (agrupa por RFC tercero,
  separa IVA acreditable/no-acreditable, export `.txt` batch SAT); reporte de
  conciliación fiscal mensual (emitido vigente vs declarado; IVA acreditable de
  recibidos vigentes vs acreditado). Conexiones: #1, #2.

## Riesgos

- **Backlog fantasma de CxP** (alta). Un cron que alimente `cxp_factura_alta` con
  histórico crearía pasivos `por_pagar` de facturas ya pagadas. Mitigación: la
  descarga masiva NUNCA escribe vía `cxp_factura_alta`; aterriza en
  `erp.cfdi_staging` read-only; la promoción a pasivo real es acto humano y solo
  para CFDI ≥ fecha de cutover.
- **Duplicación por TOCTOU** (alta). Índice `uuid_sat` plano + dedup app-level
  (verificado por gpt-5.5: `cxp_factura_alta` hace `SELECT` antes del `INSERT`).
  Mitigación: UNIQUE `(empresa_id, uuid_sat, sentido)` en Sprint 1 (el **sentido**
  importa: un CFDI intercompañía es legítimamente emitido por una empresa y
  recibido por otra) + 23505 idempotente. Sin esto el cron NO se enciende.
- **Custodia de la e.firma = llave maestra fiscal** (alta). Filtración compromete
  la identidad fiscal entera; caducidad (~4 años, peor en Nigropetense de
  movimiento nulo) rompe el sync en silencio. Mitigación: 1Password + Service
  Account scoped + Reminder de vigencia 90 días antes por RFC; preferir CIEC/PAC
  para un job read-only si la paridad funcional lo permite.
- **Cuadratura sin cross-check** (alta). Aplicar un Cancelado toca dinero y el WS
  es eventualmente-consistente (cancelado puede leerse vigente por horas).
  Mitigación: patrón aviso-y-confirma con debounce; nunca trigger automático.
- **Expectativa del backfill mal puesta** (alta). El cap de 2,000 XML/día hace el
  histórico de ANSA un goteo de semanas. Mitigación: separar backfill de
  steady-state; "2000/día" como constraint de primera clase.
- **SOAP + XML-DSig en Vercel serverless** (media). Libs cripto nuevas pueden no
  bundlear (precedente @react-pdf). Mitigación: spike en Sprint 0; plan B
  microservicio aislado (que de paso aísla la llave) o delegar a PAC (REST).
- **Scope creep hacia timbrado/contabilidad** (alta). Mitigación: línea dura
  escrita en el slug y el doc; emisión = iniciativas separadas.
- **Mezcla de universos fiscales** (media). 5 RFCs = 5 universos; un ZIP de la
  empresa A bajo `empresa_id` B mezcla universos. Mitigación: `empresa_id`
  partición de primera clase en toda la cadena + RLS empresa-scoped + tests de
  aislamiento + manejo de receptores genéricos XAXX/XEXX.
- **Identidad del CFDI mal modelada** (alta, gpt-5.5). Tratar el UUID como
  documento de una sola empresa rompe en intercompañía (mismo UUID, dos universos).
  Mitigación: modelo canónico `cfdi_documentos` + `cfdi_participaciones` con sentido
  desde el día 1; descubrirlo tras construir staging+bandeja sale caro.
- **Jobs sin actor en el audit trail** (media, gpt-5.5). `cxp_factura_recibir_cfdi`
  escribe `auth.uid()` y se llama vía service-role → un cron puede quedar sin
  usuario. Mitigación: actor explícito `system:sat-sync` + correlation IDs en toda
  RPC tocada por jobs SAT.
- **EFOS tratado como booleano** (media, gpt-5.5). 69-B no es sí/no: importa
  estatus (presunto/definitivo/desvirtuado), fecha de publicación, firmeza y el
  periodo del CFDI vs. el periodo de la lista. Mitigación: modelar esos campos en
  `core.sat_efos` y en el cruce.

## Métricas

- % de CFDI auto-conciliados (uuid ya en BSOP) sobre el total descargado por
  empresa — alto y creciente.
- Cola de huérfanos (CFDI sin match) → 0 por empresa.
- % de facturas del ejercicio vigente+anterior con `sat_validado_at` fresco.
- # de cancelaciones del SAT detectadas y aplicadas (vía confirmación humana) que
  antes pasaban invisibles en la cuadratura DILESA.
- # de proveedores marcados por 69-B/EFOS en el alta.
- Frescura del espejo por empresa ("última conciliación < N horas" en verde).
- Cero duplicados de `(empresa_id, uuid_sat, sentido)` tras encender el cron
  (invariante del UNIQUE canónico).

## ADRs candidatos

- **ADR — Arquitectura de credenciales fiscales** (custodia 1Password vs PAC, FIEL
  vs CIEC por servicio mínimo-privilegio, dónde vive el `.key`, aislamiento por
  empresa, rotación/revocación Beto-first). Sprint 0, bloqueante.
- **ADR — Capa `lib/sat/`** (espejo de `lib/ai`) con drift-guard en CI: aísla
  transporte/PAC concreto tras interfaz tipada; antídoto contra vendor lock-in.
- **ADR — Staging fiscal vs subledger**: separación universo-fiscal append-only
  (`erp.cfdi_staging`) ↔ subledger CxP (`erp.facturas`); regla de promoción + flag
  de origen.
- **ADR — Patrón detección/aplicación** para efectos financieros derivados del SAT
  (cruza la regla dura de control financiero, vive más allá de esta iniciativa).
- **ADR-DB — Identidad canónica del CFDI**: `cfdi_documentos(uuid_sat)` +
  `cfdi_participaciones(empresa_id, uuid_sat, sentido)` con UNIQUE
  `(empresa_id, uuid_sat, sentido)` + 23505 idempotente, como invariante de dedup
  multi-origen y multi-empresa (gpt-5.5; puede vivir en `supabase/adr/`).

## Bitácora

- **2026-06-27** — Promoción. Investigación de conexiones SAT + panel
  multi-ángulo (9 agentes: 2 de fundamentos, 6 críticos, 1 síntesis) que reencuadró
  la iniciativa a read-only/conciliación. Hallazgos verificados en el repo:
  índice `uuid_sat` plano, cuadratura sin cross-check, parser sin sello. Beto
  aprobó el alcance read-only, eligió DILESA como piloto, y planteó 1Password como
  custodio (incorporado como decisión candidata para Sprint 0). Próximo: Sprint 0
  (ADR de credenciales, sin código).
- **2026-06-27** — Segundo pase crítico con **gpt-5.5** (codex CLI, linaje GPT, para
  blind spots complementarios). Validó los 3 hallazgos contra el código + encontró
  uno nuevo (`cxp_factura_recibir_cfdi` con `auth.uid()` → jobs sin actor).
  Incorporado al doc: (1) **identidad canónica del CFDI** multi-empresa (documento +
  participación por sentido) — el cambio de mayor impacto; (2) **enforcement de
  workflow con override** (read-only ≠ solo-avisar): bloquear pagos a CFDI
  cancelado/EFOS sin tocar saldos; (3) corrección: la **Metadata no es gratis** ni
  pública (requiere e.firma) → Sprint 0 prueba el SOAP real; (4) **1Password no es
  HSM** (no cierra runtime) → el ADR es un threat model; (5) parser fiscal completo,
  EFOS no-booleano, REP-lectura, actor `system:sat-sync`.

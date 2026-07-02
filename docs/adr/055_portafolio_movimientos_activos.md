# ADR-055 — Subdivisiones, fusiones y relotificaciones de activos del portafolio

**Estado:** aceptada · 2026-07-02
**Iniciativa:** `dilesa-portafolio-predios` (S5)
**Decide:** cómo se modela la transformación catastral de predios (un predio se parte en varios, varios se funden en uno, o N se reacomodan en M) con trazabilidad completa.

## Contexto

DILESA subdivide y fusiona predios con regularidad (ante notario/catastro): la
Parcela 122 del Ejido Villa de Fuente ya aparece partida en el listado de
prediales (`47-122` y `47-122/1`), y hay una **relotificación en trámite** para
entregar un área verde al municipio de Piedras Negras como contraprestación del
convenio de reducción del predial 60% 2026-2027. Hoy nada de esto deja registro
estructurado: se editaba el activo a mano y el linaje se perdía.

Restricciones del modelo existente (ADR-009/010):

- `dilesa.activos` tiene ciclo de vida (`prospecto → adquirido → operando →
desincorporado`) y jerarquía `activo_padre_id` (plaza→local, estructura→cara).
- Las cuentas catastrales viven en `dilesa.cuentas_prediales` (iniciativa
  `dilesa-portafolio-predios` S1) con `estatus` (`activa | baja_subdivision |
baja_fusion | baja_venta | baja_otro`): catastro da de baja la clave del
  predio origen y emite claves nuevas para los resultantes.
- ADR-010 ya contempla proyectos `tipo=subdivision` para cuando la subdivisión
  es un DESARROLLO (con costos, urbanización, prorrateo). Este ADR cubre el
  caso **ligero**: el trámite notarial/catastral puro, sin proyecto.

## Decisión

### D1 — Movimiento como evento inmutable (tabla + partes)

- **`dilesa.activo_movimientos`**: un evento por transformación — `tipo`
  (`subdivision | fusion | relotificacion`), `fecha`, `documento_id` (FK
  opcional a `erp.documentos`: la escritura/oficio que la ampara), `notas`,
  `creado_por`. Append-only: no se edita ni borra (audit trail, regla dura).
- **`dilesa.activo_movimiento_partes`**: liga N:M movimiento ↔ activos con
  `rol` (`origen | resultante`). Subdivisión = 1 origen → N resultantes;
  fusión = N orígenes → 1 resultante; relotificación = N → M.

### D2 — Los orígenes se desincorporan, nunca se borran

El activo origen pasa a `estado='desincorporado'` con la razón anotada en
`notas` (append). Su expediente, documentos, escrituras y cuentas prediales
quedan consultables — el historial predial de la clave vieja es exactamente lo
que el municipio audita.

### D3 — Los resultantes nacen ligados al linaje

Cada resultante se crea como activo nuevo (mismo INSERT canónico del alta) con
`activo_padre_id = primer origen` y hereda por default `zona`, `municipio`,
`estado_geo` y `situacion_legal` del origen (overridables en el wizard). Las
claves catastrales nuevas se capturan al crearlos (o después) y generan su
`cuenta_predial` propia cuando se conozcan.

### D4 — Las cuentas prediales del origen se dan de baja lógica

`estatus = 'baja_subdivision' | 'baja_fusion'` según el tipo (relotificación
usa `baja_subdivision` — catastro lo procesa igual). La cuenta conserva su
`activo_id` origen y todo su historial de ejercicios.

### D5 — Una RPC atómica, SECURITY INVOKER

`dilesa.fn_ejecutar_movimiento_activos(p_tipo, p_origen_ids uuid[],
p_resultantes jsonb, p_fecha, p_documento_id, p_notas)` hace todo en una
transacción (evento + partes + desincorporar + crear resultantes + bajas de
cuentas). Guards: orígenes vivos y de la misma empresa, cardinalidad por tipo,
resultantes con nombre y tipo válidos. La suma de superficies se compara y la
diferencia se ANOTA en el movimiento (no bloquea: en una relotificación es
normal ceder área al municipio). UI gated admin/Dirección, como toda escritura
del portafolio.

## Alternativas descartadas

- **Editar el activo origen in-place** (cambiarle superficie/clave): pierde el
  linaje y el historial predial de la clave vieja; imposible auditar.
- **Proyecto `tipo=subdivision` obligatorio**: sobra para el caso notarial puro
  (sin costos ni obra); ADR-010 queda para subdivisiones-desarrollo.
- **Soft-delete del origen** (`deleted_at`): lo escondería de listas e
  historial; `desincorporado` es el estado semánticamente correcto del ciclo
  de vida y ya existe.

## Consecuencias

- El caso piloto (relotificación del área verde del convenio predial) quedará
  registrado end-to-end: predio origen → resultantes (área verde municipal +
  remanentes DILESA) → convenio referenciando el movimiento en notas.
- `activo_padre_id` gana un segundo significado (linaje además de composición
  plaza→local); se distingue por el movimiento asociado.
- El wizard vive en el expediente del activo; el historial de movimientos se
  muestra tanto en el origen como en los resultantes.

# Iniciativa — Finiquito mejoras (UX + dinámica + audit trail)

**Estado:** in_progress
**Empresas:** todas (cross-empresa, hereda DILESA + RDB; ANSA y COAGAN
heredan automáticamente cuando capturen sus datos fiscales en
`core.empresas`).
**Schemas:** `core` (lectura empresas), `erp` (nueva tabla `finiquitos`).
**Última actualización:** 2026-04-30

## Problema

Beto detectó al usar el flujo de baja con generación de finiquito en
`/<empresa>/rh/personal/<id>` (live, post sub-PR 5 de
`shared-modules-refactor`):

1. **Bug visual** — el modal "Dar de baja al empleado" tiene
   `DialogContent max-w-sm` (384 px) y `DialogFooter` con 3 botones
   horizontales: Cancelar, Solo dar de baja, Baja + generar finiquito.
   Los textos en español + íconos no caben en 384 px y los botones se
   salen del cuadro a partir del breakpoint `sm`.
2. **Ciudad hardcoded** — el `<FiniquitoPrintable>` arranca con _"En la
   ciudad de Piedras Negras, Coahuila…"_ literal en
   [components/rh/finiquito-printable.tsx:102](../../components/rh/finiquito-printable.tsx).
   DILESA y RDB ambas operan ahí, pero ANSA tiene domicilio fiscal en
   un municipio distinto y la convención debe leerse de `core.empresas`.
3. **Sin audit trail** — el convenio se imprime pero no se persiste en
   DB. Si el cálculo cambia entre dos impresiones (causa, fecha, sueldo),
   no hay rastro de qué firmó el trabajador. Para una empresa que paga
   liquidaciones esto es no negociable.
4. **Forma de pago sin captura** — la cláusula PRIMERA del convenio
   dice \_"mediante [efectivo / cheque / transferencia bancaria nº ___]"\_
   con bracket placeholder. Beto pidió que la forma + referencia se
   capturen antes de imprimir y queden en el documento.
5. **Salario mínimo por zona hardcoded** — el módulo usa
   `SALARIO_MINIMO_DIARIO_ZLFN_2026 = 374.89` como default global. El SM
   correcto depende del municipio de la empresa: Zona Libre Frontera
   Norte (43 municipios) usa $374.89; el resto del país usa $248.93
   (general 2026, fuente CONASAMI). Beto explicitó que "depende de
   donde esté la ciudad".

## Outcome esperado

Para todo empleado de cualquier empresa con datos fiscales completos
en `core.empresas`:

- El modal de baja respeta los límites del dialog en todos los
  breakpoints (mobile + desktop).
- El printable abre con la ciudad/estado del domicilio fiscal de la
  empresa (no Piedras Negras hardcoded).
- El SM diario default se calcula desde el municipio de la empresa
  (ZLFN vs general) y queda editable como lo está hoy.
- Cada vez que se "imprime" un finiquito, se persiste en `erp.finiquitos`
  un snapshot completo: causa, fechas, conceptos calculados, sueldos
  base, datos del trabajador, datos del patrón, forma de pago,
  referencia, total. Se puede listar el historial por empleado desde
  su detalle.

## Alcance v1

### Sprint 1 — UX dinámica (PR sin DB)

1. Fix modal: `DialogFooter` con `flex-col` global + botones full-width
   en el modal de baja.
2. Extender `ContratoPatron` con `municipio: string` y `estado: string`
   como campos sueltos (además de `domicilio` agregado).
3. `buildPatronFromDatos` populate los nuevos campos desde
   `domicilio_municipio` y `domicilio_estado`.
4. `<FiniquitoPrintable>`: header lee `patron.municipio`/`patron.estado`
   en lugar de literal "Piedras Negras, Coahuila".
5. Helper nuevo `lib/hr/salario-minimo-zona.ts`:
   - Lista de los 43 municipios ZLFN (CONASAMI).
   - Función `getSalarioMinimoZona({ municipio, estado, anio })` que
     devuelve `{ valor, zona: 'frontera' | 'general', anio }`.
   - Tabla de SM por año (`{ general: 248.93, frontera: 374.89 }` para
     2026; preparar entrada para 2027).
6. `<EmpleadoFiniquitoModule>` usa el helper para inicializar
   `salarioMinimo` en lugar de la constante `ZLFN_2026` hardcoded.

### Sprint 2 — Persistencia + forma de pago (PR con migración)

1. Migración `erp.finiquitos` con columnas:
   - `id uuid pk`, `empleado_id uuid fk`, `empresa_id uuid fk`
     (denormalizado para RLS rápida)
   - `fecha_baja date`, `fecha_convenio date`, `causa text`,
     `motivo_detalle text`
   - `fecha_ingreso date`, `antiguedad_anios int`, `antiguedad_meses int`,
     `antiguedad_dias int`
   - `sueldo_diario numeric(12,2)`, `sdi numeric(12,2)`,
     `salario_minimo_diario numeric(12,2)`, `zona_salario_minimo text`
   - `total_finiquito numeric(14,2)`, `total_indemnizacion numeric(14,2)`,
     `total_general numeric(14,2)`
   - `conceptos jsonb` (snapshot del array `FiniquitoConcepto[]`)
   - `notas_calculo jsonb` (array de strings; las que el cálculo emite)
   - `forma_pago text` (enum: 'efectivo' | 'cheque' | 'transferencia')
   - `referencia_pago text` (nº cheque o referencia de transferencia)
   - `patron_snapshot jsonb` (razón social, RFC, domicilio del patrón
     al momento de generación — para que cambios futuros en
     `core.empresas` no alteren el documento histórico)
   - `creado_por uuid` (auth.uid()), `creado_en timestamptz`
2. RLS: lectura/escritura por `empresa_id` con el helper canónico
   (mirror del patrón en `erp.empleados`).
3. `<EmpleadoFiniquitoModule>`:
   - Agregar campos `forma_pago` (combo) y `referencia_pago` (input,
     placeholder dinámico según forma).
   - El printable usa estos campos en lugar del bracket placeholder.
   - Botón nuevo "Guardar y descargar" que persiste antes de imprimir.
   - El botón "Imprimir finiquito" actual se mantiene para preview sin
     persistir (con label aclaratorio).
4. `<EmpleadoDetailModule>`: nueva sección "Finiquitos generados" que
   lista los registros de `erp.finiquitos` para ese empleado (read-only,
   con link a re-imprimir).

## Métricas de éxito

- Sprint 1 mergeado: bug visual del modal cerrado (verificable en
  preview), `<FiniquitoPrintable>` muestra ciudad/estado correctos para
  DILESA y RDB.
- Sprint 2 mergeado: 1 finiquito de prueba persistido en
  `erp.finiquitos` con todos los campos, listable desde el detalle del
  empleado.

## Riesgos

- **Migración manual**: por la regla "Migraciones DB en BSOP", Beto
  aplica el SQL después de mergear el PR de Sprint 2. Si el SQL falla
  parcialmente (ej. ya existe la tabla porque se experimentó antes),
  Beto rollbackea manualmente. La migración usa `IF NOT EXISTS` /
  `CREATE OR REPLACE` para idempotencia.
- **Datos snapshot vs. live**: el `patron_snapshot` en `erp.finiquitos`
  congela los datos del patrón al momento de generación. Esto es el
  comportamiento correcto (auditoría) pero implica que si se corrige el
  domicilio fiscal de la empresa después, los finiquitos viejos siguen
  mostrando el dato viejo. Beto OK con ese trade-off (auditoría > UX
  retroactiva).

## Decisiones registradas

- **2026-04-30**: Beto autoriza promover los 5 puntos como una sola
  iniciativa de 2 sprints. Modal fix + ciudad dinámica + SM por zona
  van en Sprint 1 (sin DB) para soltar valor rápido. Persistencia +
  forma de pago van en Sprint 2 (con migración) para audit trail.
- **2026-04-30**: SM por zona no se va a tabla en DB; se mantiene como
  constante en TypeScript con tabla por año. Reasoning: cambia 1 vez
  al año en enero, la tabla en TS se commitea junto con la actualización
  de constantes y no requiere migración. Si en el futuro las empresas
  necesitan zonas custom (ej. ANSA en otra entidad), se evalúa mover a
  DB en ese momento.
- **2026-04-30**: el `domicilio_estado` se interpreta como el estado
  oficial mexicano (ej. "Coahuila", "Nuevo León"); `domicilio_municipio`
  como el municipio (ej. "Piedras Negras"). Si en `core.empresas` están
  capturados con variantes ortográficas, el helper hace `trim()` +
  comparación case-insensitive contra la lista canónica de ZLFN.

## Bitácora

- **2026-04-30**: Beto reporta bug visual del modal y solicita revisión
  del proceso completo de finiquitos. Tras el explainer, autoriza los
  5 puntos como iniciativa formal. Promovida a `in_progress` en este
  mismo PR (Sprint 1 arranca de inmediato).

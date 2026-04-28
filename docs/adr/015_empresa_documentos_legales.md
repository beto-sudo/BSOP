# ADR-015 — Empresa: documentos legales por referencia con rol semántico

- **Status**: Accepted
- **Date**: 2026-04-28
- **Authors**: Beto, Claude Code (iniciativa `empresa-documentos-legales`)
- **Related**: [planning](../planning/empresa-documentos-legales.md), [ADR-011](./011_shared_modules_cross_empresa.md)

---

## Contexto

`erp.documentos` es la fuente de verdad de los PDFs legales de cada empresa:
escrituras constitutivas, reformas, poderes notariales, compraventas,
contratos, etc. Tiene `tipo`, `subtipo_meta` (jsonb), `archivo_url`,
`notario_proveedor_id` y extracción IA con `extraccion_status` que parsea
el PDF entero.

Por otro lado, `lib/rh/datos-fiscales-empresa.ts` exige varios campos
notariales (`numero, fecha, notario, notaria_numero, distrito` para la
constitutiva y para el poder del representante) antes de permitir alta de
empleados o generar contratos LFT.

Históricamente — y como quick-win en PR #280 — esos campos se capturaban
**a mano** en `core.empresas.escritura_constitutiva` y `escritura_poder`
(jsonb). El operador re-tipiaba la metadata del PDF que ya estaba en
`erp.documentos`. Esto deja **dos problemas estructurales**:

1. **Duplicación de metadata** entre `erp.documentos.subtipo_meta`
   (poblado por la IA) y `core.empresas.escritura_*` (capturado a mano).
   Si el PDF cambia o se corrige, hay que sincronizar a mano.
2. **Sin trazabilidad** del PDF original desde el flujo de RH. El
   contrato laboral se imprime con metadata pero sin liga al instrumento
   notarial.
3. **Sin semántica de uso por documento**. Una empresa puede tener
   varios poderes vigentes (general administración, actos de dominio,
   bancario, IMSS). El jsonb `escritura_poder` solo soporta uno —
   no hay forma de declarar "este poder es para contratos laborales,
   este otro es para apertura de cuentas".
4. **No escala más allá de escrituras/poderes**. Mañana van a aparecer
   reglamento interior de trabajo, comprobantes de domicilio, políticas
   internas — todos documentos legales con rol específico.

## Decisión

Las empresas **no almacenan metadata propia de documentos legales**. En
cambio, **referencian** documentos del módulo Documentos vía una tabla
intermedia polimórfica con rol:

```sql
CREATE TABLE core.empresa_documentos (
  id            UUID PK,
  empresa_id    UUID NOT NULL REFERENCES core.empresas(id),
  documento_id  UUID NOT NULL REFERENCES erp.documentos(id),
  rol           TEXT NOT NULL,         -- CHECK con lista cerrada
  es_default    BOOLEAN NOT NULL,      -- partial UNIQUE por (empresa_id, rol)
  asignado_por  UUID REFERENCES core.usuarios(id),
  asignado_at   TIMESTAMPTZ NOT NULL,
  notas         TEXT,
  ...
);
```

**Roles iniciales** (extensibles vía `ALTER CONSTRAINT`):
`acta_constitutiva`, `acta_reforma`, `poder_general_administracion`,
`poder_actos_dominio`, `poder_pleitos_cobranzas`, `poder_bancario`,
`representante_legal_imss`.

**Reglas del modelo** (codificadas como ED1-ED7 — _**E**mpresa
**D**ocumentos legales_):

### ED1 — Múltiples vigentes por rol, uno default

Una empresa puede tener varios documentos del mismo rol simultáneamente
(ej. tres poderes generales otorgados en distintas fechas, todos
vigentes). Exactamente uno se marca `es_default = true` por
`(empresa_id, rol)` (enforced por partial UNIQUE index). Los flujos
automáticos (alta empleado, contrato LFT) usan el default. La UI permite
cambiar default sin desasignar los demás.

### ED2 — Caché jsonb sincronizado por trigger

Las columnas `core.empresas.escritura_constitutiva` y `escritura_poder`
**siguen existiendo** pero como caché read-only que sincroniza
automáticamente vía
`core.fn_empresa_documentos_sync_escrituras_cache(empresa_id, rol)` cuando
cambia el `es_default` de los roles `acta_constitutiva` y
`poder_general_administracion`. Tres triggers (INSERT/UPDATE/DELETE
STATEMENT-level) agrupan por `(empresa_id, rol)` distintos y llaman a la
función de sync. El validador de RH y los printables de contratos
**siguen leyendo del caché** sin refactor.

### ED3 — Mapeo defensivo del subtipo_meta

La función de sync mapea defensivamente las dos convenciones de naming
que la extracción IA puede producir
(`numero_escritura`/`numero`, `fecha_escritura`/`fecha`,
`notario_nombre`/`notario`, `distrito_notarial`/`distrito`). Si Sprint
2's extracción extendida estandariza a una convención única en el
futuro, el mapeo se simplifica a una sola key.

### ED4 — Espejo TS ↔ PL/pgSQL del mapeo

`lib/empresa-documentos/cache-mapping.ts` replica la lógica de
`fn_empresa_documentos_sync_escrituras_cache` en TypeScript. Sirve para
preview en UI antes del assign + cobertura de tests sin tocar DB.
Comentarios "espejo de X" en ambos lados para que el próximo editor
compare al modificar.

### ED5 — Ownership: documento pertenece a empresa

Un documento solo puede asignarse a la **misma** empresa a la que ya
pertenece (`erp.documentos.empresa_id`). El endpoint POST valida y
rechaza con 403 si difiere. El caso de "documento compartido entre
empresas del grupo" (ej. poder cruzado) queda fuera del v1; cuando
emerja, agregar columna `empresas_compartidas` o cambiar el modelo a
permitirlo explícitamente.

### ED6 — Hard delete de asignación, NO del documento

Desasignar (`DELETE`) borra el row de `core.empresa_documentos` pero
**no toca** el documento original en `erp.documentos`. La UI lo deja
explícito en el confirm: "el documento original NO se borra; solo se
quita la liga".

### ED7 — Solo admin v1; matriz de roles abierta

INSERT/UPDATE/DELETE solo `core.fn_is_admin()` en RLS y endpoints. La
apertura a comité ejecutivo / accionistas queda como sub-iniciativa
cross-cutting cuando se defina la matriz general de "acciones
admin-only" del repo.

## Alternativas consideradas

- **(A) FK directas en `core.empresas`**:
  `escritura_constitutiva_documento_id`, `poder_general_documento_id`,
  etc. Más simple pero se llena de columnas si crecen los usos. No
  soporta "múltiples poderes vigentes" sin agregar más columnas.
  Rechazada.

- **(B) Captura a mano + jsonb (status quo de PR #280)**: Funciona pero
  duplica la metadata y no escala más allá de escrituras/poderes.
  Mantenida temporalmente como _legacy_ debajo de `<details>` en la UI;
  se deprecará cuando todas las empresas estén migradas al modelo nuevo.

- **(C) Schema sin caché jsonb**: leer siempre vía referencia + JOIN.
  Más limpio pero requiere refactor de `lib/rh/datos-fiscales-empresa.ts`
  y de los printables. Rechazada por scope (cambio incremental gana).

- **(D) Trigger ROW-level**: simpler que STATEMENT-level pero tropezaría
  con el partial UNIQUE durante el "cambio atómico de default" cuando un
  endpoint baja el flag de uno y sube el de otro en dos UPDATEs
  separados. STATEMENT-level es defensivo. Aceptado.

## Consecuencias

- **Single source of truth para metadata legal**: `erp.documentos`. La
  extracción IA es la única vía de captura para nuevas escrituras.
- **Consumers de RH no necesitan refactor**: `escritura_*` jsonb sigue
  siendo el contrato externo, ahora alimentado automáticamente.
- **Costo de adopción**: Sprint 5 operativo (Beto sube docs faltantes y
  asigna en cada empresa). Mientras no se complete, el editor manual
  legacy queda disponible pero no es la ruta recomendada.
- **Extensibilidad**: agregar un nuevo rol legal requiere `ALTER
TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...` con la nueva lista
  - actualizar `EMPRESA_DOCUMENTOS_ROLES` en `cache-mapping.ts`. Sin
    schema changes a `core.empresas`.
- **Riesgo de stale cache**: si alguien hace `UPDATE` directo sobre
  `core.empresa_documentos` bypaseando RLS (ej. desde un script con
  service_role), el trigger se dispara igual y el caché queda
  consistente. Si alguien hace `UPDATE` sobre `erp.documentos.subtipo_meta`
  sin tocar `empresa_documentos`, el caché queda stale hasta que se
  re-asigne o se llame `fn_empresa_documentos_sync_escrituras_cache`
  manualmente. Mitigación: futuro endpoint admin "resincronizar caché"
  para casos edge.

## Migration path

- **Sprint 1** (DB schema) — ✅ #286
- **Sprint 2** (extracción IA) — ✅ #288
- **Sprint 3** (API endpoints) — ✅ #289
- **Sprint 4** (UI panel) — ✅ #290
- **Sprint 5** (operativo, lo hace Beto) — pendiente: subir docs faltantes
  de RDB/ANSA/COAGAN; asignar los de DILESA que ya están cargados.
- **Sprint 6** (cleanup): ADR (este doc) + deprecar editor manual legacy
  cuando las 4 empresas estén migradas.

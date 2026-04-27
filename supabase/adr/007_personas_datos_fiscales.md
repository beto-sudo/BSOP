# ADR-007 — Datos fiscales de personas: tabla anexa 1:1 a `erp.personas`

**Status:** Accepted
**Fecha:** 2026-04-27
**Iniciativa:** [`proveedores-csf-ai`](../../docs/planning/proveedores-csf-ai.md)
**Authors:** Beto (alcance), Claude Code (decisión técnica)

## Contexto

La iniciativa `proveedores-csf-ai` requiere capturar los datos fiscales completos que vienen en la Constancia de Situación Fiscal del SAT: tipo de persona (física/moral), razón social, régimen fiscal, domicilio fiscal estructurado, regímenes y obligaciones, fecha inicio de operaciones.

Hoy `erp.personas` (línea 1763 de `SCHEMA_REF.md`) tiene 22 columnas mezclando identidad básica (nombre, apellidos, email, teléfono) con datos personales sensibles (CURP, NSS, fecha nacimiento, contacto de emergencia) y un `domicilio` text libre sin estructura. No hay separación entre persona física y moral, ni catálogo de régimen fiscal, ni código postal estructurado.

`erp.proveedores`, `erp.empleados` y `erp.clientes` ya viven como tablas anexas 1:1 con FK a `erp.personas` — atributos específicos del rol fuera de la tabla maestra. Es el patrón establecido del repo.

`erp.adjuntos` (línea 1119) es polimórfica con (`entidad_tipo`, `entidad_id`, `rol`); el PDF de la CSF se archiva ahí sin schema nuevo.

La pregunta del alcance: **¿columnas nuevas en `erp.personas` o tabla anexa `personas_datos_fiscales`?**

## Decisión

**Tabla anexa 1:1 nueva: `erp.personas_datos_fiscales`**, con FK `persona_id` UNIQUE a `erp.personas(id)`. La CSF (PDF) se archiva con `entidad_tipo='persona'`, `rol='csf'`, `entidad_id=persona_id` — versionado nativo por `created_at`.

`erp.personas` recibe **una sola columna nueva**: `tipo_persona` (`'fisica'` | `'moral'`) con default `'fisica'`. Es lo único fundamental que cambia el tratamiento UI/validación de toda la persona — no es un atributo fiscal anexo, es identidad.

### Forma propuesta

```sql
-- Migración aditiva: erp.personas
alter table erp.personas
  add column tipo_persona text not null default 'fisica'
    check (tipo_persona in ('fisica', 'moral'));

-- Tabla anexa nueva
create table erp.personas_datos_fiscales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references core.empresas(id),
  persona_id uuid not null unique references erp.personas(id) on delete cascade,

  -- Identidad fiscal
  razon_social text,           -- oficial SAT (morales); para físicas usualmente null
  nombre_comercial text,

  -- Régimen
  regimen_fiscal_codigo text,  -- código SAT (ej. '601', '612')
  regimen_fiscal_nombre text,  -- denormalizado del catálogo SAT
  regimenes_adicionales jsonb, -- array opcional para personas con varios

  -- Domicilio fiscal estructurado
  domicilio_calle text,
  domicilio_num_ext text,
  domicilio_num_int text,
  domicilio_colonia text,
  domicilio_cp text,           -- 5 dígitos México
  domicilio_municipio text,
  domicilio_estado text,
  domicilio_pais text default 'México',

  -- Obligaciones fiscales
  obligaciones jsonb,          -- array de descripciones SAT

  -- Trazabilidad de la CSF vigente
  csf_adjunto_id uuid references erp.adjuntos(id),
  csf_fecha_emision date,
  fecha_inicio_operaciones date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index personas_datos_fiscales_persona_id_uidx
  on erp.personas_datos_fiscales(persona_id);
create index personas_datos_fiscales_empresa_id_idx
  on erp.personas_datos_fiscales(empresa_id);
```

### Por qué tabla anexa y no columnas en `personas`

1. **Sigue el patrón del repo.** `proveedores`, `empleados`, `clientes` ya son tablas anexas 1:1. Agregar una más es coherente; inflar `personas` con 15+ columnas fiscales rompe la consistencia.
2. **Concerns separados.** `personas` es identidad (cómo se llama, cómo lo contacto). Datos fiscales son una capa formal que solo aplica cuando hay CSF. La mayoría de personas en `personas` (empleados sin CSF cargada, contactos varios) no necesitan la capa fiscal.
3. **Queries explícitos.** El módulo de proveedores hace `LEFT JOIN personas_datos_fiscales` cuando los necesita; otros módulos (RH, clientes generales) ignoran la tabla. Si fueran columnas en `personas`, viajan como ruido en cada `select *`.
4. **Migración aditiva, sin riesgo.** Crear tabla nueva no afecta filas existentes ni código actual. Agregar 15 columnas nullable a una tabla con FKs desde 7+ tablas es más invasivo y aumenta el área de regresión.
5. **Espacio para versionado futuro.** Si después se quiere histórico de cambios fiscales (no solo del PDF, también del estado parseado), agregamos `personas_datos_fiscales_historial` o convertimos a versionado en otro ADR. Con columnas en `personas` la migración futura sería más cara.

### Por qué `tipo_persona` sí va en `erp.personas`

Es la pregunta fundamental "¿es una persona física o una empresa?", anterior a si tiene CSF cargada o no. Define:

- Qué campos UI mostrar (apellidos solo físicas; razón social solo morales).
- Qué validaciones aplicar al RFC (12 chars morales, 13 chars físicas).
- Cómo agruparla en listados y reports.

Si vive en `personas_datos_fiscales`, la UI tiene que hacer LEFT JOIN para saber algo que necesita siempre. Default `'fisica'` preserva las filas existentes (la mayoría son empleados, todos físicas).

### Por qué CSF como adjunto polimórfico, no FK directa al PDF en datos_fiscales

`erp.adjuntos` ya soporta polimorfismo con `entidad_tipo` + `entidad_id` + `rol`. Usarlo:

- **Histórico nativo.** Listar CSFs anteriores: `where entidad_tipo='persona' and rol='csf' and entidad_id=:persona_id order by created_at desc`. No hay tabla nueva.
- **`csf_adjunto_id` apunta al vigente.** Cuando aplican un update con diff campo-por-campo, `csf_adjunto_id` se actualiza al PDF nuevo; el anterior queda en `adjuntos` como histórico.
- **Reusa el patrón de Documentos.** El módulo de Documentos ya carga PDFs así.

### Por qué `regimen_fiscal_codigo` + `_nombre` denormalizado y no FK a catálogo

No tenemos catálogo SAT como tabla — y crear uno solo para esta tabla es over-engineering. Guardar `('601', 'General de Ley Personas Morales')` denormalizado es suficiente para mostrar y filtrar. Si en el futuro queremos filtrar por código sin string match, agregamos el catálogo en otro ADR.

### Por qué `obligaciones` y `regimenes_adicionales` como `jsonb`

La extracción IA pobla esto desde la CSF en lista variable. Rara vez se filtra/joinea por estos campos — son metadata visual del proveedor. `jsonb` evita una tabla N:M solo para casos de display. Si después hace falta query estructurado, se normaliza.

## Consecuencias

### Positivas

- Código de proveedores hace `LEFT JOIN personas_datos_fiscales` cuando muestra datos fiscales; otros módulos no se enteran.
- Migración aditiva sin riesgo de regresión.
- El módulo de Documentos puede reutilizar el patrón de extracción sin cambios — `entidad_tipo='persona', rol='csf'` cuadra con la convención existente.
- El catálogo SAT vive como denormalización, sin acoplamiento a una tabla referencial que no necesitamos hoy.

### Negativas

- Una query "dame al proveedor con su régimen fiscal" requiere JOIN. Mitigación: `select *` desde proveedores ya hace JOIN a personas; agregar un JOIN más es trivial.
- Si en el futuro se quiere `tipo_persona` con más valores (`'fideicomiso'`, `'extranjero'`), la columna en `personas` se amplía. Aceptable — el conjunto de tipos relevantes es chico y estable.

### Cosas que NO cambian

- `erp.personas` mantiene sus 22 columnas existentes y todas sus FKs entrantes (de `proveedores`, `empleados`, `clientes`, etc.).
- Filas existentes en `personas` reciben `tipo_persona='fisica'` por default. No hay backfill necesario salvo para morales conocidas (puntual, manual, no en este ADR).
- El módulo de adjuntos no cambia.
- `domicilio` text libre en `personas` se preserva — la nueva tabla tiene domicilio estructurado, pero el campo legacy queda como referencia hasta que se decida limpieza en otro ADR.

## Notas de implementación

- **RLS por empresa**: replicar el patrón de `personas` (FK a `empresa_id` + policy por empresa). La tabla nueva es per-empresa.
- **Dedup por RFC al alta**: la query es `where empresa_id=:e and rfc=:rfc and activo=true` sobre `personas` (donde vive `rfc`), no en la nueva tabla. Sin cambios al modelo de dedup.
- **Trigger de `updated_at`**: replicar trigger estándar del repo.
- **Soft delete**: la tabla anexa se elimina en cascada cuando `personas` se elimina (vía `on delete cascade`). Si se quiere preservar histórico, se cambia a `on delete restrict` y se hace soft delete en ambas. Decisión: cascade — el dato fiscal sin persona no tiene sentido.

## Referencias

- `supabase/SCHEMA_REF.md` líneas 1763 (personas), 1840 (proveedores), 1119 (adjuntos).
- Iniciativa: `docs/planning/proveedores-csf-ai.md`.
- Patrón de extracción IA reutilizable: `lib/documentos/extraction-core.ts`, `app/api/documentos/[id]/`.

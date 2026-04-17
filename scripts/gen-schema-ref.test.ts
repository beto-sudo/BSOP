import { describe, it, expect } from 'vitest';

import { formatSchemaRef, type SchemaData, type FormatOptions } from './gen-schema-ref';

/**
 * Tests para `formatSchemaRef` — la función pura que convierte los datos
 * crudos de `information_schema` al markdown determinístico de
 * `supabase/SCHEMA_REF.md`.
 *
 * La intención es lockear tres propiedades críticas:
 *   1. Determinismo — mismo input siempre produce el mismo output
 *      (sin esto los PRs de regeneración tendrían diffs espurios).
 *   2. Orden canónico — schemas/tablas alfabéticos, columnas por ordinal.
 *   3. Render correcto de PK, FK, nullable, default, tipo de objeto
 *      (tabla / vista / materialized view) y comentarios de tabla.
 */

const GENERATED_AT = '2026-04-17T10:00:00Z';

function opts(schemas: string[]): FormatOptions {
  return { schemas, generatedAt: GENERATED_AT };
}

describe('formatSchemaRef — structure', () => {
  it('renders header + schemas-covered blurb', () => {
    const out = formatSchemaRef(
      { tables: [], columns: [], pks: [], fks: [] },
      opts(['core', 'erp'])
    );
    expect(out).toContain('# BSOP Supabase Schema Reference');
    expect(out).toContain(`Last regenerated: ${GENERATED_AT}`);
    expect(out).toContain('Schemas: core, erp');
    expect(out).toContain('**Schemas cubiertos:** `core` · `erp`');
  });

  it('renders "sin tablas ni vistas" when a schema is empty', () => {
    const out = formatSchemaRef({ tables: [], columns: [], pks: [], fks: [] }, opts(['core']));
    expect(out).toContain('## Schema `core`');
    expect(out).toContain('_(sin tablas ni vistas)_');
  });

  it('ends with exactly one trailing newline', () => {
    const out = formatSchemaRef({ tables: [], columns: [], pks: [], fks: [] }, opts(['core']));
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});

describe('formatSchemaRef — determinism & ordering', () => {
  const data: SchemaData = {
    tables: [
      { schema: 'erp', name: 'puestos', kind: 'table', comment: null },
      { schema: 'core', name: 'usuarios', kind: 'table', comment: null },
      { schema: 'erp', name: 'departamentos', kind: 'table', comment: null },
      { schema: 'core', name: 'empresas', kind: 'table', comment: null },
    ],
    columns: [
      // Intencionalmente desordenados.
      {
        schema: 'core',
        table: 'empresas',
        name: 'nombre',
        type: 'text',
        nullable: true,
        defaultExpr: null,
        ordinal: 3,
      },
      {
        schema: 'core',
        table: 'empresas',
        name: 'id',
        type: 'uuid',
        nullable: false,
        defaultExpr: 'gen_random_uuid()',
        ordinal: 1,
      },
      {
        schema: 'core',
        table: 'empresas',
        name: 'slug',
        type: 'text',
        nullable: false,
        defaultExpr: null,
        ordinal: 2,
      },
    ],
    pks: [{ schema: 'core', table: 'empresas', columns: ['id'] }],
    fks: [],
  };

  it('orders schemas alphabetically in opts.schemas', () => {
    const out = formatSchemaRef(data, opts(['erp', 'core']));
    const coreIdx = out.indexOf('## Schema `core`');
    const erpIdx = out.indexOf('## Schema `erp`');
    expect(coreIdx).toBeGreaterThan(-1);
    expect(erpIdx).toBeGreaterThan(coreIdx);
  });

  it('orders tables alphabetically within a schema', () => {
    const out = formatSchemaRef(data, opts(['core', 'erp']));
    const dep = out.indexOf('### `erp.departamentos`');
    const pue = out.indexOf('### `erp.puestos`');
    expect(dep).toBeGreaterThan(-1);
    expect(pue).toBeGreaterThan(dep);
  });

  it('orders columns by ordinal_position, not insertion order', () => {
    const out = formatSchemaRef(data, opts(['core', 'erp']));
    const idIdx = out.indexOf('**id**');
    const slugIdx = out.indexOf('**slug**');
    const nombreIdx = out.indexOf('**nombre**');
    expect(idIdx).toBeLessThan(slugIdx);
    expect(slugIdx).toBeLessThan(nombreIdx);
  });

  it('is stable — same input produces byte-identical output twice', () => {
    const a = formatSchemaRef(data, opts(['core', 'erp']));
    const b = formatSchemaRef(data, opts(['core', 'erp']));
    expect(a).toBe(b);
  });
});

describe('formatSchemaRef — column rendering', () => {
  it('emits NOT NULL and DEFAULT markers', () => {
    const out = formatSchemaRef(
      {
        tables: [{ schema: 'core', name: 't', kind: 'table', comment: null }],
        columns: [
          {
            schema: 'core',
            table: 't',
            name: 'activo',
            type: 'boolean',
            nullable: false,
            defaultExpr: 'true',
            ordinal: 1,
          },
        ],
        pks: [],
        fks: [],
      },
      opts(['core'])
    );
    expect(out).toContain('**activo** `boolean` NOT NULL DEFAULT `true`');
  });

  it('emits PK suffix for primary-key columns', () => {
    const out = formatSchemaRef(
      {
        tables: [{ schema: 'core', name: 't', kind: 'table', comment: null }],
        columns: [
          {
            schema: 'core',
            table: 't',
            name: 'id',
            type: 'uuid',
            nullable: false,
            defaultExpr: null,
            ordinal: 1,
          },
        ],
        pks: [{ schema: 'core', table: 't', columns: ['id'] }],
        fks: [],
      },
      opts(['core'])
    );
    expect(out).toMatch(/\*\*id\*\* `uuid` NOT NULL — PK/);
  });

  it('emits FK suffix with schema.table(column)', () => {
    const out = formatSchemaRef(
      {
        tables: [{ schema: 'erp', name: 'empleados', kind: 'table', comment: null }],
        columns: [
          {
            schema: 'erp',
            table: 'empleados',
            name: 'empresa_id',
            type: 'uuid',
            nullable: false,
            defaultExpr: null,
            ordinal: 1,
          },
        ],
        pks: [],
        fks: [
          {
            schema: 'erp',
            table: 'empleados',
            column: 'empresa_id',
            refSchema: 'core',
            refTable: 'empresas',
            refColumn: 'id',
          },
        ],
      },
      opts(['erp'])
    );
    expect(out).toContain('**empresa_id** `uuid` NOT NULL — FK → `core.empresas(id)`');
  });

  it('combines PK and FK suffixes when both apply', () => {
    const out = formatSchemaRef(
      {
        tables: [{ schema: 'erp', name: 't', kind: 'table', comment: null }],
        columns: [
          {
            schema: 'erp',
            table: 't',
            name: 'empresa_id',
            type: 'uuid',
            nullable: false,
            defaultExpr: null,
            ordinal: 1,
          },
        ],
        pks: [{ schema: 'erp', table: 't', columns: ['empresa_id'] }],
        fks: [
          {
            schema: 'erp',
            table: 't',
            column: 'empresa_id',
            refSchema: 'core',
            refTable: 'empresas',
            refColumn: 'id',
          },
        ],
      },
      opts(['erp'])
    );
    expect(out).toContain('— PK, FK → `core.empresas(id)`');
  });
});

describe('formatSchemaRef — object kinds & comments', () => {
  it('labels views as _(view)_', () => {
    const out = formatSchemaRef(
      {
        tables: [{ schema: 'rdb', name: 'v_cortes_totales', kind: 'view', comment: null }],
        columns: [
          {
            schema: 'rdb',
            table: 'v_cortes_totales',
            name: 'corte_id',
            type: 'uuid',
            nullable: true,
            defaultExpr: null,
            ordinal: 1,
          },
        ],
        pks: [],
        fks: [],
      },
      opts(['rdb'])
    );
    expect(out).toContain('### `rdb.v_cortes_totales` _(view)_');
  });

  it('labels materialized views as _(materialized view)_', () => {
    const out = formatSchemaRef(
      {
        tables: [{ schema: 'rdb', name: 'mv_algo', kind: 'mview', comment: null }],
        columns: [],
        pks: [],
        fks: [],
      },
      opts(['rdb'])
    );
    expect(out).toContain('### `rdb.mv_algo` _(materialized view)_');
  });

  it('renders table comment as blockquote', () => {
    const out = formatSchemaRef(
      {
        tables: [
          {
            schema: 'core',
            name: 'empresas',
            kind: 'table',
            comment: 'Registry of empresas.\nCross-tenant.',
          },
        ],
        columns: [
          {
            schema: 'core',
            table: 'empresas',
            name: 'id',
            type: 'uuid',
            nullable: false,
            defaultExpr: null,
            ordinal: 1,
          },
        ],
        pks: [],
        fks: [],
      },
      opts(['core'])
    );
    expect(out).toContain('> Registry of empresas.');
    expect(out).toContain('> Cross-tenant.');
  });
});

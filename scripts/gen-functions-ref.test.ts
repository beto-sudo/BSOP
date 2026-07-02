import { describe, it, expect } from 'vitest';

import { formatFunctionsRef, type FunctionsData, type FormatOptions } from './gen-functions-ref';

/**
 * Tests para `formatFunctionsRef` — la función pura que convierte los datos
 * crudos de pg_catalog al markdown determinístico de
 * `supabase/FUNCTIONS_REF.md`.
 *
 * Propiedades lockeadas (mismas que gen-schema-ref):
 *   1. Determinismo — mismo input, mismo output (sin diffs espurios en PRs).
 *   2. Orden canónico — schemas alfabéticos; funciones por nombre + identity
 *      args (overloads estables); triggers/CHECKs por tabla + nombre.
 *   3. Render correcto — fence ```sql``` por función, comentarios como
 *      blockquote, procedures marcados, agrupación por tabla.
 */

const GENERATED_AT = '2026-07-02T10:00:00Z';

function opts(schemas: string[]): FormatOptions {
  return { schemas, generatedAt: GENERATED_AT };
}

const EMPTY: FunctionsData = { functions: [], triggers: [], checks: [] };

function fn(
  schema: string,
  name: string,
  identityArgs: string,
  definition: string,
  extra?: Partial<FunctionsData['functions'][number]>
): FunctionsData['functions'][number] {
  return { schema, name, identityArgs, kind: 'function', definition, comment: null, ...extra };
}

describe('formatFunctionsRef — structure', () => {
  it('renders header + schemas-covered blurb + convención de redefinición', () => {
    const out = formatFunctionsRef(EMPTY, opts(['erp', 'core']));
    expect(out).toContain('# BSOP Supabase Functions Reference');
    expect(out).toContain(`Last regenerated: ${GENERATED_AT}`);
    expect(out).toContain('Schemas: core, erp');
    expect(out).toContain('**Schemas cubiertos:** `core` · `erp`');
    expect(out).toContain('debe partir del');
  });

  it('renders empty-schema placeholder', () => {
    const out = formatFunctionsRef(EMPTY, opts(['erp']));
    expect(out).toContain('## Schema `erp`');
    expect(out).toContain('_(sin funciones, triggers ni CHECK constraints)_');
  });

  it('ends with exactly one trailing newline', () => {
    const out = formatFunctionsRef(EMPTY, opts(['erp']));
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});

describe('formatFunctionsRef — funciones', () => {
  it('renders definition inside a sql fence with identity args in the heading', () => {
    const data: FunctionsData = {
      ...EMPTY,
      functions: [
        fn(
          'erp',
          'cxc_pago_registrar',
          'p_empresa_id uuid, p_monto numeric',
          'CREATE OR REPLACE FUNCTION erp.cxc_pago_registrar(p_empresa_id uuid, p_monto numeric)\n RETURNS uuid\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  RETURN gen_random_uuid();\nEND;\n$function$'
        ),
      ],
    };
    const out = formatFunctionsRef(data, opts(['erp']));
    expect(out).toContain('#### `erp.cxc_pago_registrar(p_empresa_id uuid, p_monto numeric)`');
    expect(out).toContain('```sql\nCREATE OR REPLACE FUNCTION erp.cxc_pago_registrar');
    expect(out).toContain('### Funciones (1)');
  });

  it('sorts overloads by identity args (stable)', () => {
    const data: FunctionsData = {
      ...EMPTY,
      functions: [
        fn('erp', 'fn_x', 'p_b uuid', 'CREATE b'),
        fn('erp', 'fn_x', 'p_a uuid', 'CREATE a'),
      ],
    };
    const out = formatFunctionsRef(data, opts(['erp']));
    expect(out.indexOf('fn_x(p_a uuid)')).toBeLessThan(out.indexOf('fn_x(p_b uuid)'));
  });

  it('marks procedures and renders comments as blockquote', () => {
    const data: FunctionsData = {
      ...EMPTY,
      functions: [
        fn('erp', 'proc_y', '', 'CREATE PROCEDURE ...', {
          kind: 'procedure',
          comment: 'línea 1\nlínea 2',
        }),
      ],
    };
    const out = formatFunctionsRef(data, opts(['erp']));
    expect(out).toContain('#### `erp.proc_y()` _(procedure)_');
    expect(out).toContain('> línea 1\n> línea 2');
  });

  it('normalizes CRLF and trailing whitespace inside definitions', () => {
    const data: FunctionsData = {
      ...EMPTY,
      functions: [fn('erp', 'fn_z', '', 'CREATE line1  \r\nline2\t')],
    };
    const out = formatFunctionsRef(data, opts(['erp']));
    expect(out).toContain('CREATE line1\nline2\n');
    expect(out).not.toContain('\r');
  });
});

describe('formatFunctionsRef — triggers y CHECKs', () => {
  const data: FunctionsData = {
    functions: [],
    triggers: [
      // Desordenados a propósito.
      {
        schema: 'dilesa',
        table: 'ventas',
        name: 'tg_b',
        definition: 'CREATE TRIGGER tg_b BEFORE UPDATE ...',
      },
      {
        schema: 'dilesa',
        table: 'venta_fases',
        name: 'tg_a',
        definition: 'CREATE TRIGGER tg_a AFTER INSERT ...',
      },
      {
        schema: 'dilesa',
        table: 'ventas',
        name: 'tg_a',
        definition: 'CREATE TRIGGER tg_a AFTER INSERT ...',
      },
    ],
    checks: [
      {
        schema: 'dilesa',
        table: 'ventas',
        name: 'ventas_monto_check',
        definition: 'CHECK ((monto >= 0))',
      },
    ],
  };

  it('groups triggers by table, sorted by table then name', () => {
    const out = formatFunctionsRef(data, opts(['dilesa']));
    expect(out).toContain('### Triggers (3)');
    const ixFases = out.indexOf('**`dilesa.venta_fases`**');
    const ixVentas = out.indexOf('**`dilesa.ventas`**');
    expect(ixFases).toBeGreaterThan(-1);
    expect(ixFases).toBeLessThan(ixVentas);
    // Dentro de ventas: tg_a antes que tg_b.
    const ventasBlock = out.slice(ixVentas);
    expect(ventasBlock.indexOf('`tg_a`')).toBeLessThan(ventasBlock.indexOf('`tg_b`'));
  });

  it('renders CHECK constraints with their definition', () => {
    const out = formatFunctionsRef(data, opts(['dilesa']));
    expect(out).toContain('### CHECK constraints (1)');
    expect(out).toContain('- `ventas_monto_check`: `CHECK ((monto >= 0))`');
  });
});

describe('formatFunctionsRef — determinism', () => {
  it('same input twice → identical output', () => {
    const data: FunctionsData = {
      functions: [fn('erp', 'fn_b', '', 'CREATE b'), fn('core', 'fn_a', 'x integer', 'CREATE a')],
      triggers: [{ schema: 'erp', table: 't', name: 'tg', definition: 'CREATE TRIGGER tg ...' }],
      checks: [{ schema: 'core', table: 'c', name: 'chk', definition: 'CHECK (true)' }],
    };
    const a = formatFunctionsRef(data, opts(['erp', 'core']));
    const b = formatFunctionsRef(data, opts(['core', 'erp']));
    expect(a).toBe(b);
  });

  it('schemas render in alphabetical order regardless of input order', () => {
    const out = formatFunctionsRef(EMPTY, opts(['rdb', 'core', 'erp']));
    const ixCore = out.indexOf('## Schema `core`');
    const ixErp = out.indexOf('## Schema `erp`');
    const ixRdb = out.indexOf('## Schema `rdb`');
    expect(ixCore).toBeLessThan(ixErp);
    expect(ixErp).toBeLessThan(ixRdb);
  });
});

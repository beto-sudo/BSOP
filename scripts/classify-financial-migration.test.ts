import { describe, it, expect } from 'vitest';

import { classifySql, levelOf, stripSqlComments, type Level } from './classify-financial-migration';

/**
 * Tests del clasificador de dos niveles del gate financiero D5
 * (recalibración 2026-07-01):
 *
 *   - `notify` — superficie financiera pero DDL aditivo → auto-merge con aviso.
 *   - `block`  — mueve dinero o permisos → espera label `finanzas-ok`.
 *
 * La intención es lockear la frontera notify/block: si un patrón nuevo la
 * mueve, este test obliga a decidirlo conscientemente.
 */

function level(sql: string): Level {
  return levelOf(classifySql(sql));
}

describe('stripSqlComments', () => {
  it('remueve comentarios de línea y de bloque', () => {
    const sql = `-- toca dilesa.ventas\n/* y erp.facturas */\nCREATE TABLE core.notas (id uuid);`;
    const out = stripSqlComments(sql);
    expect(out).not.toContain('dilesa.ventas');
    expect(out).not.toContain('erp.facturas');
    expect(out).toContain('CREATE TABLE core.notas');
  });
});

describe('nivel none — sin superficie financiera', () => {
  it('migración no-financiera común', () => {
    expect(level(`ALTER TABLE dilesa.unidades ADD COLUMN frente_id uuid;`)).toBe('none');
  });

  it('mención de tabla financiera SOLO en comentario no dispara el gate', () => {
    expect(
      level(
        `-- este índice acelera el join contra dilesa.ventas\nCREATE INDEX idx_uni ON dilesa.unidades (estado);`
      )
    ).toBe('none');
  });

  it('REVOKE FROM anon/PUBLIC es endurecimiento, no bloquea', () => {
    expect(level(`REVOKE SELECT ON rdb.v_inventario_stock FROM anon;`)).toBe('none');
    expect(level(`REVOKE ALL ON core.notas FROM PUBLIC, anon;`)).toBe('none');
  });
});

describe('nivel notify — superficie financiera aditiva', () => {
  it('CREATE TABLE financiera nueva', () => {
    expect(level(`CREATE TABLE erp.cxc_documentos (id uuid PRIMARY KEY, monto numeric);`)).toBe(
      'notify'
    );
  });

  it('ADD COLUMN sobre tabla financiera', () => {
    expect(level(`ALTER TABLE dilesa.ventas ADD COLUMN motivo_descuento text;`)).toBe('notify');
  });

  it('término de dinero en DDL aditivo', () => {
    expect(level(`ALTER TABLE dilesa.unidades ADD COLUMN sobreprecio numeric;`)).toBe('notify');
  });

  it('función financiera NUEVA (CREATE FUNCTION sin OR REPLACE) con boilerplate de grants', () => {
    const sql = `
      CREATE FUNCTION dilesa.fn_calcular_precio_lote(p_id uuid) RETURNS numeric
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION dilesa.fn_calcular_precio_lote(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION dilesa.fn_calcular_precio_lote(uuid) TO authenticated;
    `;
    expect(level(sql)).toBe('notify');
  });
});

describe('nivel block — mueve dinero o permisos', () => {
  it('UPDATE sobre tabla financiera', () => {
    expect(level(`UPDATE dilesa.ventas SET estado = 'terminada' WHERE id = '…';`)).toBe('block');
  });

  it('DELETE sobre tabla financiera', () => {
    expect(level(`DELETE FROM erp.pagos WHERE id = '…';`)).toBe('block');
  });

  it('INSERT (backfill/seed) sobre tabla financiera', () => {
    expect(level(`INSERT INTO erp.facturas (id) VALUES ('…');`)).toBe('block');
  });

  it('backfill de columna de montos fuera de las tablas listadas', () => {
    expect(level(`UPDATE dilesa.unidades SET sobreprecio = precio * 0.06;`)).toBe('block');
  });

  it('DROP TABLE financiera', () => {
    expect(level(`DROP TABLE IF EXISTS erp.presupuesto_obra;`)).toBe('block');
  });

  it('DROP COLUMN sobre tabla financiera', () => {
    expect(level(`ALTER TABLE dilesa.ventas DROP COLUMN sobreprecio;`)).toBe('block');
  });

  it('CREATE OR REPLACE de RPC financiera (redefinición de algo vivo)', () => {
    expect(
      level(
        `CREATE OR REPLACE FUNCTION dilesa.fn_registrar_pago(p uuid) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;`
      )
    ).toBe('block');
  });

  it('GRANT fuera del boilerplate (a anon / sobre tablas)', () => {
    expect(level(`GRANT SELECT ON erp.facturas TO anon;`)).toBe('block');
    expect(level(`GRANT USAGE ON SCHEMA erp TO anon;`)).toBe('block');
  });

  it('REVOKE a roles de la app (puede romper acceso, no es tightening)', () => {
    expect(level(`REVOKE SELECT ON core.notas FROM authenticated;`)).toBe('block');
  });

  it('RLS deshabilitado', () => {
    expect(level(`ALTER TABLE core.notas DISABLE ROW LEVEL SECURITY;`)).toBe('block');
  });

  it('DROP POLICY sobre tabla financiera', () => {
    expect(level(`DROP POLICY ventas_empresa ON dilesa.ventas;`)).toBe('block');
  });

  it('policy nueva que expone a anon', () => {
    expect(level(`CREATE POLICY abierta ON core.notas FOR SELECT TO anon USING (true);`)).toBe(
      'block'
    );
  });
});

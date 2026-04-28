/* eslint-disable @typescript-eslint/no-explicit-any -- Test fixtures for fluent Supabase mock chains. */

/**
 * Shared mocking infrastructure for `app/api/empresas/*` route tests.
 *
 * Mirrors the approach used in `app/api/impersonate/route.test.ts` but trimmed
 * to the specific tables and operations these endpoints touch:
 *
 *   - `core.usuarios` for the admin guard
 *   - `core.empresas` for lookup, dedup, insert, update
 *   - `erp.adjuntos` for archiving the CSF PDF
 *
 * Each test reassigns the per-table results via `installAdminMock`, so a
 * single test file can vary just the slice it cares about (e.g. RFC duplicate
 * vs. slug duplicate vs. clean insert).
 */

export type AdminScript = {
  // core.usuarios — admin guard
  callerUser?: { id: string; email: string; rol: string; activo: boolean } | null;
  // core.empresas
  empresaByRfc?: { id: string; slug: string } | null;
  empresaBySlug?: { id: string } | null;
  empresaById?: { id: string; slug: string; rfc: string | null } | null;
  // INSERT/UPDATE results
  insertEmpresaResult?: {
    data: { id: string; slug: string } | null;
    error: { message: string } | null;
  };
  updateEmpresaResult?: { error: { message: string } | null };
  insertAdjuntoResult?: { data: { id: string } | null; error: { message: string } | null };
  // Storage
  storageUploadResult?: { error: { message: string } | null };
};

export type FluentResult = {
  data: any;
  error: any;
};

/**
 * Builds a fluent admin client matching the call shapes in the empresas
 * routes. Routes by `(schema, table, op)` and inspects the `.eq()` chain to
 * decide which fixture to return.
 */
export function buildAdminMock(script: AdminScript): any {
  return {
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          const key = `${schemaName}.${tableName}`;
          // Track filters chain
          const filters: Record<string, unknown> = {};
          let pendingInsert: unknown = null;
          let pendingUpdate: unknown = null;

          const builder: any = {
            select(_cols: string) {
              return builder;
            },
            insert(row: unknown) {
              pendingInsert = row;
              return builder;
            },
            update(row: unknown) {
              pendingUpdate = row;
              return builder;
            },
            eq(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            is(_col: string, _val: unknown) {
              return builder;
            },
            async maybeSingle(): Promise<FluentResult> {
              return resolveSingle(key, filters, script);
            },
            async single(): Promise<FluentResult> {
              return resolveInsertSingle(key, pendingInsert, script);
            },
            // Direct await on update chain (no .select().single() after)
            then(
              onFulfilled: (result: FluentResult) => unknown,
              onRejected?: (reason: unknown) => unknown
            ) {
              const result = pendingUpdate
                ? resolveUpdate(key, script)
                : { data: null, error: null };
              return Promise.resolve(result).then(onFulfilled, onRejected);
            },
          };
          return builder;
        },
      };
    },
    storage: {
      from(_bucket: string) {
        return {
          async upload(_path: string, _bytes: Uint8Array, _opts: unknown) {
            return script.storageUploadResult ?? { error: null };
          },
        };
      },
    },
    auth: {
      async getUser() {
        return { data: { user: null } };
      },
    },
  };
}

function resolveSingle(
  key: string,
  filters: Record<string, unknown>,
  script: AdminScript
): FluentResult {
  if (key === 'core.usuarios') {
    return { data: script.callerUser ?? null, error: null };
  }
  if (key === 'core.empresas') {
    if ('rfc' in filters) {
      return { data: script.empresaByRfc ?? null, error: null };
    }
    if ('slug' in filters) {
      return { data: script.empresaBySlug ?? null, error: null };
    }
    if ('id' in filters) {
      return { data: script.empresaById ?? null, error: null };
    }
  }
  return { data: null, error: null };
}

function resolveInsertSingle(key: string, _row: unknown, script: AdminScript): FluentResult {
  if (key === 'core.empresas') {
    return (
      script.insertEmpresaResult ?? {
        data: { id: 'new-emp-id', slug: 'new-slug' },
        error: null,
      }
    );
  }
  if (key === 'erp.adjuntos') {
    return (
      script.insertAdjuntoResult ?? {
        data: { id: 'new-adj-id' },
        error: null,
      }
    );
  }
  return { data: null, error: null };
}

function resolveUpdate(key: string, script: AdminScript): FluentResult {
  if (key === 'core.empresas') {
    const r = script.updateEmpresaResult ?? { error: null };
    return { data: null, error: r.error };
  }
  return { data: null, error: null };
}

/**
 * Builds a multipart FormData with a fake PDF blob + a JSON payload.
 */
export function buildCsfFormData(args: {
  filename?: string;
  fileType?: string;
  fileSize?: number;
  payload?: unknown;
}): FormData {
  const fd = new FormData();
  const size = args.fileSize ?? 1024;
  const blob = new Blob([new Uint8Array(size)], {
    type: args.fileType ?? 'application/pdf',
  });
  const file = new File([blob], args.filename ?? 'csf.pdf', {
    type: args.fileType ?? 'application/pdf',
  });
  fd.append('file', file);
  if (args.payload !== undefined) {
    fd.append('payload', JSON.stringify(args.payload));
  }
  return fd;
}

export const SAMPLE_EXTRACCION = {
  tipo_persona: 'moral' as const,
  rfc: 'ABC010101AB1',
  curp: null,
  nombre: null,
  apellido_paterno: null,
  apellido_materno: null,
  razon_social: 'EJEMPLO SA DE CV',
  nombre_comercial: '',
  regimen_fiscal_codigo: '601',
  regimen_fiscal_nombre: 'General de Ley Personas Morales',
  regimenes_adicionales: [
    {
      codigo: '601',
      nombre: 'General de Ley Personas Morales',
      fecha_inicio: '2020-01-01',
      fecha_fin: null,
    },
  ],
  domicilio_calle: 'Av. Reforma',
  domicilio_num_ext: '100',
  domicilio_num_int: '',
  domicilio_colonia: 'Centro',
  domicilio_cp: '06000',
  domicilio_municipio: 'Cuauhtémoc',
  domicilio_estado: 'CDMX',
  obligaciones: [],
  fecha_inicio_operaciones: '2020-01-01',
  fecha_emision: '2026-04-27',
  id_cif: '14110980997',
  estatus_sat: 'ACTIVO',
  regimen_capital: 'SOCIEDAD ANONIMA DE CAPITAL VARIABLE',
  actividades_economicas: [],
};

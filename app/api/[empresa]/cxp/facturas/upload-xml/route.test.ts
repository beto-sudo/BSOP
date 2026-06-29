/* eslint-disable @typescript-eslint/no-explicit-any -- Test fixtures for fluent Supabase mock chains. */

/**
 * Tests del endpoint de ingesta XML CFDI (CxP). Foco: el audit trail
 * server-side de rechazos (core.audit_log), la atribución del usuario al RPC
 * (p_usuario_id) y los status por desenlace del lote (200/207/422). El parser
 * CFDI corre real (es puro); se mockea el cliente Supabase con el mismo
 * estilo fluent de `app/api/empresas/_test-helpers.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────

type Script = {
  empresa?: { id: string; rfc: string | null; slug: string } | null;
  callerRol?: string | null;
  membership?: boolean;
  /** uuid_sat → factura existente (dedup hit). */
  dupByUuid?: Record<string, { id: string }>;
  /** RFC emisor → proveedor (erp.personas). */
  personaByRfc?: Record<string, { id: string }>;
  rpcResult?: { data: string | null; error: { message: string } | null };
  auditInsertError?: { message: string } | null;
  /** Facturas en espera (placeholders de destajo u obra) para el auto-match. */
  placeholders?: {
    id: string;
    proveedor_id: string | null;
    total: number;
    estimacion_id?: string | null;
    obra_estimacion_id?: string | null;
  }[];
  /** dilesa.estimaciones para resolver el código del destajo. */
  estimaciones?: { id: string; codigo: string }[];
  /** dilesa.obra_estimaciones para resolver el origen de obra (etiqueta + contrato). */
  obraEstimaciones?: { id: string; etiqueta: string | null; contrato_id: string }[];
  /** dilesa.contratos_construccion para resolver el código del contrato de obra. */
  contratos?: { id: string; codigo: string | null }[];
  /** erp.personas de los contratistas de los placeholders (RFC + nombre). */
  placeholderPersonas?: {
    id: string;
    rfc: string | null;
    nombre: string | null;
    apellido_paterno: string | null;
    apellido_materno: string | null;
  }[];
};

type Calls = {
  rpc: { fn: string; args: Record<string, unknown> }[];
  auditRows: Record<string, any>[];
};

let serverUser: { id: string } | null = null;
let script: Script = {};
const calls: Calls = { rpc: [], auditRows: [] };

function buildAdminMock(): any {
  return {
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          const key = `${schemaName}.${tableName}`;
          const filters: Record<string, unknown> = {};
          let usedOr = false; // marca la query de placeholders (fetchDestajoPlaceholders)
          let usedIlike = false; // marca el match de proveedor (matchProveedorId)
          const builder: any = {
            select: () => builder,
            eq(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            ilike(col: string, val: unknown) {
              filters[col] = val;
              usedIlike = true;
              return builder;
            },
            order() {
              return builder;
            },
            limit() {
              return builder;
            },
            not(col: string, _op: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            // fetchDestajoPlaceholders: `.or(estimacion_id|obra_estimacion_id no
            // nulo)` awaiteado directo. El mock devuelve vacío (sin placeholders)
            // → carga normal, como antes, salvo que el test los inyecte.
            or(_expr: string) {
              usedOr = true;
              return builder;
            },
            is(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            in() {
              return builder;
            },
            insert(rows: unknown) {
              if (key === 'core.audit_log') {
                calls.auditRows.push(...(rows as Record<string, any>[]));
                return Promise.resolve({ data: null, error: script.auditInsertError ?? null });
              }
              // erp.adjuntos — best-effort, el route solo lo awaitea.
              return Promise.resolve({ data: null, error: null });
            },
            update: () => builder,
            async maybeSingle() {
              if (key === 'core.empresas') return { data: script.empresa ?? null, error: null };
              if (key === 'core.usuarios')
                return {
                  data: script.callerRol ? { rol: script.callerRol } : null,
                  error: null,
                };
              if (key === 'core.usuarios_empresas')
                return {
                  data: script.membership ? { usuario_id: serverUser?.id } : null,
                  error: null,
                };
              if (key === 'erp.facturas')
                return {
                  data: script.dupByUuid?.[String(filters.uuid_sat)] ?? null,
                  error: null,
                };
              if (key === 'erp.personas')
                return {
                  data: script.personaByRfc?.[String(filters.rfc)] ?? null,
                  error: null,
                };
              return { data: null, error: null };
            },
            // Awaiteado directo: update().eq() (data null), la query de
            // placeholders (erp.facturas + .or), el lookup de estimaciones y, para
            // obra, obra_estimaciones + contratos_construccion (vacíos por defecto).
            then(
              onFulfilled: (r: { data: unknown; error: null }) => unknown,
              onRejected?: (reason: unknown) => unknown
            ) {
              let data: unknown = null;
              if (key === 'erp.facturas' && usedOr) data = script.placeholders ?? [];
              else if (key === 'dilesa.estimaciones') data = script.estimaciones ?? [];
              else if (key === 'dilesa.obra_estimaciones') data = script.obraEstimaciones ?? [];
              else if (key === 'dilesa.contratos_construccion') data = script.contratos ?? [];
              else if (key === 'erp.personas')
                // matchProveedorId (empresa-scoped, `.ilike` + `.limit(1)`) reusa
                // el fixture personaByRfc; el otro uso (placeholders, `.in`) trae
                // las personas de los contratistas.
                data = usedIlike
                  ? (() => {
                      const hit = script.personaByRfc?.[String(filters.rfc)];
                      return hit ? [hit] : [];
                    })()
                  : (script.placeholderPersonas ?? []);
              return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
            },
          };
          return builder;
        },
        rpc(fn: string, args: Record<string, unknown>) {
          calls.rpc.push({ fn, args });
          return Promise.resolve(script.rpcResult ?? { data: 'factura-nueva-1', error: null });
        },
      };
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
      }),
    },
  };
}

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: serverUser } }) },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => buildAdminMock(),
}));

import { POST } from './route';

// ── Fixtures CFDI (espejo de lib/cxp/cfdi-parser.test.ts) ─────────────

// El parser normaliza el UUID a mayúsculas — las constantes ya lo están para
// comparar directo contra lo parseado.
const UUID_OK = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const UUID_DUP = '99999999-9999-9999-9999-999999999999';

const XML_OK = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Serie="A" Folio="1234" Fecha="2026-01-15T10:30:00"
  SubTotal="1000.00" Total="1160.00" Moneda="MXN" FormaPago="03" MetodoPago="PUE" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Proveedor Demo SA de CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DIE030904866" Nombre="DESARROLLO INMOBILIARIO" UsoCFDI="G03"/>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${UUID_OK}" FechaTimbrado="2026-01-15T10:31:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const XML_DUP = XML_OK.replace(UUID_OK, UUID_DUP);
const XML_OTRO_RECEPTOR = XML_OK.replace('DIE030904866', 'XXX010101XX1').replace(
  UUID_OK,
  '88888888-8888-8888-8888-888888888888'
);
const XML_MALO = 'esto no es un CFDI';

// Destajo del caso "persona duplicada": el emisor (con RFC) matchea una persona
// distinta a la del placeholder (sin RFC), pero el nombre coincide. Total 1100.
const XML_DESTAJO_NOMBRE = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Serie="A" Folio="77" Fecha="2026-06-20T10:30:00"
  SubTotal="1100.00" Total="1100.00" Moneda="MXN" FormaPago="03" MetodoPago="PUE" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="SAMD8409154U7" Nombre="DAVID EDUARDO SALAZAR MORALES" RegimenFiscal="612"/>
  <cfdi:Receptor Rfc="DIE030904866" Nombre="DESARROLLO INMOBILIARIO" UsoCFDI="G03"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="11112222-3333-4444-5555-666677778888" FechaTimbrado="2026-06-20T10:31:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

// ── Helpers ────────────────────────────────────────────────────────────

function makeReq(files: { name: string; xml: string }[]): NextRequest {
  const fd = new FormData();
  for (const f of files) {
    fd.append('file', new File([f.xml], f.name, { type: 'application/xml' }));
  }
  return new NextRequest(new URL('http://localhost/api/dilesa/cxp/facturas/upload-xml'), {
    method: 'POST',
    body: fd,
    headers: { 'user-agent': 'vitest-agent' },
  });
}

const params = { params: Promise.resolve({ empresa: 'dilesa' }) };

beforeEach(() => {
  serverUser = { id: 'user-1' };
  script = {
    empresa: { id: 'emp-dilesa', rfc: 'DIE030904866', slug: 'dilesa' },
    callerRol: 'admin',
    membership: true,
    dupByUuid: {},
    personaByRfc: { AAA010101AAA: { id: 'prov-1' } },
  };
  calls.rpc = [];
  calls.auditRows = [];
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('POST /api/[empresa]/cxp/facturas/upload-xml', () => {
  it('401 sin sesión', async () => {
    serverUser = null;
    const res = await POST(makeReq([{ name: 'a.xml', xml: XML_OK }]), params);
    expect(res.status).toBe(401);
  });

  it('lote todo OK → 200, RPC con p_usuario_id y solo fila-resumen en audit', async () => {
    const res = await POST(makeReq([{ name: 'a.xml', xml: XML_OK }]), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, total: 1, exitosos: 1 });

    expect(calls.rpc).toHaveLength(1);
    expect(calls.rpc[0].fn).toBe('cxp_factura_alta');
    expect(calls.rpc[0].args.p_usuario_id).toBe('user-1');

    expect(calls.auditRows).toHaveLength(1);
    expect(calls.auditRows[0]).toMatchObject({
      empresa_id: 'emp-dilesa',
      usuario_id: 'user-1',
      accion: 'cxp_facturas_upload_lote',
      tabla: 'erp.facturas',
      datos_nuevos: { total: 1, exitosos: 1, rechazados: 0 },
      user_agent: 'vitest-agent',
    });
  });

  it('lote mixto → 207 con una fila de audit por rechazo + resumen', async () => {
    script.dupByUuid = { [UUID_DUP]: { id: 'factura-vieja-1' } };
    const res = await POST(
      makeReq([
        { name: 'ok.xml', xml: XML_OK },
        { name: 'dup.xml', xml: XML_DUP },
        { name: 'ajena.xml', xml: XML_OTRO_RECEPTOR },
        { name: 'rota.xml', xml: XML_MALO },
      ]),
      params
    );
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, total: 4, exitosos: 1 });
    expect(body.results).toHaveLength(4);

    const rechazos = calls.auditRows.filter((r) => r.accion === 'cxp_factura_rechazo');
    expect(rechazos).toHaveLength(3);

    // Duplicado: conserva uuid/RFC del CFDI y apunta a la factura existente.
    const dup = rechazos.find((r) => r.datos_nuevos.filename === 'dup.xml');
    expect(dup).toMatchObject({
      usuario_id: 'user-1',
      registro_id: 'factura-vieja-1',
      datos_nuevos: { uuid_sat: UUID_DUP, emisor_rfc: 'AAA010101AAA' },
    });
    expect(dup?.datos_nuevos.motivo).toContain(UUID_DUP);

    // Receptor ajeno: se parseó, así que lleva uuid/RFC.
    const ajena = rechazos.find((r) => r.datos_nuevos.filename === 'ajena.xml');
    expect(ajena?.datos_nuevos.motivo).toContain('XXX010101XX1');
    expect(ajena?.registro_id).toBeNull();

    // Parse error: sin uuid/RFC (no se alcanzó a parsear).
    const rota = rechazos.find((r) => r.datos_nuevos.filename === 'rota.xml');
    expect(rota?.datos_nuevos.uuid_sat).toBeNull();
    expect(rota?.datos_nuevos.emisor_rfc).toBeNull();

    const lote = calls.auditRows.find((r) => r.accion === 'cxp_facturas_upload_lote');
    expect(lote?.datos_nuevos).toMatchObject({ total: 4, exitosos: 1, rechazados: 3 });
  });

  it('todos rechazados → 422 con results y exitosos=0', async () => {
    script.dupByUuid = { [UUID_OK]: { id: 'factura-vieja-2' } };
    const res = await POST(makeReq([{ name: 'dup.xml', xml: XML_OK }]), params);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, total: 1, exitosos: 0 });
    expect(body.results[0].error).toContain(UUID_OK);

    const lote = calls.auditRows.find((r) => r.accion === 'cxp_facturas_upload_lote');
    expect(lote?.datos_nuevos).toMatchObject({ total: 1, exitosos: 0, rechazados: 1 });
  });

  it('error del RPC → rechazo auditado con uuid/RFC del CFDI', async () => {
    script.rpcResult = { data: null, error: { message: 'duplicado en carrera' } };
    const res = await POST(makeReq([{ name: 'a.xml', xml: XML_OK }]), params);
    expect(res.status).toBe(422);

    const rechazos = calls.auditRows.filter((r) => r.accion === 'cxp_factura_rechazo');
    expect(rechazos).toHaveLength(1);
    expect(rechazos[0].datos_nuevos).toMatchObject({
      filename: 'a.xml',
      motivo: 'duplicado en carrera',
      uuid_sat: UUID_OK,
      emisor_rfc: 'AAA010101AAA',
    });
  });

  it('fallo del insert de audit no tumba la respuesta (best-effort)', async () => {
    script.auditInsertError = { message: 'permiso denegado' };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await POST(makeReq([{ name: 'a.xml', xml: XML_OK }]), params);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.exitosos).toBe(1);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('audit_log'), 'permiso denegado');
    } finally {
      errSpy.mockRestore();
    }
  });

  // ── Auto-match destajo → CxP (S4) ──────────────────────────────────────

  function makeReqRaw(fields: {
    analyze?: boolean;
    decisiones?: Record<string, string>;
    xml?: string;
    filename?: string;
  }): NextRequest {
    const fd = new FormData();
    if (fields.analyze) fd.append('analyze', '1');
    if (fields.decisiones) fd.append('decisiones', JSON.stringify(fields.decisiones));
    fd.append(
      'file',
      new File([fields.xml ?? XML_OK], fields.filename ?? 'a.xml', {
        type: 'application/xml',
      })
    );
    return new NextRequest(new URL('http://localhost/api/dilesa/cxp/facturas/upload-xml'), {
      method: 'POST',
      body: fd,
      headers: { 'user-agent': 'vitest-agent' },
    });
  }

  it('analyze → sugiere asociar al destajo en espera del contratista (neto ≥ CFDI)', async () => {
    script.placeholders = [
      { id: 'ph-1', proveedor_id: 'prov-1', total: 1200, estimacion_id: 'est-1' },
    ];
    script.estimaciones = [{ id: 'est-1', codigo: 'EST-2026-W26-AAA-001' }];
    const res = await POST(makeReqRaw({ analyze: true }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const a = body.analisis[0];
    expect(a.ok).toBe(true);
    expect(a.candidatos).toHaveLength(1);
    // CFDI total 1160, neto 1200 → Δ materiales 40.
    expect(a.candidatos[0]).toMatchObject({ facturaId: 'ph-1', neto: 1200, delta: 40 });
    expect(a.sugerencia).toBe('ph-1');
    expect(calls.rpc).toHaveLength(0); // analyze no escribe
  });

  it('analyze → si el CFDI excede el neto, no es candidato (sugiere normal)', async () => {
    // neto 1000 < CFDI 1160 → fuera (la factura nunca debe ser mayor).
    script.placeholders = [
      { id: 'ph-1', proveedor_id: 'prov-1', total: 1000, estimacion_id: 'est-1' },
    ];
    script.estimaciones = [{ id: 'est-1', codigo: 'EST-2026-W26-AAA-001' }];
    const res = await POST(makeReqRaw({ analyze: true }), params);
    const body = await res.json();
    expect(body.analisis[0].candidatos).toHaveLength(0);
    expect(body.analisis[0].sugerencia).toBe('normal');
  });

  it('analyze → reconoce también una estimación de obra en espera (obra_estimacion_id)', async () => {
    // El placeholder cuelga de obra_estimacion_id (no estimacion_id); el código
    // se arma "contrato · etiqueta". Mismo contratista (prov-1) que el CFDI.
    script.placeholders = [
      { id: 'ph-obra', proveedor_id: 'prov-1', total: 1200, obra_estimacion_id: 'obra-1' },
    ];
    script.obraEstimaciones = [{ id: 'obra-1', etiqueta: 'Estimación 2', contrato_id: 'ctr-1' }];
    script.contratos = [{ id: 'ctr-1', codigo: 'OBRA-URB-001' }];
    const res = await POST(makeReqRaw({ analyze: true }), params);
    expect(res.status).toBe(200);
    const a = (await res.json()).analisis[0];
    expect(a.ok).toBe(true);
    expect(a.candidatos).toHaveLength(1);
    // CFDI total 1160, neto 1200 → Δ materiales 40.
    expect(a.candidatos[0]).toMatchObject({ facturaId: 'ph-obra', neto: 1200, delta: 40 });
    expect(a.sugerencia).toBe('ph-obra');
    expect(calls.rpc).toHaveLength(0);
  });

  it('analyze → reconoce el destajo por nombre aunque la persona del destajo no tenga RFC (duplicado)', async () => {
    // El placeholder cuelga de una persona SIN RFC; el emisor del CFDI matchea
    // OTRA persona (con RFC). Mismo humano → debe ofrecerse el destajo igual.
    script.placeholders = [
      { id: 'ph-david', proveedor_id: 'prov-destajo', total: 1200, estimacion_id: 'est-david' },
    ];
    script.estimaciones = [{ id: 'est-david', codigo: 'EST-2026-W26-SALA-001' }];
    script.placeholderPersonas = [
      {
        id: 'prov-destajo',
        rfc: null,
        nombre: 'DAVID EDUARDO',
        apellido_paterno: 'SALAZAR',
        apellido_materno: 'MORALES',
      },
    ];
    script.personaByRfc = { SAMD8409154U7: { id: 'persona-con-rfc' } };
    const res = await POST(
      makeReqRaw({ analyze: true, xml: XML_DESTAJO_NOMBRE, filename: 'david.xml' }),
      params
    );
    expect(res.status).toBe(200);
    const a = (await res.json()).analisis[0];
    expect(a.ok).toBe(true);
    expect(a.proveedorId).toBe('persona-con-rfc'); // distinto al del destajo
    expect(a.candidatos).toHaveLength(1);
    expect(a.candidatos[0]).toMatchObject({ facturaId: 'ph-david', neto: 1200, delta: 100 });
    expect(a.sugerencia).toBe('ph-david');
  });

  it('commit con decisiones → asocia el CFDI al destajo (recibir_cfdi, no alta)', async () => {
    script.placeholders = [
      { id: 'ph-1', proveedor_id: 'prov-1', total: 1200, estimacion_id: 'est-1' },
    ];
    script.estimaciones = [{ id: 'est-1', codigo: 'EST-2026-W26-AAA-001' }];
    const res = await POST(makeReqRaw({ decisiones: { 'a.xml': 'ph-1' } }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, exitosos: 1 });
    expect(calls.rpc).toHaveLength(1);
    expect(calls.rpc[0].fn).toBe('cxp_factura_recibir_cfdi');
    expect(calls.rpc[0].args.p_factura_id).toBe('ph-1');
  });
});

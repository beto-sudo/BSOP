/* eslint-disable @typescript-eslint/no-explicit-any -- Test fixtures for fluent Supabase mock chains. */

/**
 * Tests del endpoint de desglose CFDI on-read (CxP). Foco: el gating de acceso
 * (sesión + membresía/admin), el scoping por empresa de la factura, la
 * resolución del path del XML (columna xml_url o adjunto rol xml_cfdi) y el
 * parseo del XML bajado de storage. El parser corre real (es puro); se mockea
 * el cliente Supabase con el mismo estilo fluent que upload-xml.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────

type Script = {
  empresa?: { id: string; slug: string } | null;
  callerRol?: string | null;
  membership?: boolean;
  factura?: { id: string; xml_url: string | null } | null;
  adjuntoUrl?: string | null;
  /** Si es string, `download` devuelve un Blob con ese XML; si es null, error. */
  downloadXml?: string | null;
};

let serverUser: { id: string } | null = null;
let script: Script = {};

function buildAdminMock(): any {
  return {
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          const key = `${schemaName}.${tableName}`;
          const builder: any = {
            select: () => builder,
            eq: () => builder,
            limit: () => builder,
            async maybeSingle() {
              if (key === 'core.empresas') return { data: script.empresa ?? null, error: null };
              if (key === 'core.usuarios')
                return { data: script.callerRol ? { rol: script.callerRol } : null, error: null };
              if (key === 'core.usuarios_empresas')
                return {
                  data: script.membership ? { usuario_id: serverUser?.id } : null,
                  error: null,
                };
              if (key === 'erp.facturas') return { data: script.factura ?? null, error: null };
              if (key === 'erp.adjuntos')
                return {
                  data: script.adjuntoUrl ? { url: script.adjuntoUrl } : null,
                  error: null,
                };
              return { data: null, error: null };
            },
          };
          return builder;
        },
      };
    },
    storage: {
      from: () => ({
        async download() {
          if (script.downloadXml == null) return { data: null, error: { message: 'not found' } };
          return {
            data: new Blob([script.downloadXml], { type: 'application/xml' }),
            error: null,
          };
        },
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

import { GET } from './route';

// ── Fixtures ───────────────────────────────────────────────────────────

const XML_CON_CONCEPTOS = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Serie="A" Folio="1234" Fecha="2026-01-15T10:30:00"
  SubTotal="1000.00" Total="1160.00" Moneda="MXN" FormaPago="03" MetodoPago="PUE" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Proveedor Demo" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DIE030904866" Nombre="DESARROLLO INMOBILIARIO" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="2" Unidad="Pieza" Descripcion="Cemento" ValorUnitario="500.00" Importe="1000.00"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="a1b2c3d4-e5f6-7890-abcd-ef1234567890" FechaTimbrado="2026-01-15T10:31:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

function makeReq(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/dilesa/cxp/facturas/fac-1/cfdi'));
}

const params = { params: Promise.resolve({ empresa: 'dilesa', id: 'fac-1' }) };

beforeEach(() => {
  serverUser = { id: 'user-1' };
  script = {
    empresa: { id: 'emp-dilesa', slug: 'dilesa' },
    callerRol: null,
    membership: true,
    factura: { id: 'fac-1', xml_url: 'dilesa/facturas/fac-1/cfdi.xml' },
    adjuntoUrl: null,
    downloadXml: XML_CON_CONCEPTOS,
  };
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('GET /api/[empresa]/cxp/facturas/[id]/cfdi', () => {
  it('400 si la empresa no es válida', async () => {
    const res = await GET(
      new NextRequest(new URL('http://localhost/api/xxx/cxp/facturas/fac-1/cfdi')),
      { params: Promise.resolve({ empresa: 'xxx', id: 'fac-1' }) }
    );
    expect(res.status).toBe(400);
  });

  it('401 sin sesión', async () => {
    serverUser = null;
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(401);
  });

  it('403 sin membresía ni rol admin', async () => {
    script.membership = false;
    script.callerRol = null;
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(403);
  });

  it('admin global sin membresía sí pasa el gate', async () => {
    script.membership = false;
    script.callerRol = 'admin';
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
  });

  it('404 si la factura no existe o no es de la empresa', async () => {
    script.factura = null;
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('no encontrada');
  });

  it('404 code sin_xml si la factura no tiene XML', async () => {
    script.factura = { id: 'fac-1', xml_url: null };
    script.adjuntoUrl = null;
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('sin_xml');
  });

  it('resuelve el XML por adjunto cuando xml_url es null', async () => {
    script.factura = { id: 'fac-1', xml_url: null };
    script.adjuntoUrl = 'dilesa/facturas/fac-1/cfdi.xml';
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).cfdi.conceptos).toHaveLength(1);
  });

  it('200 devuelve conceptos + metadata fiscal del CFDI', async () => {
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cfdi).toMatchObject({
      serie: 'A',
      folio: '1234',
      fechaTimbrado: '2026-01-15T10:31:00',
      regimenFiscalEmisor: '601',
      moneda: 'MXN',
      tipoComprobante: 'I',
    });
    expect(body.cfdi.conceptos[0]).toMatchObject({
      descripcion: 'Cemento',
      cantidad: 2,
      unidad: 'Pieza',
      importe: 1000,
    });
  });

  it('422 si el XML guardado no es un CFDI parseable', async () => {
    script.downloadXml = 'esto no es un CFDI';
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(422);
  });

  it('404 sin_xml si el download de storage falla', async () => {
    script.downloadXml = null;
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('sin_xml');
  });
});

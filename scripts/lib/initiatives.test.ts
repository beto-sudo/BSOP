import { describe, it, expect } from 'vitest';
import {
  ACTIVAS_START,
  ACTIVAS_END,
  isActive,
  parsePlanningDoc,
  toInitiative,
  renderActivasTable,
  replaceBetweenMarkers,
  regenerateInitiatives,
  type Initiative,
  type ParsedDoc,
} from './initiatives';

const DOC = `# Iniciativa — Cuentas por Pagar (CxP)

**Slug:** \`cxp\`
**Empresas:** todas (golden: RDB)
**Schemas afectados:** \`erp\` (extiende \`facturas\`; nuevas \`cxp_pagos\`)
**Estado:** in_progress
**Próximo hito:** Sprint 2 — ingesta XML CFDI
**Dueño:** Beto
**Creada:** 2026-05-01
**Última actualización:** 2026-06-02 (Sprint 1 en prod)

## Problema

Aquí abajo hay otro **Estado:** que NO debe parsearse como header.
`;

describe('parsePlanningDoc', () => {
  it('extrae todos los campos del header y deriva el nombre del H1', () => {
    const d = parsePlanningDoc(DOC, 'cxp');
    expect(d.slug).toBe('cxp');
    expect(d.nombre).toBe('Cuentas por Pagar (CxP)');
    expect(d.empresas).toBe('todas (golden: RDB)');
    expect(d.schemas).toBe('`erp` (extiende `facturas`; nuevas `cxp_pagos`)');
    expect(d.estado).toBe('in_progress');
    expect(d.proximoHito).toBe('Sprint 2 — ingesta XML CFDI');
    expect(d.ultimaActualizacion).toBe('2026-06-02');
  });

  it('solo parsea el bloque header (ignora campos en secciones posteriores)', () => {
    // El "**Estado:**" dentro de ## Problema no debe sobrescribir el del header.
    expect(parsePlanningDoc(DOC, 'cxp').estado).toBe('in_progress');
  });

  it('captura valores de campo envueltos en varias líneas (prose-wrap)', () => {
    const wrapped = `# Iniciativa — Construcción

**Estado:** in_progress
**Schemas afectados:** \`dilesa\` (8 tablas nuevas + extender \`productos\`),
erp.personas (extender tipo con 'contratista')
**Dueño:** Beto
`;
    const d = parsePlanningDoc(wrapped, 'dilesa-construccion');
    expect(d.schemas).toBe(
      "`dilesa` (8 tablas nuevas + extender `productos`), erp.personas (extender tipo con 'contratista')"
    );
  });

  it('normaliza el estado a su primer token en minúsculas', () => {
    const d = parsePlanningDoc('# Iniciativa — X\n\n**Estado:** In_Progress (Sprint A)\n', 'x');
    expect(d.estado).toBe('in_progress');
  });

  it('devuelve null en campos ausentes', () => {
    const d = parsePlanningDoc('# Iniciativa — Solo título\n', 'solo');
    expect(d.nombre).toBe('Solo título');
    expect(d.estado).toBeNull();
    expect(d.proximoHito).toBeNull();
    expect(d.empresas).toBeNull();
  });

  it('soporta H1 con guion normal además de em-dash', () => {
    expect(parsePlanningDoc('# Iniciativa - Con guion\n', 'g').nombre).toBe('Con guion');
  });
});

describe('isActive', () => {
  it('reconoce los 4 estados activos', () => {
    for (const e of ['proposed', 'planned', 'in_progress', 'blocked']) {
      expect(isActive(e)).toBe(true);
    }
  });
  it('rechaza done y null', () => {
    expect(isActive('done')).toBe(false);
    expect(isActive(null)).toBe(false);
  });
});

describe('toInitiative', () => {
  const base: ParsedDoc = {
    slug: 'x',
    nombre: 'X',
    empresas: 'todas',
    schemas: 'erp',
    estado: 'planned',
    proximoHito: 'Sprint 1',
    ultimaActualizacion: '2026-06-07',
  };

  it('acepta un doc activo completo', () => {
    expect(toInitiative(base).slug).toBe('x');
  });

  it('tira un error nombrando el slug y el campo faltante', () => {
    expect(() => toInitiative({ ...base, proximoHito: null })).toThrow(/x\.md/);
    expect(() => toInitiative({ ...base, proximoHito: null })).toThrow(/Próximo hito/);
    expect(() => toInitiative({ ...base, empresas: null })).toThrow(/Empresas/);
  });
});

describe('renderActivasTable', () => {
  const a: Initiative = {
    slug: 'zebra',
    nombre: 'Zebra',
    empresas: 'RDB',
    schemas: 'rdb',
    estado: 'planned',
    proximoHito: 'Hito Z',
    ultimaActualizacion: '2026-01-01',
  };
  const b: Initiative = {
    slug: 'alpha',
    nombre: 'Alpha',
    empresas: 'todas',
    schemas: 'erp',
    estado: 'in_progress',
    proximoHito: 'Hito A',
    ultimaActualizacion: '2026-02-02',
  };

  it('ordena alfabéticamente por slug', () => {
    const out = renderActivasTable([a, b]);
    expect(out.indexOf('`alpha`')).toBeLessThan(out.indexOf('`zebra`'));
  });

  it('incluye header + separador + una fila por iniciativa', () => {
    const lines = renderActivasTable([a, b]).split('\n');
    expect(lines[0]).toContain('| Iniciativa |');
    expect(lines[1]).toMatch(/^\| --- \|/);
    expect(lines).toHaveLength(4); // header + sep + 2 filas
  });

  it('agrega el link al planning doc derivado del slug', () => {
    expect(renderActivasTable([b])).toContain('(ver [planning](../planning/alpha.md))');
  });

  it('no duplica el link si la prosa ya lo trae', () => {
    const withLink: Initiative = {
      ...b,
      proximoHito: 'Hito A (ver [planning](../planning/alpha.md))',
    };
    const out = renderActivasTable([withLink]);
    expect(out.match(/ver \[planning\]/g)).toHaveLength(1);
  });

  it('escapa pipes y colapsa saltos de línea en las celdas', () => {
    const dirty: Initiative = { ...b, empresas: 'a | b', proximoHito: 'línea1\nlínea2' };
    const out = renderActivasTable([dirty]);
    expect(out).toContain('a \\| b');
    expect(out).toContain('línea1 línea2');
  });
});

describe('replaceBetweenMarkers', () => {
  it('reemplaza el contenido conservando los marcadores', () => {
    const md = `intro\n${ACTIVAS_START}\nVIEJO\n${ACTIVAS_END}\noutro`;
    const out = replaceBetweenMarkers(md, ACTIVAS_START, ACTIVAS_END, 'NUEVO');
    expect(out).toBe(`intro\n${ACTIVAS_START}\nNUEVO\n${ACTIVAS_END}\noutro`);
    expect(out).toContain('intro');
    expect(out).toContain('outro');
    expect(out).not.toContain('VIEJO');
  });

  it('tira un error si faltan los marcadores', () => {
    expect(() => replaceBetweenMarkers('sin marcadores', ACTIVAS_START, ACTIVAS_END, 'x')).toThrow(
      /Marcadores no encontrados/
    );
  });

  it('tira un error si los marcadores están invertidos', () => {
    const md = `${ACTIVAS_END}\nx\n${ACTIVAS_START}`;
    expect(() => replaceBetweenMarkers(md, ACTIVAS_START, ACTIVAS_END, 'y')).toThrow();
  });
});

describe('regenerateInitiatives', () => {
  const mkDoc = (slug: string, estado: string) =>
    parsePlanningDoc(
      `# Iniciativa — ${slug.toUpperCase()}\n\n**Empresas:** todas\n**Schemas afectados:** erp\n**Estado:** ${estado}\n**Próximo hito:** hito ${slug}\n**Última actualización:** 2026-06-07\n`,
      slug
    );

  it('filtra a solo activas y las inyecta entre los marcadores', () => {
    const md = `# Init\n\n## Activas\n\n${ACTIVAS_START}\nVIEJO\n${ACTIVAS_END}\n\n## Done\n\nhistoria\n`;
    const docs = [mkDoc('activa-uno', 'in_progress'), mkDoc('cerrada', 'done')];
    const { content, active } = regenerateInitiatives(md, docs);

    expect(active).toHaveLength(1);
    expect(active[0].slug).toBe('activa-uno');
    expect(content).toContain('`activa-uno`');
    expect(content).not.toContain('`cerrada`');
    expect(content).not.toContain('VIEJO');
    // Preserva todo lo que está fuera de los marcadores.
    expect(content).toContain('## Done');
    expect(content).toContain('historia');
  });

  it('propaga el error de validación de un doc activo incompleto', () => {
    const md = `${ACTIVAS_START}\n${ACTIVAS_END}`;
    const incompleto = parsePlanningDoc('# Iniciativa — Rota\n\n**Estado:** planned\n', 'rota');
    expect(() => regenerateInitiatives(md, [incompleto])).toThrow(/rota\.md/);
  });
});

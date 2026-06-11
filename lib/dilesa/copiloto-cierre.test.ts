import { describe, expect, it } from 'vitest';
import { evaluarCierre, type CopilotoInput } from './copiloto-cierre';
import { rolesOpcionales } from './captura/fase-roles';

const fasesCompletas = Array.from({ length: 17 }, (_, idx) => ({
  pos: idx + 1,
  nombre: `Fase ${idx + 1}`,
  alcanzada: idx + 1 <= 16,
}));

const BASE: CopilotoInput = {
  fases: fasesCompletas,
  docsFaltantes: [],
  saldoCliente: -276049.55,
  cubierta: true,
};

describe('evaluarCierre', () => {
  it('todo en orden → listo con 4 palomitas', () => {
    const r = evaluarCierre(BASE);
    expect(r.listo).toBe(true);
    expect(r.pendientes).toBe(0);
    expect(r.items.every((i) => i.ok)).toBe(true);
  });

  it('fases pendientes se listan con posición y nombre', () => {
    const fases = BASE.fases.map((f) =>
      f.pos === 9 || f.pos === 12 ? { ...f, alcanzada: false } : f
    );
    const r = evaluarCierre({ ...BASE, fases });
    expect(r.listo).toBe(false);
    expect(r.items[0]!.ok).toBe(false);
    expect(r.items[0]!.detalle).toContain('9 · Fase 9');
    expect(r.items[0]!.detalle).toContain('12 · Fase 12');
  });

  it('docs faltantes se enumeran por label', () => {
    const r = evaluarCierre({
      ...BASE,
      docsFaltantes: [
        { fase: 'Facturada', rol: 'factura', label: 'Factura' },
        { fase: 'Escriturada', rol: 'pagare', label: 'Pagaré' },
      ],
    });
    expect(r.items[1]!.ok).toBe(false);
    expect(r.items[1]!.detalle).toContain('Faltan 2');
    expect(r.items[1]!.detalle).toContain('Factura');
  });

  it('saldo pendiente muestra el monto; sin datos lo dice', () => {
    const conSaldo = evaluarCierre({ ...BASE, cubierta: false, saldoCliente: 49000 });
    expect(conSaldo.items[2]!.ok).toBe(false);
    expect(conSaldo.items[2]!.detalle).toContain('49,000');

    const sinDatos = evaluarCierre({ ...BASE, cubierta: null, saldoCliente: null });
    expect(sinDatos.items[2]!.detalle).toContain('Sin datos');
  });

  it('fase 16 sin cerrar = conformidad pendiente', () => {
    const fases = BASE.fases.map((f) => (f.pos === 16 ? { ...f, alcanzada: false } : f));
    const r = evaluarCierre({ ...BASE, fases });
    expect(r.items[3]!.ok).toBe(false);
    expect(r.listo).toBe(false);
  });
});

describe('rolesOpcionales (docs condicionales)', () => {
  it('venta Infonavit simple sin CD ni nota: exime co-titular, pagaré y nota', () => {
    const opc = rolesOpcionales({
      monto_credito_cotitular: null,
      monto_credito_directo: null,
      monto_nota_credito: 0,
      tipo_credito: 'Infonavit Tradicional',
    });
    expect(opc.has('constancia_credito_cotitular')).toBe(true);
    expect(opc.has('pagare')).toBe(true);
    expect(opc.has('nota_credito')).toBe(true);
    expect(opc.has('condiciones_financieras')).toBe(false); // Infonavit SÍ lo exige
  });

  it('crédito bancario: exime el Anexo B', () => {
    const opc = rolesOpcionales({
      monto_credito_cotitular: 100000,
      monto_credito_directo: 50000,
      monto_nota_credito: 1000,
      tipo_credito: 'Hipotecario',
    });
    expect(opc.has('condiciones_financieras')).toBe(true);
    expect(opc.has('constancia_credito_cotitular')).toBe(false);
    expect(opc.has('pagare')).toBe(false);
    expect(opc.has('nota_credito')).toBe(false);
  });
});

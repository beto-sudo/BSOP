import { describe, it, expect } from 'vitest';
import { listManualDocs } from './load';
import {
  MANUAL_GROUPS,
  manualGroupKey,
  manualGroupLabel,
  isRegisteredManualGroup,
  sortDocsForReading,
  groupManualDocs,
} from './groups';

describe('manualGroupKey', () => {
  it('docs anidados usan el segmento después de la empresa', () => {
    expect(manualGroupKey(['dilesa', 'ventas', 'lista'])).toBe('ventas');
    expect(manualGroupKey(['dilesa', 'compras', 'costo_materiales'])).toBe('compras');
  });

  it('docs top-level son su propio grupo', () => {
    expect(manualGroupKey(['dilesa', 'ruv'])).toBe('ruv');
    expect(manualGroupKey(['dilesa', 'saldos-bancos'])).toBe('saldos-bancos');
  });
});

describe('grupos registrados', () => {
  it('TODOS los docs reales del manual caen en un grupo con label registrado', async () => {
    // Anti-drift: si alguien agrega una carpeta nueva bajo content/manual/
    // sin registrar su label en MANUAL_GROUPS, este test la detecta (la
    // portada y el PDF mostrarían el key crudo capitalizado).
    const docs = await listManualDocs('dilesa');
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      const key = manualGroupKey(doc.slug);
      expect(isRegisteredManualGroup(key), `grupo sin label: ${key} (${doc.slug.join('/')})`).toBe(
        true
      );
    }
  });

  it('labels sin duplicados y fallback capitalizado para keys desconocidos', () => {
    const labels = MANUAL_GROUPS.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(manualGroupLabel('zzz-nuevo')).toBe('Zzz-nuevo');
  });
});

describe('orden de lectura', () => {
  it('agrupa siguiendo el orden curado y pone el doc principal primero', async () => {
    const docs = await listManualDocs('dilesa');
    const grouped = groupManualDocs(docs);

    // Los grupos presentes respetan el orden de MANUAL_GROUPS.
    const orderIndex = new Map(MANUAL_GROUPS.map((g, i) => [g.key, i]));
    const seen = grouped.map((g) => orderIndex.get(g.key) ?? MANUAL_GROUPS.length);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);

    // En Ventas, la pantalla principal (lista) abre el grupo y las fases
    // quedan en secuencia (zero-padding).
    const ventas = grouped.find((g) => g.key === 'ventas');
    expect(ventas).toBeDefined();
    expect(ventas!.docs[0].slug.join('/')).toBe('dilesa/ventas/lista');
    const fases = ventas!.docs
      .map((d) => d.slug[d.slug.length - 1])
      .filter((n) => n.startsWith('fase'));
    expect(fases).toEqual([...fases].sort());
  });

  it('sortDocsForReading no muta el array original', async () => {
    const docs = await listManualDocs('dilesa');
    const copy = [...docs];
    sortDocsForReading(docs);
    expect(docs).toEqual(copy);
  });
});

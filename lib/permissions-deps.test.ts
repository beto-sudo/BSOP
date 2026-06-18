import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { MODULE_DEPS, requisitosDe, requisitosFaltantes } from './permissions-deps';

/**
 * Inventario real página → slug: recorre los page.tsx bajo app/ y extrae el
 * `modulo="..."` de su RequireAccess. Es la misma fuente de verdad que el
 * runtime — si una sesión futura agrega una página con slug nuevo y no lo
 * registra en MODULE_DEPS, estos tests fallan (regla S1, accesos-intuitivos).
 */
function inventarioPaginas(): Array<{ ruta: string; slug: string }> {
  const raiz = join(process.cwd(), 'app');
  const resultado: Array<{ ruta: string; slug: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'page.tsx') {
        const src = readFileSync(full, 'utf8');
        const m = src.match(/modulo="([^"]+)"/);
        if (m) {
          resultado.push({
            ruta: relative(raiz, dir).split(sep).join('/'),
            slug: m[1],
          });
        }
      }
    }
  };
  walk(raiz);
  return resultado;
}

const PAGINAS = inventarioPaginas();

describe('MODULE_DEPS — cobertura y validez', () => {
  it('toda página con RequireAccess tiene su slug registrado en MODULE_DEPS', () => {
    const sinEntrada = PAGINAS.filter((p) => !(p.slug in MODULE_DEPS));
    expect(
      sinEntrada,
      `Slugs de página sin entrada en lib/permissions-deps.ts (agrégalos, aunque sea con []): ${sinEntrada
        .map((p) => `${p.slug} (app/${p.ruta})`)
        .join(', ')}`
    ).toEqual([]);
  });

  it('toda dependencia declarada apunta a un slug registrado', () => {
    const rotas = Object.entries(MODULE_DEPS).flatMap(([slug, deps]) =>
      deps.filter((d) => !(d in MODULE_DEPS)).map((d) => `${slug} → ${d}`)
    );
    expect(rotas).toEqual([]);
  });

  it('no hay ciclos (ningún slug se requiere a sí mismo transitividad incluida)', () => {
    const ciclos = Object.keys(MODULE_DEPS).filter((slug) => requisitosDe(slug).includes(slug));
    expect(ciclos).toEqual([]);
  });

  it('páginas anidadas bajo un segmento dinámico declaran el slug de su ancestro', () => {
    // Si /x/[id]/captura pide slug A y /x (o /x/[id]) pide slug B ≠ A, llegar a
    // la página anidada atraviesa B → A debe requerir B. Este test es el que
    // detecta el "caso Nelcy" para páginas futuras.
    const slugPorRuta = new Map(PAGINAS.map((p) => [p.ruta, p.slug]));
    const faltas: string[] = [];
    for (const { ruta, slug } of PAGINAS) {
      const segmentos = ruta.split('/');
      if (!segmentos.some((s) => s.startsWith('['))) continue; // no anidada bajo dinámico
      for (let corte = segmentos.length - 1; corte > 0; corte--) {
        const rutaAncestro = segmentos.slice(0, corte).join('/');
        const slugAncestro = slugPorRuta.get(rutaAncestro);
        if (!slugAncestro) continue;
        // Primer ancestro con página propia: si comparte slug, la navegación
        // se resuelve dentro del mismo permiso y no hay dependencia que pedir.
        if (slugAncestro !== slug && !requisitosDe(slug).includes(slugAncestro)) {
          faltas.push(`${slug} (app/${ruta}) debería requerir ${slugAncestro}`);
        }
        break;
      }
    }
    expect(faltas).toEqual([]);
  });
});

describe('requisitosDe / requisitosFaltantes', () => {
  it('capturas de fase y autorizar requieren la lista de ventas', () => {
    expect(requisitosDe('dilesa.ventas.autorizar')).toContain('dilesa.ventas.lista');
    expect(requisitosDe('dilesa.ventas.fase03_formalizada')).toContain('dilesa.ventas.lista');
    expect(requisitosDe('dilesa.ventas.fase17_operacion_terminada')).toContain(
      'dilesa.ventas.lista'
    );
  });

  it('el gasto de proyecto requiere el detalle de proyectos', () => {
    expect(requisitosDe('dilesa.proyectos.gasto')).toContain('dilesa.proyectos.activos');
  });

  it('slugs sin dependencias devuelven vacío', () => {
    expect(requisitosDe('dilesa.ventas.lista')).toEqual([]);
    expect(requisitosDe('rdb.home')).toEqual([]);
  });

  it('requisitosFaltantes excluye los que ya tienen lectura', () => {
    // `autorizar` (captura Fase 2) vive bajo el expediente → requiere operacion,
    // que a su vez requiere lista (cadena tras `dilesa-ventas-expediente-tabs`).
    expect(
      requisitosFaltantes(
        'dilesa.ventas.autorizar',
        new Set(['dilesa.ventas.lista', 'dilesa.ventas.operacion'])
      )
    ).toEqual([]);
    expect(requisitosFaltantes('dilesa.ventas.autorizar', new Set())).toEqual([
      'dilesa.ventas.operacion',
      'dilesa.ventas.lista',
    ]);
  });

  it('slug desconocido no truena (devuelve vacío)', () => {
    expect(requisitosDe('no.existe')).toEqual([]);
  });
});

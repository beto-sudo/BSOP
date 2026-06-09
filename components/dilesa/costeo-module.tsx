'use client';

/**
 * CosteoModule — costeo + rollup de CapEx por proyecto (DILESA).
 *
 * Iniciativa dilesa-contratos-obra · Sprint 3, rediseñado en dilesa-compras
 * (Sprint 1 fase 2b). Tab "Costeo" del hub Construcción. Junta las dos capas
 * del traspaso de obra (ADR-038):
 *
 *   - Capa A (`erp.presupuesto_partidas`, modelo canónico ADR-040): presupuesto
 *     actualizado vs gasto real por partida × etapa × proyecto. Es la tabla
 *     principal de esta vista.
 *   - Capa B (`dilesa.contratos_construccion` + `dilesa.obra_estimaciones`):
 *     contratado y pagado por proyecto → saldo por pagar (`valor_total − Σ
 *     estimaciones`). Alimenta los KPIs de rollup.
 *
 * El rediseño (2026-06-04, plan cerrado con Beto):
 *   1. Tabla agrupada colapsable en 2 niveles: etapa › capítulo (del catálogo
 *      `erp.conceptos_compra`), con subtotal por grupo.
 *   2. Orden por el catálogo canónico (etapa→capítulo→concepto). Las partidas
 *      sin `concepto_id` caen en un grupo "Sin clasificar" al final.
 *   3. Un proyecto a la vez: auto-selecciona el primero al entrar.
 *   4. El form gana 2 dropdowns: concepto del catálogo (clasifica → setea
 *      `concepto_id`) + proveedor de `erp.proveedores` (setea
 *      `proveedor_persona_id`).
 *   5. Edición por click en la fila; el botón eliminar vive dentro del cuadro
 *      de edición (no íconos en la orilla de la fila).
 *
 * Carga cross-schema con queries paralelas + lookups Map (mismo patrón que
 * contratos-module — evita embeds de PostgREST). Los KPIs son reactivos a los
 * filtros (ADR-034); el contratado/saldo refleja los proyectos visibles.
 *
 * Control de 3 capas por partida (ADR-042, sprint Contratos→partidas · Fase 3):
 * cada renglón muestra Comprometido (Σ OC + contratos de obra ligados por
 * `partida_id`) · Ejercido (recibido + facturas directas) · Disponible
 * (presupuesto − comprometido; rojo si negativo = sobre-contratación), leídos de
 * `erp.v_partida_control` por un lookup Map paralelo. Por eso el monto de un
 * contrato de obra (p.ej. Maya) ya aparece dentro de su partida, no solo en el
 * KPI agregado "Contratado".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Coins, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { usePermissions } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { CosteoConceptoForm } from '@/components/dilesa/costeo-concepto-form';
import {
  buildProyectoOptions,
  type ProyectoOption,
  type ProyectoSelectorRow,
} from '@/lib/dilesa/proyectos-selector';
import {
  buildCatalogoConceptos,
  type CatalogoConceptos,
  type ConceptoResuelto,
} from '@/lib/dilesa/conceptos-catalogo';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency, formatPercent } from '@/lib/format';

export type CosteoRow = {
  id: string;
  proyecto_id: string | null;
  proyectoNombre: string;
  etapa: string | null;
  concepto: string;
  /** Clasificación al catálogo `erp.conceptos_compra` (drives agrupado/orden). */
  conceptoId: string | null;
  /** presupuesto_previo crudo (numeric, c/IVA) — para la captura. */
  presupuestoPrevio: number | null;
  /** presupuesto_actualizado crudo (numeric, c/IVA) — para la captura. */
  presupuestoActualizado: number | null;
  /** presupuesto_actualizado ?? presupuesto_previo (numeric, c/IVA). Derivado. */
  presupuesto: number | null;
  /** gasto_real_total (numeric, c/IVA) — captura manual del traspaso (Excel). */
  gastoReal: number | null;
  /**
   * Comprometido de la partida (Σ OC enviada/parcial/cerrada + Σ contratos de
   * obra ligados por `partida_id`) — `erp.v_partida_control` (ADR-042). 0 si la
   * partida no tiene ni OC ni contratos.
   */
  comprometido: number;
  /**
   * Ejercido/devengado de la partida (recibido de OC + facturas directas) —
   * `erp.v_partida_control` (ADR-041). 0 si nada devengado.
   */
  ejercido: number;
  /** Proveedor estructurado (persona_id) — preferido sobre el texto libre. */
  proveedorPersonaId: string | null;
  /** Proveedor en texto libre (legacy del traspaso; fallback de display). */
  proveedor: string | null;
  /** fecha_compromiso (date ISO) — para la captura. */
  fechaCompromiso: string | null;
  /** orden dentro del proyecto — autocalculado en alta. */
  orden: number;
  /** gastoReal / presupuesto (0–1) o null si no hay presupuesto. */
  ratio: number | null;
};

/** Opción de proveedor para el dropdown del form (persona_id + nombre). */
export type ProveedorOption = { personaId: string; label: string };

/** Contratado y pagado por proyecto (Capa B), para el rollup de saldo. */
export type ContratoAgg = { contratado: number; saldo: number };

/** Clave del bucket "sin clasificar" (etapa o capítulo sin catálogo). */
const SIN = '__sin__';

/** Un capítulo agrupado con sus partidas y subtotales. */
export type CosteoCapitulo = {
  key: string;
  codigo: string | null;
  nombre: string;
  partidas: CosteoRow[];
  presupuesto: number;
  gastoReal: number;
  comprometido: number;
  ejercido: number;
};

/** Una etapa agrupada con sus capítulos y subtotales. */
export type CosteoEtapa = {
  key: string;
  codigo: string | null;
  nombre: string;
  capitulos: CosteoCapitulo[];
  presupuesto: number;
  gastoReal: number;
  comprometido: number;
  ejercido: number;
};

/**
 * Agrupa las partidas en la estructura colapsable de 2 niveles (etapa →
 * capítulo) según la clasificación del catálogo. Las partidas sin `concepto_id`
 * (o cuyo concepto no resuelve en el catálogo) caen en "Sin clasificar", que se
 * ordena al final. Subtotales null-safe. Orden de hojas: código de concepto →
 * `orden` → texto. Exportado para test unitario (ADR-034 patrón deriveKpis).
 */
export function groupCosteo(
  rows: readonly CosteoRow[],
  byConcepto: ReadonlyMap<string, ConceptoResuelto>
): CosteoEtapa[] {
  type EtapaAcc = {
    key: string;
    codigo: string | null;
    nombre: string;
    orderKey: string;
    capitulos: Map<string, { cap: CosteoCapitulo; orderKey: string }>;
    presupuesto: number;
    gastoReal: number;
    comprometido: number;
    ejercido: number;
  };
  const etapas = new Map<string, EtapaAcc>();

  for (const r of rows) {
    const res = r.conceptoId ? byConcepto.get(r.conceptoId) : undefined;
    const etapaKey = res ? res.etapaCodigo : SIN;
    const capKey = res ? res.capituloCodigo : SIN;

    let e = etapas.get(etapaKey);
    if (!e) {
      e = {
        key: etapaKey,
        codigo: res ? res.etapaCodigo : null,
        nombre: res ? res.etapaNombre : 'Sin clasificar',
        orderKey: res ? res.etapaCodigo : '￿',
        capitulos: new Map(),
        presupuesto: 0,
        gastoReal: 0,
        comprometido: 0,
        ejercido: 0,
      };
      etapas.set(etapaKey, e);
    }

    let c = e.capitulos.get(capKey);
    if (!c) {
      c = {
        cap: {
          key: `${etapaKey}/${capKey}`,
          codigo: res ? res.capituloCodigo : null,
          nombre: res ? res.capituloNombre : 'Sin clasificar',
          partidas: [],
          presupuesto: 0,
          gastoReal: 0,
          comprometido: 0,
          ejercido: 0,
        },
        orderKey: res ? res.capituloCodigo : '￿',
      };
      e.capitulos.set(capKey, c);
    }

    const p = r.presupuesto ?? 0;
    const g = r.gastoReal ?? 0;
    c.cap.partidas.push(r);
    c.cap.presupuesto += p;
    c.cap.gastoReal += g;
    c.cap.comprometido += r.comprometido;
    c.cap.ejercido += r.ejercido;
    e.presupuesto += p;
    e.gastoReal += g;
    e.comprometido += r.comprometido;
    e.ejercido += r.ejercido;
  }

  return [...etapas.values()]
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey))
    .map((e) => ({
      key: e.key,
      codigo: e.codigo,
      nombre: e.nombre,
      presupuesto: e.presupuesto,
      gastoReal: e.gastoReal,
      comprometido: e.comprometido,
      ejercido: e.ejercido,
      capitulos: [...e.capitulos.values()]
        .sort((a, b) => a.orderKey.localeCompare(b.orderKey))
        .map(({ cap }) => {
          cap.partidas.sort((x, y) => {
            const cx = x.conceptoId ? (byConcepto.get(x.conceptoId)?.codigo ?? '') : '';
            const cy = y.conceptoId ? (byConcepto.get(y.conceptoId)?.codigo ?? '') : '';
            if (cx !== cy) return cx.localeCompare(cy);
            if (x.orden !== y.orden) return x.orden - y.orden;
            return x.concepto.localeCompare(y.concepto);
          });
          return cap;
        }),
    }));
}

/**
 * KPIs reactivos a filtros (ADR-034). `rows` = renglones de presupuesto
 * visibles; `contratos` = agregado de Capa B de los proyectos visibles.
 */
export function deriveKpis(
  rows: readonly CosteoRow[],
  contratos: ContratoAgg
): readonly ModuleKpi[] {
  const presupuesto = rows.reduce((acc, r) => acc + (r.presupuesto ?? 0), 0);
  const gastoReal = rows.reduce((acc, r) => acc + (r.gastoReal ?? 0), 0);
  const ratio = presupuesto > 0 ? gastoReal / presupuesto : null;

  return [
    {
      key: 'presupuesto',
      label: 'Presupuesto',
      value: presupuesto === 0 ? '—' : formatCurrency(presupuesto, { compact: true }),
    },
    {
      key: 'gasto',
      label: 'Gasto real',
      value: gastoReal === 0 ? '—' : formatCurrency(gastoReal, { compact: true }),
    },
    {
      key: 'ejecucion',
      label: '% ejecución',
      value: ratio == null ? '—' : formatPercent(ratio),
    },
    {
      key: 'contratado',
      label: 'Contratado',
      value:
        contratos.contratado === 0 ? '—' : formatCurrency(contratos.contratado, { compact: true }),
    },
    {
      key: 'saldo',
      label: 'Saldo por pagar',
      value: contratos.saldo === 0 ? '—' : formatCurrency(contratos.saldo, { compact: true }),
    },
  ];
}

/** Monto del costeo: '—' cuando es exactamente 0, moneda si no (ADR-034). */
function fmtMonto(n: number): string {
  return n === 0 ? '—' : formatCurrency(n);
}

/**
 * Disponible de una partida/grupo = presupuesto − comprometido. Negativo =
 * sobre-contratación (se comprometió más de lo presupuestado) → `alerta`. '—'
 * solo cuando no hay ni presupuesto ni comprometido.
 */
function disponibleCell(
  presupuesto: number,
  comprometido: number
): {
  text: string;
  alerta: boolean;
} {
  if (presupuesto === 0 && comprometido === 0) return { text: '—', alerta: false };
  const d = presupuesto - comprometido;
  return { text: formatCurrency(d), alerta: d < 0 };
}

type FetchResult = {
  rows?: CosteoRow[];
  agg?: Map<string, { contratado: number; pagado: number }>;
  proyectos?: ProyectoOption[];
  catalogo?: CatalogoConceptos;
  proveedores?: ProveedorOption[];
  proveedorNombreById?: Map<string, string>;
  error?: string;
};

export function CosteoModule({
  empresaId,
  proyectoIdFijo,
}: {
  empresaId: string;
  /**
   * Modo "home del gasto" (iniciativa dilesa-flujo-gasto · S2): el módulo
   * vive dentro del detalle de un proyecto — proyecto fijo (sin selector ni
   * header propio) y gate de escritura por el sub-slug del tab Gasto.
   */
  proyectoIdFijo?: string;
}) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const writeSlug = proyectoIdFijo ? 'dilesa.proyectos.gasto' : 'dilesa.construccion.costeo';
  const puedeEscribir = permissions.isAdmin || permissions.modulos.get(writeSlug)?.write === true;

  const [rows, setRows] = useState<CosteoRow[]>([]);
  /** contratado/pagado por proyecto_id (Capa B). */
  const [contratoAggByProyecto, setContratoAggByProyecto] = useState<
    Map<string, { contratado: number; pagado: number }>
  >(new Map());
  /** Proyectos DILESA para el selector del form (desarrollos + anteproyectos no convertidos). */
  const [proyectos, setProyectos] = useState<ProyectoOption[]>([]);
  /** Catálogo de conceptos (agrupado/orden de la tabla + optgroups del form). */
  const [catalogo, setCatalogo] = useState<CatalogoConceptos>({
    byConcepto: new Map(),
    optgroups: [],
  });
  /** Proveedores activos para el dropdown del form. */
  const [proveedores, setProveedores] = useState<ProveedorOption[]>([]);
  /** persona_id → nombre, para resolver el proveedor en la tabla. */
  const [proveedorNombreById, setProveedorNombreById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  /** '' = todos · '__sin__' = sin proyecto · else proyecto_id (un proyecto a la vez). */
  const [proyectoFiltro, setProyectoFiltro] = useState(proyectoIdFijo ?? '');
  // Con proyecto fijo el auto-select del primer proyecto no debe correr.
  const autoSelectDone = useRef(Boolean(proyectoIdFijo));
  /** Captura de presupuesto. null editRow + open = alta. */
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState<CosteoRow | null>(null);
  /** Colapsado de grupos (keys de etapa y capítulo). Default: todo expandido. */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const fetchCosteo = useCallback(async (): Promise<FetchResult> => {
    const sb = createSupabaseBrowserClient();

    // Capa A (partidas) + proyectos + Capa B (contratos + estimaciones) +
    // catálogo de conceptos + proveedores activos.
    const [
      presupuestoRes,
      proyectosRes,
      contratosRes,
      estimacionesRes,
      catalogoRes,
      proveedoresRes,
      controlRes,
    ] = await Promise.all([
      // Capa A migrada al modelo canónico erp.presupuesto_partidas (ADR-040).
      // Cast `as any`: la tabla aún no está en types (se difiere al workflow
      // db-types). concepto→concepto_texto, presupuesto_actualizado→presupuesto_aprobado.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('presupuesto_partidas')
        .select(
          'id, proyecto_id, etapa, concepto_texto, concepto_id, presupuesto_aprobado, presupuesto_previo, gasto_real_total, proveedor_persona_id, proveedor_texto, fecha_compromiso, orden'
        )
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre, tipo, proyecto_predecesor_id')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('contratos_construccion')
        .select('id, proyecto_id, valor_total')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .is('cancelada_at', null),
      sb
        .schema('dilesa')
        .from('obra_estimaciones')
        .select('contrato_id, monto_total')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .is('cancelada_at', null),
      // Catálogo de conceptos (ADR-040) — cast `as any` (no está en types aún).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('conceptos_compra')
        .select('id, padre_id, nivel, codigo, nombre')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      // Proveedores activos + nombre de la persona (embed intra-schema erp).
      sb
        .schema('erp')
        .from('proveedores')
        .select('persona_id, personas:persona_id(nombre, apellido_paterno, apellido_materno)')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .is('deleted_at', null),
      // Control de 3 capas por partida (ADR-042): comprometido = Σ OC + Σ
      // contratos de obra ligados por partida_id; ejercido = recibido + facturas
      // directas. La vista ya filtra deleted_at y deriva por empresa.
      sb
        .schema('erp')
        .from('v_partida_control')
        .select('partida_id, comprometido, ejercido')
        .eq('empresa_id', empresaId),
    ]);

    const firstErr =
      presupuestoRes.error ??
      proyectosRes.error ??
      contratosRes.error ??
      estimacionesRes.error ??
      catalogoRes.error ??
      proveedoresRes.error ??
      controlRes.error;
    if (firstErr) {
      return { error: getSupabaseErrorMessage(firstErr, 'No se pudo cargar el costeo.') };
    }

    // Control de 3 capas por partida_id (ADR-042). Lookup Map: evita embed
    // cross-schema (la vista vive en erp; las partidas también, pero el patrón
    // del módulo es queries paralelas + Map).
    const controlByPartida = new Map<string, { comprometido: number; ejercido: number }>();
    for (const c of controlRes.data ?? []) {
      if (!c.partida_id) continue;
      controlByPartida.set(c.partida_id, {
        comprometido: Number(c.comprometido ?? 0),
        ejercido: Number(c.ejercido ?? 0),
      });
    }

    // proyectoMap resuelve nombres de TODOS los proyectos (para la tabla de
    // costeo). El selector del form usa buildProyectoOptions: oculta los
    // anteproyectos ya convertidos y etiqueta los no convertidos
    // (ver lib/dilesa/proyectos-selector).
    const proyectoMap = new Map<string, string>();
    for (const p of proyectosRes.data ?? []) {
      proyectoMap.set(p.id as string, p.nombre as string);
    }
    const proyectos = buildProyectoOptions(
      (proyectosRes.data ?? []) as unknown as ProyectoSelectorRow[]
    );

    // Capa B: pagado por contrato → contratado/pagado por proyecto.
    const pagadoByContrato = new Map<string, number>();
    for (const e of estimacionesRes.data ?? []) {
      const cid = e.contrato_id as string;
      pagadoByContrato.set(cid, (pagadoByContrato.get(cid) ?? 0) + Number(e.monto_total ?? 0));
    }
    const agg = new Map<string, { contratado: number; pagado: number }>();
    for (const c of contratosRes.data ?? []) {
      const pid = c.proyecto_id as string | null;
      if (!pid) continue;
      const cur = agg.get(pid) ?? { contratado: 0, pagado: 0 };
      cur.contratado += Number(c.valor_total ?? 0);
      cur.pagado += pagadoByContrato.get(c.id as string) ?? 0;
      agg.set(pid, cur);
    }

    // Catálogo de conceptos (árbol etapa→capítulo→concepto).
    const catalogo = buildCatalogoConceptos(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (catalogoRes.data ?? []) as any[]
    );

    // Proveedores: dedup por persona_id, label = nombre + apellidos.
    type ProvRaw = {
      persona_id: string;
      personas: {
        nombre: string | null;
        apellido_paterno: string | null;
        apellido_materno: string | null;
      } | null;
    };
    const proveedorNombreById = new Map<string, string>();
    for (const pv of (proveedoresRes.data ?? []) as unknown as ProvRaw[]) {
      if (!pv.persona_id || proveedorNombreById.has(pv.persona_id)) continue;
      const label = [
        pv.personas?.nombre,
        pv.personas?.apellido_paterno,
        pv.personas?.apellido_materno,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();
      proveedorNombreById.set(pv.persona_id, label || '(sin nombre)');
    }
    const proveedores: ProveedorOption[] = [...proveedorNombreById.entries()]
      .map(([personaId, label]) => ({ personaId, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // El SELECT va por cast `as any`; tipamos la fila cruda aquí para conservar
    // el chequeo en el mapeo.
    type PartidaRaw = {
      id: string;
      proyecto_id: string | null;
      etapa: string | null;
      concepto_texto: string | null;
      concepto_id: string | null;
      presupuesto_aprobado: number | null;
      presupuesto_previo: number | null;
      gasto_real_total: number | null;
      proveedor_persona_id: string | null;
      proveedor_texto: string | null;
      fecha_compromiso: string | null;
      orden: number | null;
    };
    const out: CosteoRow[] = ((presupuestoRes.data ?? []) as PartidaRaw[]).map((r) => {
      const presupuesto =
        r.presupuesto_aprobado != null
          ? Number(r.presupuesto_aprobado)
          : r.presupuesto_previo != null
            ? Number(r.presupuesto_previo)
            : null;
      const gastoReal = r.gasto_real_total != null ? Number(r.gasto_real_total) : null;
      const pid = (r.proyecto_id as string | null) ?? null;
      const ctrl = controlByPartida.get(r.id as string);
      return {
        id: r.id as string,
        proyecto_id: pid,
        proyectoNombre: pid ? (proyectoMap.get(pid) ?? '') : '',
        etapa: (r.etapa as string | null) ?? null,
        concepto: (r.concepto_texto as string) ?? '',
        conceptoId: (r.concepto_id as string | null) ?? null,
        presupuestoPrevio: r.presupuesto_previo != null ? Number(r.presupuesto_previo) : null,
        presupuestoActualizado:
          r.presupuesto_aprobado != null ? Number(r.presupuesto_aprobado) : null,
        presupuesto,
        gastoReal,
        comprometido: ctrl?.comprometido ?? 0,
        ejercido: ctrl?.ejercido ?? 0,
        proveedorPersonaId: (r.proveedor_persona_id as string | null) ?? null,
        proveedor: (r.proveedor_texto as string | null) ?? null,
        fechaCompromiso: (r.fecha_compromiso as string | null) ?? null,
        orden: Number(r.orden ?? 0),
        ratio:
          presupuesto != null && presupuesto > 0 && gastoReal != null
            ? gastoReal / presupuesto
            : null,
      };
    });

    return { rows: out, agg, proyectos, catalogo, proveedores, proveedorNombreById };
  }, [empresaId]);

  const applyResult = useCallback((res: FetchResult) => {
    if (res.error) {
      setError(res.error);
      setRows([]);
      setContratoAggByProyecto(new Map());
      setProyectos([]);
      setProveedores([]);
      setProveedorNombreById(new Map());
      setCatalogo({ byConcepto: new Map(), optgroups: [] });
    } else {
      setError(null);
      setRows(res.rows ?? []);
      setContratoAggByProyecto(res.agg ?? new Map());
      setProyectos(res.proyectos ?? []);
      setCatalogo(res.catalogo ?? { byConcepto: new Map(), optgroups: [] });
      setProveedores(res.proveedores ?? []);
      setProveedorNombreById(res.proveedorNombreById ?? new Map());
    }
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    applyResult(await fetchCosteo());
    setLoading(false);
  }, [fetchCosteo, applyResult]);

  useEffect(() => {
    let activo = true;
    void fetchCosteo().then((res) => {
      if (!activo) return;
      applyResult(res);
      // Un proyecto a la vez: auto-selecciona el primero (por nombre) al entrar.
      if (!autoSelectDone.current && !res.error) {
        const first = (res.rows ?? [])
          .filter((r) => r.proyecto_id)
          .sort((a, b) => a.proyectoNombre.localeCompare(b.proyectoNombre))[0];
        if (first?.proyecto_id) setProyectoFiltro(first.proyecto_id);
        autoSelectDone.current = true;
      }
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchCosteo, applyResult]);

  // Soft-delete de una partida. Patrón del repo: marca `deleted_at`, preserva
  // historial para auditoría. Devuelve true si borró (para cerrar el form).
  const eliminar = useCallback(
    async (row: CosteoRow, motivo: string): Promise<boolean> => {
      const sb = createSupabaseBrowserClient();
      const ahora = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any)
        .from('presupuesto_partidas')
        .update({ deleted_at: ahora, cancelada_at: ahora, motivo_cancelacion: motivo })
        .eq('id', row.id);
      if (e) {
        toast.add({
          title: 'Error al eliminar',
          description: getSupabaseErrorMessage(e, 'No se pudo eliminar la partida.'),
          type: 'error',
        });
        return false;
      }
      toast.add({ title: 'Partida eliminada', description: row.concepto, type: 'success' });
      void cargar();
      return true;
    },
    [toast, cargar]
  );

  function abrirAlta() {
    setEditRow(null);
    setFormOpen(true);
  }
  function abrirEdicion(row: CosteoRow) {
    setEditRow(row);
    setFormOpen(true);
  }
  function cerrarForm() {
    setFormOpen(false);
    setEditRow(null);
  }

  const toggleGrupo = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Opciones del selector de proyecto: cada proyecto presente + "sin proyecto".
  const proyectosPresentes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.proyecto_id) m.set(r.proyecto_id, r.proyectoNombre || '(sin nombre)');
    }
    return [...m.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rows]);
  const haySinProyecto = useMemo(() => rows.some((r) => !r.proyecto_id), [rows]);

  const q = search.trim().toLowerCase();
  const filtrados = useMemo(() => {
    return rows.filter((r) => {
      if (proyectoFiltro === SIN) {
        if (r.proyecto_id) return false;
      } else if (proyectoFiltro !== '') {
        if (r.proyecto_id !== proyectoFiltro) return false;
      }
      if (q) {
        const proveedorNombre = r.proveedorPersonaId
          ? (proveedorNombreById.get(r.proveedorPersonaId) ?? '')
          : '';
        const hay =
          r.concepto.toLowerCase().includes(q) ||
          (r.proveedor?.toLowerCase().includes(q) ?? false) ||
          proveedorNombre.toLowerCase().includes(q) ||
          (r.etapa?.toLowerCase().includes(q) ?? false);
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, q, proyectoFiltro, proveedorNombreById]);

  // Contratado/saldo de Capa B para los proyectos visibles en los filtros.
  const contratoTotals = useMemo<ContratoAgg>(() => {
    const visibles = new Set(filtrados.map((r) => r.proyecto_id).filter(Boolean) as string[]);
    let contratado = 0;
    let pagado = 0;
    for (const pid of visibles) {
      const a = contratoAggByProyecto.get(pid);
      if (a) {
        contratado += a.contratado;
        pagado += a.pagado;
      }
    }
    return { contratado, saldo: contratado - pagado };
  }, [filtrados, contratoAggByProyecto]);

  const kpis = useMemo(() => deriveKpis(filtrados, contratoTotals), [filtrados, contratoTotals]);

  const grupos = useMemo(
    () => groupCosteo(filtrados, catalogo.byConcepto),
    [filtrados, catalogo.byConcepto]
  );

  // Al buscar, ignora el colapsado para que los matches sean visibles.
  const isSearching = q.length > 0;
  // Click en la fila abre la edición (solo si puede escribir).
  const onRowClick = puedeEscribir ? abrirEdicion : undefined;

  return (
    <div className="space-y-6 p-6">
      {proyectoIdFijo ? null : (
        <header className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Costeo</h1>
            <p className="text-sm text-[var(--text)]/60">
              Presupuesto vs gasto real por concepto y etapa (urbanización + cabecera), con el
              contratado y saldo por pagar de los contratos de obra. CapEx del desarrollo.
            </p>
          </div>
        </header>
      )}

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex flex-wrap items-center gap-3">
        {proyectoIdFijo ? null : (
          <select
            value={proyectoFiltro}
            onChange={(e) => setProyectoFiltro(e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)]"
            aria-label="Proyecto"
          >
            <option value="">Todos los proyectos</option>
            {proyectosPresentes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
            {haySinProyecto ? <option value={SIN}>Sin proyecto asignado</option> : null}
          </select>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar concepto, proveedor o etapa…"
            className="w-72 pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-[var(--text)]/60">
            {filtrados.length} de {rows.length} partidas
          </span>
          {puedeEscribir ? (
            <button
              type="button"
              onClick={abrirAlta}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva partida
            </button>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <CosteoConceptoForm
          key={editRow?.id ?? 'nuevo'}
          empresaId={empresaId}
          proyectos={proyectos}
          optgroups={catalogo.optgroups}
          proveedores={proveedores}
          rows={rows}
          editRow={editRow}
          defaultProyectoId={proyectoIdFijo}
          onClose={cerrarForm}
          onSaved={() => {
            cerrarForm();
            void cargar();
          }}
          onDelete={
            editRow && puedeEscribir
              ? async (motivo) => {
                  const ok = await eliminar(editRow, motivo ?? '');
                  if (ok) cerrarForm();
                }
              : undefined
          }
        />
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-[var(--border)] py-16 text-sm text-[var(--text)]/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando costeo…
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="mt-2 rounded-md border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      ) : grupos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border)] py-16 text-center">
          <Coins className="h-6 w-6 text-[var(--text)]/30" />
          <p className="text-sm font-medium text-[var(--text)]">Sin costeo</p>
          <p className="text-sm text-[var(--text)]/60">
            No hay partidas de presupuesto que coincidan con los filtros.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--card)] text-xs uppercase tracking-wide text-[var(--text)]/50">
              <tr className="border-b border-[var(--border)]">
                <th className="px-3 py-2.5 text-left">Concepto</th>
                <th className="w-32 px-3 py-2.5 text-right">Presupuesto</th>
                <th className="w-32 px-3 py-2.5 text-right">Comprometido</th>
                <th className="w-32 px-3 py-2.5 text-right">Ejercido</th>
                <th className="w-32 px-3 py-2.5 text-right">Disponible</th>
                <th className="w-32 px-3 py-2.5 text-right">Gasto real</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((etapa) => {
                const etapaCollapsed = !isSearching && collapsed.has(etapa.key);
                return (
                  <GrupoFragment
                    key={etapa.key}
                    etapa={etapa}
                    etapaCollapsed={etapaCollapsed}
                    collapsed={collapsed}
                    isSearching={isSearching}
                    onToggle={toggleGrupo}
                    onRowClick={onRowClick}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Celda de disponible (rojo si sobre-contratado) ─────────────────────────

function DisponibleTd({
  presupuesto,
  comprometido,
  pad,
  normalColor,
}: {
  presupuesto: number;
  comprometido: number;
  pad: string;
  normalColor: string;
}) {
  const { text, alerta } = disponibleCell(presupuesto, comprometido);
  return (
    <td className={`${pad} text-right tabular-nums ${alerta ? 'text-red-600' : normalColor}`}>
      {text}
    </td>
  );
}

// ─── Fragmento de grupo (etapa + sus capítulos + partidas) ──────────────────

function GrupoFragment({
  etapa,
  etapaCollapsed,
  collapsed,
  isSearching,
  onToggle,
  onRowClick,
}: {
  etapa: CosteoEtapa;
  etapaCollapsed: boolean;
  collapsed: Set<string>;
  isSearching: boolean;
  onToggle: (key: string) => void;
  onRowClick?: (r: CosteoRow) => void;
}) {
  return (
    <>
      {/* Nivel 1 · Etapa */}
      <tr className="border-b border-[var(--border)] bg-[var(--card)]/70">
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={() => onToggle(etapa.key)}
            className="-mx-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-left font-semibold text-[var(--text)] hover:bg-[var(--card)]"
          >
            <Chevron open={!etapaCollapsed} />
            {etapa.nombre}
          </button>
        </td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text)]">
          {fmtMonto(etapa.presupuesto)}
        </td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text)]">
          {fmtMonto(etapa.comprometido)}
        </td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text)]">
          {fmtMonto(etapa.ejercido)}
        </td>
        <DisponibleTd
          presupuesto={etapa.presupuesto}
          comprometido={etapa.comprometido}
          pad="px-3 py-2 font-semibold"
          normalColor="text-[var(--text)]"
        />
        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text)]/70">
          {fmtMonto(etapa.gastoReal)}
        </td>
      </tr>

      {!etapaCollapsed &&
        etapa.capitulos.map((cap) => {
          const capCollapsed = !isSearching && collapsed.has(cap.key);
          return (
            <CapituloFragment
              key={cap.key}
              cap={cap}
              capCollapsed={capCollapsed}
              onToggle={onToggle}
              onRowClick={onRowClick}
            />
          );
        })}
    </>
  );
}

// ─── Fragmento de capítulo (capítulo + sus partidas) ────────────────────────

function CapituloFragment({
  cap,
  capCollapsed,
  onToggle,
  onRowClick,
}: {
  cap: CosteoCapitulo;
  capCollapsed: boolean;
  onToggle: (key: string) => void;
  onRowClick?: (r: CosteoRow) => void;
}) {
  return (
    <>
      {/* Nivel 2 · Capítulo */}
      <tr className="border-b border-[var(--border)]/60 bg-[var(--card)]/30">
        <td className="px-3 py-1.5 pl-7">
          <button
            type="button"
            onClick={() => onToggle(cap.key)}
            className="-mx-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-left font-medium text-[var(--text)]/90 hover:bg-[var(--card)]"
          >
            <Chevron open={!capCollapsed} small />
            {cap.nombre}
            <span className="text-xs font-normal text-[var(--text)]/40">
              ({cap.partidas.length})
            </span>
          </button>
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text)]/80">
          {fmtMonto(cap.presupuesto)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text)]/80">
          {fmtMonto(cap.comprometido)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text)]/80">
          {fmtMonto(cap.ejercido)}
        </td>
        <DisponibleTd
          presupuesto={cap.presupuesto}
          comprometido={cap.comprometido}
          pad="px-3 py-1.5"
          normalColor="text-[var(--text)]/80"
        />
        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text)]/60">
          {fmtMonto(cap.gastoReal)}
        </td>
      </tr>

      {!capCollapsed &&
        cap.partidas.map((r) => (
          <tr
            key={r.id}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            title={onRowClick ? 'Editar partida' : undefined}
            className={`border-b border-[var(--border)]/40 transition-colors hover:bg-[var(--card)]/40 ${
              onRowClick ? 'cursor-pointer' : ''
            }`}
          >
            <td className="px-3 py-1.5 pl-12 text-[var(--text)]">{r.concepto || '—'}</td>
            <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text)]">
              {r.presupuesto == null ? '—' : formatCurrency(r.presupuesto)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text)]">
              {fmtMonto(r.comprometido)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text)]">
              {fmtMonto(r.ejercido)}
            </td>
            <DisponibleTd
              presupuesto={r.presupuesto ?? 0}
              comprometido={r.comprometido}
              pad="px-3 py-1.5"
              normalColor="text-[var(--text)]"
            />
            <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text)]/70">
              {r.gastoReal == null ? '—' : formatCurrency(r.gastoReal)}
            </td>
          </tr>
        ))}
    </>
  );
}

function Chevron({ open, small = false }: { open: boolean; small?: boolean }) {
  const cls = small ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return open ? (
    <ChevronDown className={`${cls} text-[var(--text)]/40`} />
  ) : (
    <ChevronRight className={`${cls} text-[var(--text)]/40`} />
  );
}

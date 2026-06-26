'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookText, RefreshCw, Search } from 'lucide-react';

import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  CUENTA_SELECT,
  naturalezaTone,
  tipoTone,
  TIPO_LABEL,
  TIPO_ORDER,
  type CuentaNaturaleza,
  type CuentaRow,
  type CuentaTipo,
} from '@/lib/contabilidad/cuentas';

/**
 * Catálogo de cuentas contables (DILESA) — read-only.
 * Iniciativa `dilesa-catalogo-contable` · Sprint 2.
 *
 * Tabla plana ordenada por número (que ya viene jerárquico: 100-00-000,
 * 101-00-000, 101-01-000…), indentada por nivel para que se lea como árbol.
 * Las acumulativas (no afectables) son los encabezados de sección; las
 * afectables (hojas) son donde se registra. El buscador cubre la navegación.
 */
export function ContabilidadCatalogoModule({ empresaId }: { empresaId: string }) {
  const [rows, setRows] = useState<CuentaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'' | CuentaTipo>('');
  const [naturalezaFiltro, setNaturalezaFiltro] = useState<'' | CuentaNaturaleza>('');
  const [soloAfectables, setSoloAfectables] = useState(false);

  const fetchCuentas = useCallback(async (): Promise<{ data?: CuentaRow[]; error?: string }> => {
    const sb = createSupabaseBrowserClient();
    const { data, error: e } = await sb
      .schema('erp')
      .from('cuentas_contables')
      .select(CUENTA_SELECT)
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .order('numero', { ascending: true });
    if (e) {
      return { error: getSupabaseErrorMessage(e, 'No se pudo cargar el catálogo de cuentas.') };
    }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id,
        numero: r.numero,
        codigo_contpaqi: r.codigo_contpaqi,
        nombre: r.nombre,
        naturaleza: r.naturaleza as CuentaNaturaleza,
        tipo: r.tipo as CuentaTipo,
        nivel: r.nivel,
        cuenta_padre_id: r.cuenta_padre_id,
        codigo_agrupador_sat: r.codigo_agrupador_sat,
        afectable: r.afectable,
      })),
    };
  }, [empresaId]);

  const aplicar = useCallback((res: { data?: CuentaRow[]; error?: string }) => {
    if (res.error) {
      setError(res.error);
      setRows([]);
    } else {
      setError(null);
      setRows(res.data ?? []);
    }
    setLoading(false);
  }, []);

  // Carga inicial. El efecto NO llama setState de forma síncrona (solo dentro
  // del .then, ya asíncrono) — evita el cascade de renders que marca el linter.
  useEffect(() => {
    let activo = true;
    void fetchCuentas().then((res) => {
      if (activo) aplicar(res);
    });
    return () => {
      activo = false;
    };
  }, [fetchCuentas, aplicar]);

  const refrescar = useCallback(() => {
    setLoading(true);
    void fetchCuentas().then(aplicar);
  }, [fetchCuentas, aplicar]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (tipoFiltro && c.tipo !== tipoFiltro) return false;
      if (naturalezaFiltro && c.naturaleza !== naturalezaFiltro) return false;
      if (soloAfectables && !c.afectable) return false;
      if (!q) return true;
      return (
        c.numero.toLowerCase().includes(q) ||
        c.nombre.toLowerCase().includes(q) ||
        (c.codigo_contpaqi ?? '').toLowerCase().includes(q) ||
        (c.codigo_agrupador_sat ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, tipoFiltro, naturalezaFiltro, soloAfectables]);

  const kpis: ModuleKpi[] = useMemo(() => {
    const total = rows.length;
    const afectables = rows.filter((c) => c.afectable).length;
    const gastos = rows.filter((c) => c.tipo === 'gasto' && c.afectable).length;
    return [
      { key: 'total', label: 'Cuentas', value: total.toLocaleString('es-MX') },
      { key: 'afect', label: 'Registrables', value: afectables.toLocaleString('es-MX') },
      {
        key: 'acum',
        label: 'Acumulativas',
        value: (total - afectables).toLocaleString('es-MX'),
      },
      { key: 'gastos', label: 'Cuentas de gasto', value: gastos.toLocaleString('es-MX') },
    ];
  }, [rows]);

  const columns: Column<CuentaRow>[] = useMemo(
    () => [
      {
        key: 'numero',
        label: 'Número',
        type: 'text',
        sticky: true,
        width: 'min-w-[130px]',
        cellClassName: 'font-mono text-xs tabular-nums',
      },
      {
        key: 'nombre',
        label: 'Cuenta',
        type: 'custom',
        width: 'min-w-[320px]',
        render: (c) => (
          <span
            style={{ paddingLeft: `${Math.max(0, c.nivel) * 14}px` }}
            className={c.afectable ? '' : 'font-semibold text-[var(--text)]/70'}
          >
            {c.nombre}
          </span>
        ),
      },
      {
        key: 'tipo',
        label: 'Tipo',
        type: 'custom',
        sortKey: 'tipo',
        render: (c) => <Badge tone={tipoTone(c.tipo)}>{TIPO_LABEL[c.tipo]}</Badge>,
      },
      {
        key: 'naturaleza',
        label: 'Naturaleza',
        type: 'custom',
        sortKey: 'naturaleza',
        render: (c) => (
          <Badge tone={naturalezaTone(c.naturaleza)}>
            {c.naturaleza === 'deudora' ? 'Deudora' : 'Acreedora'}
          </Badge>
        ),
      },
      {
        key: 'codigo_agrupador_sat',
        label: 'SAT',
        type: 'text',
        align: 'left',
        cellClassName: 'font-mono text-xs text-[var(--text)]/50',
      },
      {
        key: 'afectable',
        label: 'Registro',
        type: 'custom',
        render: (c) =>
          c.afectable ? (
            <Badge tone="success">Registrable</Badge>
          ) : (
            <Badge tone="neutral">Acumulativa</Badge>
          ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10">
          <BookText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo de cuentas</h1>
          <p className="text-sm text-[var(--text)]/60">
            Estructura contable de DILESA (CONTPAQi / agrupador SAT). Las cuentas{' '}
            <span className="font-medium">registrables</span> son donde se clasifica el gasto.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={4} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, nombre o código…"
            className="w-72 pl-9"
            aria-label="Buscar cuenta"
          />
        </div>
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value as '' | CuentaTipo)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos los tipos</option>
          {TIPO_ORDER.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          value={naturalezaFiltro}
          onChange={(e) => setNaturalezaFiltro(e.target.value as '' | CuentaNaturaleza)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
          aria-label="Filtrar por naturaleza"
        >
          <option value="">Toda naturaleza</option>
          <option value="deudora">Deudora</option>
          <option value="acreedora">Acreedora</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-[var(--text)]/70">
          <input
            type="checkbox"
            checked={soloAfectables}
            onChange={(e) => setSoloAfectables(e.target.checked)}
            className="size-4 rounded border-[var(--border)]"
          />
          Solo registrables
        </label>
        <button
          onClick={refrescar}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:bg-[var(--bg)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
      </div>

      <DataTable
        data={filtradas}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={refrescar}
        initialSort={{ key: 'numero', dir: 'asc' }}
        density="compact"
        emptyTitle="Sin cuentas"
        emptyDescription="No hay cuentas que coincidan con los filtros."
        maxHeight="calc(100vh - 300px)"
      />
    </div>
  );
}

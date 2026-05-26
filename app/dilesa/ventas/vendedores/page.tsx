'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA
 * (cf. app/dilesa/ventas/[id]/page.tsx, components/dilesa/construccion-module.tsx).
 */

/**
 * @module Ventas · Vendedores (DILESA)
 * @responsive desktop-only
 *
 * Tab "Vendedores" del hub Ventas (sprint tabs-hub). Lista de vendedores
 * con KPIs derivados de las ventas: # activas, # cerradas, monto total
 * vendido, comisiones pagadas/pendientes, tasa de cierre.
 *
 * Modelo: agrupamos por nombre (`dilesa.ventas.vendedor` — texto legacy
 * del Coda). Cuando `vendedor_usuario_id` está poblado pero `vendedor`
 * texto NO, igual cae al bucket "(sin nombre)" — no podemos leer
 * `core.usuarios.first_name` cross-rol sin elevación, y la mayoría de
 * ventas ya tienen el campo texto. Si en el futuro se quiere mostrar el
 * email/avatar del vendedor activo, agregar lookup explícito desde el
 * perfil del propio usuario.
 *
 * "Cerrada" (heurística): `fase_posicion >= 15` (Entregada / Comisión
 * Pagada / Operación Terminada) — el estado escalar `estado` solo es
 * activa|desasignada, no expresa cierre por sí mismo.
 *
 * Gate: sub-slug `dilesa.ventas.vendedores` (ADR-030 SS5).
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, RefreshCw, Search } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { deriveVendedoresKpis } from '@/lib/dilesa/kpis/vendedores';

const CIERRE_POSICION_MIN = 15;

type Venta = {
  id: string;
  estado: string;
  fase_posicion: number | null;
  fase_actual: string | null;
  precio_asignacion: number | null;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  comision_vendedor: number | null;
  anticipo_comision: number | null;
  vendedor: string | null;
  vendedor_usuario_id: string | null;
  created_at: string;
};

type VendedorRow = {
  id: string;
  nombre: string;
  numVentas: number;
  numActivas: number;
  numCerradas: number;
  montoTotal: number;
  comisionTotal: number;
  comisionPagada: number;
  comisionPendiente: number;
  tasaCierre: number;
};

export default function VentasVendedoresPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.vendedores">
      <VentasVendedoresBody />
    </RequireAccess>
  );
}

function VentasVendedoresBody() {
  const router = useRouter();
  const [vendedores, setVendedores] = useState<VendedorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mesFiltro, setMesFiltro] = useState('');
  const [mesesPresentes, setMesesPresentes] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();

    const { data, error: vErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'id, estado, fase_posicion, fase_actual, precio_asignacion, valor_escrituracion, valor_comercial, comision_vendedor, anticipo_comision, vendedor, vendedor_usuario_id, created_at'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null);
    if (vErr) {
      setError(getSupabaseErrorMessage(vErr, 'No se pudieron cargar los vendedores.'));
      setLoading(false);
      return;
    }
    const ventas = (data ?? []) as Venta[];

    // Meses (YYYY-MM) únicos para el filtro
    const meses = new Set<string>();
    for (const v of ventas) meses.add(v.created_at.slice(0, 7));
    setMesesPresentes([...meses].sort().reverse());

    // Filtro por mes (los KPIs reflejan solo el mes seleccionado).
    const filtradoMes = mesFiltro
      ? ventas.filter((v) => v.created_at.slice(0, 7) === mesFiltro)
      : ventas;

    const byVendedor = new Map<string, Venta[]>();
    for (const v of filtradoMes) {
      // Key: vendedor texto si existe; si no, usuario_id; si no, bucket sin nombre.
      const key = (v.vendedor && v.vendedor.trim()) || v.vendedor_usuario_id || '(sin nombre)';
      const arr = byVendedor.get(key) ?? [];
      arr.push(v);
      byVendedor.set(key, arr);
    }

    const rows: VendedorRow[] = [];
    for (const [key, vs] of byVendedor.entries()) {
      // El "id" para click se basa en la key; el nombre legible es el campo
      // texto cuando esté disponible. Si la key es un UUID, mostramos el
      // sufijo corto para que no se vea hostil.
      const isUUIDLike = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(key);
      const nombre = isUUIDLike ? `Usuario ${key.slice(0, 8)}` : key;

      const numVentas = vs.length;
      const numActivas = vs.filter((v) => v.estado === 'activa').length;
      const numCerradas = vs.filter((v) => (v.fase_posicion ?? 0) >= CIERRE_POSICION_MIN).length;
      const montoTotal = vs.reduce(
        (s, v) => s + (v.valor_escrituracion ?? v.precio_asignacion ?? v.valor_comercial ?? 0),
        0
      );
      const comisionTotal = vs.reduce((s, v) => s + (v.comision_vendedor ?? 0), 0);
      const comisionPagada = vs.reduce((s, v) => s + (v.anticipo_comision ?? 0), 0);
      const comisionPendiente = Math.max(0, comisionTotal - comisionPagada);
      const tasaCierre = numVentas > 0 ? numCerradas / numVentas : 0;

      rows.push({
        id: key,
        nombre,
        numVentas,
        numActivas,
        numCerradas,
        montoTotal,
        comisionTotal,
        comisionPagada,
        comisionPendiente,
        tasaCierre,
      });
    }
    rows.sort((a, b) => b.montoTotal - a.montoTotal);
    setVendedores(rows);
    setLoading(false);
  }, [mesFiltro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendedores;
    return vendedores.filter((v) => v.nombre.toLowerCase().includes(q));
  }, [vendedores, search]);

  // KPIs sobre dataset filtrado — ADR-034 KPI2+KPI3.
  const kpis = useMemo(() => deriveVendedoresKpis(filtrados), [filtrados]);

  const columns: Column<VendedorRow>[] = [
    { key: 'nombre', label: 'Vendedor', type: 'text', sticky: true, width: 'min-w-[220px]' },
    { key: 'numVentas', label: '# ventas', type: 'number' },
    { key: 'numActivas', label: '# activas', type: 'number' },
    { key: 'numCerradas', label: '# cerradas', type: 'number' },
    {
      key: 'tasaCierre',
      label: 'Tasa cierre',
      type: 'custom',
      accessor: (v) => v.tasaCierre,
      render: (v) => <span className="tabular-nums">{(v.tasaCierre * 100).toFixed(0)}%</span>,
    },
    { key: 'montoTotal', label: 'Monto total', type: 'currency' },
    { key: 'comisionTotal', label: 'Comisión total', type: 'currency' },
    { key: 'comisionPagada', label: 'Anticipos', type: 'currency' },
    { key: 'comisionPendiente', label: 'Por pagar', type: 'currency' },
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <BadgeDollarSign className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Vendedores</h1>
          <p className="text-sm text-[var(--text)]/60">
            KPIs por vendedor — ventas activas, cerradas, monto total, comisiones, tasa de cierre.
            &laquo;Cerrada&raquo; = fase ≥ {CIERRE_POSICION_MIN} (Entregada en adelante).
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar vendedor…"
            className="w-64 pl-9"
          />
        </div>
        <select
          value={mesFiltro}
          onChange={(e) => setMesFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Acumulado (todos los meses)</option>
          {mesesPresentes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
        <span className="ml-auto text-sm text-[var(--text)]/60">
          {filtrados.length} vendedor{filtrados.length === 1 ? '' : 'es'}
        </span>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={(v) => router.push(`/dilesa/ventas/vendedores/${encodeURIComponent(v.id)}`)}
        initialSort={{ key: 'montoTotal', dir: 'desc' }}
        emptyTitle="Sin vendedores"
        emptyDescription="Aún no hay ventas con vendedor asignado."
        emptyIcon={<BadgeDollarSign className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}

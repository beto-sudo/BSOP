'use client';

import { useMemo, useState } from 'react';
import {
  FlaskConical,
  Store,
  Pill,
  Syringe,
  FileText,
  ExternalLink,
  ShieldAlert,
  Trophy,
  NotebookPen,
} from 'lucide-react';
import {
  ModuleKpiStrip,
  ModuleFilters,
  ModuleContent,
  DataTable,
  type Column,
} from '@/components/module-page';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
} from '@/components/detail-page/detail-drawer';
import { useUrlFilters } from '@/hooks/use-url-filters';
import type { PeptidesData, Test, Vendor, Insumo } from '@/lib/peptides';
import { computeVendorScores, normCode, type VendorScore } from '@/lib/peptides-score';
import { BitacoraTab } from '@/components/peptides/bitacora-tab';
import type { ProtocoloCompuestoConTomas } from '@/lib/protocolo';

type TabKey = 'coa' | 'vendors' | 'peptidos' | 'insumos' | 'notas' | 'bitacora';
type VendorRow = Vendor & { score: VendorScore };

const TABS: { key: TabKey; label: string; icon: typeof FlaskConical }[] = [
  { key: 'coa', label: 'COA / Testing', icon: FlaskConical },
  { key: 'vendors', label: 'Vendors', icon: Store },
  { key: 'peptidos', label: 'Péptidos', icon: Pill },
  { key: 'insumos', label: 'Insumos', icon: Syringe },
  { key: 'notas', label: 'Notas', icon: FileText },
  { key: 'bitacora', label: 'Bitácora', icon: NotebookPen },
];

const FILTER_DEFAULTS = {
  tab: 'coa',
  peptido: '',
  minPurity: '',
  soloEndotoxina: false,
  soloVendorsOk: false,
  q: '',
  vRegion: '',
  vEstado: '',
};

const ESTADO_STYLE: Record<Vendor['estado'], string> = {
  activo:
    'border-emerald-300/40 bg-emerald-100/60 text-emerald-700 dark:border-emerald-300/25 dark:bg-emerald-300/10 dark:text-emerald-200',
  warning:
    'border-amber-300/40 bg-amber-100/60 text-amber-700 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200',
  removido:
    'border-rose-300/40 bg-rose-100/60 text-rose-700 dark:border-rose-300/25 dark:bg-rose-300/10 dark:text-rose-200',
};

function EstadoBadge({ estado }: { estado: Vendor['estado'] }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ESTADO_STYLE[estado]}`}
    >
      {estado}
    </span>
  );
}

function purityColor(p: number | null): string {
  if (p == null) return 'text-muted-foreground';
  if (p >= 99) return 'text-emerald-600 dark:text-emerald-400';
  if (p >= 98) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function scoreColor(n: number): string {
  if (n >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (n >= 45) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-MX', {
    timeZone: 'America/Matamoros',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtPrecio(v: number | null): string {
  return v == null ? '—' : `$${v.toFixed(2)}/mg`;
}

function warehouses(v: Vendor): string {
  const w: string[] = [];
  if (v.us_warehouse) w.push('US');
  if (v.china_warehouse) w.push('CN');
  if (v.eu_warehouse) w.push('EU');
  return w.length ? w.join(' · ') : '—';
}

export function PeptidesView({
  data,
  protocolo,
}: {
  data: PeptidesData;
  protocolo: ProtocoloCompuestoConTomas[];
}) {
  const { peptidos, vendors, tests, insumos, notas, asOf, errors } = data;
  const { filters, setFilter, clearAll } = useUrlFilters(FILTER_DEFAULTS);
  const tab = (filters.tab || 'coa') as TabKey;
  const [vendorSel, setVendorSel] = useState<VendorRow | null>(null);

  // Match blando vendor↔COA por código normalizado (BFF ↔ BFF/AMO).
  const vendorByNorm = useMemo(
    () => new Map(vendors.map((v) => [normCode(v.codigo), v])),
    [vendors]
  );
  const vendorScores = useMemo(() => computeVendorScores(vendors, tests), [vendors, tests]);

  // Opciones de péptido ordenadas por # de COAs (los más probados arriba).
  const peptidoOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tests) if (t.peptido) counts.set(t.peptido, (counts.get(t.peptido) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [tests]);

  const filteredTests = useMemo(() => {
    const min = Number(filters.minPurity) || 0;
    const q = (filters.q || '').toLowerCase();
    return tests.filter((t) => {
      if (filters.peptido && t.peptido !== filters.peptido) return false;
      if (min && (t.purity_pct ?? 0) < min) return false;
      if (filters.soloEndotoxina && !t.endotoxin) return false;
      if (filters.soloVendorsOk) {
        const v = vendorByNorm.get(normCode(t.vendor_codigo));
        if (v && v.estado !== 'activo') return false;
      }
      if (q) {
        const hay = `${t.vendor_codigo ?? ''} ${t.batch ?? ''} ${t.peptido ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    tests,
    filters.peptido,
    filters.minPurity,
    filters.soloEndotoxina,
    filters.soloVendorsOk,
    filters.q,
    vendorByNorm,
  ]);

  const coaKpis = useMemo(() => {
    const n = filteredTests.length;
    const vend = new Set(filteredTests.map((t) => t.vendor_codigo).filter(Boolean)).size;
    const purs = filteredTests.map((t) => t.purity_pct).filter((p): p is number => p != null);
    const avg = purs.length ? purs.reduce((a, b) => a + b, 0) / purs.length : null;
    const endo = filteredTests.filter((t) => t.endotoxin).length;
    return { n, vend, avg, endo };
  }, [filteredTests]);

  const scoredVendors = useMemo<VendorRow[]>(() => {
    return vendors
      .map((v) => ({ ...v, score: vendorScores.get(v.codigo) as VendorScore }))
      .filter((v) => {
        if (filters.vRegion === 'us' && !v.us_warehouse) return false;
        if (filters.vRegion === 'china' && !v.china_warehouse) return false;
        if (filters.vRegion === 'eu' && !v.eu_warehouse) return false;
        if (filters.vEstado && v.estado !== filters.vEstado) return false;
        return true;
      });
  }, [vendors, vendorScores, filters.vRegion, filters.vEstado]);

  const coaColumns: Column<Test>[] = [
    { key: 'peptido', label: 'Péptido', cellClassName: 'font-medium' },
    {
      key: 'vendor_codigo',
      label: 'Vendor',
      render: (t) => {
        const v = vendorByNorm.get(normCode(t.vendor_codigo));
        return (
          <span className="inline-flex items-center gap-1.5">
            {t.vendor_codigo ?? '—'}
            {v ? <EstadoBadge estado={v.estado} /> : null}
          </span>
        );
      },
    },
    { key: 'batch', label: 'Batch', cellClassName: 'text-muted-foreground' },
    {
      key: 'purity_pct',
      label: 'Pureza',
      type: 'custom',
      align: 'right',
      accessor: (t) => t.purity_pct ?? -1,
      render: (t) => (
        <span className={`font-semibold tabular-nums ${purityColor(t.purity_pct)}`}>
          {t.purity_pct != null ? `${t.purity_pct}%` : '—'}
        </span>
      ),
    },
    {
      key: 'endotoxin',
      label: 'Endotoxina',
      render: (t) =>
        t.endotoxin ? (
          <span className="inline-flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
            {t.endotoxin}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'mass_mg',
      label: 'Masa (real/esp)',
      align: 'right',
      type: 'custom',
      accessor: (t) => t.mass_mg ?? -1,
      render: (t) => (
        <span className="tabular-nums text-muted-foreground">
          {t.mass_mg != null ? t.mass_mg : '—'}
          {t.expected_mass_mg != null ? ` / ${t.expected_mass_mg}` : ''}
        </span>
      ),
    },
    { key: 'test_date', label: 'Fecha', type: 'date' },
    {
      key: 'lab_url',
      label: 'COA',
      sortable: false,
      render: (t) =>
        t.lab_url ? (
          <a
            href={t.lab_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t.test_lab ?? 'ver'}
          </a>
        ) : (
          <span className="text-muted-foreground">{t.test_lab ?? '—'}</span>
        ),
    },
  ];

  const vendorColumns: Column<VendorRow>[] = [
    {
      key: 'score',
      label: 'Score',
      type: 'custom',
      align: 'right',
      accessor: (v) => v.score.total,
      render: (v) => (
        <span className={`text-base font-bold tabular-nums ${scoreColor(v.score.total)}`}>
          {v.score.total}
        </span>
      ),
    },
    { key: 'codigo', label: 'Código', cellClassName: 'font-medium' },
    { key: 'nombre', label: 'Nombre', render: (v) => v.nombre ?? v.codigo },
    {
      key: 'estado',
      label: 'Estado',
      accessor: (v) => v.estado,
      render: (v) => <EstadoBadge estado={v.estado} />,
    },
    {
      key: 'precio_mg',
      label: '$/mg',
      align: 'right',
      type: 'custom',
      accessor: (v) => v.precio_mg ?? 999,
      render: (v) => <span className="tabular-nums">{fmtPrecio(v.precio_mg)}</span>,
    },
    {
      key: 'nCoas',
      label: 'COAs',
      align: 'right',
      type: 'custom',
      accessor: (v) => v.score.nCoas,
      render: (v) => <span className="tabular-nums">{v.score.nCoas}</span>,
    },
    {
      key: 'avgPurity',
      label: 'Pureza prom',
      align: 'right',
      type: 'custom',
      accessor: (v) => v.score.avgPurity ?? -1,
      render: (v) => (
        <span className={`tabular-nums ${purityColor(v.score.avgPurity)}`}>
          {v.score.avgPurity != null ? `${v.score.avgPurity}%` : '—'}
        </span>
      ),
    },
    { key: 'warehouses', label: 'Warehouses', sortable: false, render: (v) => warehouses(v) },
    {
      key: 'notas',
      label: 'Historial / notas',
      sortable: false,
      render: (v) =>
        v.notas ? (
          <span className="line-clamp-2 max-w-sm text-xs text-muted-foreground">{v.notas}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const peptidoStats = useMemo(() => {
    const m = new Map<string, { nombre: string; nTests: number; best: number | null }>();
    for (const t of tests) {
      if (!t.peptido) continue;
      const cur = m.get(t.peptido) ?? { nombre: t.peptido, nTests: 0, best: null };
      cur.nTests += 1;
      if (t.purity_pct != null && (cur.best == null || t.purity_pct > cur.best))
        cur.best = t.purity_pct;
      m.set(t.peptido, cur);
    }
    for (const p of peptidos)
      if (!m.has(p.nombre)) m.set(p.nombre, { nombre: p.nombre, nTests: 0, best: null });
    return [...m.values()].sort((a, b) => b.nTests - a.nTests);
  }, [tests, peptidos]);

  type PeptidoStat = { nombre: string; nTests: number; best: number | null };
  const peptidoColumns: Column<PeptidoStat>[] = [
    { key: 'nombre', label: 'Péptido', cellClassName: 'font-medium' },
    { key: 'nTests', label: 'COAs', type: 'number', align: 'right' },
    {
      key: 'best',
      label: 'Mejor pureza',
      align: 'right',
      type: 'custom',
      accessor: (p) => p.best ?? -1,
      render: (p) => (
        <span className={`tabular-nums ${purityColor(p.best)}`}>
          {p.best != null ? `${p.best}%` : '—'}
        </span>
      ),
    },
  ];

  const insumoColumns: Column<Insumo>[] = [
    { key: 'proveedor', label: 'Proveedor', cellClassName: 'font-medium' },
    {
      key: 'productos',
      label: 'Productos',
      sortable: false,
      render: (i) => (
        <span className="whitespace-pre-line text-xs text-muted-foreground">
          {i.productos ?? '—'}
        </span>
      ),
    },
    { key: 'url', label: 'Link', sortable: false, cellClassName: 'text-muted-foreground' },
  ];

  return (
    <section>
      <div className="mb-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300">
          <FlaskConical className="h-4 w-4" />
          Péptidos
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Base de info — sourcing y testing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          COAs, vendors, precios e insumos del grupo STG, para filtrar y decidir de dónde comprar.
          Snapshot {asOf ? `al ${fmtDate(asOf.slice(0, 10))}` : 'sin fecha'} · la fuente cambia
          seguido, re-sincroniza para refrescar. No es consejo médico ni aval de ningún vendor.
        </p>
      </div>

      {errors.length ? (
        <div className="mb-4 rounded-lg border border-amber-300/40 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
          {errors[0]}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-1.5 border-b">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter('tab', t.key)}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-emerald-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'coa' ? (
        <div className="space-y-4">
          <ModuleKpiStrip
            cols={4}
            stats={[
              { key: 'n', label: 'COAs', value: coaKpis.n },
              { key: 'v', label: 'Vendors', value: coaKpis.vend },
              {
                key: 'avg',
                label: 'Pureza prom.',
                value: coaKpis.avg != null ? `${coaKpis.avg.toFixed(2)}%` : '—',
              },
              { key: 'endo', label: 'Con endotoxina', value: coaKpis.endo },
            ]}
          />
          <ModuleFilters count={`${filteredTests.length} de ${tests.length}`}>
            <select
              value={filters.peptido}
              onChange={(e) => setFilter('peptido', e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Todos los péptidos</option>
              {peptidoOptions.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
            <select
              value={filters.minPurity}
              onChange={(e) => setFilter('minPurity', e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Pureza: cualquiera</option>
              <option value="99.5">≥ 99.5%</option>
              <option value="99">≥ 99%</option>
              <option value="98">≥ 98%</option>
            </select>
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={filters.soloEndotoxina}
                onChange={(e) => setFilter('soloEndotoxina', e.target.checked)}
              />
              Con endotoxina
            </label>
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={filters.soloVendorsOk}
                onChange={(e) => setFilter('soloVendorsOk', e.target.checked)}
              />
              Solo vendors OK
            </label>
            <input
              type="search"
              placeholder="Buscar vendor / batch…"
              value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)}
              className="h-9 w-48 rounded-md border bg-background px-2 text-sm"
            />
            <button
              type="button"
              onClick={clearAll}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Limpiar
            </button>
          </ModuleFilters>
          <ModuleContent>
            <DataTable<Test>
              data={filteredTests}
              columns={coaColumns}
              rowKey="id"
              initialSort={{ key: 'purity_pct', dir: 'desc' }}
              showDensityToggle={false}
              maxHeight="calc(100vh - 360px)"
              emptyIcon={<FlaskConical className="h-8 w-8" />}
              emptyTitle="Ningún COA coincide"
              emptyDescription="Ajusta los filtros."
            />
          </ModuleContent>
        </div>
      ) : null}

      {tab === 'vendors' ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            <Trophy className="mr-1 inline h-3.5 w-3.5" />
            Score 0–100 = resultados (40%) · precio (25%) · evidencia/# COAs (20%) · endotoxina
            (15%), con el estado como multiplicador. Click en un vendor para ver el desglose.
          </p>
          <ModuleFilters count={`${scoredVendors.length} de ${vendors.length}`}>
            <select
              value={filters.vRegion}
              onChange={(e) => setFilter('vRegion', e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Todas las regiones</option>
              <option value="us">USA warehouse</option>
              <option value="china">China warehouse</option>
              <option value="eu">EU warehouse</option>
            </select>
            <select
              value={filters.vEstado}
              onChange={(e) => setFilter('vEstado', e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="warning">Warning</option>
              <option value="removido">Removidos</option>
            </select>
            <button
              type="button"
              onClick={clearAll}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Limpiar
            </button>
          </ModuleFilters>
          <ModuleContent>
            <DataTable<VendorRow>
              data={scoredVendors}
              columns={vendorColumns}
              rowKey="id"
              initialSort={{ key: 'score', dir: 'desc' }}
              showDensityToggle={false}
              onRowClick={(v) => setVendorSel(v)}
              emptyIcon={<Store className="h-8 w-8" />}
              emptyTitle="Ningún vendor coincide"
              emptyDescription="Ajusta los filtros."
            />
          </ModuleContent>
        </div>
      ) : null}

      {tab === 'peptidos' ? (
        <ModuleContent>
          <DataTable<PeptidoStat>
            data={peptidoStats}
            columns={peptidoColumns}
            rowKey="nombre"
            initialSort={{ key: 'nTests', dir: 'desc' }}
            showDensityToggle={false}
            emptyIcon={<Pill className="h-8 w-8" />}
            emptyTitle="Sin péptidos"
            emptyDescription="Corre el importer."
          />
        </ModuleContent>
      ) : null}

      {tab === 'insumos' ? (
        <ModuleContent>
          <DataTable<Insumo>
            data={insumos}
            columns={insumoColumns}
            rowKey="id"
            showDensityToggle={false}
            emptyIcon={<Syringe className="h-8 w-8" />}
            emptyTitle="Sin insumos"
            emptyDescription="Corre el importer."
          />
        </ModuleContent>
      ) : null}

      {tab === 'notas' ? (
        notas.length ? (
          <div className="space-y-3">
            {notas.map((n) => (
              <div key={n.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {n.titulo ?? 'Nota'}
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.cuerpo}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Aún no hay notas. Aquí aterriza lo curado del wiki y el digest del Telegram.
          </div>
        )
      ) : null}

      {tab === 'bitacora' ? <BitacoraTab compuestos={protocolo} /> : null}

      <DetailDrawer
        open={!!vendorSel}
        onOpenChange={(o) => !o && setVendorSel(null)}
        title={vendorSel?.nombre ?? vendorSel?.codigo ?? 'Vendor'}
        description={vendorSel ? `Código ${vendorSel.codigo}` : undefined}
      >
        {vendorSel ? (
          <DetailDrawerContent>
            <DetailDrawerSection title="Score">
              <div className="flex items-baseline gap-3">
                <span
                  className={`text-4xl font-bold tabular-nums ${scoreColor(vendorSel.score.total)}`}
                >
                  {vendorSel.score.total}
                </span>
                <span className="text-sm text-muted-foreground">/ 100</span>
                <EstadoBadge estado={vendorSel.estado} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <ScorePart label="Calidad" value={vendorSel.score.calidad} />
                <ScorePart label="Precio" value={vendorSel.score.precio} />
                <ScorePart label="Evidencia" value={vendorSel.score.evidencia} />
                <ScorePart label="Endotoxina" value={vendorSel.score.endotoxina} />
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {vendorSel.score.nCoas} COAs · pureza prom{' '}
                {vendorSel.score.avgPurity != null ? `${vendorSel.score.avgPurity}%` : '—'} ·{' '}
                {Math.round(vendorSel.score.pctAlta * 100)}% ≥99% · {fmtPrecio(vendorSel.precio_mg)}
              </div>
              {vendorSel.score.endotoxinaFlag ? (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-300/40 bg-rose-50 px-2 py-1 text-xs text-rose-700 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-200">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Algún batch reportó endotoxina alta — revisa los COAs.
                </div>
              ) : null}
            </DetailDrawerSection>
            <DetailDrawerSection title="Resumen">
              <div className="space-y-2 text-sm">
                <div className="text-muted-foreground">Warehouses: {warehouses(vendorSel)}</div>
                {vendorSel.metodos_pago ? (
                  <div className="text-muted-foreground">Pago: {vendorSel.metodos_pago}</div>
                ) : null}
                {vendorSel.primer_contacto ? (
                  <div className="text-muted-foreground">Desde: {vendorSel.primer_contacto}</div>
                ) : null}
              </div>
            </DetailDrawerSection>
            {vendorSel.notas ? (
              <DetailDrawerSection title="Historial / notas de la comunidad">
                <p className="whitespace-pre-line text-sm leading-relaxed">{vendorSel.notas}</p>
              </DetailDrawerSection>
            ) : null}
            {vendorSel.nota_personal ? (
              <DetailDrawerSection title="Mi nota">
                <p className="whitespace-pre-line text-sm leading-relaxed">
                  {vendorSel.nota_personal}
                </p>
              </DetailDrawerSection>
            ) : null}
          </DetailDrawerContent>
        ) : null}
      </DetailDrawer>
    </section>
  );
}

function ScorePart({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border bg-card px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value == null ? '—' : value}</div>
    </div>
  );
}

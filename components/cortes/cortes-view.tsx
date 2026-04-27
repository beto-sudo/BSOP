'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Cleanup PR (#30): pre-existing `any` on Supabase row mapping.
 * Proper typing requires schema refactor — out of scope for lint cleanup.
 */

import { PlusCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cargarBancos } from '@/app/rdb/cortes/actions';
import { RequireAccess } from '@/components/require-access';
import { Button } from '@/components/ui/button';
import { AbrirCajaDialog } from './abrir-caja-dialog';
import { CerrarCorteDialog } from './cerrar-corte-dialog';
import { CorteDetail } from './corte-detail';
import { CortesFilters } from './cortes-filters';
import { CortesTable } from './cortes-table';
import { fetchCorteDetail, fetchCortesList } from './data';
import { resolvePresetRange } from './date-presets';
import { todayRange } from './helpers';
import { SummaryBar } from './summary-bar';
import type { Banco, Corte, CorteProducto, CorteTotales, Movimiento, Voucher } from './types';
import { useAbrirCaja } from './use-abrir-caja';
import { useCerrarCorte } from './use-cerrar-corte';

/**
 * CortesView — orchestrator for the RDB cortes de caja dashboard.
 *
 * Behavior preserved 1:1 from the prior single-file `app/rdb/cortes/page.tsx`.
 * Split mirrors the pattern used in `components/travel/`, `components/health/`,
 * and `components/tasks/`:
 *   - ./types                 shapes + UI constants
 *   - ./helpers               pure formatters (dates, currency, ranges)
 *   - ./date-presets          preset → [from, to] resolver
 *   - ./data                  Supabase fetch helpers
 *   - ./summary-bar           top summary cards
 *   - ./cortes-filters        estado/date/preset filter row
 *   - ./cortes-table          sortable data table
 *   - ./corte-detail          side-sheet orchestrator
 *   - ./corte-print-marbete   print-only voucher
 *   - ./abrir-caja-dialog     open-turn dialog (UI)
 *   - ./use-abrir-caja        open-turn state + submit
 *   - ./cerrar-corte-dialog   close-turn denominación counter (UI)
 *   - ./use-cerrar-corte      close-turn state + submit
 */
export function CortesView() {
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estadoFilter, setEstadoFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => todayRange().from);
  const [dateTo, setDateTo] = useState(() => todayRange().to);
  const [presetKey, setPresetKey] = useState<string>('hoy');

  const [selected, setSelected] = useState<Corte | null>(null);
  const [selectedTotales, setSelectedTotales] = useState<CorteTotales | null>(null);
  const [selectedMovimientos, setSelectedMovimientos] = useState<Movimiento[]>([]);
  const [, setSelectedProductos] = useState<CorteProducto[]>([]);
  const [selectedVouchers, setSelectedVouchers] = useState<Voucher[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const abrir = useAbrirCaja();
  const cerrar = useCerrarCorte();

  const handlePreset = (preset: string | null) => {
    if (!preset) return;
    setPresetKey(preset);
    localStorage.setItem('rdb_preset_cortes', preset);
    const range = resolvePresetRange(preset);
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('rdb_preset_cortes');
    if (saved && saved !== 'hoy') {
      handlePreset(saved);
    }
  }, []);

  // Catálogo de bancos: estable, se carga una sola vez al montar.
  useEffect(() => {
    cargarBancos()
      .then(setBancos)
      .catch((e) => {
        console.error('[cortes] cargarBancos:', e);
      });
  }, []);

  const fetchCortes = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const data = await fetchCortesList({ dateFrom, dateTo });
      setCortes(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Error al cargar cortes');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchCortes();
  }, [fetchCortes]);

  const loadDetail = useCallback(async (corteId: string, withSpinner: boolean) => {
    if (withSpinner) setLoadingDetail(true);
    try {
      const { totales, movimientos, productos, vouchers } = await fetchCorteDetail(corteId);
      setSelectedTotales(totales);
      setSelectedMovimientos(movimientos);
      setSelectedProductos(productos);
      setSelectedVouchers(vouchers);
    } catch {
      // non-fatal — drawer still shows corte base info
    } finally {
      if (withSpinner) setLoadingDetail(false);
    }
  }, []);

  const openDetail = async (corte: Corte) => {
    setSelected(corte);
    setSelectedTotales(null);
    setSelectedMovimientos([]);
    setSelectedVouchers([]);
    setDrawerOpen(true);
    await loadDetail(corte.id, true);
  };

  const refreshSelectedDetail = useCallback(() => {
    if (!selected) return;
    void loadDetail(selected.id, false);
    void fetchCortes();
  }, [selected, loadDetail, fetchCortes]);

  const filtered = cortes.filter((c) => {
    if (estadoFilter !== 'all' && c.estado?.toLowerCase() !== estadoFilter) return false;
    return true;
  });

  function openCerrarDialog(corte: Corte) {
    cerrar.openDialog(corte);
    setDrawerOpen(false);
  }

  return (
    <RequireAccess empresa="rdb" modulo="rdb.cortes">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cortes de Caja</h1>
            <p className="text-sm text-muted-foreground">Turnos registrados en RDB</p>
          </div>
          <Button onClick={() => void abrir.openDialog()} className="shrink-0">
            <PlusCircle className="mr-2 h-4 w-4" />
            Abrir Caja
          </Button>
        </div>

        {/* Summary */}
        {!loading && !error && <SummaryBar cortes={filtered} />}

        {/* Filters */}
        <CortesFilters
          estadoFilter={estadoFilter}
          onEstadoChange={setEstadoFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={(v) => {
            setDateFrom(v);
            setPresetKey('custom');
          }}
          onDateToChange={(v) => {
            setDateTo(v);
            setPresetKey('custom');
          }}
          presetKey={presetKey}
          onPresetChange={handlePreset}
          onRefresh={() => void fetchCortes()}
          loading={loading}
          filteredCount={filtered.length}
        />

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Table */}
        <CortesTable
          cortes={filtered}
          loading={loading}
          onRowClick={(corte) => void openDetail(corte)}
        />

        {/* Detail drawer */}
        <CorteDetail
          corte={selected}
          totales={selectedTotales}
          movimientos={selectedMovimientos}
          vouchers={selectedVouchers}
          bancos={bancos}
          loadingDetail={loadingDetail}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onCerrar={openCerrarDialog}
          onMovimientoRegistered={refreshSelectedDetail}
        />

        {/* Cerrar Corte dialog */}
        <CerrarCorteDialog
          open={cerrar.open}
          onOpenChange={cerrar.setOpen}
          corte={cerrar.corte}
          denominaciones={cerrar.denominaciones}
          onUpdateCantidad={cerrar.updateCantidad}
          observaciones={cerrar.observaciones}
          onObservacionesChange={cerrar.setObservaciones}
          onSubmit={() =>
            cerrar.submit(() => {
              void fetchCortes();
              if (selected) void loadDetail(selected.id, false);
            })
          }
          isPending={cerrar.isPending}
          error={cerrar.error}
          isWizard={cerrar.isWizard}
          step={cerrar.step}
          onNext={cerrar.goNext}
          onBack={cerrar.goBack}
          vouchers={cerrar.vouchers}
          bancos={bancos}
          onVoucherUploaded={cerrar.onVoucherUploaded}
          onVoucherRemoved={cerrar.onVoucherRemoved}
        />

        {/* Abrir Caja dialog */}
        <AbrirCajaDialog
          open={abrir.open}
          onOpenChange={abrir.setOpen}
          cajas={abrir.cajas}
          form={abrir.form}
          onFormChange={abrir.setForm}
          onSubmit={() => abrir.submit(() => void fetchCortes())}
          isPending={abrir.isPending}
          error={abrir.error}
        />
      </div>
    </RequireAccess>
  );
}

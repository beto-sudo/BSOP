'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page/detail-drawer';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

import { ArrendamientoPagoDialog } from './arrendamiento-pago-dialog';

/**
 * Estado de cuenta de un contrato de arrendamiento (Sprint 2c). Lista los
 * cargos de `erp.cxc_cargos` (origen_tipo='arrendamiento', origen_id=contrato)
 * con su saldo, y permite registrar un pago contra el contrato.
 */

export type ContratoSel = {
  id: string;
  folio: string | null;
  arrendatario_persona_id: string;
  arrendatario_nombre: string;
};

type CargoRow = {
  id: string;
  tipo_cargo: string;
  periodo: string | null;
  concepto: string | null;
  monto: number;
  monto_pagado: number;
  saldo: number | null;
  fecha_vencimiento: string | null;
  estado: string;
};

type FetchResult = { contratoId: string | null; rows: CargoRow[]; error: string | null };

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  liquidado: 'Liquidado',
  cancelado: 'Cancelado',
};

const ESTADO_CLASS: Record<string, string> = {
  pendiente: 'bg-amber-500/15 text-amber-600',
  parcial: 'bg-sky-500/15 text-sky-600',
  liquidado: 'bg-emerald-500/15 text-emerald-600',
  cancelado: 'bg-muted text-muted-foreground',
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

function fmtFecha(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function fmtPeriodo(p: string | null): string {
  if (!p || p.length !== 6) return p ?? '—';
  return `${p.slice(0, 4)}-${p.slice(4, 6)}`;
}

export function ArrendamientoEstadoCuentaDrawer({
  empresaId,
  contrato,
  open,
  onOpenChange,
}: {
  empresaId: string;
  contrato: ContratoSel | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rows, setRows] = useState<CargoRow[]>([]);
  // `loadedFor` = id del contrato cuyos cargos ya están en `rows`. El spinner
  // se deriva (loading = datos no corresponden al contrato abierto) en vez de
  // un setLoading(true) síncrono en el efecto (regla set-state-in-effect).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagoOpen, setPagoOpen] = useState(false);

  const contratoId = contrato?.id ?? null;
  const loading = open && contratoId != null && loadedFor !== contratoId;

  // fetchData RETORNA datos; aplicar() hace el setState dentro del .then (regla
  // set-state-in-effect). Mismo patrón que arrendamiento-module.
  const fetchData = useCallback(async (): Promise<FetchResult> => {
    if (!contratoId) return { contratoId: null, rows: [], error: null };
    const sb = createSupabaseBrowserClient();
    const { data, error: e } = await sb
      .schema('erp')
      .from('cxc_cargos')
      .select(
        'id, tipo_cargo, periodo, concepto, monto, monto_pagado, saldo, fecha_vencimiento, estado'
      )
      .eq('empresa_id', empresaId)
      .eq('origen_tipo', 'arrendamiento')
      .eq('origen_id', contratoId)
      .is('deleted_at', null)
      .order('periodo', { ascending: true });
    if (e) {
      return {
        contratoId,
        rows: [],
        error: getSupabaseErrorMessage(e, 'No se pudo cargar el estado de cuenta.'),
      };
    }
    return { contratoId, rows: (data ?? []) as CargoRow[], error: null };
  }, [empresaId, contratoId]);

  const aplicar = useCallback((res: FetchResult) => {
    setRows(res.rows);
    setError(res.error);
    setLoadedFor(res.contratoId);
  }, []);

  useEffect(() => {
    if (!open || !contratoId) return;
    let activo = true;
    void fetchData().then((res) => {
      if (activo) aplicar(res);
    });
    return () => {
      activo = false;
    };
  }, [open, contratoId, fetchData, aplicar]);

  const totalAdeudado = rows.reduce(
    (acc, r) => (r.estado === 'cancelado' ? acc : acc + (r.saldo ?? 0)),
    0
  );

  const title = contrato
    ? `Estado de cuenta · ${contrato.arrendatario_nombre}`
    : 'Estado de cuenta';
  const description = contrato?.folio ?? undefined;

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        title={title}
        description={description}
        meta={
          <span className="text-sm">
            Total adeudado:{' '}
            <strong className={totalAdeudado > 0 ? 'text-rose-600' : 'text-emerald-600'}>
              {money.format(totalAdeudado)}
            </strong>
          </span>
        }
        actions={
          <Button
            size="sm"
            onClick={() => setPagoOpen(true)}
            disabled={!contrato}
            className="gap-1.5"
          >
            <Plus className="size-4" /> Registrar pago
          </Button>
        }
      >
        <DetailDrawerContent>
          {error && (
            <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Cargando cargos…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              Este contrato aún no tiene cargos generados. Usa “Generar cargos del mes” para crear
              la renta del periodo.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Periodo</th>
                    <th className="px-3 py-2 font-medium">Concepto</th>
                    <th className="px-3 py-2 text-right font-medium">Monto</th>
                    <th className="px-3 py-2 text-right font-medium">Pagado</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    <th className="px-3 py-2 font-medium">Vence</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{fmtPeriodo(r.periodo)}</td>
                      <td className="px-3 py-2">{r.concepto ?? r.tipo_cargo}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money.format(r.monto)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {money.format(r.monto_pagado)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {money.format(r.saldo ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-xs">{fmtFecha(r.fecha_vencimiento)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            ESTADO_CLASS[r.estado] ?? 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {ESTADO_LABEL[r.estado] ?? r.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DetailDrawerContent>
      </DetailDrawer>

      {contrato && (
        <ArrendamientoPagoDialog
          open={pagoOpen}
          onOpenChange={setPagoOpen}
          arrendamientoId={contrato.id}
          personaId={contrato.arrendatario_persona_id}
          arrendatarioNombre={contrato.arrendatario_nombre}
          contratoFolio={contrato.folio}
          onRegistrado={() => {
            // Forzar spinner (loadedFor != contratoId) y refrescar. Esto corre
            // en un handler, no en el efecto → no viola set-state-in-effect.
            setLoadedFor(null);
            void fetchData().then(aplicar);
          }}
        />
      )}
    </>
  );
}

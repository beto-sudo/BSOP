'use client';

/**
 * CxP · Programación — módulo compartido cross-empresa (ADR-011, SM1-SM6).
 *
 * Lista las facturas de egreso con saldo abierto (`erp.facturas`,
 * `flujo='egreso'`, `saldo > 0`, `estado_cxp IN ('por_pagar','parcial')`)
 * ordenadas por lo que vence primero (`fecha_pago_programada` ||
 * `fecha_vencimiento`), marcando las vencidas. El usuario selecciona varias
 * y, al confirmar, se **agrupa por proveedor** y se llama
 * `erp.cxp_pago_programar` UNA vez por proveedor (con sus facturas y el
 * saldo de cada una). Permite elegir cuenta bancaria, método de pago y
 * fecha programada (comunes al lote).
 *
 * No inventa lógica financiera: la RPC valida saldo por factura, empresa y
 * estado. Esta UI solo arma el JSONB de aplicaciones y muestra una
 * confirmación clara antes de programar.
 *
 * Parametrizado por `empresa` (slug) + `empresaId` (UUID). RDB y DILESA lo
 * reusan con pages delgados (SM1).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Search } from 'lucide-react';

import {
  ModuleFilters,
  ModuleContent,
  ErrorBanner,
  ActiveFiltersChip,
} from '@/components/module-page';
import { DesktopOnlyNotice } from '@/components/responsive';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import type { Json } from '@/types/supabase';
import type { EmpresaSlug } from '@/lib/empresa-branding';

const TZ = 'America/Matamoros';

const FILTER_DEFAULTS = {
  search: '',
};

export type CxpProgramacionModuleProps = {
  /** UUID de la empresa (`core.empresas.id`). Filtra todas las queries. */
  empresaId: string;
  /** Slug de la empresa. Solo para copy/contexto del lote. */
  empresa: EmpresaSlug;
};

// ── Types ────────────────────────────────────────────────────────────────────

type FacturaPendiente = {
  id: string;
  proveedor_id: string | null;
  emisor_nombre: string | null;
  emisor_rfc: string | null;
  proveedor_nombre: string | null;
  fecha_pago_programada: string | null;
  fecha_vencimiento: string | null;
  total: number | null;
  saldo: number;
};

type CuentaBancaria = { id: string; nombre: string; banco: string | null };

const METODO_OPTIONS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00`);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'medium' }).format(d);
}

/** Fecha base para ordenar/derivar vencimiento. */
function fechaBase(f: FacturaPendiente): string | null {
  return f.fecha_pago_programada ?? f.fecha_vencimiento;
}

/** Días para el vencimiento: negativo = vencida. null = sin fecha base. */
function diasParaVencer(f: FacturaPendiente): number | null {
  const base = fechaBase(f);
  if (!base) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${base}T00:00:00`);
  if (isNaN(venc.getTime())) return null;
  return Math.floor((venc.getTime() - hoy.getTime()) / 86400000);
}

function proveedorLabel(f: FacturaPendiente): string {
  return f.emisor_nombre || f.proveedor_nombre || f.emisor_rfc || '(sin proveedor)';
}

/** Clave de agrupación por proveedor (id si existe, si no RFC, si no nombre). */
function proveedorKey(f: FacturaPendiente): string {
  return f.proveedor_id ?? f.emisor_rfc ?? f.emisor_nombre ?? '(sin proveedor)';
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

function vencimientoBadge(f: FacturaPendiente): {
  label: string;
  variant: BadgeVariant;
  className?: string;
} {
  const dias = diasParaVencer(f);
  if (dias == null) return { label: 'Sin fecha', variant: 'outline' };
  if (dias < 0) return { label: `Vencida ${Math.abs(dias)}d`, variant: 'destructive' };
  if (dias === 0)
    return {
      label: 'Vence hoy',
      variant: 'secondary',
      className: 'border-amber-500/50 text-amber-600',
    };
  if (dias <= 7)
    return {
      label: `Vence ${dias}d`,
      variant: 'secondary',
      className: 'border-amber-500/50 text-amber-600',
    };
  return { label: `${dias}d`, variant: 'secondary' };
}

// ── Módulo ─────────────────────────────────────────────────────────────────────

export function CxpProgramacionModule({ empresaId, empresa }: CxpProgramacionModuleProps) {
  const feedback = useActionFeedback();
  const [facturas, setFacturas] = useState<FacturaPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(FILTER_DEFAULTS);
  const { search } = filters;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchFacturas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createSupabaseBrowserClient();
      const { data, error: qErr } = await sb
        .schema('erp')
        .from('facturas')
        .select(
          'id, proveedor_id, emisor_nombre, emisor_rfc, fecha_pago_programada, fecha_vencimiento, total, saldo, estado_cxp'
        )
        .eq('empresa_id', empresaId)
        .eq('flujo', 'egreso')
        .gt('saldo', 0)
        .in('estado_cxp', ['por_pagar', 'parcial']);
      if (qErr) throw qErr;

      type Raw = Omit<FacturaPendiente, 'proveedor_nombre' | 'saldo'> & {
        saldo: number | null;
        estado_cxp: string;
      };
      const rows = (data ?? []) as Raw[];

      // Nombres de proveedor (erp.personas) para filas con proveedor_id sin
      // emisor_nombre. Chunk defensivo a 150 por límite de URL.
      const proveedorIds = [
        ...new Set(rows.map((r) => r.proveedor_id).filter((x): x is string => !!x)),
      ];
      const nombrePorPersona = new Map<string, string>();
      for (let i = 0; i < proveedorIds.length; i += 150) {
        const chunk = proveedorIds.slice(i, i + 150);
        const { data: personas } = await sb
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno, apellido_materno')
          .in('id', chunk);
        for (const p of personas ?? []) {
          const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno]
            .filter(Boolean)
            .join(' ');
          if (nombre) nombrePorPersona.set(p.id as string, nombre);
        }
      }

      const mapped: FacturaPendiente[] = rows.map((r) => ({
        id: r.id,
        proveedor_id: r.proveedor_id,
        emisor_nombre: r.emisor_nombre,
        emisor_rfc: r.emisor_rfc,
        proveedor_nombre: r.proveedor_id ? (nombrePorPersona.get(r.proveedor_id) ?? null) : null,
        fecha_pago_programada: r.fecha_pago_programada,
        fecha_vencimiento: r.fecha_vencimiento,
        total: r.total,
        saldo: Number(r.saldo ?? 0),
      }));

      // Orden: lo que vence primero. Las sin fecha al final.
      mapped.sort((a, b) => {
        const fa = fechaBase(a);
        const fb = fechaBase(b);
        if (fa && fb) return fa < fb ? -1 : fa > fb ? 1 : 0;
        if (fa) return -1;
        if (fb) return 1;
        return 0;
      });

      setFacturas(mapped);
      // Drop selecciones que ya no existen (refresh tras programar).
      setSelectedIds((prev) => {
        const ids = new Set(mapped.map((m) => m.id));
        const next = new Set<string>();
        for (const id of prev) if (ids.has(id)) next.add(id);
        return next;
      });
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'No se pudieron cargar las facturas.'));
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void fetchFacturas();
  }, [fetchFacturas]);

  const filtered = useMemo(() => {
    if (!search) return facturas;
    const q = search.toLowerCase();
    return facturas.filter(
      (f) =>
        proveedorLabel(f).toLowerCase().includes(q) ||
        (f.emisor_rfc ?? '').toLowerCase().includes(q)
    );
  }, [facturas, search]);

  const selectedFacturas = useMemo(
    () => facturas.filter((f) => selectedIds.has(f.id)),
    [facturas, selectedIds]
  );
  const selectedTotal = useMemo(
    () => selectedFacturas.reduce((acc, f) => acc + f.saldo, 0),
    [selectedFacturas]
  );

  // Lote agrupado por proveedor — un cxp_pago por grupo.
  const grupos = useMemo(() => {
    const byProv = new Map<
      string,
      { proveedorId: string | null; proveedor: string; facturas: FacturaPendiente[]; total: number }
    >();
    for (const f of selectedFacturas) {
      const key = proveedorKey(f);
      const g = byProv.get(key) ?? {
        proveedorId: f.proveedor_id,
        proveedor: proveedorLabel(f),
        facturas: [],
        total: 0,
      };
      g.facturas.push(f);
      g.total += f.saldo;
      byProv.set(key, g);
    }
    return [...byProv.values()];
  }, [selectedFacturas]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((f) => selectedIds.has(f.id));

  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (filtered.every((f) => next.has(f.id))) {
        for (const f of filtered) next.delete(f.id);
      } else {
        for (const f of filtered) next.add(f.id);
      }
      return next;
    });
  }, [filtered]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <>
      <DesktopOnlyNotice module="Cuentas por Pagar" />
      <div className="hidden sm:block">
        <ModuleFilters
          count={
            loading
              ? 'Cargando…'
              : `${filtered.length} por pagar${selectedIds.size > 0 ? ` · ${selectedIds.size} seleccionada${selectedIds.size !== 1 ? 's' : ''}` : ''}`
          }
          actions={
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={selectedIds.size === 0}
              className="gap-2"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Programar pago{grupos.length > 1 ? `s (${grupos.length})` : ''}
            </Button>
          }
        >
          <div className="relative min-w-52">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Proveedor o RFC…"
              value={search}
              onChange={(e) => setFilter('search', e.target.value)}
              className="pl-9"
            />
          </div>

          <ActiveFiltersChip count={activeCount} onClearAll={clearAll} />

          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchFacturas()}
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </ModuleFilters>

        {error && <ErrorBanner error={error} onRetry={() => void fetchFacturas()} />}

        <ModuleContent>
          {loading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground sm:px-6">Cargando…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border bg-card px-6 py-12 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium">
                {activeCount > 0 ? 'Ninguna factura coincide' : 'Nada por programar'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeCount > 0
                  ? 'Limpia los filtros para ver todas las facturas con saldo.'
                  : 'No hay facturas de egreso con saldo pendiente.'}
              </p>
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 py-2 pl-3 pr-2">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                      />
                    </th>
                    <th className="py-2 pr-2 font-medium">Proveedor</th>
                    <th className="py-2 pr-2 font-medium">Vence</th>
                    <th className="py-2 pr-2 font-medium">Estado</th>
                    <th className="py-2 pr-2 text-right font-medium">Total</th>
                    <th className="py-2 pl-2 pr-3 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => {
                    const b = vencimientoBadge(f);
                    const checked = selectedIds.has(f.id);
                    return (
                      <tr
                        key={f.id}
                        className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${
                          checked ? 'bg-primary/5' : ''
                        }`}
                        onClick={() => toggleOne(f.id)}
                      >
                        <td className="py-2 pl-3 pr-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${proveedorLabel(f)}`}
                            checked={checked}
                            onChange={() => toggleOne(f.id)}
                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{proveedorLabel(f)}</div>
                            {f.emisor_rfc ? (
                              <div className="font-mono text-xs text-muted-foreground">
                                {f.emisor_rfc}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">
                          {formatDate(fechaBase(f))}
                        </td>
                        <td className="py-2 pr-2">
                          <Badge variant={b.variant} className={b.className}>
                            {b.label}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                          {formatCurrency(f.total)}
                        </td>
                        <td className="py-2 pl-2 pr-3 text-right font-semibold tabular-nums text-amber-600">
                          {formatCurrency(f.saldo)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {selectedIds.size > 0 && (
                  <tfoot>
                    <tr className="border-t font-medium">
                      <td />
                      <td className="py-2 pr-2 text-xs uppercase tracking-wide text-muted-foreground">
                        {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''} ·{' '}
                        {grupos.length} proveedor{grupos.length !== 1 ? 'es' : ''}
                      </td>
                      <td colSpan={3} />
                      <td className="py-2 pl-2 pr-3 text-right tabular-nums">
                        {formatCurrency(selectedTotal)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </ModuleContent>
      </div>

      {/* Se monta on-demand → arranca con estado fresco sin reset-effect. */}
      {confirmOpen && (
        <ProgramarDialog
          onClose={() => setConfirmOpen(false)}
          empresaId={empresaId}
          empresa={empresa}
          grupos={grupos}
          selectedTotal={selectedTotal}
          onDone={(programados) => {
            if (programados > 0) {
              feedback.success(
                `${programados} pago${programados !== 1 ? 's' : ''} programado${programados !== 1 ? 's' : ''}`,
                { description: 'Quedan en estado «programado» pendientes de aprobación.' }
              );
              setSelectedIds(new Set());
              void fetchFacturas();
            }
          }}
        />
      )}
    </>
  );
}

// ── Dialog: programar (agrupado por proveedor) ───────────────────────────────

type Grupo = {
  proveedorId: string | null;
  proveedor: string;
  facturas: FacturaPendiente[];
  total: number;
};

function ProgramarDialog({
  onClose,
  empresaId,
  empresa,
  grupos,
  selectedTotal,
  onDone,
}: {
  /** El padre monta este dialog on-demand → siempre abierto mientras existe. */
  onClose: () => void;
  empresaId: string;
  empresa: EmpresaSlug;
  grupos: Grupo[];
  selectedTotal: number;
  onDone: (programados: number) => void;
}) {
  const feedback = useActionFeedback();
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [cuentaId, setCuentaId] = useState('');
  const [metodo, setMetodo] = useState('transferencia');
  const [fecha, setFecha] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Cargar cuentas bancarias de la empresa al montar.
  useEffect(() => {
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .schema('erp')
        .from('cuentas_bancarias')
        .select('id, nombre, banco')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre');
      if (!activo) return;
      setCuentas((data ?? []) as CuentaBancaria[]);
    })();
    return () => {
      activo = false;
    };
  }, [empresaId]);

  const handleSubmit = async () => {
    if (grupos.length === 0) return;
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    let exitosos = 0;
    const fallidos: string[] = [];

    // Un cxp_pago por proveedor. Secuencial para reportar fallas por grupo
    // sin abortar el lote — el saldo lo valida la RPC factura por factura.
    for (const g of grupos) {
      const aplicaciones = g.facturas.map((f) => ({ factura_id: f.id, monto: f.saldo }));
      const { error } = await sb.schema('erp').rpc('cxp_pago_programar', {
        p_empresa_id: empresaId,
        p_proveedor_id: g.proveedorId as string,
        p_aplicaciones: aplicaciones as unknown as Json,
        p_metodo_pago: metodo || undefined,
        p_fecha_programada: fecha || undefined,
        p_cuenta_bancaria_id: cuentaId || undefined,
      });
      if (error) {
        fallidos.push(`${g.proveedor}: ${getSupabaseErrorMessage(error, 'error')}`);
      } else {
        exitosos += 1;
      }
    }

    setSubmitting(false);
    if (fallidos.length > 0) {
      feedback.error(fallidos.join(' · '), {
        title: `No se programaron ${fallidos.length} de ${grupos.length}`,
      });
    }
    onDone(exitosos);
    if (fallidos.length === 0) onClose();
  };

  const sinProveedor = grupos.some((g) => !g.proveedorId);
  const empresaLabel = empresa.toUpperCase();

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !submitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Programar pagos</DialogTitle>
          <DialogDescription>
            Se creará un pago por proveedor en estado «programado» (pendiente de aprobación de
            Dirección). No sale dinero todavía. Empresa: {empresaLabel}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumen por proveedor */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {grupos.length} pago{grupos.length !== 1 ? 's' : ''} a generar
            </div>
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {grupos.map((g, i) => (
                <li
                  key={g.proveedorId ?? `np-${i}`}
                  className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{g.proveedor}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.facturas.length} factura{g.facturas.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span className="tabular-nums font-semibold">{formatCurrency(g.total)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t pt-1.5 text-sm font-semibold">
              <span>Total a programar</span>
              <span className="tabular-nums">{formatCurrency(selectedTotal)}</span>
            </div>
          </div>

          {sinProveedor && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              Una o más facturas no tienen proveedor enlazado; no se pueden programar. Enlaza el
              proveedor en la factura primero.
            </p>
          )}

          <Separator />

          {/* Parámetros del lote */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Método de pago</span>
              <Combobox
                value={metodo}
                onChange={(v) => setMetodo(v ?? '')}
                options={METODO_OPTIONS}
                placeholder="Método"
                size="sm"
                className="w-full"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Fecha programada</span>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-9"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Cuenta bancaria (opcional)</span>
            <Combobox
              value={cuentaId}
              onChange={(v) => setCuentaId(v ?? '')}
              options={cuentas.map((c) => ({
                value: c.id,
                label: c.banco ? `${c.nombre} · ${c.banco}` : c.nombre,
              }))}
              placeholder={cuentas.length ? 'Elegir cuenta…' : 'Sin cuentas registradas'}
              emptyText="Sin cuentas"
              allowClear
              size="sm"
              className="w-full"
            />
            <span className="text-[11px] text-muted-foreground">
              Si la eliges, al marcar pagado se emite el movimiento bancario automáticamente.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || grupos.length === 0 || sinProveedor}
          >
            {submitting
              ? 'Programando…'
              : `Programar ${grupos.length} pago${grupos.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

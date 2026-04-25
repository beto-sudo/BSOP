'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de /rdb/inventario/levantamientos.
 */

/**
 * Diferencias detalladas — tabla de revisión post-captura.
 *
 * Carga vía `getLineasParaRevisar` (RPC) — la SELECT directa a la tabla está
 * bloqueada por RLS para no-admins.
 *
 * Filtros y acciones:
 *   - Solo con diferencia / Solo fuera de tolerancia / por categoría.
 *   - Edición inline de `notas_diferencia` (server action `actualizarNotaDiferencia`)
 *     habilitada solo para el contador y mientras estado === 'capturado'.
 *   - Imprimir: link a `/reporte`.
 *   - Exportar CSV: client-side, sin roundtrip.
 *
 * NO renderiza <InventarioTabs>.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  Printer,
  Save,
  X,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { LevantamientoStatusBadge } from '@/components/inventario/levantamiento-status-badge';
import { VarianceCell } from '@/components/inventario/variance-cell';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/inventario/format';
import { cn } from '@/lib/utils';
import { actualizarNotaDiferencia, getLineasParaRevisar } from '../../actions';
import type { LineaParaRevisar } from '../../types';

type LevHeader = {
  id: string;
  folio: string | null;
  estado: string;
  fecha_cierre: string | null;
  almacen_nombre: string | null;
  contador_id: string | null;
  contador_nombre: string | null;
};

export default function DiferenciasPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.inventario">
      <DiferenciasInner />
    </RequireAccess>
  );
}

function DiferenciasInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [lev, setLev] = useState<LevHeader | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaParaRevisar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [soloConDiff, setSoloConDiff] = useState(false);
  const [soloFuera, setSoloFuera] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const [
      { data: levRow, error: levErr },
      {
        data: { user },
      },
      lineasRes,
    ] = await Promise.all([
      supabase
        .schema('erp')
        .from('inventario_levantamientos')
        .select('id, folio, estado, fecha_cierre, contador_id, almacenes(nombre)')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase.auth.getUser(),
      getLineasParaRevisar(id),
    ]);

    if (levErr) {
      setError(levErr.message);
      setLoading(false);
      return;
    }
    if (!levRow) {
      setError('Levantamiento no encontrado.');
      setLoading(false);
      return;
    }
    if (!lineasRes.ok) {
      setError(lineasRes.error);
      setLoading(false);
      return;
    }

    type LevQuery = {
      id: string;
      folio: string | null;
      estado: string;
      fecha_cierre: string | null;
      contador_id: string | null;
      almacenes: { nombre: string } | null;
    };
    const lr = levRow as unknown as LevQuery;

    let contador_nombre: string | null = null;
    if (lr.contador_id) {
      const { data: ucRow } = await supabase
        .schema('core')
        .from('usuarios')
        .select('first_name, email')
        .eq('id', lr.contador_id)
        .maybeSingle();
      if (ucRow) {
        contador_nombre = ucRow.first_name?.trim() || ucRow.email || null;
      }
    }

    setLev({
      id: lr.id,
      folio: lr.folio,
      estado: lr.estado,
      fecha_cierre: lr.fecha_cierre,
      almacen_nombre: lr.almacenes?.nombre ?? null,
      contador_id: lr.contador_id,
      contador_nombre,
    });
    setUserId(user?.id ?? null);
    setLineas(lineasRes.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const l of lineas) {
      if (l.categoria) set.add(l.categoria);
    }
    return Array.from(set).sort();
  }, [lineas]);

  const filtered = useMemo(() => {
    return lineas.filter((l) => {
      if (soloConDiff && (l.diferencia ?? 0) === 0) return false;
      if (soloFuera && !l.fuera_de_tolerancia) return false;
      if (categoriaFiltro && l.categoria !== categoriaFiltro) return false;
      return true;
    });
  }, [lineas, soloConDiff, soloFuera, categoriaFiltro]);

  const editable =
    lev != null && lev.estado === 'capturado' && userId != null && lev.contador_id === userId;

  const handleNotaUpdated = (linea_id: string, nota: string) => {
    setLineas((prev) =>
      prev.map((l) =>
        l.linea_id === linea_id ? { ...l, notas_diferencia: nota.trim() || null } : l
      )
    );
  };

  const exportCSV = () => {
    if (!lev) return;
    const header = [
      'Producto',
      'Codigo',
      'Categoria',
      'Unidad',
      'Stock inicial',
      'Salidas durante captura',
      'Stock efectivo',
      'Contado',
      'Diferencia',
      'Diferencia $',
      'Fuera de tolerancia',
      'Notas',
      'Contado at',
    ];
    const rows = filtered.map((l) => [
      l.producto_nombre,
      l.producto_codigo,
      l.categoria ?? '',
      l.unidad,
      String(l.stock_inicial),
      String(l.salidas_durante_captura),
      String(l.stock_efectivo),
      l.cantidad_contada == null ? '' : String(l.cantidad_contada),
      l.diferencia == null ? '' : String(l.diferencia),
      l.diferencia_valor == null ? '' : String(l.diferencia_valor),
      l.fuera_de_tolerancia ? 'sí' : 'no',
      (l.notas_diferencia ?? '').replaceAll('\n', ' '),
      l.contado_at ?? '',
    ]);
    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? '');
            return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `levantamiento-${lev.folio ?? lev.id}-diferencias.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-7xl space-y-4 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !lev) {
    return (
      <div className="container mx-auto max-w-7xl space-y-4 px-4 py-6">
        <BackLink id={id} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Levantamiento no encontrado.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-5 px-4 py-6">
      <BackLink id={id} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Diferencias — {lev.folio ?? '—'}
            </h1>
            <LevantamientoStatusBadge estado={lev.estado} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {lev.almacen_nombre ?? 'Sin almacén'}
            {lev.fecha_cierre ? ` · Cerrado ${formatDateTime(lev.fecha_cierre)}` : ''}
            {lev.contador_nombre ? ` · Contador: ${lev.contador_nombre}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/rdb/inventario/levantamientos/${lev.id}/reporte`}>
            <Button variant="outline" size="sm">
              <Printer className="size-4" />
              Imprimir
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="size-4" />
            Exportar CSV
          </Button>
        </div>
      </header>

      {/* ─── Filtros ──────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-4 rounded-lg border bg-card px-4 py-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={soloConDiff}
            onChange={(e) => setSoloConDiff(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Solo con diferencia
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={soloFuera}
            onChange={(e) => setSoloFuera(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Solo fuera de tolerancia
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground">Categoría:</span>
          <Combobox
            value={categoriaFiltro ?? ''}
            onChange={(v) => setCategoriaFiltro(v || null)}
            options={[
              { value: '', label: 'Todas' },
              ...categorias.map((c) => ({ value: c, label: c })),
            ]}
            className="min-w-[12rem]"
            placeholder="Todas"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} de {lineas.length} líneas
        </span>
      </section>

      {/* ─── Tabla ───────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Stock inicial</TableHead>
              <TableHead className="text-right">Salidas</TableHead>
              <TableHead className="text-right">Efectivo</TableHead>
              <TableHead className="text-right">Δ vs Sistema</TableHead>
              <TableHead className="text-right">Δ $</TableHead>
              <TableHead>Tolerancia</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Contado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                  Sin líneas que coincidan con los filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l) => (
                <DiferenciaRow
                  key={l.linea_id}
                  linea={l}
                  editable={editable}
                  onUpdated={handleNotaUpdated}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function BackLink({ id }: { id: string }) {
  return (
    <Link
      href={`/rdb/inventario/levantamientos/${id}`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Volver al levantamiento
    </Link>
  );
}

function DiferenciaRow({
  linea,
  editable,
  onUpdated,
}: {
  linea: LineaParaRevisar;
  editable: boolean;
  onUpdated: (linea_id: string, nota: string) => void;
}) {
  const sinContar = linea.cantidad_contada == null;
  const conDiff = (linea.diferencia ?? 0) !== 0;

  return (
    <TableRow className={cn(linea.fuera_de_tolerancia && 'bg-destructive/5')}>
      <TableCell>
        <div className="font-medium">{linea.producto_nombre}</div>
        <div className="text-xs text-muted-foreground">
          {linea.producto_codigo} · {linea.unidad}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{linea.categoria ?? '—'}</TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(linea.stock_inicial)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {linea.salidas_durante_captura > 0 ? (
          <span className="text-amber-600 dark:text-amber-400">
            -{formatNumber(linea.salidas_durante_captura)}
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {formatNumber(linea.stock_efectivo)}
      </TableCell>
      <TableCell className="text-right">
        {sinContar ? (
          <span className="text-xs italic text-muted-foreground">Sin contar</span>
        ) : (
          <VarianceCell
            sistema={linea.stock_efectivo}
            contado={Number(linea.cantidad_contada)}
            unidad={linea.unidad}
            fueraDeTolerancia={linea.fuera_de_tolerancia}
            className="grid-cols-1 text-right"
          />
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {linea.diferencia_valor == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              linea.fuera_de_tolerancia && 'font-semibold text-destructive',
              !linea.fuera_de_tolerancia && conDiff && 'text-amber-600 dark:text-amber-400'
            )}
          >
            {formatCurrency(linea.diferencia_valor)}
          </span>
        )}
      </TableCell>
      <TableCell>
        <ToleranceLabel
          fuera={linea.fuera_de_tolerancia}
          conDiferencia={conDiff}
          sinContar={sinContar}
        />
      </TableCell>
      <TableCell className="min-w-[16rem] max-w-sm">
        <NotaCell linea={linea} editable={editable} onUpdated={onUpdated} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {linea.contado_at ? formatDateTime(linea.contado_at) : '—'}
      </TableCell>
    </TableRow>
  );
}

function ToleranceLabel({
  fuera,
  conDiferencia,
  sinContar,
}: {
  fuera: boolean;
  conDiferencia: boolean;
  sinContar: boolean;
}) {
  if (sinContar) {
    return <span className="text-xs italic text-muted-foreground">Sin contar</span>;
  }
  if (fuera) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <AlertTriangle className="size-3" /> Fuera
      </span>
    );
  }
  if (conDiferencia) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        Dentro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="size-3" /> OK
    </span>
  );
}

function NotaCell({
  linea,
  editable,
  onUpdated,
}: {
  linea: LineaParaRevisar;
  editable: boolean;
  onUpdated: (linea_id: string, nota: string) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(linea.notas_diferencia ?? '');
  const [saving, setSaving] = useState(false);

  if (!editing) {
    const empty = !linea.notas_diferencia;
    return (
      <div className="flex items-start gap-2">
        <p
          className={cn(
            'min-h-[1.25rem] flex-1 whitespace-pre-wrap text-sm',
            empty && 'italic text-muted-foreground'
          )}
        >
          {empty ? (editable ? 'Sin nota — agregar' : 'Sin nota') : linea.notas_diferencia}
        </p>
        {editable && (
          <button
            type="button"
            onClick={() => {
              setDraft(linea.notas_diferencia ?? '');
              setEditing(true);
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Editar nota"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
    );
  }

  const guardar = async () => {
    setSaving(true);
    const res = await actualizarNotaDiferencia(linea.linea_id, draft);
    setSaving(false);
    if (!res.ok) {
      toast.add({ title: 'No se pudo guardar', description: res.error, type: 'error' });
      return;
    }
    onUpdated(linea.linea_id, draft);
    setEditing(false);
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        className="text-sm"
        autoFocus
        disabled={saving}
      />
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
          disabled={saving}
          aria-label="Cancelar"
        >
          <X className="size-3.5" />
        </Button>
        <Button size="sm" onClick={guardar} disabled={saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}

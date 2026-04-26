'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Same data-sync pattern used elsewhere in /rdb/inventario (see page.tsx). The
 * load() function flips loading flags around an awaited fetch — refactoring to
 * avoid the rule changes render semantics without measurable benefit.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus, RefreshCw } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LevantamientoStatusBadge,
  type LevantamientoEstado,
} from '@/components/inventario/levantamiento-status-badge';
import { formatDateShort, formatDateTime } from '@/lib/inventario/format';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

type LevantamientoRow = {
  id: string;
  folio: string | null;
  estado: string;
  fecha_programada: string;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  fecha_aplicado: string | null;
  almacen_id: string;
  notas: string | null;
  created_at: string;
  almacenes: { nombre: string } | null;
};

export default function LevantamientosListaPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.inventario">
      <LevantamientosListaInner />
    </RequireAccess>
  );
}

function LevantamientosListaInner() {
  const [items, setItems] = useState<LevantamientoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error: err } = await supabase
      .schema('erp')
      .from('inventario_levantamientos')
      .select(
        'id, folio, estado, fecha_programada, fecha_inicio, fecha_cierre, fecha_aplicado, almacen_id, notas, created_at, almacenes(nombre)'
      )
      .eq('empresa_id', RDB_EMPRESA_ID)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setItems((data ?? []) as unknown as LevantamientoRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activos = items.filter(
    (i) => i.estado === 'borrador' || i.estado === 'capturando' || i.estado === 'capturado'
  );
  const cerrados = items.filter((i) => i.estado === 'aplicado' || i.estado === 'cancelado');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Levantamientos físicos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conteo físico, conciliación y aplicación de movimientos al inventario.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={loading}
            aria-label="Actualizar"
          >
            <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
            Actualizar
          </Button>
          <Link href="/rdb/inventario/levantamientos/nuevo">
            <Button size="sm">
              <Plus className="size-4" />
              Nuevo levantamiento
            </Button>
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Activos
        </h2>
        {loading ? (
          <ListSkeleton />
        ) : activos.length === 0 ? (
          <EmptyState
            title="No hay levantamientos activos"
            description="Inicia uno nuevo para comenzar el conteo."
            cta={
              <Link href="/rdb/inventario/levantamientos/nuevo">
                <Button>
                  <Plus className="size-4" />
                  Nuevo levantamiento
                </Button>
              </Link>
            }
          />
        ) : (
          <LevantamientosTable rows={activos} />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Histórico reciente
        </h2>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : cerrados.length === 0 ? (
          <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            Sin levantamientos cerrados todavía.
          </p>
        ) : (
          <LevantamientosTable rows={cerrados} />
        )}
      </section>
    </div>
  );
}

function LevantamientosTable({ rows }: { rows: LevantamientoRow[] }) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Folio</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Almacén</TableHead>
            <TableHead>Programado</TableHead>
            <TableHead>Última actividad</TableHead>
            <TableHead className="text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const ultima =
              row.fecha_aplicado ?? row.fecha_cierre ?? row.fecha_inicio ?? row.created_at;
            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium tabular-nums">{row.folio ?? '—'}</TableCell>
                <TableCell>
                  <LevantamientoStatusBadge estado={row.estado as LevantamientoEstado} />
                </TableCell>
                <TableCell>{row.almacenes?.nombre ?? '—'}</TableCell>
                <TableCell className="tabular-nums">
                  {formatDateShort(row.fecha_programada)}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatDateTime(ultima)}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/rdb/inventario/levantamientos/${row.id}`}>
                    <Button variant="outline" size="sm">
                      Abrir
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 p-10 text-center">
      <ClipboardList className="size-10 text-muted-foreground/60" />
      <div>
        <div className="font-medium">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
      {cta}
    </div>
  );
}

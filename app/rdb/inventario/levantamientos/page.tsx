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
import { DataTable, ErrorBanner, type Column } from '@/components/module-page';
import {
  LevantamientoStatusBadge,
  type LevantamientoEstado,
} from '@/components/inventario/levantamiento-status-badge';
import { formatDate, formatDateTime } from '@/lib/format';

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

const columns: Column<LevantamientoRow>[] = [
  {
    key: 'folio',
    label: 'Folio',
    cellClassName: 'font-medium tabular-nums',
    render: (r) => r.folio ?? '—',
  },
  {
    key: 'estado',
    label: 'Estado',
    render: (r) => <LevantamientoStatusBadge estado={r.estado as LevantamientoEstado} />,
  },
  {
    key: 'almacen',
    label: 'Almacén',
    accessor: (r) => r.almacenes?.nombre ?? '',
    render: (r) => r.almacenes?.nombre ?? '—',
  },
  {
    key: 'fecha_programada',
    label: 'Programado',
    cellClassName: 'tabular-nums',
    render: (r) => formatDate(r.fecha_programada),
  },
  {
    key: 'ultima_actividad',
    label: 'Última actividad',
    cellClassName: 'tabular-nums text-muted-foreground',
    accessor: (r) => r.fecha_aplicado ?? r.fecha_cierre ?? r.fecha_inicio ?? r.created_at,
    render: (r) => {
      const ultima = r.fecha_aplicado ?? r.fecha_cierre ?? r.fecha_inicio ?? r.created_at;
      return formatDateTime(ultima);
    },
  },
  {
    key: 'accion',
    label: 'Acción',
    sortable: false,
    align: 'right',
    render: (r) => (
      <DataTable.InteractiveCell>
        <Link href={`/rdb/inventario/levantamientos/${r.id}`}>
          <Button variant="outline" size="sm">
            Abrir
          </Button>
        </Link>
      </DataTable.InteractiveCell>
    ),
  },
];

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

      {error && <ErrorBanner error={error} onRetry={() => void load()} />}

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Activos
        </h2>
        <DataTable<LevantamientoRow>
          data={activos}
          columns={columns}
          rowKey="id"
          loading={loading}
          initialSort={{ key: 'fecha_programada', dir: 'desc' }}
          emptyIcon={<ClipboardList className="size-8" />}
          emptyTitle="No hay levantamientos activos"
          emptyDescription="Inicia uno nuevo para comenzar el conteo."
          emptyAction={
            <Link href="/rdb/inventario/levantamientos/nuevo">
              <Button>
                <Plus className="size-4" />
                Nuevo levantamiento
              </Button>
            </Link>
          }
          showDensityToggle={false}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Histórico reciente
        </h2>
        <DataTable<LevantamientoRow>
          data={cerrados}
          columns={columns}
          rowKey="id"
          loading={loading}
          initialSort={{ key: 'ultima_actividad', dir: 'desc' }}
          emptyTitle="Sin levantamientos cerrados todavía"
          showDensityToggle={false}
        />
      </section>
    </div>
  );
}

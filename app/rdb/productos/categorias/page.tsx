'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Tags } from 'lucide-react';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

type CategoriaRow = {
  id: string;
  nombre: string;
  color: string | null;
  productos: number;
};

// Badge de categoría con el color hex del catálogo.
function CategoriaBadge({ nombre, color }: { nombre: string; color: string | null }) {
  if (!color)
    return (
      <Badge variant="outline" className="text-xs">
        {nombre}
      </Badge>
    );
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: `${color}40`, backgroundColor: `${color}10`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {nombre}
    </span>
  );
}

const columns: Column<CategoriaRow>[] = [
  {
    key: 'nombre',
    label: 'Categoría',
    render: (c) => <CategoriaBadge nombre={c.nombre} color={c.color} />,
  },
  {
    key: 'productos',
    label: 'Productos',
    type: 'number',
    cellClassName: 'tabular-nums',
    render: (c) => c.productos.toLocaleString('es-MX'),
  },
];

/**
 * @module Productos — Categorías (RDB)
 * @responsive desktop-only
 */
export default function ProductosCategoriasPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CategoriaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Categorías activas (orden canónico) + conteo de productos activos.
      const [catRes, prodRes] = await Promise.all([
        supabase
          .schema('erp')
          .from('categorias_producto')
          .select('id, nombre, color, orden')
          .eq('empresa_id', RDB_EMPRESA_ID)
          .eq('activo', true)
          .order('orden'),
        supabase
          .schema('erp')
          .from('productos')
          .select('categoria_id')
          .eq('empresa_id', RDB_EMPRESA_ID)
          .eq('activo', true)
          .is('deleted_at', null),
      ]);
      if (catRes.error) throw catRes.error;
      if (prodRes.error) throw prodRes.error;

      const counts = new Map<string, number>();
      for (const p of prodRes.data ?? []) {
        const cid = p.categoria_id as string | null;
        if (cid) counts.set(cid, (counts.get(cid) ?? 0) + 1);
      }

      setRows(
        (catRes.data ?? []).map((c) => ({
          id: c.id as string,
          nombre: c.nombre as string,
          color: (c.color as string | null) ?? null,
          productos: counts.get(c.id as string) ?? 0,
        }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <RequireAccess empresa="rdb" modulo="rdb.productos.categorias">
      <DesktopOnlyNotice module="Categorías" />
      <div className="hidden space-y-6 sm:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
            <p className="text-sm text-muted-foreground">
              Catálogo de categorías de productos. Haz click en una para ver los productos que la
              componen.
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchData()}
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <DataTable<CategoriaRow>
          data={rows}
          columns={columns}
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void fetchData()}
          onRowClick={(c) => router.push(`/rdb/productos?categoria=${c.id}`)}
          emptyIcon={<Tags className="h-8 w-8 opacity-50" />}
          emptyTitle="Sin categorías"
          showDensityToggle={false}
        />
      </div>
    </RequireAccess>
  );
}

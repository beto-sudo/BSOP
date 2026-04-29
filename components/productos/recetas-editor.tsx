'use client';

import * as React from 'react';
import { Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { upsertReceta } from '@/app/rdb/productos/actions';
import type { InsumoDisponible } from '@/lib/productos/recetas';

export type RecetaEditorRow = {
  insumo_id: string;
  insumo_nombre: string;
  cantidad: number;
  unidad: string;
};

export type RecetasEditorProps = {
  productoVentaId: string;
  productoVentaNombre: string;
  insumosDisponibles: InsumoDisponible[];
  initialRows: RecetaEditorRow[];
  onSaved: () => void;
  onCancel: () => void;
};

function rowsAreEqual(a: RecetaEditorRow[], b: RecetaEditorRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].insumo_id !== b[i].insumo_id ||
      a[i].cantidad !== b[i].cantidad ||
      a[i].unidad !== b[i].unidad
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Editor inline de una receta. Permite cambiar cantidades, unidades, agregar
 * o quitar insumos sin pasar por el drawer de Catálogo. Persiste vía
 * `upsertReceta` (server action que reemplaza atómicamente la receta).
 *
 * Diseñado para vivir dentro del `<DetailDrawer>` de Recetas en RDB. El
 * caller controla cuándo está visible (modo lectura ↔ modo edición) y
 * recibe `onSaved` / `onCancel` para reaccionar.
 */
export function RecetasEditor({
  productoVentaId,
  productoVentaNombre,
  insumosDisponibles,
  initialRows,
  onSaved,
  onCancel,
}: RecetasEditorProps) {
  const [rows, setRows] = React.useState<RecetaEditorRow[]>(() =>
    initialRows.map((r) => ({ ...r }))
  );
  const [insumoToAdd, setInsumoToAdd] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDirty = React.useMemo(() => !rowsAreEqual(rows, initialRows), [rows, initialRows]);
  const hasInvalidQty = React.useMemo(() => rows.some((r) => !(r.cantidad > 0)), [rows]);

  const handleAddInsumo = (insumoId: string) => {
    if (!insumoId || insumoId === productoVentaId) return;
    if (rows.some((r) => r.insumo_id === insumoId)) return;
    const ins = insumosDisponibles.find((i) => i.id === insumoId);
    if (!ins) return;
    setRows((prev) => [
      ...prev,
      {
        insumo_id: ins.id,
        insumo_nombre: ins.nombre,
        cantidad: 1,
        unidad: ins.unidad ?? '',
      },
    ]);
    setInsumoToAdd('');
  };

  const handleSave = async () => {
    if (hasInvalidQty) {
      setError('Todas las cantidades deben ser mayores a 0.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const result = await upsertReceta({
        producto_venta_id: productoVentaId,
        insumos: rows.map((r) => ({
          insumo_id: r.insumo_id,
          cantidad: r.cantidad,
          unidad: r.unidad,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        setSaving(false);
        return;
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar receta.');
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (isDirty && !window.confirm('Hay cambios sin guardar. ¿Descartar?')) return;
    onCancel();
  };

  const optionsCombobox = React.useMemo(
    () =>
      insumosDisponibles
        .filter((i) => i.id !== productoVentaId && !rows.some((r) => r.insumo_id === i.id))
        .map((i) => ({ value: i.id, label: i.nombre })),
    [insumosDisponibles, rows, productoVentaId]
  );

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        Editar receta · {productoVentaNombre}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed border-[var(--border)] p-4 text-center text-sm">
            Sin insumos. Agregá uno desde el combobox de abajo.
          </div>
        ) : (
          rows.map((row, idx) => (
            <div key={row.insumo_id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate text-sm">{row.insumo_nombre}</div>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={row.cantidad}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setRows((rs) =>
                    rs.map((r, i) =>
                      i === idx ? { ...r, cantidad: Number.isFinite(v) ? v : 0 } : r
                    )
                  );
                }}
                className="w-24 text-right tabular-nums"
                aria-label={`Cantidad de ${row.insumo_nombre}`}
                disabled={saving}
              />
              <Input
                value={row.unidad}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) => (i === idx ? { ...r, unidad: e.target.value } : r))
                  )
                }
                className="w-20"
                aria-label={`Unidad de ${row.insumo_nombre}`}
                disabled={saving}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}
                aria-label={`Quitar ${row.insumo_nombre}`}
                disabled={saving}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2 border-t pt-2">
        <Combobox
          value={insumoToAdd}
          onChange={handleAddInsumo}
          options={optionsCombobox}
          placeholder="+ Agregar insumo…"
          searchPlaceholder="Buscar insumo…"
          className="flex-1"
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          disabled={saving || !isDirty || hasInvalidQty}
        >
          <Save className="mr-1 h-3.5 w-3.5" /> {saving ? 'Guardando…' : 'Guardar receta'}
        </Button>
      </div>
    </div>
  );
}

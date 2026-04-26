'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RDB_EMPRESA_ID, TIPO_OPTIONS, type StockItem, type TipoUI } from './types';
import { mapTipoToDb } from './utils';

export interface RegistrarMovimientoDialogProps {
  open: boolean;
  onClose: () => void;
  productos: StockItem[];
  onSuccess: () => void;
}

export function RegistrarMovimientoDialog({
  open,
  onClose,
  productos,
  onSuccess,
}: RegistrarMovimientoDialogProps) {
  const [productoId, setProductoId] = useState('');
  const [productoPopoverOpen, setProductoPopoverOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoUI>('ajuste_positivo');
  const [cantidad, setCantidad] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProductoId('');
      setTipo('ajuste_positivo');
      setCantidad('');
      setNotas('');
      setFormError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoId) {
      setFormError('Selecciona un producto.');
      return;
    }
    const cantNum = parseFloat(cantidad);
    if (!cantidad || isNaN(cantNum) || cantNum <= 0) {
      setFormError('Ingresa una cantidad positiva mayor a cero.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const { tipoDB, cantidadSigned } = mapTipoToDb(tipo, cantNum);
      const supabase = createSupabaseBrowserClient();
      const { data: almacen } = await supabase
        .schema('erp')
        .from('almacenes')
        .select('id')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .limit(1)
        .single();
      if (!almacen) throw new Error('No se encontró almacén');
      const { error } = await supabase
        .schema('erp')
        .from('movimientos_inventario')
        .insert({
          empresa_id: RDB_EMPRESA_ID,
          almacen_id: almacen.id,
          producto_id: productoId,
          tipo_movimiento: tipoDB,
          cantidad: cantidadSigned,
          referencia_tipo: 'ajuste_manual',
          notas: notas.trim() || null,
        });
      if (error) throw error;
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error al registrar movimiento');
    } finally {
      setSaving(false);
    }
  };

  const tipoSeleccionado = TIPO_OPTIONS.find((t) => t.value === tipo);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Movimiento</DialogTitle>
          <DialogDescription>Ajusta el inventario manualmente.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Producto */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Producto</label>
            <Popover open={productoPopoverOpen} onOpenChange={setProductoPopoverOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productoPopoverOpen}
                    className="w-full justify-between font-normal"
                  />
                }
              >
                <span className="truncate">
                  {productoId ? (
                    (productos.find((p) => p.id === productoId)?.nombre ?? 'Seleccionar…')
                  ) : (
                    <span className="text-muted-foreground">Seleccionar producto…</span>
                  )}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar producto…" />
                  <CommandList className="max-h-60">
                    <CommandEmpty>No se encontraron productos.</CommandEmpty>
                    <CommandGroup>
                      {productos
                        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
                        .map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.nombre}
                            onSelect={() => {
                              setProductoId(p.id);
                              setProductoPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 shrink-0 ${productoId === p.id ? 'opacity-100' : 'opacity-0'}`}
                            />
                            <span className="truncate">{p.nombre}</span>
                            {p.bajo_minimo && (
                              <span className="ml-auto text-xs text-amber-500 shrink-0">
                                ⚠ bajo mínimo
                              </span>
                            )}
                            {p.categoria && !p.bajo_minimo && (
                              <span className="ml-auto text-xs text-muted-foreground shrink-0">
                                {p.categoria}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tipo de movimiento</label>
            <Combobox
              value={tipo}
              onChange={(v) => setTipo(v as TipoUI)}
              options={TIPO_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              className="w-full"
            />
            {tipoSeleccionado && (
              <p className="text-xs text-muted-foreground">{tipoSeleccionado.desc}</p>
            )}
          </div>

          {/* Cantidad */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cantidad</label>
            <Input
              type="number"
              min="0.01"
              step="any"
              placeholder="Ej. 3"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Notas / Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              className="w-full min-h-[80px] resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ej. Se rompió vaso en evento"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          {formError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

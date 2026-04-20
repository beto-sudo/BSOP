import { Loader2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import type { Caja } from './types';

export type AbrirForm = {
  caja_id: string;
  responsable_apertura: string;
  efectivo_inicial: string;
  fecha_operativa: string;
  auto_matched: boolean;
};

export function AbrirCajaDialog({
  open,
  onOpenChange,
  cajas,
  form,
  onFormChange,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cajas: Caja[];
  form: AbrirForm;
  onFormChange: (updater: (f: AbrirForm) => AbrirForm) => void;
  onSubmit: () => void;
  isPending: boolean;
  error: string | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir Caja</DialogTitle>
          <DialogDescription>
            Registra la apertura de un nuevo turno de caja. Se verificará que no haya un turno
            abierto para la caja seleccionada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm border bg-muted/30 p-3 rounded-lg">
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Responsable
              </div>
              <div className="font-medium text-foreground">{form.responsable_apertura || '—'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Fecha Operativa
              </div>
              <div className="font-medium text-foreground">{form.fecha_operativa}</div>
            </div>
            <div className="space-y-1 col-span-2">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Caja Asignada
              </div>
              {form.auto_matched ? (
                <div className="font-medium text-foreground">
                  {cajas.find((c) => c.id === form.caja_id)?.nombre || '—'}
                </div>
              ) : (
                <Combobox
                  value={form.caja_id}
                  onChange={(v) => onFormChange((f) => ({ ...f, caja_id: v }))}
                  options={cajas.map((caja) => ({ value: caja.id, label: caja.nombre }))}
                  placeholder="Selecciona tu caja…"
                  allowClear
                  className="mt-1 border-muted-foreground/30 bg-background"
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Efectivo inicial
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.efectivo_inicial}
                onChange={(e) => onFormChange((f) => ({ ...f, efectivo_inicial: e.target.value }))}
                placeholder="0.00"
                className="pl-7 text-lg font-medium"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Abriendo…
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Abrir turno
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import { generarCargosDelMes } from '@/app/dilesa/arrendamiento/actions';

/**
 * Generar cargos de renta del periodo (Sprint 2c). Confirma el periodo y llama
 * la RPC idempotente `erp.arrendamiento_generar_cargos` vía la server action.
 */

function mesActualYYYYMM(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ArrendamientoGenerarCargosDialog({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGenerated: () => void;
}) {
  const [periodo, setPeriodo] = useState(mesActualYYYYMM());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  function handleOpenChange(v: boolean) {
    if (v) {
      setPeriodo(mesActualYYYYMM());
      setError(null);
      setExito(null);
    }
    onOpenChange(v);
  }

  async function generar() {
    setSaving(true);
    setError(null);
    setExito(null);
    const res = await generarCargosDelMes(periodo);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setExito(
      res.creados === 0
        ? 'No había cargos nuevos por generar para este periodo.'
        : `Se generaron ${res.creados} ${res.creados === 1 ? 'cargo' : 'cargos'} de renta.`
    );
    onGenerated();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Generar cargos del mes</DialogTitle>
          <DialogDescription>
            Crea la renta del periodo para los contratos vigentes. Es seguro repetir: no duplica
            cargos ya generados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="gen-periodo" required>
              Periodo (YYYYMM)
            </FieldLabel>
            <Input
              id="gen-periodo"
              inputMode="numeric"
              maxLength={6}
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="202606"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
              {error}
            </div>
          )}
          {exito && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
              {exito}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {exito ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button onClick={() => void generar()} disabled={saving || periodo.length !== 6}>
            {saving ? 'Generando…' : 'Generar cargos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

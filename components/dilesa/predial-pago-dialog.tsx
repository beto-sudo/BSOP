'use client';

/**
 * PredialPagoDialog — registrar el pago de un ejercicio predial (iniciativa
 * `dilesa-portafolio-predios` · S3). v1 control: fecha + monto + notas +
 * comprobante (erp.adjuntos, entidad prediales_ejercicios). NO toca CxP.
 */

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
import { FileAttachments } from '@/components/file-attachments';
import { registrarPagoPredial } from '@/app/dilesa/portafolio/actions';
import { formatCurrency } from '@/lib/format';
import { adeudoNetoEjercicio, type PredialEjercicio } from '@/lib/dilesa/prediales';
import { hoyISOMatamoros } from '@/lib/fecha-mx';
import { Receipt } from 'lucide-react';

type RowConCuenta = PredialEjercicio & {
  cuenta: { clave_catastral: string; activo: { nombre: string } | null };
};

export function PredialPagoDialog({
  row,
  empresaId,
  open,
  onOpenChange,
  onSaved,
}: {
  row: RowConCuenta | null;
  empresaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState('');
  const [monto, setMonto] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(v: boolean) {
    if (v && row) {
      setFecha(hoyISOMatamoros());
      const neto = adeudoNetoEjercicio(row);
      setMonto(neto > 0 ? neto.toFixed(2) : '');
      setNotas('');
      setError(null);
    }
    onOpenChange(v);
  }

  async function handleSubmit() {
    if (!row) return;
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      setError('El monto pagado debe ser un número ≥ 0.');
      return;
    }
    setSaving(true);
    setError(null);
    const r = await registrarPagoPredial({
      ejercicioId: row.id,
      fechaPago: fecha,
      montoPagado: montoNum,
      notas: notas || undefined,
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onSaved();
  }

  const neto = row ? adeudoNetoEjercicio(row) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Registrar pago de predial
          </DialogTitle>
          <DialogDescription>
            {row
              ? `${row.cuenta.activo?.nombre ?? 'Predio'} · clave ${row.cuenta.clave_catastral} · ejercicio ${row.ejercicio}`
              : ''}
            {neto > 0 ? ` — adeudo neto ${formatCurrency(neto)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Fecha de pago</FieldLabel>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Monto pagado</FieldLabel>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <FieldLabel>Notas (opcional)</FieldLabel>
            <Input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Referencia del recibo, descuento aplicado…"
            />
          </div>
          {row ? (
            <div>
              <FieldLabel>Comprobante</FieldLabel>
              <FileAttachments
                empresaId={empresaId}
                empresaSlug="dilesa"
                entidad="prediales_ejercicios"
                entidadId={row.id}
                roles={[{ id: 'comprobante', label: 'Comprobante' }]}
                defaultUploadRole="comprobante"
              />
            </div>
          ) : null}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !fecha}>
            {saving ? 'Guardando…' : 'Marcar pagado'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

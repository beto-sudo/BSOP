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
import { registrarPagoRenta } from '@/app/dilesa/arrendamiento/actions';

/**
 * Registrar pago de renta (Sprint 2c). Captura un abono y lo envía a la RPC
 * `erp.arrendamiento_pago_registrar` vía la server action. Con periodo aplica
 * dirigido a ese cargo; sin él, al saldo más antiguo del contrato.
 */

const selectCls =
  'w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

function hoyISO(): string {
  // Fecha local (sin TZ) en formato YYYY-MM-DD para el <input type="date">.
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function ArrendamientoPagoDialog({
  open,
  onOpenChange,
  arrendamientoId,
  personaId,
  arrendatarioNombre,
  contratoFolio,
  periodoSugerido,
  onRegistrado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  arrendamientoId: string;
  personaId: string;
  arrendatarioNombre: string;
  contratoFolio: string | null;
  /** Periodo (YYYYMM) a pre-cargar — típicamente el del cargo seleccionado. */
  periodoSugerido?: string;
  onRegistrado: () => void;
}) {
  const [monto, setMonto] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [formaPago, setFormaPago] = useState('transferencia');
  const [referencia, setReferencia] = useState('');
  const [uuidSat, setUuidSat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset al abrir: dialog montado siempre; reseteamos en el onClick del trigger.
  // Aquí solo sincronizamos el periodo sugerido cuando cambia el que abre.
  function resetForm() {
    setMonto('');
    setPeriodo(periodoSugerido ?? '');
    setFecha(hoyISO());
    setFormaPago('transferencia');
    setReferencia('');
    setUuidSat('');
    setError(null);
  }

  function handleOpenChange(v: boolean) {
    if (v) resetForm();
    onOpenChange(v);
  }

  async function guardar() {
    setSaving(true);
    setError(null);
    const res = await registrarPagoRenta({
      persona_id: personaId,
      arrendamiento_id: arrendamientoId,
      monto: Number(monto || 0),
      periodo: periodo || null,
      fecha: fecha || null,
      forma_pago: formaPago,
      referencia: referencia || null,
      uuid_sat: uuidSat || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onOpenChange(false);
    onRegistrado();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago de renta</DialogTitle>
          <DialogDescription>
            {arrendatarioNombre}
            {contratoFolio ? ` · ${contratoFolio}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="pago-monto" required>
                Monto
              </FieldLabel>
              <Input
                id="pago-monto"
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <FieldLabel htmlFor="pago-periodo">Periodo (YYYYMM)</FieldLabel>
              <Input
                id="pago-periodo"
                inputMode="numeric"
                maxLength={6}
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Auto (saldo más antiguo)"
              />
            </div>
            <div>
              <FieldLabel htmlFor="pago-fecha">Fecha</FieldLabel>
              <Input
                id="pago-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="pago-forma">Forma de pago</FieldLabel>
              <select
                id="pago-forma"
                className={selectCls}
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
              >
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="col-span-2">
              <FieldLabel htmlFor="pago-ref">Referencia</FieldLabel>
              <Input
                id="pago-ref"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Folio, número de operación…"
              />
            </div>
            <div className="col-span-2">
              <FieldLabel htmlFor="pago-uuid">UUID SAT (CFDI)</FieldLabel>
              <Input
                id="pago-uuid"
                value={uuidSat}
                onChange={(e) => setUuidSat(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={saving || !(Number(monto) > 0)}>
            {saving ? 'Registrando…' : 'Registrar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

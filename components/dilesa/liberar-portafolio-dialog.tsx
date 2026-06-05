'use client';

/**
 * LiberarPortafolioDialog — modal compartido para traspasar una unidad al
 * portafolio de activos (captura tipo de activo + destino + valor estimado y
 * llama la server action `liberarUnidadAlPortafolio`).
 *
 * Iniciativa dilesa-portafolio-activos. Lo usan `<ProyectoDetalle>` (tabla de
 * unidades) y `<UnidadDetailDrawer>` (inventario de ventas). El gate de
 * "solo admin" lo aplican los callers (botón) Y la server action (enforcement).
 *
 * Se monta condicionalmente por unidad (`{unidad ? <…/> : null}`), así los
 * defaults se computan con `useState` initializers — sin efecto que sincronice
 * estado con props.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ACTIVO_TIPOS,
  ACTIVO_TIPO_LABEL,
  ACTIVO_MODALIDADES,
  ACTIVO_MODALIDAD_LABEL,
  inferActivoTipo,
  type ActivoTipo,
  type ActivoModalidad,
} from '@/lib/dilesa/portafolio';
import { liberarUnidadAlPortafolio } from '@/app/dilesa/proyectos/actions';

export type UnidadLiberable = {
  id: string;
  identificador: string;
  tipo_lote: string | null;
  precio: number | null;
};

export function LiberarPortafolioDialog({
  unidad,
  onOpenChange,
  onLiberated,
}: {
  /** Unidad a liberar. El caller monta el dialog solo cuando hay una. */
  unidad: UnidadLiberable;
  onOpenChange: (open: boolean) => void;
  /** Se llama tras liberar con éxito (para que el caller refresque/cierre). */
  onLiberated: (unidadId: string) => void;
}) {
  const [tipo, setTipo] = useState<ActivoTipo>(() => inferActivoTipo(unidad.tipo_lote));
  const [modalidad, setModalidad] = useState<ActivoModalidad>('venta');
  const [valor, setValor] = useState(() => (unidad.precio != null ? String(unidad.precio) : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmar = () => {
    setBusy(true);
    setError(null);
    const trimmed = valor.trim();
    const valorNum = trimmed === '' ? null : Number(trimmed);
    void liberarUnidadAlPortafolio(unidad.id, {
      tipo,
      modalidad,
      valorEstimado: valorNum,
    }).then((r) => {
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onLiberated(unidad.id);
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!busy && !o) onOpenChange(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Traspasar al portafolio</DialogTitle>
          <DialogDescription>
            {unidad.identificador} saldrá del inventario de ventas del fraccionamiento y se
            registrará como activo del portafolio de DILESA.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--text)]/70">Tipo de activo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as ActivoTipo)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
            >
              {ACTIVO_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ACTIVO_TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--text)]/70">Destino</span>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as ActivoModalidad)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
            >
              {ACTIVO_MODALIDADES.map((m) => (
                <option key={m} value={m}>
                  {ACTIVO_MODALIDAD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--text)]/70">Valor estimado (MXN)</span>
            <Input
              type="number"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.currentTarget.value)}
              placeholder="0.00"
            />
          </label>
        </div>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={busy}>
            {busy ? 'Traspasando…' : 'Traspasar al portafolio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

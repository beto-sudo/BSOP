'use client';

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

/**
 * Diálogo compartido para cancelar una entidad del P2P con motivo (audit trail).
 *
 * Iniciativa `p2p-cancelaciones` (D1: cancelar con motivo, el registro queda
 * visible con estado "Cancelado"). El motivo es obligatorio por default. El
 * padre lo monta on-demand con `key` y maneja la llamada al RPC en `onConfirm`
 * (que debe lanzar para mantener el diálogo abierto si falla — el error se
 * muestra vía toast desde el caller).
 */
export function CancelarConMotivoDialog({
  title,
  description,
  confirmLabel = 'Cancelar',
  /** Texto del botón mientras se ejecuta `onConfirm`. */
  submittingLabel = 'Cancelando…',
  /** Variante del botón de confirmar — `destructive` por default (cancelaciones). */
  confirmVariant = 'destructive',
  motivoRequerido = true,
  placeholder = 'Ej. error de captura, duplicado…',
  onClose,
  onConfirm,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  submittingLabel?: string;
  confirmVariant?: 'default' | 'destructive';
  motivoRequerido?: boolean;
  placeholder?: string;
  onClose: () => void;
  onConfirm: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canConfirm = !motivoRequerido || motivo.trim().length > 0;

  const handleConfirm = async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(motivo.trim());
      onClose();
    } catch {
      // El error ya se mostró vía toast desde el caller; deja el diálogo abierto.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="motivo-cancelacion">
            Motivo{motivoRequerido ? ' *' : ' (opcional)'}
          </label>
          <Input
            id="motivo-cancelacion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Volver
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => void handleConfirm()}
            disabled={!canConfirm || submitting}
          >
            {submitting ? submittingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

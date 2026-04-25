'use client';

import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from './helpers';
import type { Banco, Movimiento, Voucher } from './types';
import { VoucherCaptureForm } from './voucher-capture-form';

type Props = {
  voucher: Voucher | null;
  bancos: Banco[];
  movimientos: Movimiento[];
  onClose: () => void;
  onSaved: () => void;
};

function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function VoucherLightbox({ voucher, bancos, movimientos, onClose, onSaved }: Props) {
  const open = !!voucher;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{voucher?.nombre_original ?? 'Voucher'}</DialogTitle>
          <DialogDescription>
            Subido {formatDateTime(voucher?.uploaded_at)}
            {voucher?.uploaded_by_nombre ? ` · ${voucher.uploaded_by_nombre}` : ''}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-4">
            {voucher?.signed_url ? (
              <div className="relative max-h-[45vh] overflow-auto rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={voucher.signed_url}
                  alt={voucher.nombre_original ?? 'voucher'}
                  className="mx-auto max-h-[45vh] w-auto object-contain"
                />
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                Preview no disponible
              </div>
            )}

            {voucher && (
              <VoucherCaptureForm
                voucher={voucher}
                bancos={bancos}
                movimientos={movimientos}
                onSaved={onSaved}
              />
            )}

            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span>Tamaño: {formatBytes(voucher?.tamano_bytes ?? null)}</span>
              {voucher?.signed_url ? (
                <a
                  href={voucher.signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={voucher.nombre_original ?? undefined}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Descargar
                </a>
              ) : null}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

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
import { formatDateTime } from './helpers';
import type { Voucher } from './types';

type Props = {
  voucher: Voucher | null;
  onClose: () => void;
};

function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function VoucherLightbox({ voucher, onClose }: Props) {
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
          <DialogTitle>{voucher?.nombre_original ?? 'Voucher de terminal'}</DialogTitle>
          <DialogDescription>
            Cierre de lote · {formatDateTime(voucher?.uploaded_at)}
          </DialogDescription>
        </DialogHeader>

        {voucher?.signed_url ? (
          <div className="relative max-h-[65vh] overflow-auto rounded-md border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={voucher.signed_url}
              alt={voucher.nombre_original ?? 'voucher'}
              className="mx-auto max-h-[65vh] w-auto object-contain"
            />
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
            Preview no disponible
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="block text-xs text-muted-foreground">Subido por</span>
            <span className="font-medium">{voucher?.uploaded_by_nombre ?? '—'}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Afiliación</span>
            <span className="font-medium tabular-nums">{voucher?.afiliacion ?? '—'}</span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Monto reportado</span>
            <span className="font-medium tabular-nums">
              {voucher?.monto_reportado != null
                ? new Intl.NumberFormat('es-MX', {
                    style: 'currency',
                    currency: 'MXN',
                  }).format(voucher.monto_reportado)
                : '—'}
            </span>
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Tamaño</span>
            <span className="font-medium tabular-nums">
              {formatBytes(voucher?.tamano_bytes ?? null)}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
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
      </DialogContent>
    </Dialog>
  );
}

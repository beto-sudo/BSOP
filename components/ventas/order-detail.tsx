'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import type { Pedido } from './types';
import { formatCurrency, formatDate, statusVariant } from './utils';

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex justify-between gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function OrderDetail({
  pedido,
  loadingDetail,
  open,
  onClose,
}: {
  pedido: Pedido | null;
  loadingDetail: boolean;
  open: boolean;
  onClose: () => void;
}) {
  if (!pedido) return null;

  const items = pedido.items ?? [];
  const pagos = pedido.pagos ?? [];

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="sm:max-w-[600px]">
        {/* Membrete solo para impresión */}
        <img
          src="/brand/rdb/header-email.png"
          alt="Membrete Rincón del Bosque"
          className="hidden print:block w-full object-contain mb-6"
        />
        <SheetHeader>
          <SheetTitle>Pedido #{pedido.order_id ?? pedido.id}</SheetTitle>
          <SheetDescription>{formatDate(pedido.timestamp)}</SheetDescription>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
          <div className="absolute right-12 top-4 hidden sm:flex print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto">
          <div className="mt-6 space-y-6 pb-6">
            {/* Status + total */}
            <div className="flex items-center justify-between">
              <Badge variant={statusVariant(pedido.status)}>{pedido.status ?? 'Sin estado'}</Badge>
              <span className="text-lg font-semibold">{formatCurrency(pedido.total_amount)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm mt-4">
              {pedido.place_name && (
                <div>
                  <span className="text-muted-foreground block text-xs">Ubicación</span>
                  <span className="font-medium">{pedido.place_name}</span>
                </div>
              )}
              {pedido.layout_name && (
                <div>
                  <span className="text-muted-foreground block text-xs">Área</span>
                  <span className="font-medium">{pedido.layout_name}</span>
                </div>
              )}
              {pedido.table_name && (
                <div>
                  <span className="text-muted-foreground block text-xs">Mesa</span>
                  <span className="font-medium">{pedido.table_name}</span>
                </div>
              )}
              {pedido.external_delivery_id && (
                <div>
                  <span className="text-muted-foreground block text-xs">Delivery ID</span>
                  <span className="font-medium">{pedido.external_delivery_id}</span>
                </div>
              )}
            </div>
            {(() => {
              const realDiscount =
                (pedido.total_amount ?? 0) - (pedido.total_discount ?? pedido.total_amount ?? 0);
              const hasDiscount = realDiscount > 0.01;
              const hasService = (pedido.service_charge ?? 0) > 0;
              const hasTax = (pedido.tax ?? 0) > 0;

              if (!hasDiscount && !hasService && !hasTax) return null;

              return (
                <div className="bg-muted/30 rounded-lg p-3 mt-4 space-y-1 text-sm">
                  {hasDiscount && (
                    <div className="flex justify-between text-destructive">
                      <span>Descuento</span>
                      <span>-{formatCurrency(realDiscount)}</span>
                    </div>
                  )}
                  {hasService && (
                    <div className="flex justify-between">
                      <span>Servicio</span>
                      <span>{formatCurrency(pedido.service_charge)}</span>
                    </div>
                  )}
                  {hasTax && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Impuestos</span>
                      <span>{pedido.tax}%</span>
                    </div>
                  )}
                </div>
              );
            })()}
            {pedido.notes && (
              <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 p-3 rounded-lg text-sm">
                <span className="font-semibold block mb-1">Notas del Pedido</span>
                {pedido.notes}
              </div>
            )}

            <Separator />

            {/* Items */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Productos
              </div>
              {loadingDetail ? (
                <DetailSkeleton />
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin detalle de productos</p>
              ) : (
                <div className="space-y-2.5">
                  {items.map((item) => {
                    const nombre = item.product_name ?? item.nombre ?? item.name ?? 'Producto';
                    const qty = item.cantidad ?? item.quantity ?? 1;
                    const price = item.unit_price ?? item.precio ?? item.price;
                    const sub =
                      item.total_price ?? item.subtotal ?? (price != null ? price * qty : null);
                    return (
                      <div
                        key={String(item.id)}
                        className="flex items-start justify-between gap-4 text-sm"
                      >
                        <span className="text-foreground">{nombre}</span>
                        <span className="shrink-0 text-right text-muted-foreground">
                          {qty} × {price != null ? formatCurrency(price) : '—'}
                          <br />
                          <span className="font-medium text-foreground">
                            {sub != null ? formatCurrency(sub) : '—'}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            {/* Payments */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pagos
              </div>
              {loadingDetail ? (
                <DetailSkeleton />
              ) : pagos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin registros de pago</p>
              ) : (
                <div className="space-y-1.5">
                  {pagos.map((pago) => {
                    const metodo = pago.metodo ?? pago.payment_method ?? 'Desconocido';
                    const monto = pago.monto ?? pago.amount;
                    return (
                      <div
                        key={String(pago.id)}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="capitalize text-foreground">{metodo}</span>
                        <span className="font-medium">{formatCurrency(monto)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

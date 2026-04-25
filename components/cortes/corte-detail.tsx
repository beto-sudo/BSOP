import { Plus, Printer, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { conciliarEfectivo, conciliarTarjeta } from './conciliacion';
import { CorteConciliacion } from './corte-conciliacion';
import { estadoVariant, formatCurrency, formatDate, formatDateTime } from './helpers';
import { RegistrarMovimientoDialog } from './registrar-movimiento-dialog';
import type { Banco, Corte, CorteTotales, Movimiento, Voucher } from './types';
import { VoucherLightbox } from './voucher-lightbox';

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex justify-between gap-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CorteDetail({
  corte,
  totales,
  movimientos,
  vouchers,
  bancos,
  loadingDetail,
  open,
  onClose,
  onCerrar,
  onMovimientoRegistered,
}: {
  corte: Corte | null;
  totales: CorteTotales | null;
  movimientos: Movimiento[];
  vouchers: Voucher[];
  bancos: Banco[];
  loadingDetail: boolean;
  open: boolean;
  onClose: () => void;
  onCerrar: (corte: Corte) => void;
  onMovimientoRegistered: () => void;
}) {
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [lightboxVoucher, setLightboxVoucher] = useState<Voucher | null>(null);
  if (!corte) return null;
  const estaAbierto = corte.estado?.toLowerCase() === 'abierto';
  const efectivoEsperado = totales?.efectivo_esperado ?? corte.efectivo_esperado ?? 0;
  const efectivoContado = corte.efectivo_contado ?? 0;
  const diferencia = efectivoContado - efectivoEsperado;

  const tarjeta = conciliarTarjeta(totales, vouchers);
  const efectivo = conciliarEfectivo(corte, totales);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="sm:max-w-[600px]">
        {/* Print-only logo strip — el SheetHeader ya queda visible en print
            con el nombre del corte; este sólo agrega la marca arriba. */}
        <div className="hidden print:mb-1 print:flex print:items-baseline print:justify-between print:border-b print:pb-1 print:text-[10px]">
          <span className="font-bold">Rincón del Bosque</span>
          <span className="text-gray-500">Corte de Caja</span>
        </div>

        {/* ── HEADER ─────────────────────────────────────────── */}
        <SheetHeader className="print:gap-0 print:p-0">
          <SheetTitle className="print:text-sm">
            {corte.corte_nombre ?? `Corte ${corte.id}`}
          </SheetTitle>
          <SheetDescription className="print:text-[10px]">
            {corte.caja_nombre ?? '—'} · {formatDateTime(corte.hora_inicio)} a{' '}
            {formatDateTime(corte.hora_fin)}
          </SheetDescription>
          <div className="absolute right-12 top-4 flex gap-2 print:hidden">
            {estaAbierto && (
              <Button variant="destructive" size="sm" onClick={() => onCerrar(corte)}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                Cerrar Corte
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Marbete
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 pr-1 print:h-auto print:overflow-visible">
          <div className="mt-6 space-y-6 pb-6 print:mt-2 print:space-y-3 print:pb-2 print:text-[11px]">
            {/* Estado + responsable */}
            <div className="flex items-center justify-between">
              <Badge variant={estadoVariant(corte.estado)} className="print:text-[10px]">
                {corte.estado ?? 'Sin estado'}
              </Badge>
              <span className="text-sm text-muted-foreground print:text-[10px]">
                {corte.responsable_apertura ?? corte.responsable_cierre ?? ''}
              </span>
            </div>

            {/* Horario */}
            <div className="grid grid-cols-2 gap-4 text-sm print:gap-x-4 print:gap-y-0.5 print:text-[10px]">
              <div>
                <span className="block text-xs text-muted-foreground print:inline print:text-[9px]">
                  Apertura{' '}
                </span>
                <span className="font-medium">{formatDate(corte.hora_inicio)}</span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground print:inline print:text-[9px]">
                  Cierre{' '}
                </span>
                <span className="font-medium">{formatDate(corte.hora_fin)}</span>
              </div>
              {corte.turno && (
                <div>
                  <span className="block text-xs text-muted-foreground print:inline print:text-[9px]">
                    Turno{' '}
                  </span>
                  <span className="font-medium">{corte.turno}</span>
                </div>
              )}
              {corte.tipo && (
                <div>
                  <span className="block text-xs text-muted-foreground print:inline print:text-[9px]">
                    Tipo{' '}
                  </span>
                  <span className="font-medium">{corte.tipo}</span>
                </div>
              )}
            </div>

            {corte.observaciones && (
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-600 print:p-1.5 print:text-[10px] print:text-gray-700 dark:text-yellow-400">
                <span className="mb-1 block font-semibold">Observaciones</span>
                {corte.observaciones}
              </div>
            )}

            {!loadingDetail && (
              <CorteConciliacion
                tarjeta={tarjeta}
                efectivo={efectivo}
                ingresosStripe={totales?.ingresos_stripe ?? 0}
                ingresosTransferencias={totales?.ingresos_transferencias ?? 0}
              />
            )}

            <Separator className="print:my-1" />

            {/* Resumen Financiero */}
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground print:mb-1 print:text-[9px] print:text-gray-500">
                Resumen Financiero
              </div>
              {loadingDetail ? (
                <DetailSkeleton />
              ) : totales ? (
                <div className="space-y-2 text-sm print:space-y-0 print:text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo inicial</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.efectivo_inicial)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingresos efectivo</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.ingresos_efectivo)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingresos tarjeta</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.ingresos_tarjeta)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingresos Stripe</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.ingresos_stripe)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transferencias</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(totales.ingresos_transferencias)}
                    </span>
                  </div>
                  {(totales.depositos ?? 0) !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Depósitos</span>
                      <span className="font-medium tabular-nums text-emerald-500">
                        {formatCurrency(totales.depositos)}
                      </span>
                    </div>
                  )}
                  {(totales.retiros ?? 0) !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Retiros</span>
                      <span className="font-medium tabular-nums text-destructive">
                        {formatCurrency(totales.retiros)}
                      </span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-semibold">
                    <span>Total ingresos</span>
                    <span className="tabular-nums">{formatCurrency(totales.total_ingresos)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Efectivo esperado</span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(totales.efectivo_esperado)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin datos de totales.</p>
              )}
            </div>

            <Separator className="print:my-1" />

            {/* Movimientos */}
            <div>
              <div className="mb-3 flex items-center justify-between print:mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-[9px] print:text-gray-500">
                  Movimientos
                </span>
                {estaAbierto && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRegistrarOpen(true)}
                    aria-label="Registrar movimiento de caja"
                    className="print:hidden"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Registrar
                  </Button>
                )}
              </div>
              {loadingDetail ? (
                <DetailSkeleton />
              ) : movimientos.length === 0 ? (
                <p className="text-sm text-muted-foreground print:text-[10px]">
                  Sin movimientos registrados.
                </p>
              ) : (
                <div className="space-y-2 text-sm print:space-y-0.5 print:text-[10px]">
                  {movimientos.map((m) => (
                    <div key={m.id} className="flex items-start justify-between gap-4">
                      <div>
                        <span className="font-medium capitalize">{m.tipo ?? 'Movimiento'}</span>
                        {m.nota && (
                          <span className="block text-xs text-muted-foreground print:inline print:text-[10px] print:text-gray-700">
                            {m.nota ? ` · ${m.nota}` : ''}
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground print:text-[9px]">
                          {formatDate(m.fecha_hora)}
                          {m.registrado_por ? ` · ${m.registrado_por}` : ''}
                        </span>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCurrency(m.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(() => {
              // Fallback `?? 'voucher_tarjeta'` por compat con vouchers viejos cuyo
              // SELECT preexistente no incluía `categoria` (bug fix Fase 3 §1).
              const vouchersTarjeta = vouchers.filter(
                (v) => (v.categoria ?? 'voucher_tarjeta') === 'voucher_tarjeta'
              );
              if (vouchersTarjeta.length === 0) return null;
              return (
                <>
                  <Separator className="print:hidden" />
                  <div className="print:hidden">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Vouchers de tarjeta ({vouchersTarjeta.length})
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {vouchersTarjeta.map((v) => {
                        const capturado = v.monto_reportado != null;
                        const tieneOCR =
                          !capturado &&
                          (v.ocr_monto_sugerido != null || v.ocr_banco_sugerido_id != null);
                        const badgeText = capturado ? '✓' : tieneOCR ? 'OCR' : 'Capturar';
                        const badgeClass = capturado
                          ? 'bg-emerald-500/90 text-white'
                          : tieneOCR
                            ? 'bg-blue-500/90 text-white'
                            : 'bg-yellow-500/90 text-zinc-900';
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className="group relative aspect-square overflow-hidden rounded-md border bg-muted hover:border-primary"
                            onClick={() => setLightboxVoucher(v)}
                          >
                            {v.signed_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={v.signed_url}
                                alt={v.nombre_original ?? 'voucher'}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                Sin preview
                              </div>
                            )}
                            <span
                              className={`absolute right-1 top-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${badgeClass}`}
                            >
                              {badgeText}
                            </span>
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                              <span className="block truncate text-xs text-white">
                                {v.afiliacion ?? formatDateTime(v.uploaded_at)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Firmas (sólo impresión) — bloque al final del marbete para los
                responsables de apertura y cierre. */}
            <div className="hidden print:mt-4 print:grid print:grid-cols-2 print:gap-6 print:border-t print:pt-2 print:text-[9px]">
              <div className="border-t border-gray-400 pt-0.5 text-center text-gray-500">
                Responsable de apertura
              </div>
              <div className="border-t border-gray-400 pt-0.5 text-center text-gray-500">
                Responsable de cierre
              </div>
            </div>
          </div>
        </ScrollArea>

        {estaAbierto && (
          <RegistrarMovimientoDialog
            corteId={corte.id}
            open={registrarOpen}
            onOpenChange={setRegistrarOpen}
            onSuccess={onMovimientoRegistered}
          />
        )}

        <VoucherLightbox
          voucher={lightboxVoucher}
          bancos={bancos}
          movimientos={movimientos}
          onClose={() => setLightboxVoucher(null)}
          onSaved={() => {
            setLightboxVoucher(null);
            onMovimientoRegistered();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

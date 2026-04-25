'use client';

import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { actualizarCategoriaVoucher, confirmarVoucher } from '@/app/rdb/cortes/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { formatCurrency, formatDateTime } from './helpers';
import type { Banco, Movimiento, Voucher, VoucherCategoria } from './types';

type Props = {
  voucher: Voucher;
  bancos: Banco[];
  movimientos: Movimiento[];
  onSaved: () => void;
};

const CATEGORIA_OPTIONS: { value: VoucherCategoria; label: string }[] = [
  { value: 'voucher_tarjeta', label: 'Voucher tarjeta' },
  { value: 'comprobante_movimiento', label: 'Comprobante movimiento' },
  { value: 'otro', label: 'Otro' },
];

export function VoucherCaptureForm({ voucher, bancos, movimientos, onSaved }: Props) {
  const toast = useToast();
  const initialCategoria: VoucherCategoria = voucher.categoria ?? 'voucher_tarjeta';
  // Pre-llenado: si hay valor humano confirmado, usa ese. Si no, sugerencia OCR.
  const initialBancoId = voucher.banco_id ?? voucher.ocr_banco_sugerido_id ?? null;
  const initialMonto =
    voucher.monto_reportado != null
      ? String(voucher.monto_reportado)
      : voucher.ocr_monto_sugerido != null
        ? String(voucher.ocr_monto_sugerido)
        : '';
  const [categoria, setCategoria] = useState<VoucherCategoria>(initialCategoria);
  const [bancoId, setBancoId] = useState<string | null>(initialBancoId);
  const [monto, setMonto] = useState<string>(initialMonto);
  const [afiliacion, setAfiliacion] = useState<string>(voucher.afiliacion ?? '');
  const [movimientoId, setMovimientoId] = useState<string | null>(
    voucher.movimiento_caja_id ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Indicación visual: ¿el form arrancó pre-llenado por OCR (sin confirmación humana previa)?
  const esSugeridoPorOCR =
    voucher.monto_reportado == null &&
    (voucher.ocr_monto_sugerido != null || voucher.ocr_banco_sugerido_id != null);
  const confianzaBaja = esSugeridoPorOCR && (voucher.ocr_confianza ?? 1) < 0.4;

  const montoNum = parseFloat(monto);
  const montoValido =
    monto !== '' && !Number.isNaN(montoNum) && montoNum >= 0 && Number.isFinite(montoNum);

  const canSubmit = (() => {
    if (saving) return false;
    if (categoria === 'voucher_tarjeta') return montoValido;
    if (categoria === 'comprobante_movimiento') return !!movimientoId;
    return true; // 'otro' siempre puede guardarse
  })();

  function handleCategoriaChange(next: string | null) {
    if (!next) return;
    setCategoria(next as VoucherCategoria);
    setError(null);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    try {
      const categoriaCambia = categoria !== initialCategoria;

      if (categoria === 'voucher_tarjeta') {
        if (categoriaCambia) {
          await actualizarCategoriaVoucher({
            voucher_id: voucher.id,
            categoria: 'voucher_tarjeta',
            movimiento_caja_id: null,
          });
        }
        await confirmarVoucher({
          voucher_id: voucher.id,
          banco_id: bancoId,
          monto: montoNum,
          afiliacion: afiliacion.trim() || null,
        });
      } else if (categoria === 'comprobante_movimiento') {
        await actualizarCategoriaVoucher({
          voucher_id: voucher.id,
          categoria: 'comprobante_movimiento',
          movimiento_caja_id: movimientoId,
        });
      } else {
        await actualizarCategoriaVoucher({
          voucher_id: voucher.id,
          categoria: 'otro',
          movimiento_caja_id: null,
        });
      }

      toast.add({ title: 'Voucher actualizado', type: 'success' });
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
      toast.add({ title: 'No se pudo guardar', description: msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-3 rounded-lg border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      {esSugeridoPorOCR && categoria === 'voucher_tarjeta' && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <div className="space-y-0.5">
            <div className="font-medium">OCR sugiere — verifica los datos antes de confirmar.</div>
            {confianzaBaja && (
              <div className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Confianza baja — revisa con cuidado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selector segmentado de categoría */}
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        {CATEGORIA_OPTIONS.map((opt) => {
          const active = categoria === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleCategoriaChange(opt.value)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Campos según categoría */}
      {categoria === 'voucher_tarjeta' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label
                htmlFor="vc-banco"
                className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Banco
              </label>
              <Select value={bancoId ?? ''} onValueChange={(v) => setBancoId(v || null)}>
                <SelectTrigger id="vc-banco" className="w-full">
                  <SelectValue placeholder="Selecciona banco" />
                </SelectTrigger>
                <SelectContent>
                  {bancos.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="vc-monto"
                className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Monto
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="vc-monto"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="pl-6 tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="vc-afiliacion"
              className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Afiliación (opcional)
            </label>
            <Input
              id="vc-afiliacion"
              value={afiliacion}
              onChange={(e) => setAfiliacion(e.target.value)}
              placeholder="Ej. 7235801"
              className="tabular-nums"
            />
          </div>
        </div>
      )}

      {categoria === 'comprobante_movimiento' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label
              htmlFor="vc-mov"
              className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Movimiento ligado
            </label>
            <Select value={movimientoId ?? ''} onValueChange={(v) => setMovimientoId(v || null)}>
              <SelectTrigger id="vc-mov" className="w-full">
                <SelectValue placeholder="Selecciona movimiento" />
              </SelectTrigger>
              <SelectContent>
                {movimientos.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Sin movimientos registrados en este corte
                  </div>
                ) : (
                  movimientos.map((m) => {
                    const partes = [
                      m.tipo ?? '—',
                      m.tipo_detalle,
                      formatCurrency(m.monto),
                      formatDateTime(m.fecha_hora),
                    ].filter(Boolean);
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {partes.join(' · ')}
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Esta foto respalda un movimiento de caja, no es voucher de tarjeta. Liga al movimiento
            correspondiente.
          </p>
        </div>
      )}

      {categoria === 'otro' && (
        <p className="text-[11px] text-muted-foreground">
          Foto sin clasificar. Permanece archivada pero no entra en conciliación.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Guardando…
            </>
          ) : (
            'Guardar'
          )}
        </Button>
      </div>
    </form>
  );
}

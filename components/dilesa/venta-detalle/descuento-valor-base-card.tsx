'use client';

/**
 * Descuento al valor base sobre una venta YA CREADA (Fase 1).
 *
 * El flujo real de captura es: el vendedor crea la solicitud y Dirección
 * entra DESPUÉS a autorizar/aplicar el descuento — no puede capturarlo en el
 * form de nueva venta porque esa captura no es suya (sesión 2026-07-02).
 * Este card recalcula el precio vía `fn_calcular_precio_venta` con el
 * descuento y RE-CONGELA el snapshot, solo mientras la venta sigue en
 * Fase 1 (la solicitud aún no se firma; el PDF se regenera con el neto).
 *
 * Solo lo ve Dirección; el enforcement real vive en el trigger guard de DB
 * (migración 20260701222450), que además sella autorizado_por/at.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { congelarDesglose, leerDesglose } from '@/lib/dilesa/desglose-precio';
import { useVentaDetalle } from './provider';
import { fmtMoney } from './types';

type Motivo = { id: string; nombre: string };
type VentaOrigenCandidata = {
  id: string;
  estado: string;
  identificador: string;
  valor_base: number | null;
};

export function DescuentoValorBaseCard() {
  const { venta, effectiveUser, bumpRefresh, calculo } = useVentaDetalle();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);

  const esDireccion =
    !!effectiveUser?.isAdmin ||
    (venta != null && (effectiveUser?.direccionEmpresaIds ?? []).includes(venta.empresa_id));

  // Editable solo en Fase 1 con la venta activa: la solicitud todavía no se
  // firma, así que re-congelar el snapshot regenera el PDF con el neto sin
  // tocar documentos ya firmados (para eso existe el flujo de re-firma de
  // dictaminación, ADR-048).
  const editable = !!venta && venta.estado === 'activa' && venta.fase_posicion === 1;
  const descuentoActual = venta?.descuento_valor_base ?? 0;
  const visible = esDireccion && !!venta && (editable || descuentoActual > 0);

  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [ventasOrigen, setVentasOrigen] = useState<VentaOrigenCandidata[]>([]);
  const [monto, setMonto] = useState<string>('');
  const [motivoId, setMotivoId] = useState<string>('');
  const [detalle, setDetalle] = useState<string>('');
  const [origenId, setOrigenId] = useState<string>('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible || !venta) return;
    let active = true;
    (async () => {
      const [mRes, oRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('descuento_motivos')
          .select('id, nombre')
          .eq('empresa_id', venta.empresa_id)
          .eq('activa', true)
          .is('deleted_at', null)
          .order('orden'),
        sb
          .schema('dilesa')
          .from('ventas')
          .select('id, estado, valor_comercial, desglose_precio, unidades(identificador)')
          .eq('empresa_id', venta.empresa_id)
          .eq('persona_id', venta.persona_id)
          .in('estado', ['desasignada', 'expirada'])
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);
      if (!active) return;
      setMotivos((mRes.data ?? []) as Motivo[]);
      setVentasOrigen(
        (oRes.data ?? []).map((v) => {
          const snap = leerDesglose(v.desglose_precio);
          return {
            id: v.id as string,
            estado: v.estado as string,
            identificador:
              ((v.unidades as { identificador?: string } | null)?.identificador as string) ?? '—',
            valor_base: snap?.valor_comercial ?? (v.valor_comercial as number | null),
          };
        })
      );
    })();
    return () => {
      active = false;
    };
  }, [sb, visible, venta]);

  if (!visible || !venta) return null;

  const lista = calculo?.valor_comercial_lista ?? null;

  async function aplicar(descuento: number) {
    if (!venta || !venta.unidad_id) return;
    if (descuento > 0 && (!motivoId || detalle.trim() === '')) {
      toast.add({
        title: 'Faltan datos',
        description: 'El descuento requiere motivo y detalle del caso.',
        type: 'error',
      });
      return;
    }
    setGuardando(true);
    try {
      // tipo_credito vive como TEXTO (nombre) en la venta; la RPC pide el id.
      let tipoCreditoId: string | undefined;
      if (venta.tipo_credito) {
        const { data: tc } = await sb
          .schema('dilesa')
          .from('tipos_credito')
          .select('id')
          .eq('empresa_id', venta.empresa_id)
          .eq('nombre', venta.tipo_credito)
          .is('deleted_at', null)
          .maybeSingle();
        tipoCreditoId = (tc?.id as string | undefined) ?? undefined;
      }

      const { data: calc, error: cErr } = await sb
        .schema('dilesa')
        .rpc('fn_calcular_precio_venta', {
          p_unidad_id: venta.unidad_id,
          p_tipo_credito_id: tipoCreditoId,
          p_monto_credito_titular: venta.monto_credito_titular ?? 0,
          p_monto_credito_cotitular: venta.monto_credito_cotitular ?? 0,
          p_productos_adicionales: venta.productos_adicionales ?? 0,
          p_sobreprecio_gastos_escrituracion: venta.sobreprecio_gastos_escrituracion ?? 0,
          p_descuento_valor_base: descuento,
        });
      const calcObj = calc as Record<string, unknown> | null;
      if (cErr || !calcObj || calcObj.error) {
        throw new Error(
          getSupabaseErrorMessage(cErr, String(calcObj?.error ?? 'No se pudo recalcular.'))
        );
      }

      const aplicado = Number(calcObj.descuento_valor_base ?? 0);
      const motivoNombre =
        aplicado > 0 ? (motivos.find((m) => m.id === motivoId)?.nombre ?? null) : null;
      const paraCongelar = (
        motivoNombre ? { ...calcObj, descuento_valor_base_motivo: motivoNombre } : calcObj
      ) as Parameters<typeof congelarDesglose>[0];

      // Mismos campos que escribe el form de nueva venta al asignar: el
      // snapshot para PDF/detalle + los escalares que lee la cuadratura.
      const { error: upErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .update({
          valor_comercial: calcObj.valor_comercial as number,
          precio_asignacion: calcObj.precio_venta_total as number,
          desglose_precio: congelarDesglose(paraCongelar),
          enganche_requerido: calcObj.enganche_1pct as number,
          gastos_escrituracion: calcObj.gastos_notariales_6pct as number,
          precio_base: calcObj.valor_comercial as number,
          incremento_credito: calcObj.costo_credito_adicional as number,
          valor_excedente_terreno: calcObj.valor_excedente_terreno as number,
          valor_frente_verde: calcObj.valor_frente_verde as number,
          valor_esquina: calcObj.valor_esquina as number,
          valor_venta_futuro: calcObj.valor_venta_futuro as number,
          descuento_valor_base: aplicado > 0 ? aplicado : null,
          descuento_valor_base_motivo_id: aplicado > 0 ? motivoId : null,
          descuento_valor_base_detalle: aplicado > 0 ? detalle.trim() : null,
          venta_origen_id: aplicado > 0 && origenId ? origenId : null,
        })
        .eq('id', venta.id);
      if (upErr) throw new Error(getSupabaseErrorMessage(upErr, 'No se pudo aplicar.'));

      toast.add({
        title: aplicado > 0 ? 'Descuento aplicado' : 'Descuento retirado',
        description:
          aplicado > 0
            ? `Nuevo precio de venta: ${fmtMoney(Number(calcObj.precio_venta_total))}. La solicitud se imprime con lista − descuento = neto.`
            : 'El precio volvió al valor de lista.',
        type: 'success',
      });
      setMonto('');
      setMotivoId('');
      setDetalle('');
      setOrigenId('');
      bumpRefresh();
    } catch (e) {
      toast.add({
        title: 'Error al aplicar descuento',
        description: (e as Error).message,
        type: 'error',
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
        Descuento al valor base (autorización Dirección)
      </div>

      {!editable ? (
        <p className="mt-1 text-sm text-[var(--text)]/70">
          Aplicado: {fmtMoney(descuentoActual)}. Solo puede modificarse en Fase 1; después del
          cierre de la solicitud usa el flujo de re-firma de dictaminación.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-[var(--text)]/60">
            Recalcula el precio pegando al valor base antes de las derivaciones y re-congela el
            snapshot — la solicitud se reimprime con lista − descuento = neto y el motivo como
            etiqueta.
            {descuentoActual > 0 ? ` Actual: ${fmtMoney(descuentoActual)}.` : ''}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--text)]/60">Monto de descuento</span>
              <Input
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
              />
              {lista != null && (Number(monto) || 0) > 0 ? (
                <span className="mt-1 block text-xs text-[var(--text)]/50">
                  Lista {fmtMoney(lista)} − {fmtMoney(Number(monto))} ={' '}
                  <strong>{fmtMoney(Math.max(0, lista - Number(monto)))}</strong> neto
                </span>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--text)]/60">
                o valor base objetivo
              </span>
              <Input
                type="number"
                value={
                  lista != null && monto !== '' ? String(Math.max(0, lista - Number(monto))) : ''
                }
                onChange={(e) => {
                  if (lista == null) return;
                  setMonto(String(Math.max(0, lista - (Number(e.target.value) || 0))));
                }}
                disabled={lista == null}
                placeholder={lista == null ? 'sin valor de lista en snapshot' : ''}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--text)]/60">Motivo *</span>
              <select
                className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={motivoId}
                onChange={(e) => setMotivoId(e.target.value)}
              >
                <option value="">— selecciona —</option>
                {motivos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--text)]/60">Detalle del caso *</span>
              <Input
                value={detalle}
                onChange={(e) => setDetalle(e.target.value)}
                placeholder="ej. reasignación de M3-L9; se respeta su valor de 2026-02"
              />
            </label>
            {ventasOrigen.length > 0 ? (
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs text-[var(--text)]/60">
                  Venta anterior que se respeta (opcional — prellena el descuento)
                </span>
                <select
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={origenId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setOrigenId(id);
                    const origen = ventasOrigen.find((v) => v.id === id);
                    if (origen?.valor_base != null && lista != null) {
                      setMonto(String(Math.max(0, lista - origen.valor_base)));
                    }
                  }}
                >
                  <option value="">— ninguna —</option>
                  {ventasOrigen.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.identificador} · {v.estado}
                      {v.valor_base != null ? ` · valor base ${fmtMoney(v.valor_base)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => void aplicar(Number(monto) || 0)}
              disabled={guardando || (Number(monto) || 0) <= 0}
            >
              {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
              Aplicar descuento
            </Button>
            {descuentoActual > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void aplicar(0)}
                disabled={guardando}
              >
                Quitar descuento actual
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

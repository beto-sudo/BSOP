'use client';

/**
 * Captura Fase 17 — Operación Terminada (S4+S5 dilesa-ventas-expediente).
 *
 * El sello final del expediente. NO es una revisión manual: el copiloto
 * re-evalúa aquí las 4 condiciones (fases 1-16, expediente documental
 * completo descontando docs que la venta no amerita, cuadratura cubierta,
 * conformidad registrada) y solo entonces habilita el cierre.
 *
 * Acceso: `dilesa.ventas.fase17_operacion_terminada` (pre-sembrado).
 */

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Loader2, PartyPopper } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { marcarFase, FASES_PIPELINE } from '@/lib/dilesa/captura/marcar-fase';
import { FASE_ROLES, ROL_LABEL, rolesOpcionales } from '@/lib/dilesa/captura/fase-roles';
import { evaluarCierre, type CopilotoResultado } from '@/lib/dilesa/copiloto-cierre';
import { calcularCuadratura } from '@/lib/dilesa/cuadratura';

type VentaCtx = {
  id: string;
  empresa_id: string;
  persona_id: string;
  unidad_id: string | null;
  tipo_credito: string | null;
  valor_escrituracion: number | null;
  precio_asignacion: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  monto_credito_directo: number | null;
  monto_cheque_notaria: number | null;
  gastos_escrituracion: number | null;
  monto_nota_credito: number | null;
  descuento_total: number | null;
  descuento_precio: number | null;
  descuento_equipamiento: number | null;
  descuento_gastos_escrituracion: number | null;
  descuento_nota_credito: number | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});

export default function CapturarFase17Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase17_operacion_terminada" write>
      <CapturarFase17Body />
    </RequireAccess>
  );
}

function CapturarFase17Body() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [clienteNombre, setClienteNombre] = useState<string>('');
  const [identificacionInv, setIdentificacionInv] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CopilotoResultado | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ventaId) return;
    let activo = true;

    (async () => {
      setLoading(true);
      setError(null);

      const { data: vRow, error: vErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .select(
          'id, empresa_id, persona_id, unidad_id, tipo_credito, valor_escrituracion, precio_asignacion, monto_credito_titular, monto_credito_cotitular, monto_credito_directo, monto_cheque_notaria, gastos_escrituracion, monto_nota_credito, descuento_total, descuento_precio, descuento_equipamiento, descuento_gastos_escrituracion, descuento_nota_credito'
        )
        .eq('id', ventaId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (vErr || !vRow) {
        setError(
          vErr
            ? getSupabaseErrorMessage(vErr, 'No se pudo cargar la venta.')
            : 'Venta no encontrada.'
        );
        setLoading(false);
        return;
      }
      const v = vRow as unknown as VentaCtx;
      setVenta(v);

      const [pRes, uRes, fRes, adjRes, abonosRes] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno')
          .eq('id', v.persona_id)
          .maybeSingle(),
        v.unidad_id
          ? sb
              .schema('dilesa')
              .from('unidades')
              .select('identificador, producto_id')
              .eq('id', v.unidad_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('posicion')
          .eq('venta_id', v.id)
          .is('deleted_at', null),
        sb
          .schema('erp')
          .from('adjuntos')
          .select('rol')
          .eq('entidad_tipo', 'venta')
          .eq('entidad_id', v.id),
        sb
          .schema('erp')
          .from('cxc_pagos')
          .select('monto_total, fuente')
          .eq('origen_tipo', 'venta_dilesa')
          .eq('origen_id', v.id)
          .is('deleted_at', null),
      ]);
      if (!activo) return;

      if (pRes.data) {
        setClienteNombre(
          [pRes.data.nombre, pRes.data.apellido_paterno, pRes.data.apellido_materno]
            .filter(Boolean)
            .join(' ') || '(sin nombre)'
        );
      }
      if (uRes.data) setIdentificacionInv(uRes.data.identificador as string);

      const posicionesAlcanzadas = new Set(
        ((fRes.data ?? []) as { posicion: number }[]).map((f) => f.posicion)
      );
      setYaCerrada(posicionesAlcanzadas.has(17));

      // Apoyo Infonavit del catálogo (mismo criterio que el detalle).
      let apoyo = 0;
      if (v.tipo_credito) {
        const { data: tc } = await sb
          .schema('dilesa')
          .from('tipos_credito')
          .select('apoyo_infonavit_monto')
          .eq('empresa_id', v.empresa_id)
          .eq('nombre', v.tipo_credito)
          .is('deleted_at', null)
          .maybeSingle();
        apoyo = Number(tc?.apoyo_infonavit_monto ?? 0);
      }

      const cuadratura = calcularCuadratura({
        valorEscrituracion: v.valor_escrituracion,
        montoCreditoTitular: v.monto_credito_titular,
        montoCreditoCotitular: v.monto_credito_cotitular,
        montoCreditoDirecto: v.monto_credito_directo,
        montoChequeNotaria: v.monto_cheque_notaria,
        gastosEscrituracion: v.gastos_escrituracion,
        apoyoInfonavit: apoyo,
        // `descuento_total` autoritativo (amarre Sprint 1).
        descuentoOtorgadoTotal: Number(v.descuento_total ?? 0),
        precioAsignacion: v.precio_asignacion,
        depositos: ((abonosRes.data ?? []) as { monto_total: number; fuente: string }[]).map(
          (a) => ({ monto: a.monto_total, directoCliente: a.fuente === 'cliente' })
        ),
        proyectoNombre: null,
      });

      // Docs requeridos faltantes (descontando opcionales por la venta).
      const cargados = new Set(((adjRes.data ?? []) as { rol: string }[]).map((a) => a.rol));
      const opcionales = rolesOpcionales(v);
      const docsFaltantes = FASES_PIPELINE.flatMap((f) =>
        (FASE_ROLES[f.nombre] ?? [])
          .filter((rol) => !cargados.has(rol) && !opcionales.has(rol))
          .map((rol) => ({ fase: f.nombre, rol, label: ROL_LABEL[rol] ?? rol }))
      );

      const fases = FASES_PIPELINE.map((f) => ({
        pos: f.posicion,
        nombre: f.nombre,
        alcanzada: posicionesAlcanzadas.has(f.posicion),
      }));

      setResultado(
        evaluarCierre(
          {
            fases,
            docsFaltantes,
            saldoCliente: cuadratura.saldoOperacion,
            cubierta: v.valor_escrituracion == null ? null : cuadratura.operacionCubierta,
          },
          (n) => moneyFmt.format(n)
        )
      );
      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  const cerrarOperacion = useCallback(async () => {
    if (!venta || !resultado?.listo) return;
    setSubmitting(true);
    const { data: userRes } = await sb.auth.getUser();
    const userId = userRes?.user?.id ?? null;

    const result = await marcarFase(sb, {
      ventaId: venta.id,
      faseNombre: 'Operación Terminada',
      faseposicion: 17,
      docs: [],
      camposVenta: {},
      notas:
        'Cierre verificado por el copiloto: pipeline completo, expediente documental, cuadratura cubierta y conformidad registrada.',
      registradoPor: userId,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.add({
        title: 'Error al cerrar la operación',
        description: result.error ?? 'Error desconocido.',
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Operación Terminada 🎉',
      description: 'El expediente quedó sellado. Felicidades por otra entrega completa.',
      type: 'success',
    });
    router.push(`/dilesa/ventas/${venta.id}`);
  }, [resultado, router, sb, toast, venta]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
        <CapturarFaseHeader
          ventaId={ventaId}
          clienteNombre={null}
          identificacionInventario={null}
          faseposicion={17}
          faseNombre="Operación Terminada"
        />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        ventaId={venta.id}
        clienteNombre={clienteNombre}
        identificacionInventario={identificacionInv}
        faseposicion={17}
        faseNombre="Operación Terminada"
        descripcion="El sello final: el copiloto verifica el expediente y habilita el cierre."
      />

      {yaCerrada ? (
        <div className="rounded-lg border border-emerald-400/40 bg-emerald-50 p-5 dark:bg-emerald-950/25">
          <div className="flex items-center gap-2">
            <PartyPopper className="size-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              Esta operación ya está terminada.
            </p>
          </div>
        </div>
      ) : resultado ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
            Verificación de cierre ({resultado.items.length - resultado.pendientes}/
            {resultado.items.length})
          </h2>
          <ul className="space-y-2">
            {resultado.items.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                {item.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-[var(--text)]/30" />
                )}
                <div>
                  <span
                    className={item.ok ? 'text-[var(--text)]/70' : 'font-medium text-[var(--text)]'}
                  >
                    {item.label}
                  </span>
                  {item.detalle ? (
                    <p className="text-xs text-[var(--text)]/55">{item.detalle}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-end gap-3">
            <Link
              href={`/dilesa/ventas/${venta.id}`}
              className="text-sm text-muted-foreground hover:text-[var(--text)]"
            >
              Volver al detalle
            </Link>
            <Button
              type="button"
              onClick={cerrarOperacion}
              disabled={!resultado.listo || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Cerrando…
                </>
              ) : (
                <>
                  <PartyPopper className="mr-2 size-4" /> Marcar Operación Terminada
                </>
              )}
            </Button>
          </div>
          {!resultado.listo ? (
            <p className="mt-2 text-right text-[11px] text-[var(--text)]/50">
              El botón se habilita cuando las {resultado.items.length} verificaciones estén en
              verde.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

'use client';

/**
 * TareaCicloReal — el ciclo P2P real visto desde una tarea del checklist
 * (fase 2 de `dilesa-flujo-gasto`: convergencia checklist ↔ ciclo real).
 *
 * La tarea de cotización crea una partida canónica (`tarea_origen_id` →
 * `erp.presupuesto_partidas`); este componente muestra TODO lo que el ciclo
 * real ya registró contra esa partida (RFQs, OCs, contratos, facturas,
 * pagos) con el mismo stepper del hilo del gasto, y ofrece las salidas:
 * "Pedir cotizaciones (RFQ)" (línea pre-cargada con la partida) y el tab
 * Gasto del proyecto.
 *
 * Los pasos manuales de la tarea (cotización/factura/pago) siguen
 * disponibles abajo — esto los complementa: cuando el ciclo real avanza, el
 * banner lo dice y la captura manual se vuelve innecesaria.
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, FileSearch, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { HiloPasosView } from '@/components/gasto/hilo-gasto-stepper';
import {
  buildHiloPasos,
  fetchHiloRegistrosPorPartida,
  hiloTieneActividad,
  type HiloGasto,
} from '@/lib/gasto/hilo';

export function TareaCicloReal({
  empresaId,
  proyectoId,
  partidaId,
  concepto,
}: {
  empresaId: string;
  proyectoId: string;
  partidaId: string;
  /** concepto_texto de la partida — semilla de la línea de la RFQ. */
  concepto: string;
}) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const router = useRouter();
  const [creando, startCreando] = useTransition();
  const puedeRfq =
    permissions.isAdmin || permissions.modulos.get('dilesa.compras.cotizaciones')?.write === true;

  const [estado, setEstado] = useState<{
    key: string;
    hilo: HiloGasto | null;
    error: string | null;
  }>({ key: '', hilo: null, error: null });

  useEffect(() => {
    let activo = true;
    const sb = createSupabaseBrowserClient();
    fetchHiloRegistrosPorPartida(sb, partidaId)
      .then((registros) => {
        if (activo)
          setEstado({ key: partidaId, hilo: buildHiloPasos(registros, null), error: null });
      })
      .catch((e: Error) => {
        if (activo) setEstado({ key: partidaId, hilo: null, error: e.message });
      });
    return () => {
      activo = false;
    };
  }, [partidaId]);

  const { hilo, error } = estado.key === partidaId ? estado : { hilo: null, error: null };
  const conActividad = hilo ? hiloTieneActividad(hilo) : false;
  const tieneRfq = hilo ? hilo.pasos.some((p) => p.key === 'cotizada' && p.refs.length > 0) : false;

  function pedirRfq() {
    startCreando(async () => {
      const sb = createSupabaseBrowserClient();
      const folio = `RFQ-${Date.now().toString(36).toUpperCase()}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const erp = sb.schema('erp') as any;
      const cot = await erp
        .from('cotizaciones')
        .insert({
          empresa_id: empresaId,
          codigo: folio,
          tipo: 'compra',
          descripcion: concepto,
          estado: 'abierta',
        })
        .select('id')
        .single();
      if (cot.error || !cot.data) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(cot.error, 'No se pudo crear la RFQ.'),
          type: 'error',
        });
        return;
      }
      const lin = await erp.from('cotizacion_lineas').insert({
        empresa_id: empresaId,
        cotizacion_id: cot.data.id,
        partida_id: partidaId,
        descripcion: concepto,
        cantidad: 1,
      });
      if (lin.error) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(lin.error, 'RFQ creada pero faltó la línea.'),
          type: 'error',
        });
        return;
      }
      toast.add({ title: 'RFQ creada', description: folio, type: 'success' });
      router.push(`/dilesa/compras/cotizaciones?focus=${cot.data.id as string}`);
    });
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
          Ciclo real (Compras / CxP)
        </span>
        <span className="text-xs text-[var(--text)]/45">· partida: {concepto}</span>
        <span className="ml-auto flex items-center gap-2">
          {puedeRfq && !tieneRfq ? (
            <button
              type="button"
              onClick={pedirRfq}
              disabled={creando}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium text-[var(--text)]/80 hover:border-[var(--accent)]/50 hover:text-[var(--text)] disabled:opacity-50"
            >
              {creando ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileSearch className="h-3 w-3" />
              )}
              Pedir cotizaciones (RFQ)
            </button>
          ) : null}
          <a
            href={`/dilesa/proyectos/${proyectoId}/gasto`}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Ver en Gasto <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      </div>
      {error ? (
        <p className="text-xs text-[var(--text)]/50">No se pudo cargar el ciclo: {error}</p>
      ) : !hilo ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--text)]/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando ciclo…
        </p>
      ) : (
        <>
          <HiloPasosView hilo={hilo} empresa="dilesa" />
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--text)]/50">
            {conActividad
              ? 'El ciclo real ya registra avance contra esta partida — los pasos manuales de abajo son opcionales mientras esto avance solo.'
              : 'Sin movimientos reales todavía. Puedes arrancar el ciclo con una RFQ, o capturar los pasos manualmente abajo si la cotización fue informal.'}
          </p>
        </>
      )}
    </div>
  );
}

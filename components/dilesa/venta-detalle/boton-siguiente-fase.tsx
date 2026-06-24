'use client';

/**
 * Botón "Capturar siguiente fase" — atajo de la cabecera del expediente de
 * venta (Zona A) directo a la captura de la fase inmediata capturable.
 *
 * Reusa `pipelineRows` del provider (sin queries nuevas): la fase siguiente es
 * la primera con `puedeCapturar` (previa cerrada, no alcanzada, venta no
 * desasignada). El botón se oculta cuando:
 *   - no hay fase capturable (venta desasignada, fase 17 ya cerrada, hueco), o
 *   - el usuario no tiene write sobre el módulo de esa fase
 *     (`CAPTURA_MODULO_BY_POSICION`) — paridad con el `<RequireAccess>` de la
 *     página de captura, para no ofrecer un atajo que aterrice en un bloqueo.
 *
 * Diseño (opción C): botón apilado de 2 líneas — "Siguiente fase" + "N · Nombre"
 * — compacto y robusto a nombres largos.
 */

import Link from 'next/link';
import { ArrowRight, Pencil } from 'lucide-react';
import { usePermissions } from '@/components/providers';
import { useVentaDetalle } from './provider';
import { CAPTURA_MODULO_BY_POSICION } from './types';
import { accionFase } from '@/lib/dilesa/fases';

export function BotonSiguienteFase() {
  const { venta, pipelineRows } = useVentaDetalle();
  const { permissions } = usePermissions();

  if (!venta) return null;

  const siguiente = pipelineRows.find((r) => r.puedeCapturar && r.slugCaptura);
  if (!siguiente?.slugCaptura) return null;

  const modulo = CAPTURA_MODULO_BY_POSICION[siguiente.pos];
  const permitido =
    permissions.isAdmin || (!!modulo && permissions.modulos.get(modulo)?.write === true);
  if (!permitido) return null;

  return (
    <Link
      href={`/dilesa/ventas/${venta.id}/capturar/${siguiente.slugCaptura}`}
      className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-white transition-colors hover:bg-[var(--accent)]/90"
      title={`Capturar la fase ${siguiente.pos} · ${accionFase(siguiente.pos)}`}
    >
      <Pencil className="size-4 shrink-0" aria-hidden />
      <span className="flex flex-col text-left leading-tight">
        <span className="text-[10px] font-normal opacity-80">Siguiente fase</span>
        <span className="text-sm font-medium">
          {siguiente.pos} · {accionFase(siguiente.pos)}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}

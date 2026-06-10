'use client';

/**
 * TeTocaStrip — bandeja lite de pendientes por rol del ciclo de gasto
 * (iniciativa `dilesa-flujo-gasto` · Sprint 4, decisión D6 "v1 lite").
 *
 * Una fila de chips con conteos accionables: requisiciones por autorizar,
 * RFQs por adjudicar, OCs por enviar, recepciones pendientes, facturas por
 * programar y pagos por aprobar. Cada chip linkea directo a la pantalla de la
 * acción; solo se muestran los chips con conteo > 0 Y para los que el usuario
 * tiene permiso de escritura en el módulo destino (o es admin). Si no hay
 * nada, el strip no se renderiza.
 *
 * Counts con `head: true` (sin payload). DILESA-first: los chips de Compras
 * asumen los sub-slugs `dilesa.compras.*`; en otras empresas solo aplican los
 * de CxP. Se monta en los layouts de los hubs Compras y CxP.
 */

import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions, useEffectiveUser } from '@/components/providers';

type Chip = {
  key: string;
  count: number;
  label: (n: number) => string;
  href: string;
  /** Sub-slug cuyo `write` habilita el chip. null = gate por `direccion`. */
  modulo: string | null;
  /** Chip exclusivo de Dirección (admin global O rol Dirección en la empresa). */
  direccion?: boolean;
};

export function TeTocaStrip({ empresaId, empresa }: { empresaId: string; empresa: string }) {
  const { permissions } = usePermissions();
  const { data: effectiveUser } = useEffectiveUser();
  const esDireccion =
    !!effectiveUser?.isAdmin || (effectiveUser?.direccionEmpresaIds ?? []).includes(empresaId);
  const [chips, setChips] = useState<Chip[]>([]);

  useEffect(() => {
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const erp = sb.schema('erp') as any;
      const count = (q: Promise<{ count: number | null; error: unknown }>) =>
        q.then((r) => (r.error ? 0 : (r.count ?? 0)));

      const esDilesa = empresa === 'dilesa';
      const [reqs, rfqs, ocsBorrador, ocsRecibir, factsProgramar, pagosAprobar] = await Promise.all(
        [
          esDilesa
            ? count(
                erp
                  .from('requisiciones')
                  .select('id', { count: 'exact', head: true })
                  .eq('empresa_id', empresaId)
                  .is('autorizada_at', null)
                  .is('cancelada_at', null)
                  .is('deleted_at', null)
              )
            : 0,
          esDilesa
            ? count(
                erp
                  .from('cotizaciones')
                  .select('id', { count: 'exact', head: true })
                  .eq('empresa_id', empresaId)
                  .in('estado', ['abierta', 'comparada'])
                  .is('cancelada_at', null)
                  .is('deleted_at', null)
              )
            : 0,
          esDilesa
            ? count(
                erp
                  .from('ordenes_compra')
                  .select('id', { count: 'exact', head: true })
                  .eq('empresa_id', empresaId)
                  .eq('estado', 'borrador')
                  .is('deleted_at', null)
              )
            : 0,
          esDilesa
            ? count(
                erp
                  .from('ordenes_compra')
                  .select('id', { count: 'exact', head: true })
                  .eq('empresa_id', empresaId)
                  .in('estado', ['enviada', 'parcial'])
                  .is('deleted_at', null)
              )
            : 0,
          count(
            erp
              .from('facturas')
              .select('id', { count: 'exact', head: true })
              .eq('empresa_id', empresaId)
              .eq('flujo', 'egreso')
              .in('estado_cxp', ['por_pagar', 'parcial'])
              .gt('saldo', 0)
          ),
          count(
            erp
              .from('cxp_pagos')
              .select('id', { count: 'exact', head: true })
              .eq('empresa_id', empresaId)
              .eq('estado', 'programado')
              .is('deleted_at', null)
          ),
        ]
      );
      // Órdenes de cambio presupuestal pendientes (gobierno del baseline,
      // iniciativa dilesa-presupuesto-baseline): las resuelve Dirección en el
      // tab Gasto del proyecto. Sin head — los proyecto_id arman el href.
      const cambiosRes = esDilesa
        ? await erp
            .from('presupuesto_cambios')
            .select('proyecto_id')
            .eq('empresa_id', empresaId)
            .eq('estado', 'solicitada')
        : { data: [], error: null };
      const cambiosProyectos: string[] = cambiosRes.error
        ? []
        : ((cambiosRes.data ?? []) as { proyecto_id: string }[]).map((c) => c.proyecto_id);
      const cambiosUnicos = [...new Set(cambiosProyectos)];
      if (!activo) return;

      setChips([
        {
          key: 'autorizar',
          count: reqs,
          label: (n) => `${n} requisición${n === 1 ? '' : 'es'} por autorizar`,
          href: '/dilesa/compras/requisiciones',
          modulo: 'dilesa.compras.requisiciones',
        },
        {
          key: 'adjudicar',
          count: rfqs,
          label: (n) => `${n} RFQ${n === 1 ? '' : 's'} en curso`,
          href: '/dilesa/compras/cotizaciones',
          modulo: 'dilesa.compras.cotizaciones',
        },
        {
          key: 'enviar',
          count: ocsBorrador,
          label: (n) => `${n} orden${n === 1 ? '' : 'es'} en borrador`,
          href: '/dilesa/compras',
          modulo: 'dilesa.compras.ordenes',
        },
        {
          key: 'recibir',
          count: ocsRecibir,
          label: (n) => `${n} orden${n === 1 ? '' : 'es'} por recibir`,
          href: '/dilesa/compras/recepciones',
          modulo: 'dilesa.compras.recepciones',
        },
        {
          key: 'programar',
          count: factsProgramar,
          label: (n) => `${n} factura${n === 1 ? '' : 's'} por programar`,
          href: `/${empresa}/cxp/programacion`,
          modulo: `${empresa}.cxp.programacion`,
        },
        {
          key: 'aprobar',
          count: pagosAprobar,
          label: (n) => `${n} pago${n === 1 ? '' : 's'} por aprobar`,
          href: `/${empresa}/cxp/pagos`,
          modulo: `${empresa}.cxp.pagos`,
        },
        {
          key: 'presupuesto',
          count: cambiosProyectos.length,
          label: (n) => `${n} cambio${n === 1 ? '' : 's'} de presupuesto por autorizar`,
          href:
            cambiosUnicos.length === 1
              ? `/dilesa/proyectos/${cambiosUnicos[0]}/gasto`
              : '/dilesa/proyectos',
          modulo: null,
          direccion: true,
        },
      ]);
    })();
    return () => {
      activo = false;
    };
  }, [empresaId, empresa]);

  const visibles = chips.filter((c) => {
    if (c.count === 0) return false;
    if (c.direccion) return esDireccion;
    return (
      permissions.isAdmin || (c.modulo != null && permissions.modulos.get(c.modulo)?.write === true)
    );
  });
  if (visibles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
        <ListChecks className="h-3.5 w-3.5" /> Te toca
      </span>
      {visibles.map((c) => (
        <a
          key={c.key}
          href={c.href}
          className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs font-medium text-[var(--text)]/80 hover:border-[var(--accent)]/50 hover:text-[var(--text)]"
        >
          {c.label(c.count)}
        </a>
      ))}
    </div>
  );
}

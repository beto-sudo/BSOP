'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA.
 */

/**
 * Hook de datos para el reporte «Unidades escriturables» (ADR-047).
 * Universo candidato = inventario vendible + unidades de ventas activas sin
 * escriturar; la obra terminada sale de `dilesa.construccion`. Espejo del
 * loader server (`escriturables-data-server`).
 */
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  normalizarEscriturables,
  OBRAS_SELECT,
  UNIDADES_ESCRITURABLES_SELECT,
  VENTAS_CANDIDATAS_SELECT,
  type EscriturablesBundle,
  type ObraRaw,
  type UnidadEscriturableRaw,
  type UnidadEscriturableRow,
  type VentaCandidataRaw,
} from '@/lib/dilesa/reportes/escriturables-data';

export function useEscriturablesReporte() {
  const [unidades, setUnidades] = useState<UnidadEscriturableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    const [unsRes, ventasRes, obrasRes, prjRes, prodRes, personasRes, antiguedadRes] =
      await Promise.all([
        sb
          .schema('dilesa')
          .from('unidades')
          .select(UNIDADES_ESCRITURABLES_SELECT)
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .is('deleted_at', null)
          .eq('es_muestra', false),
        sb
          .schema('dilesa')
          .from('ventas')
          .select(VENTAS_CANDIDATAS_SELECT)
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .is('deleted_at', null)
          .eq('estado', 'activa')
          .is('numero_escritura', null),
        sb
          .schema('dilesa')
          .from('construccion')
          .select(OBRAS_SELECT)
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .is('deleted_at', null),
        sb
          .schema('dilesa')
          .from('proyectos')
          .select('id, nombre')
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .is('deleted_at', null),
        sb
          .schema('dilesa')
          .from('productos')
          .select('id, nombre')
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .is('deleted_at', null),
        sb
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno, apellido_materno')
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .eq('tipo', 'cliente'),
        sb.schema('dilesa').rpc('fn_ventas_lista_antiguedad', { p_empresa: DILESA_EMPRESA_ID }),
      ]);

    const firstErr =
      unsRes.error ??
      ventasRes.error ??
      obrasRes.error ??
      prjRes.error ??
      prodRes.error ??
      personasRes.error;
    if (firstErr) {
      setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el reporte.'));
      setUnidades([]);
      setLoading(false);
      return;
    }

    const clientes = new Map<string, string>();
    for (const p of personasRes.data ?? []) {
      const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
      clientes.set(p.id as string, nombre || '(sin nombre)');
    }

    const diasEnFase = new Map<string, number>();
    for (const a of antiguedadRes.data ?? []) {
      if (a.dias_en_fase != null) diasEnFase.set(a.venta_id as string, a.dias_en_fase as number);
    }

    // Vendedores: FK a core.usuarios de las ventas candidatas (round-trip
    // extra porque depende del resultado de ventas). `.in` con lista vacía
    // regresa cero filas sin error.
    const ventasArr = (ventasRes.data ?? []) as VentaCandidataRaw[];
    const vendedorIds = [
      ...new Set(ventasArr.map((v) => v.vendedor_usuario_id).filter((x): x is string => !!x)),
    ];
    const usuariosRes = await sb
      .schema('core')
      .from('usuarios')
      .select('id, first_name, last_name, email')
      .in('id', vendedorIds);
    const vendedores = new Map<string, string>();
    for (const u of usuariosRes.data ?? []) {
      const nombre = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
      vendedores.set(u.id as string, nombre || ((u.email as string | null) ?? ''));
    }

    setUnidades(
      normalizarEscriturables({
        unidades: (unsRes.data ?? []) as UnidadEscriturableRaw[],
        ventas: ventasArr,
        obras: (obrasRes.data ?? []) as ObraRaw[],
        proyectos: (prjRes.data ?? []) as EscriturablesBundle['proyectos'],
        productos: (prodRes.data ?? []) as EscriturablesBundle['productos'],
        clientes,
        vendedores,
        diasEnFase,
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { unidades, loading, error, recargar };
}

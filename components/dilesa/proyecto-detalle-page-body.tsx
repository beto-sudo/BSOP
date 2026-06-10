'use client';

/**
 * Body compartido de los tabs del detalle de proyecto (fase 3 de
 * `dilesa-flujo-gasto`). Cada page del detalle (Resumen / Unidades / Obras /
 * Checklist) lo monta con su `seccion`; el fetch del proyecto vive aquí una
 * sola vez. El header del proyecto vive en la banda del layout.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  ProyectoDetalle,
  type ProyectoDetalle as ProyectoDetalleType,
  type ProyectoDetalleSeccion,
  PROYECTO_DETALLE_COLUMNAS,
} from '@/components/dilesa/proyecto-detalle';

export function ProyectoDetallePageBody({ seccion }: { seccion: ProyectoDetalleSeccion }) {
  const { id } = useParams<{ id: string }>();
  const [proyecto, setProyecto] = useState<ProyectoDetalleType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    void createSupabaseBrowserClient()
      .schema('dilesa')
      .from('proyectos')
      .select(PROYECTO_DETALLE_COLUMNAS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo) return;
        if (!data) setNotFound(true);
        else setProyecto(data as unknown as ProyectoDetalleType);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [id]);

  return (
    <div>
      {loading && <p className="p-6 text-sm text-[var(--text)]/60">Cargando proyecto…</p>}
      {notFound && (
        <p className="p-6 text-sm text-red-600/80">
          No se encontró el proyecto. Probablemente fue eliminado.
        </p>
      )}
      {!loading && !notFound && proyecto && (
        <ProyectoDetalle proyecto={proyecto} seccion={seccion} />
      )}
    </div>
  );
}

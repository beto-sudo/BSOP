'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  ProyectoDetalle,
  type ProyectoDetalle as ProyectoDetalleType,
  PROYECTO_DETALLE_COLUMNAS,
} from '@/components/dilesa/proyecto-detalle';

/**
 * @module Proyectos · Detalle (DILESA)
 * @responsive desktop-only
 *
 * Iniciativa `dilesa-drawers-a-paginas` Sprint 1. Antes vivía como
 * side drawer (`<ProyectoDetailDrawer>`); ahora es página completa
 * con layout scroll-largo (decisión 3 de Beto).
 *
 * El sub-slug RBAC es `dilesa.proyectos.activos` (el detalle
 * pertenece a la misma tab del listado). Anteproyectos tienen su
 * propia ruta `/dilesa/proyectos/anteproyectos/[id]`.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proyectos.activos">
      <DesktopOnlyNotice module="Proyecto" />
      <div className="hidden sm:block">
        <Body />
      </div>
    </RequireAccess>
  );
}

function Body() {
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
      {/* El "Volver a proyectos" + tabs viven en el layout del detalle (S2 dilesa-flujo-gasto). */}
      {loading && <p className="p-6 text-sm text-[var(--text)]/60">Cargando proyecto…</p>}
      {notFound && (
        <p className="p-6 text-sm text-red-600/80">
          No se encontró el proyecto. Probablemente fue eliminado.
        </p>
      )}
      {!loading && !notFound && proyecto && <ProyectoDetalle proyecto={proyecto} />}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { AnteproyectoDetalle } from '@/components/dilesa/anteproyecto-detalle';
import type { ProyectoDetalle as ProyectoDetalleType } from '@/components/dilesa/proyecto-detalle';

/**
 * @module Proyectos · Anteproyectos · Detalle (DILESA)
 * @responsive desktop-only
 *
 * Iniciativa `dilesa-drawers-a-paginas` Sprint 1. Antes vivía como
 * side drawer (`<AnteproyectoDetailDrawer>`); ahora es página completa
 * con layout scroll-largo. Hereda el sub-slug
 * `dilesa.proyectos.anteproyectos` del listado padre.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proyectos.anteproyectos">
      <DesktopOnlyNotice module="Anteproyecto" />
      <div className="hidden sm:block">
        <Body />
      </div>
    </RequireAccess>
  );
}

function Body() {
  const { id } = useParams<{ id: string }>();
  const [anteproyecto, setAnteproyecto] = useState<ProyectoDetalleType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    void createSupabaseBrowserClient()
      .schema('dilesa')
      .from('proyectos')
      .select(
        'id, tipo, nombre, estado, clave_interna, proyecto_padre_id, proyecto_predecesor_id, fecha_inicio, fecha_fin_estimada, fecha_licencia, area_m2, area_vendible_m2, areas_verdes_m2, lotes_proyectados, presupuesto_estimado, costo_terreno, costo_urbanizacion, costo_construccion, costo_comercializacion, notas, plano_oficial_url, image_url, acreditacion_escritura, objetivo_trimestral'
      )
      .eq('id', id)
      .eq('tipo', 'anteproyecto')
      .is('deleted_at', null)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo) return;
        if (!data) setNotFound(true);
        else setAnteproyecto(data as unknown as ProyectoDetalleType);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [id]);

  return (
    <div>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <Link
          href="/dilesa/proyectos/anteproyectos"
          className="inline-flex items-center gap-1 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a anteproyectos
        </Link>
      </div>
      {loading && <p className="p-6 text-sm text-[var(--text)]/60">Cargando anteproyecto…</p>}
      {notFound && (
        <p className="p-6 text-sm text-red-600/80">
          No se encontró el anteproyecto. Probablemente fue eliminado o convertido.
        </p>
      )}
      {!loading && !notFound && anteproyecto && <AnteproyectoDetalle anteproyecto={anteproyecto} />}
    </div>
  );
}

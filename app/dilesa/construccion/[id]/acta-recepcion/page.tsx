'use client';

/**
 * Acta de recepción de obra — formato EN BLANCO imprimible (formato "CHECK LIST
 * PRE-ENTREGA VIVIENDA" de DILESA). Se imprime ANTES del recorrido para llegar
 * con la hoja lista; Atención a Clientes la marca a mano en campo, se firma
 * (Supervisor de Obra · Contratista · Atención a Clientes/EVAP) y el escaneado
 * se sube en el drawer de recepción (carga obligatoria = gate del cierre).
 *
 * Iniciativa dilesa-atencion-clientes S4 (recepción papel-primero).
 */

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { PrintLayout } from '@/components/print';
import { useTriggerPrint } from '@/components/print/use-trigger-print';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { RECEPCION_CHECKLIST } from '@/lib/dilesa/recepcion-checklist';

type Datos = {
  codigo: string;
  proyecto: string | null;
  unidad: string | null;
  contratista: string | null;
  supervisor: string | null;
  fechaProgramada: string | null;
};

/** Casilla vacía para marcar a mano (☐ C / O / N/A). */
function Casilla({ letra }: { letra: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-3 w-3 border border-black align-middle" />
      <span>{letra}</span>
    </span>
  );
}

export default function ActaRecepcionPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.recepcion">
      <ActaInner />
    </RequireAccess>
  );
}

function ActaInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const triggerPrint = useTriggerPrint();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data: obra } = await sb
        .schema('dilesa')
        .from('construccion')
        .select('codigo, unidad_id, producto_id, contratista_id, supervisor_persona_id')
        .eq('id', id)
        .maybeSingle();
      if (!activo || !obra) {
        setLoading(false);
        return;
      }
      const [uRes, contRes, supRes, recRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('unidades')
          .select('identificador, proyecto_id')
          .eq('id', obra.unidad_id)
          .maybeSingle(),
        sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno')
          .eq('id', obra.contratista_id)
          .maybeSingle(),
        obra.supervisor_persona_id
          ? sb
              .schema('erp')
              .from('personas')
              .select('nombre, apellido_paterno, apellido_materno')
              .eq('id', obra.supervisor_persona_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        sb
          .schema('dilesa')
          .from('recepcion_obra')
          .select('fecha_programada')
          .eq('construccion_id', id)
          .is('deleted_at', null)
          .maybeSingle(),
      ]);
      if (!activo) return;

      let proyecto: string | null = null;
      if (uRes.data?.proyecto_id) {
        const { data: prj } = await sb
          .schema('dilesa')
          .from('proyectos')
          .select('nombre')
          .eq('id', uRes.data.proyecto_id)
          .maybeSingle();
        proyecto = (prj?.nombre as string | null) ?? null;
      }
      const nombre = (
        p: {
          nombre?: string | null;
          apellido_paterno?: string | null;
          apellido_materno?: string | null;
        } | null
      ) =>
        p
          ? [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') || null
          : null;

      setDatos({
        codigo: obra.codigo as string,
        proyecto,
        unidad: (uRes.data?.identificador as string | null) ?? null,
        contratista: nombre(contRes.data),
        supervisor: nombre(supRes.data),
        fechaProgramada: (recRes.data?.fecha_programada as string | null) ?? null,
      });
      setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!datos) {
    return <div className="container mx-auto max-w-3xl px-4 py-6 text-sm">Acta no encontrada.</div>;
  }

  return (
    <div className="container mx-auto max-w-[8.5in] px-4 py-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold text-[var(--text)]">
          Acta de recepción de obra (formato en blanco)
        </h1>
        <Button onClick={triggerPrint}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir
        </Button>
      </div>

      <PrintLayout
        size="letter"
        header={<div className="text-right text-[10px]">DILESA · Acta de recepción de obra</div>}
      >
        <div className="space-y-4 p-2 text-black">
          <div className="border-b-2 border-black pb-2 text-center">
            <div className="text-base font-bold">
              DESARROLLO INMOBILIARIO LOS ENCINOS, S.A. DE C.V.
            </div>
            <div className="text-sm font-semibold">CHECK LIST PRE-ENTREGA VIVIENDA</div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div>
              <span className="font-semibold">Fraccionamiento:</span> {datos.proyecto ?? '—'}
            </div>
            <div>
              <span className="font-semibold">Unidad:</span> {datos.unidad ?? datos.codigo}
            </div>
            <div>
              <span className="font-semibold">Contratista:</span> {datos.contratista ?? '—'}
            </div>
            <div>
              <span className="font-semibold">Entidad:</span> Piedras Negras, Coah.
            </div>
            <div>
              <span className="font-semibold">Fecha programada:</span>{' '}
              {datos.fechaProgramada ?? '—'}
            </div>
            <div>
              <span className="font-semibold">Fecha de recepción:</span>{' '}
              <span className="inline-block w-32 border-b border-black" />
            </div>
          </div>

          <p className="text-[10px] italic text-neutral-600">
            Marque cada punto: <span className="font-semibold">C</span> = Cumple ·{' '}
            <span className="font-semibold">O</span> = Con observación ·{' '}
            <span className="font-semibold">N/A</span> = No aplica. Anote el detalle/ubicación del
            daño en la columna de observaciones.
          </p>

          {RECEPCION_CHECKLIST.map((sec) => (
            <div key={sec.clave} className="break-inside-avoid">
              <div className="mb-1 flex items-center justify-between bg-neutral-200 px-2 py-1 text-xs font-bold uppercase">
                <span>{sec.titulo}</span>
                {sec.opcional ? (
                  <span className="text-[10px] font-normal normal-case">
                    <span className="mr-1 inline-block h-3 w-3 border border-black align-middle" />
                    No aplica (1 planta)
                  </span>
                ) : null}
              </div>
              <table className="w-full border-collapse text-[11px]">
                <tbody>
                  {sec.items.map((item) => (
                    <tr key={item.clave} className="border-b border-neutral-300">
                      <td className="w-1/2 py-1.5 pr-2 align-top">{item.etiqueta}</td>
                      <td className="w-28 py-1.5 align-top">
                        <div className="flex gap-2">
                          <Casilla letra="C" />
                          <Casilla letra="O" />
                          <Casilla letra="N/A" />
                        </div>
                      </td>
                      <td className="py-1.5 align-top">
                        <span className="block w-full border-b border-neutral-400">&nbsp;</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div className="space-y-1 text-xs break-inside-avoid">
            <span className="font-semibold">Observaciones no contempladas en el checklist:</span>
            <span className="block w-full border-b border-black">&nbsp;</span>
            <span className="block w-full border-b border-black">&nbsp;</span>
          </div>

          <div className="grid grid-cols-3 gap-6 pt-10 text-center text-[11px]">
            {[
              { rol: 'Supervisor de Obra', nombre: datos.supervisor },
              { rol: 'Contratista', nombre: datos.contratista },
              { rol: 'Atención a Clientes (EVAP)', nombre: null },
            ].map((f) => (
              <div key={f.rol}>
                <div className="mt-8 border-t border-black pt-1">{f.nombre ?? ' '}</div>
                <div className="font-semibold">{f.rol}</div>
                <div className="text-[10px] text-neutral-500">Nombre y firma</div>
              </div>
            ))}
          </div>
        </div>
      </PrintLayout>
    </div>
  );
}

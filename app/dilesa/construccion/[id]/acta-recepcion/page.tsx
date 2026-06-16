'use client';

 

/**
 * Acta de recepción de obra — vista imprimible (formato "CHECK LIST PRE-ENTREGA
 * VIVIENDA" de DILESA, LLENA con lo capturado). Se imprime, se firma
 * (Supervisor de Obra · Contratista · Atención a Clientes/EVAP) y el escaneado
 * se sube en el drawer de recepción. Iniciativa dilesa-atencion-clientes S1d.
 */

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { PrintLayout } from '@/components/print';
import { useTriggerPrint } from '@/components/print/use-trigger-print';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  RECEPCION_CHECKLIST,
  RECEPCION_ITEM_ESTADO_LABEL,
  type RecepcionChecklistRespuesta,
  type RecepcionItemEstado,
} from '@/lib/dilesa/recepcion-checklist';

type Datos = {
  codigo: string;
  proyecto: string | null;
  unidad: string | null;
  contratista: string | null;
  supervisor: string | null;
  fechaRecepcion: string | null;
  fechaProgramada: string | null;
  notas: string | null;
  respuestas: Map<string, RecepcionChecklistRespuesta>;
};

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
          .select('checklist, notas, fecha_recepcion, fecha_programada')
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

      const respuestas = new Map<string, RecepcionChecklistRespuesta>();
      for (const r of (recRes.data?.checklist ?? []) as RecepcionChecklistRespuesta[]) {
        respuestas.set(r.clave, r);
      }

      setDatos({
        codigo: obra.codigo as string,
        proyecto,
        unidad: (uRes.data?.identificador as string | null) ?? null,
        contratista: nombre(contRes.data),
        supervisor: nombre(supRes.data),
        fechaRecepcion: (recRes.data?.fecha_recepcion as string | null) ?? null,
        fechaProgramada: (recRes.data?.fecha_programada as string | null) ?? null,
        notas: (recRes.data?.notas as string | null) ?? null,
        respuestas,
      });
      setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, [id]);

  const estadoColor: Record<RecepcionItemEstado, string> = useMemo(
    () => ({ cumple: 'text-emerald-700', observacion: 'text-amber-700', na: 'text-neutral-400' }),
    []
  );

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
        <h1 className="text-lg font-semibold text-[var(--text)]">Acta de recepción de obra</h1>
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
              {datos.fechaRecepcion ?? '—'}
            </div>
          </div>

          {RECEPCION_CHECKLIST.map((sec) => (
            <div key={sec.clave} className="break-inside-avoid">
              <div className="mb-1 bg-neutral-200 px-2 py-1 text-xs font-bold uppercase">
                {sec.titulo}
              </div>
              <table className="w-full border-collapse text-[11px]">
                <tbody>
                  {sec.items.map((item) => {
                    const r = datos.respuestas.get(item.clave);
                    const est = r?.estado ?? 'cumple';
                    return (
                      <tr key={item.clave} className="border-b border-neutral-300">
                        <td className="w-1/2 py-1 pr-2">{item.etiqueta}</td>
                        <td className={`w-24 py-1 font-semibold ${estadoColor[est]}`}>
                          {RECEPCION_ITEM_ESTADO_LABEL[est]}
                        </td>
                        <td className="py-1 text-neutral-600">{r?.nota ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {datos.notas ? (
            <div className="text-xs">
              <span className="font-semibold">Observaciones no contempladas:</span> {datos.notas}
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-6 pt-10 text-center text-[11px]">
            {[
              { rol: 'Supervisor de Obra', nombre: datos.supervisor },
              { rol: 'Contratista', nombre: datos.contratista },
              { rol: 'Atención a Clientes (EVAP)', nombre: null },
            ].map((f) => (
              <div key={f.rol}>
                <div className="mt-8 border-t border-black pt-1">{f.nombre ?? ' '}</div>
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

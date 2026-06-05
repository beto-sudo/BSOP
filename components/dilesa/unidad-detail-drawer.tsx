'use client';

/**
 * UnidadDetailDrawer — ficha de lectura de una unidad de DILESA.
 *
 * Iniciativa dilesa-portafolio-activos. Drill-down reusable: se abre con
 * `onRowClick` desde el Inventario de ventas, la tabla de unidades del
 * proyecto, etc. Autocontenido — fetchea todo por `unidadId` al abrir, así
 * el caller solo pasa el id (no depende de qué columnas trae su tabla).
 *
 * Lectura por ahora. La edición/captura es un entregable posterior.
 */

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
  DetailDrawerSkeleton,
} from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import { ACTIVO_MODALIDAD_LABEL, ACTIVO_TIPO_LABEL } from '@/lib/dilesa/portafolio';

type UnidadFull = {
  id: string;
  identificador: string;
  estado: string;
  tipo_lote: string | null;
  area_m2: number | null;
  m2_construccion: number | null;
  precio: number | null;
  manzana: string | null;
  numero_lote: string | null;
  calle: string | null;
  numero_oficial: string | null;
  es_esquina: boolean | null;
  tiene_frente_verde: boolean | null;
  es_muestra: boolean;
  activo_id: string | null;
  proyecto_id: string;
  producto_id: string | null;
};

type ActivoLite = { id: string; nombre: string; tipo: string; modalidad: string | null };
type VentaLite = {
  id: string;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  fecha_escritura: string | null;
  persona_nombre: string | null;
};

type Cargado = {
  unidad: UnidadFull;
  proyectoNombre: string | null;
  prototipo: string | null;
  activo: ActivoLite | null;
  precioCalculado: number | null;
  venta: VentaLite | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  planeada: 'neutral',
  lote_urbanizado: 'neutral',
  en_construccion: 'warning',
  terminada: 'info',
  asignada: 'warning',
  vendida: 'success',
  escriturada: 'success',
  entregada: 'success',
};

const ESTADO_LABEL: Record<string, string> = {
  planeada: 'Planeada',
  lote_urbanizado: 'Lote urbanizado',
  en_construccion: 'En construcción',
  terminada: 'Terminada',
  asignada: 'Asignada',
  vendida: 'Vendida',
  escriturada: 'Escriturada',
  entregada: 'Entregada',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-[var(--text)]/60">{label}</span>
      <span className="text-right font-medium text-[var(--text)]">{value ?? '—'}</span>
    </div>
  );
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function UnidadDetailDrawer({
  unidadId,
  open,
  onOpenChange,
}: {
  unidadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<Cargado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !unidadId) return;
    let activo = true;

    void (async () => {
      setLoading(true);
      setError(null);
      setData(null);
      const sb = createSupabaseBrowserClient();
      const { data: u, error: uErr } = await sb
        .schema('dilesa')
        .from('unidades')
        .select(
          'id, identificador, estado, tipo_lote, area_m2, m2_construccion, precio, manzana, numero_lote, calle, numero_oficial, es_esquina, tiene_frente_verde, es_muestra, activo_id, proyecto_id, producto_id'
        )
        .eq('id', unidadId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!activo) return;
      if (uErr || !u) {
        setError(getSupabaseErrorMessage(uErr, 'No se pudo cargar la unidad.'));
        setLoading(false);
        return;
      }
      const unidad = u as UnidadFull;

      // Lookups en paralelo: proyecto, prototipo, activo de portafolio, precio
      // calculado, venta. Cada uno degrada a null si falla — la ficha se
      // muestra igual con lo que sí cargó.
      const [prjRes, protoRes, activoRes, precioRes, ventaRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('proyectos')
          .select('nombre')
          .eq('id', unidad.proyecto_id)
          .maybeSingle(),
        unidad.producto_id
          ? sb
              .schema('dilesa')
              .from('productos')
              .select('nombre')
              .eq('id', unidad.producto_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        unidad.activo_id
          ? sb
              .schema('dilesa')
              .from('activos')
              .select('id, nombre, tipo, modalidad')
              .eq('id', unidad.activo_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        sb.schema('dilesa').rpc('fn_calcular_precio_venta', { p_unidad_id: unidad.id }),
        sb
          .schema('dilesa')
          .from('ventas')
          .select(
            'id, valor_escrituracion, valor_comercial, fecha_escritura, persona_id, created_at'
          )
          .eq('unidad_id', unidad.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!activo) return;

      const precioJson = precioRes.data as { precio_venta_total?: number; error?: string } | null;
      const precioCalculado =
        precioJson && !precioJson.error ? (precioJson.precio_venta_total ?? null) : null;

      // Venta + nombre del cliente (cross-schema erp.personas → query aparte).
      let venta: VentaLite | null = null;
      const v = ventaRes.data as {
        id: string;
        valor_escrituracion: number | null;
        valor_comercial: number | null;
        fecha_escritura: string | null;
        persona_id: string | null;
      } | null;
      if (v) {
        let personaNombre: string | null = null;
        if (v.persona_id) {
          const { data: per } = await sb
            .schema('erp')
            .from('personas')
            .select('nombre, apellido_paterno, apellido_materno')
            .eq('id', v.persona_id)
            .maybeSingle();
          const p = per as {
            nombre?: string;
            apellido_paterno?: string | null;
            apellido_materno?: string | null;
          } | null;
          personaNombre = p
            ? [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') || null
            : null;
        }
        venta = {
          id: v.id,
          valor_escrituracion: v.valor_escrituracion,
          valor_comercial: v.valor_comercial,
          fecha_escritura: v.fecha_escritura,
          persona_nombre: personaNombre,
        };
      }

      if (!activo) return;
      setData({
        unidad,
        proyectoNombre: (prjRes.data as { nombre?: string } | null)?.nombre ?? null,
        prototipo: (protoRes.data as { nombre?: string } | null)?.nombre ?? null,
        activo: (activoRes.data as ActivoLite | null) ?? null,
        precioCalculado,
        venta,
      });
      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [open, unidadId]);

  const u = data?.unidad;
  const ubicacion = u
    ? [u.calle, u.numero_oficial].filter(Boolean).join(' ') ||
      [u.manzana ? `Mz ${u.manzana}` : null, u.numero_lote ? `Lote ${u.numero_lote}` : null]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={u ? u.identificador : 'Unidad'}
      description={data?.proyectoNombre ?? undefined}
      meta={
        u ? (
          <>
            <Badge tone={ESTADO_TONE[u.estado] ?? 'neutral'}>
              {ESTADO_LABEL[u.estado] ?? u.estado}
            </Badge>
            {u.es_muestra ? <Badge tone="accent">Casa muestra</Badge> : null}
            {u.activo_id ? <Badge tone="info">En portafolio</Badge> : null}
          </>
        ) : null
      }
    >
      <DetailDrawerContent>
        {loading ? (
          <DetailDrawerSkeleton />
        ) : error ? (
          <p className="py-4 text-sm text-[var(--danger)]">{error}</p>
        ) : u ? (
          <>
            <DetailDrawerSection title="Identificación" divider={false}>
              <Field label="Proyecto" value={data?.proyectoNombre} />
              <Field label="Prototipo" value={data?.prototipo} />
              <Field label="Tipo de lote" value={u.tipo_lote} />
              <Field label="Ubicación" value={ubicacion || '—'} />
              {u.manzana || u.numero_lote ? (
                <Field
                  label="Manzana / Lote"
                  value={`${u.manzana ?? '—'} / ${u.numero_lote ?? '—'}`}
                />
              ) : null}
            </DetailDrawerSection>

            <DetailDrawerSection title="Medidas y características">
              <Field
                label="Superficie del lote"
                value={u.area_m2 != null ? `${u.area_m2.toFixed(2)} m²` : '—'}
              />
              <Field
                label="m² de construcción"
                value={u.m2_construccion != null ? `${u.m2_construccion.toFixed(2)} m²` : '—'}
              />
              <Field
                label="Características"
                value={
                  <span className="inline-flex flex-wrap justify-end gap-1">
                    {u.es_esquina ? <Badge tone="info">Esquina</Badge> : null}
                    {u.tiene_frente_verde ? <Badge tone="success">Frente verde</Badge> : null}
                    {!u.es_esquina && !u.tiene_frente_verde ? '—' : null}
                  </span>
                }
              />
            </DetailDrawerSection>

            <DetailDrawerSection title="Precio">
              <Field
                label="Precio calculado (sin crédito)"
                value={data?.precioCalculado != null ? formatCurrency(data.precioCalculado) : '—'}
              />
              <Field
                label="Precio en el registro"
                value={u.precio != null ? formatCurrency(u.precio) : '—'}
              />
            </DetailDrawerSection>

            {data?.activo ? (
              <DetailDrawerSection title="Portafolio de activos">
                <Field label="Activo" value={data.activo.nombre} />
                <Field
                  label="Tipo"
                  value={ACTIVO_TIPO_LABEL[data.activo.tipo as never] ?? data.activo.tipo}
                />
                <Field
                  label="Destino"
                  value={
                    data.activo.modalidad
                      ? (ACTIVO_MODALIDAD_LABEL[data.activo.modalidad as never] ??
                        data.activo.modalidad)
                      : '—'
                  }
                />
                <p className="pt-1 text-xs text-[var(--text)]/50">
                  Esta unidad fue liberada al portafolio: no aparece en el inventario de ventas.
                </p>
              </DetailDrawerSection>
            ) : null}

            {data?.venta ? (
              <DetailDrawerSection title="Venta">
                <Field label="Cliente" value={data.venta.persona_nombre} />
                <Field label="Fecha de escritura" value={fmtFecha(data.venta.fecha_escritura)} />
                <Field
                  label="Valor de escrituración"
                  value={
                    data.venta.valor_escrituracion != null
                      ? formatCurrency(data.venta.valor_escrituracion)
                      : data.venta.valor_comercial != null
                        ? formatCurrency(data.venta.valor_comercial)
                        : '—'
                  }
                />
              </DetailDrawerSection>
            ) : null}
          </>
        ) : null}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

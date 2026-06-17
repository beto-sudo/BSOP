'use client';

/**
 * ActivoDetailDrawer — ficha de lectura de un activo del portafolio DILESA.
 *
 * Iniciativa dilesa-portafolio-activos. Drill-down reusable desde el módulo
 * Portafolio. Muestra el master `dilesa.activos` + su satélite por tipo
 * (`activo_<tipo>`) + la unidad/proyecto de ORIGEN cuando el activo se liberó
 * desde un fraccionamiento. Autocontenido — fetchea por `activoId` al abrir.
 *
 * Lectura por ahora; la edición/captura es un entregable posterior.
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
import { Button } from '@/components/ui/button';
import { useEffectiveUser } from '@/components/providers';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { regresarUnidadAlProyecto } from '@/app/dilesa/proyectos/actions';
import { ACTIVO_TIPO_LABEL } from '@/lib/dilesa/portafolio';

type ActivoFull = {
  id: string;
  tipo: string;
  nombre: string;
  estado: string;
  /** Destino del portafolio (catálogo `portafolio_destinos`), vía embed. */
  destino: { label: string } | null;
  clave_interna: string | null;
  municipio: string | null;
  estado_geo: string | null;
  direccion_referencia: string | null;
  area_m2: number | null;
  valor_estimado: number | null;
  situacion_legal: string | null;
  numero_escritura: string | null;
  clave_catastral: string | null;
  notas: string | null;
};

type Origen = {
  id: string;
  identificador: string;
  estado: string;
  proyectoNombre: string | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  prospecto: 'neutral',
  adquirido: 'info',
  operando: 'success',
  en_intervencion: 'warning',
  desincorporado: 'danger',
  descartado: 'neutral',
};

const ESTADO_LABEL: Record<string, string> = {
  prospecto: 'Prospecto',
  adquirido: 'Adquirido',
  operando: 'Operando',
  en_intervencion: 'En intervención',
  desincorporado: 'Desincorporado',
  descartado: 'Descartado',
};

/** Campos de metadata que no se muestran en el bloque genérico del satélite. */
const SAT_OMIT = new Set([
  'id',
  'activo_id',
  'empresa_id',
  'created_at',
  'updated_at',
  'deleted_at',
]);

const SAT_LABEL: Record<string, string> = {
  recamaras: 'Recámaras',
  banos: 'Baños',
  m2_construccion: 'm² construcción',
  m2_terreno: 'm² terreno',
  niveles: 'Niveles',
  cochera_autos: 'Cochera (autos)',
  ano_construccion: 'Año de construcción',
  estado_conservacion: 'Conservación',
  manzana: 'Manzana',
  numero_lote: 'Número de lote',
  condicion: 'Condición',
  frente_m: 'Frente (m)',
  fondo_m: 'Fondo (m)',
  m2_rentable: 'm² rentable',
  planta: 'Planta',
  giro_permitido: 'Giro permitido',
  tiene_bodega: 'Tiene bodega',
  uso_suelo: 'Uso de suelo',
  zonificacion: 'Zonificación',
  notas: 'Notas',
};

function satLabel(k: string): string {
  return SAT_LABEL[k] ?? k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function fmtSatValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-[var(--text)]/60">{label}</span>
      <span className="text-right font-medium text-[var(--text)]">{value ?? '—'}</span>
    </div>
  );
}

export function ActivoDetailDrawer({
  activoId,
  activoTipo,
  open,
  onOpenChange,
  onChanged,
}: {
  activoId: string | null;
  /** Tipo del activo (de la fila) para resolver el satélite sin un round-trip extra. */
  activoTipo: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama tras regresar la unidad a ventas, para que el caller refresque. */
  onChanged?: () => void;
}) {
  const { data: effectiveUser } = useEffectiveUser();
  const isAdmin = !!effectiveUser?.isAdmin;
  const [activo, setActivo] = useState<ActivoFull | null>(null);
  const [satelite, setSatelite] = useState<Record<string, unknown> | null>(null);
  const [origen, setOrigen] = useState<Origen | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regresarOpen, setRegresarOpen] = useState(false);

  useEffect(() => {
    if (!open || !activoId) return;
    let vivo = true;

    void (async () => {
      setLoading(true);
      setError(null);
      setActivo(null);
      setSatelite(null);
      setOrigen(null);
      const sb = createSupabaseBrowserClient();
      const { data: a, error: aErr } = await sb
        .schema('dilesa')
        .from('activos')
        .select(
          'id, tipo, nombre, estado, destino:portafolio_destinos(label), clave_interna, municipio, estado_geo, direccion_referencia, area_m2, valor_estimado, situacion_legal, numero_escritura, clave_catastral, notas'
        )
        .eq('id', activoId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!vivo) return;
      if (aErr || !a) {
        setError(getSupabaseErrorMessage(aErr, 'No se pudo cargar el activo.'));
        setLoading(false);
        return;
      }
      const act = a as ActivoFull;
      setActivo(act);

      const tipo = activoTipo ?? act.tipo;
      // Satélite por tipo (tabla `activo_<tipo>`) + unidad de origen (la unidad
      // cuyo activo_id apunta a este activo). Ambos opcionales.
      const SAT_TIPOS = new Set([
        'casa',
        'lote',
        'local',
        'terreno',
        'departamento',
        'edificio',
        'nave',
        'plaza',
        'espectacular',
        'unipolar',
        'infraestructura',
      ]);
      const [satRes, uniRes] = await Promise.all([
        SAT_TIPOS.has(tipo)
          ? // El nombre real de la tabla satélite es dinámico (`activo_<tipo>`);
            // casteamos a un tipo de tabla satélite conocido para satisfacer el
            // overload de `.from()` — el resultado se lee genérico (Record).
            sb
              .schema('dilesa')
              .from(`activo_${tipo}` as 'activo_casa')
              .select('*')
              .eq('activo_id', activoId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        sb
          .schema('dilesa')
          .from('unidades')
          .select('id, identificador, estado, proyecto_id')
          .eq('activo_id', activoId)
          .is('deleted_at', null)
          .maybeSingle(),
      ]);

      if (!vivo) return;
      setSatelite((satRes.data as Record<string, unknown> | null) ?? null);

      const uni = uniRes.data as {
        id: string;
        identificador: string;
        estado: string;
        proyecto_id: string;
      } | null;
      if (uni) {
        const { data: prj } = await sb
          .schema('dilesa')
          .from('proyectos')
          .select('nombre')
          .eq('id', uni.proyecto_id)
          .maybeSingle();
        if (!vivo) return;
        setOrigen({
          id: uni.id,
          identificador: uni.identificador,
          estado: uni.estado,
          proyectoNombre: (prj as { nombre?: string } | null)?.nombre ?? null,
        });
      }
      setLoading(false);
    })();

    return () => {
      vivo = false;
    };
  }, [open, activoId, activoTipo]);

  const satEntries = satelite
    ? Object.entries(satelite).filter(([k, v]) => !SAT_OMIT.has(k) && v != null && v !== '')
    : [];

  const handleRegresar = async () => {
    if (!origen) return;
    const r = await regresarUnidadAlProyecto(origen.id);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onOpenChange(false);
    onChanged?.();
  };

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange}
        size="md"
        title={activo ? activo.nombre : 'Activo'}
        description={activo ? (ACTIVO_TIPO_LABEL[activo.tipo as never] ?? activo.tipo) : undefined}
        meta={
          activo ? (
            <>
              <Badge tone={ESTADO_TONE[activo.estado] ?? 'neutral'}>
                {ESTADO_LABEL[activo.estado] ?? activo.estado}
              </Badge>
              {activo.destino ? <Badge tone="accent">{activo.destino.label}</Badge> : null}
            </>
          ) : null
        }
        actions={
          isAdmin && origen ? (
            <Button size="sm" variant="outline" onClick={() => setRegresarOpen(true)}>
              Regresar a ventas
            </Button>
          ) : null
        }
      >
        <DetailDrawerContent>
          {loading ? (
            <DetailDrawerSkeleton />
          ) : error ? (
            <p className="py-4 text-sm text-[var(--danger)]">{error}</p>
          ) : activo ? (
            <>
              <DetailDrawerSection title="Identificación" divider={false}>
                <Field
                  label="Tipo"
                  value={ACTIVO_TIPO_LABEL[activo.tipo as never] ?? activo.tipo}
                />
                <Field label="Destino" value={activo.destino?.label ?? '—'} />
                <Field label="Clave interna" value={activo.clave_interna} />
              </DetailDrawerSection>

              <DetailDrawerSection title="Ubicación">
                <Field label="Municipio" value={activo.municipio} />
                <Field label="Estado" value={activo.estado_geo} />
                <Field label="Referencia" value={activo.direccion_referencia} />
                <Field
                  label="Superficie"
                  value={activo.area_m2 != null ? `${activo.area_m2.toFixed(2)} m²` : '—'}
                />
              </DetailDrawerSection>

              <DetailDrawerSection title="Valor y situación legal">
                <Field
                  label="Valor estimado"
                  value={
                    activo.valor_estimado != null ? formatCurrency(activo.valor_estimado) : '—'
                  }
                />
                <Field label="Situación legal" value={activo.situacion_legal} />
                <Field label="Número de escritura" value={activo.numero_escritura} />
                <Field label="Clave catastral" value={activo.clave_catastral} />
              </DetailDrawerSection>

              {satEntries.length > 0 ? (
                <DetailDrawerSection title="Detalle del inmueble">
                  {satEntries.map(([k, v]) => (
                    <Field key={k} label={satLabel(k)} value={fmtSatValue(v)} />
                  ))}
                </DetailDrawerSection>
              ) : null}

              {origen ? (
                <DetailDrawerSection title="Origen">
                  <Field label="Unidad" value={origen.identificador} />
                  <Field label="Proyecto" value={origen.proyectoNombre} />
                  <p className="pt-1 text-xs text-[var(--text)]/50">
                    Este activo se traspasó al portafolio desde una unidad del fraccionamiento.
                  </p>
                </DetailDrawerSection>
              ) : null}

              {activo.notas ? (
                <DetailDrawerSection title="Notas">
                  <p className="text-sm text-[var(--text)]/80">{activo.notas}</p>
                </DetailDrawerSection>
              ) : null}
            </>
          ) : null}
        </DetailDrawerContent>
      </DetailDrawer>

      {origen ? (
        <ConfirmDialog
          open={regresarOpen}
          onOpenChange={setRegresarOpen}
          onConfirm={handleRegresar}
          title="¿Regresar la unidad a ventas?"
          description={`${origen.identificador} saldrá del portafolio y volverá a estar disponible para el equipo de ventas del fraccionamiento.`}
          confirmLabel="Regresar a ventas"
          confirmVariant="default"
        />
      ) : null}
    </>
  );
}

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
import { FileAttachments } from '@/components/file-attachments';
import { regresarUnidadAlProyecto } from '@/app/dilesa/proyectos/actions';
import { ACTIVO_TIPO_LABEL, computeTerrenoSnapshot } from '@/lib/dilesa/portafolio';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { FileText, Image as ImageIcon, Map as MapIcon, MapPin, Paperclip } from 'lucide-react';

const ACTIVO_DOC_ROLES = [
  { id: 'plano', label: 'Plano', icon: <MapIcon className="h-3 w-3" /> },
  { id: 'escritura', label: 'Escritura', icon: <FileText className="h-3 w-3" /> },
  { id: 'kmz', label: 'KMZ / ubicación', icon: <MapPin className="h-3 w-3" /> },
  { id: 'foto', label: 'Foto', icon: <ImageIcon className="h-3 w-3" /> },
  { id: 'otro', label: 'Otro', icon: <Paperclip className="h-3 w-3" /> },
];

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
  /** Avance de obra de la unidad de origen (dilesa.construccion), si la hay. */
  obra: {
    avancePct: number | null;
    estado: string;
    fechaArranque: string | null;
    fechaTerminada: string | null;
  } | null;
};

const OBRA_ESTADO_LABEL: Record<string, string> = {
  arrancada: 'Arrancada',
  en_progreso: 'En progreso',
  terminada: 'Terminada',
  suspendida: 'Suspendida',
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
  onEdit,
}: {
  activoId: string | null;
  /** Tipo del activo (de la fila) para resolver el satélite sin un round-trip extra. */
  activoTipo: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama tras regresar la unidad a ventas, para que el caller refresque. */
  onChanged?: () => void;
  /** Si se provee (admin/Dirección), muestra el botón Editar → abre el form de captura. */
  onEdit?: (activoId: string) => void;
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
        // Proyecto + avance de obra (dilesa.construccion) de la unidad de origen.
        // Una casa liberada en construcción muestra su % de obra en el portafolio.
        const [prjRes, obraRes] = await Promise.all([
          sb
            .schema('dilesa')
            .from('proyectos')
            .select('nombre')
            .eq('id', uni.proyecto_id)
            .maybeSingle(),
          sb
            .schema('dilesa')
            .from('construccion')
            .select('avance_pct, estado, fecha_arranque, fecha_terminada')
            .eq('unidad_id', uni.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (!vivo) return;
        const obra = obraRes.data as {
          avance_pct: number | null;
          estado: string;
          fecha_arranque: string | null;
          fecha_terminada: string | null;
        } | null;
        setOrigen({
          id: uni.id,
          identificador: uni.identificador,
          estado: uni.estado,
          proyectoNombre: (prjRes.data as { nombre?: string } | null)?.nombre ?? null,
          obra: obra
            ? {
                avancePct: obra.avance_pct,
                estado: obra.estado,
                fechaArranque: obra.fecha_arranque,
                fechaTerminada: obra.fecha_terminada,
              }
            : null,
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

  // Snapshot financiero de compra (solo terrenos con datos de negociación).
  const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const compra =
    activo?.tipo === 'terreno' && satelite
      ? computeTerrenoSnapshot({
          areaM2: activo.area_m2,
          areasAfectacionM2: numOrNull(satelite.areas_afectacion_m2),
          precioSolicitadoM2: numOrNull(satelite.precio_solicitado_m2),
          precioOfertadoM2: numOrNull(satelite.precio_ofertado_m2),
          valorObjetivoCompra: numOrNull(satelite.valor_objetivo_compra),
        })
      : null;

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
          <>
            {onEdit && activoId ? (
              <Button size="sm" variant="outline" onClick={() => onEdit(activoId)}>
                Editar
              </Button>
            ) : null}
            {isAdmin && origen ? (
              <Button size="sm" variant="outline" onClick={() => setRegresarOpen(true)}>
                Regresar a ventas
              </Button>
            ) : null}
          </>
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

              {compra ? (
                <DetailDrawerSection title="Análisis de compra">
                  <Field
                    label="Área aprovechable"
                    value={
                      compra.aprovechableM2 != null ? `${compra.aprovechableM2.toFixed(2)} m²` : '—'
                    }
                  />
                  <Field
                    label="Valor solicitado"
                    value={
                      compra.valorSolicitado != null ? formatCurrency(compra.valorSolicitado) : '—'
                    }
                  />
                  <Field
                    label="Valor ofertado"
                    value={
                      compra.valorOfertado != null ? formatCurrency(compra.valorOfertado) : '—'
                    }
                  />
                  <Field
                    label="$/m² aprovechable"
                    value={
                      compra.precioM2Aprovechable != null
                        ? formatCurrency(compra.precioM2Aprovechable)
                        : '—'
                    }
                  />
                  <Field
                    label="Brecha de negociación"
                    value={compra.brechaPct != null ? `${compra.brechaPct.toFixed(1)}%` : '—'}
                  />
                </DetailDrawerSection>
              ) : null}

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

              {origen?.obra ? (
                <DetailDrawerSection title="Avance de obra">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge
                      tone={
                        origen.obra.estado === 'terminada'
                          ? 'success'
                          : origen.obra.estado === 'suspendida'
                            ? 'warning'
                            : 'info'
                      }
                    >
                      {OBRA_ESTADO_LABEL[origen.obra.estado] ?? origen.obra.estado}
                    </Badge>
                    <span className="tabular-nums text-sm font-medium text-[var(--text)]">
                      {origen.obra.avancePct != null ? `${origen.obra.avancePct.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className="h-full bg-[var(--accent)] transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(0, origen.obra.avancePct ?? 0))}%`,
                      }}
                    />
                  </div>
                  <div className="pt-2">
                    <Field label="Arranque" value={origen.obra.fechaArranque} />
                    <Field label="Terminada" value={origen.obra.fechaTerminada} />
                  </div>
                  <p className="pt-1 text-xs text-[var(--text)]/50">
                    Avance de construcción de la unidad de origen. Una unidad puede entrar al
                    portafolio antes de terminar la obra.
                  </p>
                </DetailDrawerSection>
              ) : null}

              {activo.notas ? (
                <DetailDrawerSection title="Notas">
                  <p className="text-sm text-[var(--text)]/80">{activo.notas}</p>
                </DetailDrawerSection>
              ) : null}

              <DetailDrawerSection title="Documentos">
                <FileAttachments
                  empresaId={DILESA_EMPRESA_ID}
                  empresaSlug="dilesa"
                  entidad="activos"
                  entidadId={activo.id}
                  roles={ACTIVO_DOC_ROLES}
                  defaultUploadRole="plano"
                />
                <p className="pt-2 text-xs text-[var(--text)]/50">
                  Planos, escrituras escaneadas, KMZ de ubicación y fotos del activo. (Las
                  escrituras se ligarán al expediente legal en una fase posterior.)
                </p>
              </DetailDrawerSection>
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

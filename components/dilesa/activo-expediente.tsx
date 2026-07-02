'use client';

/**
 * ActivoExpediente — expediente de página completa de un activo del
 * portafolio DILESA (iniciativa `dilesa-portafolio-predios` · S2).
 *
 * Reemplaza al viejo `ActivoDetailDrawer` (decisión Beto 2026-07-01: los
 * expedientes ricos van en página completa, no en side drawer). Muestra el
 * master `dilesa.activos` + satélite por tipo + prediales por cuenta
 * catastral + jerarquía padre/hijos + documentos + escrituras + origen/obra.
 * Autocontenido — fetchea por `activoId`.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import { useEffectiveUser } from '@/components/providers';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FileAttachments } from '@/components/file-attachments';
import { ActivoEscrituras } from '@/components/dilesa/activo-escrituras';
import { ActivoPrediales } from '@/components/dilesa/activo-prediales';
import { ActivoCaptureDrawer } from '@/components/dilesa/activo-capture-drawer';
import { regresarUnidadAlProyecto } from '@/app/dilesa/proyectos/actions';
import { ACTIVO_TIPO_LABEL, computeTerrenoSnapshot } from '@/lib/dilesa/portafolio';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Map as MapIcon,
  MapPin,
  Paperclip,
} from 'lucide-react';

// leaflet toca `window` al importarse → solo cliente, sin SSR.
const ActivoMapa = dynamic(() => import('@/components/dilesa/activo-mapa'), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-lg bg-[var(--border)]/40" />,
});

const ACTIVO_DOC_ROLES = [
  { id: 'plano', label: 'Plano', icon: <MapIcon className="h-3 w-3" /> },
  {
    id: 'cuadro_constructivo',
    label: 'Cuadro constructivo',
    icon: <FileText className="h-3 w-3" />,
  },
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
  destino: { label: string } | null;
  activo_padre_id: string | null;
  etiqueta: string | null;
  zona: string | null;
  clave_interna: string | null;
  municipio: string | null;
  estado_geo: string | null;
  direccion_referencia: string | null;
  latitud: number | null;
  longitud: number | null;
  area_m2: number | null;
  valor_estimado: number | null;
  situacion_legal: string | null;
  numero_escritura: string | null;
  clave_catastral: string | null;
  notas: string | null;
};

type ActivoMini = {
  id: string;
  nombre: string;
  tipo: string;
  estado: string;
  area_m2: number | null;
};

type Origen = {
  id: string;
  identificador: string;
  estado: string;
  proyectoNombre: string | null;
  obra: {
    avancePct: number | null;
    estado: string;
    fechaArranque: string | null;
    fechaTerminada: string | null;
  } | null;
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

const OBRA_ESTADO_LABEL: Record<string, string> = {
  arrancada: 'Arrancada',
  en_progreso: 'En progreso',
  terminada: 'Terminada',
  suspendida: 'Suspendida',
};

/** Campos del satélite que no se muestran en el bloque genérico. */
const SAT_OMIT = new Set([
  'id',
  'activo_id',
  'empresa_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'caras_detalle',
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
  calle: 'Calle',
  numero_oficial: 'Número oficial',
  es_esquina: 'Esquina',
  tiene_frente_verde: 'Frente verde',
  planta: 'Planta',
  giro_permitido: 'Giro permitido',
  tiene_bodega: 'Tiene bodega',
  uso_suelo: 'Uso de suelo',
  zonificacion: 'Zonificación',
  notas: 'Notas',
};

type CaraDetalle = {
  cara: string | null;
  alias: string | null;
  iluminado: boolean | null;
  renta_mensual: number | null;
  scoring?: { puntos?: number | null; demanda?: number | null } | null;
};

function satLabel(k: string): string {
  return SAT_LABEL[k] ?? k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function fmtSatValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          {title}
        </h2>
        {description ? <span className="text-xs text-[var(--text)]/50">{description}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-[var(--text)]/60">{label}</span>
      <span className="text-right font-medium text-[var(--text)]">{value ?? '—'}</span>
    </div>
  );
}

type ExpedienteData = {
  activo: ActivoFull;
  satelite: Record<string, unknown> | null;
  padre: ActivoMini | null;
  hijos: ActivoMini[];
  origen: Origen | null;
};

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
  'cara',
]);

/** Fetch puro del expediente (sin estado React — el effect aplica el resultado en su callback). */
async function fetchExpediente(
  activoId: string
): Promise<{ ok: true; data: ExpedienteData } | { ok: false; error: string }> {
  const sb = createSupabaseBrowserClient();
  const { data: a, error: aErr } = await sb
    .schema('dilesa')
    .from('activos')
    .select(
      'id, tipo, nombre, estado, destino:portafolio_destinos(label), activo_padre_id, etiqueta, zona, clave_interna, municipio, estado_geo, direccion_referencia, latitud, longitud, area_m2, valor_estimado, situacion_legal, numero_escritura, clave_catastral, notas'
    )
    .eq('id', activoId)
    .is('deleted_at', null)
    .maybeSingle();

  if (aErr || !a) {
    return { ok: false, error: getSupabaseErrorMessage(aErr, 'No se pudo cargar el activo.') };
  }
  const activo = a as unknown as ActivoFull;

  const [satRes, uniRes, padreRes, hijosRes] = await Promise.all([
    SAT_TIPOS.has(activo.tipo)
      ? // Tabla satélite dinámica (`activo_<tipo>`); cast a una conocida para
        // el overload de `.from()` — el resultado se lee genérico.
        sb
          .schema('dilesa')
          .from(`activo_${activo.tipo}` as 'activo_casa')
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
    activo.activo_padre_id
      ? sb
          .schema('dilesa')
          .from('activos')
          .select('id, nombre, tipo, estado, area_m2')
          .eq('id', activo.activo_padre_id)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb
      .schema('dilesa')
      .from('activos')
      .select('id, nombre, tipo, estado, area_m2')
      .eq('activo_padre_id', activoId)
      .is('deleted_at', null)
      .order('nombre'),
  ]);

  let origen: Origen | null = null;
  const uni = uniRes.data as {
    id: string;
    identificador: string;
    estado: string;
    proyecto_id: string;
  } | null;
  if (uni) {
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
    const obra = obraRes.data as {
      avance_pct: number | null;
      estado: string;
      fecha_arranque: string | null;
      fecha_terminada: string | null;
    } | null;
    origen = {
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
    };
  }

  return {
    ok: true,
    data: {
      activo,
      satelite: (satRes.data as Record<string, unknown> | null) ?? null,
      padre: (padreRes.data as ActivoMini | null) ?? null,
      hijos: (hijosRes.data as ActivoMini[] | null) ?? [],
      origen,
    },
  };
}

export function ActivoExpediente({ activoId }: { activoId: string }) {
  const router = useRouter();
  const { data: effectiveUser } = useEffectiveUser();
  const isAdmin = !!effectiveUser?.isAdmin;
  const puedeAdmin =
    isAdmin || (effectiveUser?.direccionEmpresaIds ?? []).includes(DILESA_EMPRESA_ID);

  const [activo, setActivo] = useState<ActivoFull | null>(null);
  const [satelite, setSatelite] = useState<Record<string, unknown> | null>(null);
  const [origen, setOrigen] = useState<Origen | null>(null);
  const [padre, setPadre] = useState<ActivoMini | null>(null);
  const [hijos, setHijos] = useState<ActivoMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [regresarOpen, setRegresarOpen] = useState(false);
  // Incrementa para refetch tras editar (el effect depende de él).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetchExpediente(activoId).then((r) => {
      if (!vivo) return;
      if (r.ok) {
        setActivo(r.data.activo);
        setSatelite(r.data.satelite);
        setPadre(r.data.padre);
        setHijos(r.data.hijos);
        setOrigen(r.data.origen);
        setError(null);
      } else {
        setError(r.error);
      }
      setLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, [activoId, refreshKey]);

  const satEntries = satelite
    ? Object.entries(satelite).filter(([k, v]) => !SAT_OMIT.has(k) && v != null && v !== '')
    : [];

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

  const caras: CaraDetalle[] =
    activo?.tipo === 'espectacular' && Array.isArray(satelite?.caras_detalle)
      ? (satelite!.caras_detalle as CaraDetalle[])
      : [];

  const handleRegresar = async () => {
    if (!origen) return;
    const r = await regresarUnidadAlProyecto(origen.id);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push('/dilesa/portafolio');
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-72 animate-pulse rounded bg-[var(--border)]/60" />
        <div className="grid gap-6 xl:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg bg-[var(--border)]/40" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !activo) {
    return (
      <div className="p-6">
        <Link
          href="/dilesa/portafolio"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Portafolio
        </Link>
        <p className="text-sm text-[var(--danger)]">{error ?? 'Activo no encontrado.'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <Link
          href="/dilesa/portafolio"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Portafolio
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
              {activo.nombre}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{ACTIVO_TIPO_LABEL[activo.tipo as never] ?? activo.tipo}</Badge>
              <Badge tone={ESTADO_TONE[activo.estado] ?? 'neutral'}>
                {ESTADO_LABEL[activo.estado] ?? activo.estado}
              </Badge>
              {activo.destino ? <Badge tone="accent">{activo.destino.label}</Badge> : null}
              {activo.etiqueta ? <Badge tone="info">{activo.etiqueta}</Badge> : null}
              {activo.zona ? (
                <span className="text-sm text-[var(--text)]/60">· {activo.zona}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {puedeAdmin ? (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            ) : null}
            {isAdmin && origen ? (
              <Button size="sm" variant="outline" onClick={() => setRegresarOpen(true)}>
                Regresar a ventas
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Section title="Identificación y ubicación">
            <Field label="Tipo" value={ACTIVO_TIPO_LABEL[activo.tipo as never] ?? activo.tipo} />
            <Field label="Etiqueta" value={activo.etiqueta} />
            <Field label="Destino" value={activo.destino?.label ?? '—'} />
            <Field label="Zona / fraccionamiento" value={activo.zona} />
            <Field label="Clave interna" value={activo.clave_interna} />
            <Field label="Municipio" value={activo.municipio} />
            <Field label="Estado" value={activo.estado_geo} />
            <Field label="Referencia" value={activo.direccion_referencia} />
            <Field
              label="Superficie"
              value={activo.area_m2 != null ? `${activo.area_m2.toLocaleString('es-MX')} m²` : '—'}
            />
            {activo.latitud != null && activo.longitud != null ? (
              <Field
                label="Coordenadas"
                value={
                  <a
                    className="text-[var(--accent)] underline-offset-2 hover:underline"
                    href={`https://maps.google.com/?q=${activo.latitud},${activo.longitud}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {activo.latitud.toFixed(6)}, {activo.longitud.toFixed(6)}
                  </a>
                }
              />
            ) : null}
          </Section>

          <Section title="Valor y situación legal">
            <Field
              label="Valor estimado"
              value={activo.valor_estimado != null ? formatCurrency(activo.valor_estimado) : '—'}
            />
            <Field label="Situación legal" value={activo.situacion_legal} />
            <Field label="Número de escritura" value={activo.numero_escritura} />
            <Field label="Clave catastral" value={activo.clave_catastral} />
          </Section>

          {compra ? (
            <Section title="Análisis de compra">
              <Field
                label="Área aprovechable"
                value={
                  compra.aprovechableM2 != null
                    ? `${compra.aprovechableM2.toLocaleString('es-MX')} m²`
                    : '—'
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
                value={compra.valorOfertado != null ? formatCurrency(compra.valorOfertado) : '—'}
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
            </Section>
          ) : null}

          {satEntries.length > 0 ? (
            <Section title="Detalle del inmueble">
              {satEntries.map(([k, v]) => (
                <Field key={k} label={satLabel(k)} value={fmtSatValue(v)} />
              ))}
            </Section>
          ) : null}

          {caras.length > 0 ? (
            <Section title={`Caras (${caras.length})`}>
              {caras.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-[var(--border)]/50 py-1.5 text-sm last:border-0"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-[var(--text)]">
                      {c.cara ?? `Cara ${i + 1}`}
                    </span>
                    {c.alias ? <span className="text-[var(--text)]/60"> · {c.alias}</span> : null}
                    {c.scoring?.puntos != null ? (
                      <span className="text-xs text-[var(--text)]/50">
                        {' '}
                        · {c.scoring.puntos} pts
                      </span>
                    ) : null}
                  </div>
                  <span className="tabular-nums text-[var(--text)]/80">
                    {c.renta_mensual != null ? formatCurrency(c.renta_mensual) : '—'}
                    {c.iluminado ? ' · 💡' : ''}
                  </span>
                </div>
              ))}
            </Section>
          ) : null}

          {padre || hijos.length > 0 ? (
            <Section title="Jerarquía">
              {padre ? (
                <Field
                  label="Activo padre"
                  value={
                    <Link
                      className="text-[var(--accent)] underline-offset-2 hover:underline"
                      href={`/dilesa/portafolio/activo/${padre.id}`}
                    >
                      {padre.nombre}
                    </Link>
                  }
                />
              ) : null}
              {hijos.length > 0 ? (
                <div className="pt-1">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                    Activos hijos ({hijos.length})
                  </div>
                  <ul className="space-y-1">
                    {hijos.map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-3 text-sm">
                        <Link
                          className="min-w-0 truncate text-[var(--accent)] underline-offset-2 hover:underline"
                          href={`/dilesa/portafolio/activo/${h.id}`}
                        >
                          {h.nombre}
                        </Link>
                        <span className="shrink-0 text-xs text-[var(--text)]/50">
                          {ACTIVO_TIPO_LABEL[h.tipo as never] ?? h.tipo}
                          {h.area_m2 != null ? ` · ${h.area_m2.toLocaleString('es-MX')} m²` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Section>
          ) : null}

          {origen ? (
            <Section title="Origen">
              <Field label="Unidad" value={origen.identificador} />
              <Field label="Proyecto" value={origen.proyectoNombre} />
              {origen.obra ? (
                <div className="pt-2">
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
                </div>
              ) : null}
              <p className="pt-2 text-xs text-[var(--text)]/50">
                Este activo se traspasó al portafolio desde una unidad del fraccionamiento.
              </p>
            </Section>
          ) : null}

          {activo.notas ? (
            <Section title="Notas">
              <p className="whitespace-pre-wrap text-sm text-[var(--text)]/80">{activo.notas}</p>
            </Section>
          ) : null}
        </div>

        <div className="space-y-6">
          <Section title="Mapa">
            <ActivoMapa
              activoId={activo.id}
              latitud={activo.latitud}
              longitud={activo.longitud}
              nombre={activo.nombre}
            />
          </Section>

          <ActivoPrediales activoId={activo.id} empresaId={DILESA_EMPRESA_ID} />

          <Section title="Documentos">
            <FileAttachments
              empresaId={DILESA_EMPRESA_ID}
              empresaSlug="dilesa"
              entidad="activos"
              entidadId={activo.id}
              roles={ACTIVO_DOC_ROLES}
              defaultUploadRole="plano"
            />
            <p className="pt-2 text-xs text-[var(--text)]/50">
              Planos, cuadro constructivo, KMZ de ubicación y fotos del activo. Las escrituras
              estructuradas se ligan abajo.
            </p>
          </Section>

          <Section title="Escrituras (expediente legal)">
            <ActivoEscrituras
              activoId={activo.id}
              empresaId={DILESA_EMPRESA_ID}
              puedeAdmin={puedeAdmin}
            />
          </Section>
        </div>
      </div>

      {puedeAdmin ? (
        <ActivoCaptureDrawer
          key={editOpen ? activo.id : 'closed'}
          empresaId={DILESA_EMPRESA_ID}
          activoId={activo.id}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      ) : null}

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
    </div>
  );
}

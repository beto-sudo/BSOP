'use client';

/**
 * RecepcionObraDrawer — RECEPCIÓN DE OBRA al contratista (Atención a Clientes /
 * EVAP), flujo "papel-primero" desde el detalle de construcción DILESA.
 *
 * Flujo (S4 — recepción en papel + ciclo de re-inspección):
 *   1. La recepción se PROGRAMA antes (estado 'programada').
 *   2. Se imprime el formato EN BLANCO ("Imprimir formato"), se recorre la
 *      vivienda marcando A MANO en la hoja y se firma físico en campo.
 *   3a. Si hubo detalles -> "Registrar observaciones y reprogramar": se captura
 *       la observación + evidencia + nueva fecha y el compromiso del
 *       contratista. La obra NO se recibe; el ciclo se repite.
 *   3b. Si todo bien -> se escanea el acta firmada, se SUBE (obligatorio) y se
 *       "Recibe la obra". El escaneo es el gate único del cierre.
 *
 * El gate de rol vive en las RPC + trigger; la UI espeja los candados.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileUp, History, Printer } from 'lucide-react';

import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { WizardFileSlot } from '@/components/wizard/wizard-file-slot';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { buildAdjuntoPath, type AdjuntoEntidad } from '@/lib/storage/path';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

type EstadoRecepcion = 'programada' | 'con_observaciones' | 'recibida' | 'rechazada';

type AdjuntoRef = { nombre: string; url: string };
type Visita = {
  id: string;
  fecha_visita: string;
  resultado: 'con_observaciones' | 'recibida';
  observaciones: string | null;
  fecha_reprograma: string | null;
  compromiso_contratista: string | null;
  evidencias: AdjuntoRef[];
};

export type RecepcionObraDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  construccionId: string;
  codigo: string;
  onDone: () => void;
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Sube un archivo a Storage + registra el adjunto en erp.adjuntos. */
async function subirAdjunto(
  sb: ReturnType<typeof createSupabaseBrowserClient>,
  entidad: AdjuntoEntidad,
  entidadId: string,
  rol: string,
  file: File
): Promise<string | null> {
  const path = buildAdjuntoPath({ empresa: 'dilesa', entidad, entidadId, filename: file.name });
  const { error: upErr } = await sb.storage.from('adjuntos').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) return getSupabaseErrorMessage(upErr, 'No se pudo subir el archivo.');
  const { error: adjErr } = await sb
    .schema('erp')
    .from('adjuntos')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      entidad_tipo: entidad,
      entidad_id: entidadId,
      rol,
      nombre: file.name,
      url: path,
      tipo_mime: file.type || null,
    });
  if (adjErr) return getSupabaseErrorMessage(adjErr, 'Archivo subido pero no registrado.');
  return null;
}

export function RecepcionObraDrawer({
  open,
  onOpenChange,
  construccionId,
  codigo,
  onDone,
}: RecepcionObraDrawerProps) {
  const toast = useToast();
  const [recepcionId, setRecepcionId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoRecepcion>('programada');
  const [fechaProgramada, setFechaProgramada] = useState<string | null>(null);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [actaSubida, setActaSubida] = useState(false);
  const [actaFile, setActaFile] = useState<File | null>(null);
  const [cargada, setCargada] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form "registrar observaciones y reprogramar"
  const [obsTexto, setObsTexto] = useState('');
  const [obsFecha, setObsFecha] = useState('');
  const [obsCompromiso, setObsCompromiso] = useState('');
  const [obsFiles, setObsFiles] = useState<File[]>([]);

  const cargar = useCallback(async () => {
    const sb = createSupabaseBrowserClient();
    const { data } = await sb
      .schema('dilesa')
      .from('recepcion_obra')
      .select('id, estado, fecha_programada')
      .eq('construccion_id', construccionId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) {
      setCargada(true);
      return;
    }
    const recId = data.id as string;
    setRecepcionId(recId);
    setEstado((data.estado as EstadoRecepcion) ?? 'programada');
    setFechaProgramada((data.fecha_programada as string | null) ?? null);

    // Historial de visitas + sus evidencias
    const { data: vis } = await sb
      .schema('dilesa')
      .from('recepcion_visitas')
      .select(
        'id, fecha_visita, resultado, observaciones, fecha_reprograma, compromiso_contratista'
      )
      .eq('recepcion_id', recId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    const visitaRows = (vis ?? []) as Omit<Visita, 'evidencias'>[];

    const evidenciasByVisita = new Map<string, AdjuntoRef[]>();
    if (visitaRows.length > 0) {
      const { data: adj } = await sb
        .schema('erp')
        .from('adjuntos')
        .select('entidad_id, nombre, url')
        .eq('entidad_tipo', 'recepcion_visita')
        .in(
          'entidad_id',
          visitaRows.map((v) => v.id)
        );
      for (const a of (adj ?? []) as { entidad_id: string; nombre: string; url: string }[]) {
        const list = evidenciasByVisita.get(a.entidad_id) ?? [];
        list.push({ nombre: a.nombre, url: a.url });
        evidenciasByVisita.set(a.entidad_id, list);
      }
    }
    setVisitas(visitaRows.map((v) => ({ ...v, evidencias: evidenciasByVisita.get(v.id) ?? [] })));

    // ¿Acta firmada subida?
    const { count } = await sb
      .schema('erp')
      .from('adjuntos')
      .select('id', { count: 'exact', head: true })
      .eq('entidad_tipo', 'recepcion_obra')
      .eq('entidad_id', recId)
      .eq('rol', 'acta_recepcion');
    setActaSubida((count ?? 0) > 0);
    setCargada(true);
  }, [construccionId]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      await cargar();
    })();
  }, [open, cargar]);

  function handleOpenChange(next: boolean) {
    // Reset al cerrar (no en el effect, para no disparar setState síncrono).
    if (!next) {
      setCargada(false);
      setObsTexto('');
      setObsFecha('');
      setObsCompromiso('');
      setObsFiles([]);
      setActaFile(null);
    }
    onOpenChange(next);
  }

  /** 3a — registra una visita con observaciones + reprograma. */
  async function registrarObservaciones() {
    if (!obsTexto.trim()) {
      toast.add({ title: 'Describe las observaciones encontradas', type: 'error' });
      return;
    }
    if (!obsFecha) {
      toast.add({ title: 'Indica la nueva fecha programada', type: 'error' });
      return;
    }
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    const { data: visitaId, error } = await sb
      .schema('dilesa')
      .rpc('fn_recepcion_registrar_visita', {
        p_construccion_id: construccionId,
        p_fecha_visita: hoyISO(),
        p_observaciones: obsTexto.trim(),
        p_fecha_reprograma: obsFecha,
        p_compromiso: obsCompromiso.trim() || undefined,
      });
    if (error) {
      setSubmitting(false);
      toast.add({
        title: 'No se pudo registrar la visita',
        description: getSupabaseErrorMessage(error, 'Error al registrar.'),
        type: 'error',
      });
      return;
    }
    // Subir evidencia ligada a la visita recién creada.
    let evidenciaErr: string | null = null;
    for (const f of obsFiles) {
      const err = await subirAdjunto(sb, 'recepcion_visita', visitaId as string, 'evidencia', f);
      if (err) evidenciaErr = err;
    }
    setSubmitting(false);
    if (evidenciaErr) {
      toast.add({
        title: 'Visita registrada; falló alguna evidencia',
        description: evidenciaErr,
        type: 'error',
      });
    } else {
      toast.add({
        title: 'Visita registrada',
        description: 'Quedaron observaciones por corregir; la recepción se reprogramó.',
        type: 'success',
      });
    }
    setObsTexto('');
    setObsFecha('');
    setObsCompromiso('');
    setObsFiles([]);
    await cargar();
    onDone();
  }

  /** Sube el acta firmada (escaneada) ligada a la recepción. */
  async function subirActa(file: File | null) {
    setActaFile(file);
    if (!file || !recepcionId) return;
    const sb = createSupabaseBrowserClient();
    const err = await subirAdjunto(sb, 'recepcion_obra', recepcionId, 'acta_recepcion', file);
    if (err) {
      toast.add({ title: 'No se pudo subir el acta', description: err, type: 'error' });
      return;
    }
    setActaSubida(true);
    toast.add({ title: 'Acta firmada adjuntada', type: 'success' });
  }

  /** 3b — cierre final: marca recibida (la RPC revalida los candados). */
  async function marcarRecibida() {
    if (!actaSubida) {
      toast.add({
        title: 'Falta el acta firmada',
        description: 'Sube el acta escaneada y firmada antes de recibir.',
        type: 'error',
      });
      return;
    }
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.schema('dilesa').rpc('fn_recepcion_cerrar', {
      p_construccion_id: construccionId,
      p_fecha: hoyISO(),
      p_estado: 'recibida',
    });
    setSubmitting(false);
    if (error) {
      toast.add({
        title: 'No se pudo recibir la obra',
        description: getSupabaseErrorMessage(error, 'Error en el cierre.'),
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Obra recibida',
      description: 'La vivienda quedó marcada como terminada.',
      type: 'success',
    });
    handleOpenChange(false);
    onDone();
  }

  const yaRecibida = estado === 'recibida';

  return (
    <DetailDrawer
      open={open}
      onOpenChange={handleOpenChange}
      size="lg"
      title="Recepción de obra"
      description={codigo}
    >
      <DetailDrawerContent>
        {!cargada ? (
          <p className="py-8 text-center text-sm text-[var(--text)]/50">Cargando recepción…</p>
        ) : (
          <div className="space-y-6">
            {/* Cabecera: estado + próxima cita */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-xs">
              <span className="text-[var(--text)]/70">
                {yaRecibida
                  ? 'Obra recibida'
                  : fechaProgramada
                    ? `Próxima visita: ${fechaProgramada}`
                    : 'Recepción en proceso'}
              </span>
              <Badge
                tone={
                  yaRecibida ? 'success' : estado === 'con_observaciones' ? 'warning' : 'neutral'
                }
              >
                {yaRecibida
                  ? 'Recibida'
                  : estado === 'con_observaciones'
                    ? 'Con observaciones'
                    : 'Programada'}
              </Badge>
            </div>

            {yaRecibida ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-400/40 bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Esta obra ya fue recibida. Abajo queda el historial de visitas como evidencia.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/30 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--text)]">Formato de recepción</span>
                  <a
                    href={`/dilesa/construccion/${construccionId}/acta-recepcion`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[var(--accent)] underline"
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir formato
                  </a>
                </div>
                <p className="mt-1 text-[11px] text-[var(--text)]/50">
                  Imprime el formato <span className="font-medium">en blanco</span>, recórrelo en la
                  vivienda marcando a mano y recaba las firmas (Supervisor, Contratista y Atención a
                  Clientes) en campo.
                </p>
              </div>
            )}

            {/* Historial de visitas */}
            {visitas.length > 0 ? (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 border-b border-[var(--border)] pb-1 text-sm font-semibold text-[var(--text)]">
                  <History className="h-4 w-4" /> Historial de visitas
                </h3>
                <ol className="space-y-2">
                  {visitas.map((v, i) => (
                    <li
                      key={v.id}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[var(--text)]">
                          Visita {i + 1} · {v.fecha_visita}
                        </span>
                        <Badge tone={v.resultado === 'recibida' ? 'success' : 'warning'}>
                          {v.resultado === 'recibida' ? 'Recibida' : 'Con observaciones'}
                        </Badge>
                      </div>
                      {v.observaciones ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-[var(--text)]/80">
                          {v.observaciones}
                        </p>
                      ) : null}
                      {v.compromiso_contratista ? (
                        <p className="mt-1 text-[var(--text)]/60">
                          <span className="font-medium">Compromiso:</span>{' '}
                          {v.compromiso_contratista}
                        </p>
                      ) : null}
                      {v.fecha_reprograma ? (
                        <p className="mt-1 text-[var(--text)]/60">
                          <span className="font-medium">Reprogramada para:</span>{' '}
                          {v.fecha_reprograma}
                        </p>
                      ) : null}
                      {v.evidencias.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {v.evidencias.map((e) => (
                            <a
                              key={e.url}
                              href={getAdjuntoProxyUrl(e.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[11px] text-[var(--accent)] underline"
                            >
                              <FileUp className="h-3 w-3" /> {e.nombre}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {/* Acciones de la visita actual */}
            {!yaRecibida ? (
              <>
                {/* 3a — Registrar observaciones y reprogramar */}
                <section className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-50/40 p-3 dark:bg-amber-950/10">
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    ¿Encontraron detalles? Registrar observaciones y reprogramar
                  </h3>
                  <p className="text-[11px] text-[var(--text)]/55">
                    Captura lo que falta corregir, sube la evidencia (la hoja marcada o fotos) y
                    fija la nueva fecha con el compromiso del contratista. La obra no se recibe aún.
                  </p>
                  <Textarea
                    value={obsTexto}
                    onChange={(e) => setObsTexto(e.target.value)}
                    rows={3}
                    placeholder="Detalles encontrados / ubicación…"
                    className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-[11px] text-[var(--text)]/70">
                      <span>Nueva fecha programada</span>
                      <Input
                        type="date"
                        value={obsFecha}
                        min={hoyISO()}
                        onChange={(e) => setObsFecha(e.target.value)}
                        className="rounded-lg border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] text-[var(--text)]/70">
                      <span>Compromiso del contratista (opcional)</span>
                      <Input
                        value={obsCompromiso}
                        onChange={(e) => setObsCompromiso(e.target.value)}
                        placeholder="Ej. corrige y limpia para la fecha"
                        className="rounded-lg border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1 text-[11px] text-[var(--text)]/70">
                    <span>Evidencia (hoja marcada / fotos — opcional)</span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                      onChange={(e) => setObsFiles(Array.from(e.target.files ?? []))}
                      className="block w-full text-[11px] text-[var(--text)]/70 file:mr-2 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--panel)] file:px-2 file:py-1 file:text-[11px]"
                    />
                    {obsFiles.length > 0 ? (
                      <span className="text-[var(--text)]/50">
                        {obsFiles.length} archivo(s) por subir
                      </span>
                    ) : null}
                  </label>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => void registrarObservaciones()}
                      disabled={submitting}
                    >
                      Registrar y reprogramar
                    </Button>
                  </div>
                </section>

                {/* 3b — Recibir obra */}
                <section className="space-y-2 rounded-lg border border-emerald-400/40 bg-emerald-50/40 p-3 dark:bg-emerald-950/10">
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    ¿Todo correcto? Recibir obra
                  </h3>
                  <p className="text-[11px] text-[var(--text)]/55">
                    Sube el acta firmada y escaneada (Supervisor, Contratista y Atención a
                    Clientes). Es obligatoria: es lo que permite recibir y dar la obra por
                    terminada.
                  </p>
                  <WizardFileSlot
                    role="acta_recepcion"
                    label={
                      actaSubida ? 'Acta firmada adjuntada — reemplazar' : 'Sube el acta firmada'
                    }
                    file={actaFile}
                    onChange={(f) => void subirActa(f)}
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                  />
                  <div className="flex items-center justify-end gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenChange(false)}
                      className="text-sm text-muted-foreground hover:text-[var(--text)]"
                    >
                      Cerrar
                    </button>
                    <Button
                      onClick={() => void marcarRecibida()}
                      disabled={submitting || !actaSubida}
                      title={!actaSubida ? 'Falta subir el acta firmada' : undefined}
                    >
                      <ClipboardCheck className="mr-2 h-4 w-4" /> Recibir obra
                    </Button>
                  </div>
                </section>
              </>
            ) : null}
          </div>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

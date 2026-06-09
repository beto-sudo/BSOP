'use client';

/**
 * RuvFrenteDetalle — página de detalle de un frente (oferta) RUV.
 * Iniciativa `dilesa-ruv` · v1.1. Reemplaza el side-drawer del Sprint 3.
 *
 * Secciones:
 *   1. Datos de la oferta (folios INFONAVIT, fechas, proyecto).
 *   2. KPIs de avance derivados de los lotes (reactivos a las ediciones).
 *   3. Lotes del frente — tabla con los 4 hitos (DTU / extracción / seguro de
 *      calidad / paquete RUV) editables inline por lote (server action marcarHito).
 *   4. Documentos del paquete — checklist editable con subida de archivos a Storage.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  FileStack,
  Loader2,
  Paperclip,
  RotateCcw,
  Upload,
} from 'lucide-react';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { marcarCuv, marcarDocumento, marcarHito, type RuvHito } from '@/app/dilesa/ruv/actions';

type LoteRow = {
  id: string;
  identificador: string;
  manzana: string | null;
  numero_lote: string | null;
  cuv: string | null;
  estado: string | null;
  fecha_dtu: string | null;
  fecha_extraccion: string | null;
  fecha_seguro_calidad: string | null;
  fecha_paquete_ruv: string | null;
};

type FrenteDatos = {
  nombre: string;
  proyectoNombre: string;
  idOferta: number | null;
  idOrden: number | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  viviendasOferta: number | null;
};

type ChecklistItem = {
  id: string;
  nombre: string;
  orden: number | null;
  estado: 'cargado' | 'pendiente';
  fechaCarga: string | null;
  archivoUrl: string | null;
};

const HITOS: Array<{ key: RuvHito; col: keyof LoteRow; label: string }> = [
  { key: 'dtu', col: 'fecha_dtu', label: 'DTU' },
  { key: 'extraccion', col: 'fecha_extraccion', label: 'Extracción' },
  { key: 'seguro_calidad', col: 'fecha_seguro_calidad', label: 'Seguro calidad' },
  { key: 'paquete_ruv', col: 'fecha_paquete_ruv', label: 'Paquete RUV' },
];

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-xs text-[var(--text)]/55">{label}</span>
      <span className="text-sm font-medium text-[var(--text)] tabular-nums">{children}</span>
    </div>
  );
}

/**
 * Celda editable del CUV (16 dígitos). INFONAVIT lo emite tras registrar el
 * paquete, así que se captura aquí cuando llega. Controlada con estado local
 * para poder revertir si el guardado falla (formato/duplicado).
 */
function CuvCell({
  lote,
  onGuardar,
}: {
  lote: LoteRow;
  onGuardar: (lote: LoteRow, cuv: string) => Promise<boolean>;
}) {
  const [val, setVal] = useState(lote.cuv ?? '');
  const [saving, setSaving] = useState(false);
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={16}
      value={val}
      onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))}
      onBlur={async () => {
        if ((val || null) === (lote.cuv ?? null)) return;
        setSaving(true);
        const ok = await onGuardar(lote, val);
        setSaving(false);
        if (!ok) setVal(lote.cuv ?? '');
      }}
      disabled={saving}
      placeholder="— sin CUV —"
      className="w-40 rounded-md border border-[var(--border)] bg-[var(--panel)] px-1.5 py-1 text-xs text-[var(--text)] tabular-nums"
    />
  );
}

export function RuvFrenteDetalle({ frenteId, empresaId }: { frenteId: string; empresaId: string }) {
  const toast = useToast();
  const [frente, setFrente] = useState<FrenteDatos | null>(null);
  const [lotes, setLotes] = useState<LoteRow[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    const [frenteRes, lotesRes, catRes, estadoRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('ruv_frentes')
        .select(
          'nombre, id_oferta, id_orden, fecha_inicio, fecha_fin, viviendas_oferta, proyecto_id'
        )
        .eq('id', frenteId)
        .maybeSingle(),
      sb
        .schema('dilesa')
        .from('unidades')
        .select(
          'id, identificador, manzana, numero_lote, cuv, estado, fecha_dtu, fecha_extraccion, fecha_seguro_calidad, fecha_paquete_ruv'
        )
        .eq('frente_id', frenteId)
        .is('deleted_at', null)
        .order('manzana')
        .order('numero_lote'),
      sb
        .schema('dilesa')
        .from('ruv_documentos_catalogo')
        .select('id, nombre, orden')
        .eq('empresa_id', empresaId)
        .eq('activo', true),
      sb
        .schema('dilesa')
        .from('ruv_frente_documentos')
        .select('documento_catalogo_id, estado, fecha_carga, archivo_url')
        .eq('frente_id', frenteId)
        .is('deleted_at', null),
    ]);

    if (frenteRes.error || lotesRes.error || catRes.error || estadoRes.error) {
      setError(
        getSupabaseErrorMessage(
          frenteRes.error ?? lotesRes.error ?? catRes.error ?? estadoRes.error,
          'No se pudo cargar el frente.'
        )
      );
      setLoading(false);
      return;
    }

    let proyectoNombre = '';
    const proyectoId = (frenteRes.data?.proyecto_id as string | null) ?? null;
    if (proyectoId) {
      const { data: p } = await sb
        .schema('dilesa')
        .from('proyectos')
        .select('nombre')
        .eq('id', proyectoId)
        .maybeSingle();
      proyectoNombre = (p?.nombre as string | null) ?? '';
    }

    setFrente({
      nombre: (frenteRes.data?.nombre as string) ?? 'Frente RUV',
      proyectoNombre,
      idOferta: (frenteRes.data?.id_oferta as number | null) ?? null,
      idOrden: (frenteRes.data?.id_orden as number | null) ?? null,
      fechaInicio: (frenteRes.data?.fecha_inicio as string | null) ?? null,
      fechaFin: (frenteRes.data?.fecha_fin as string | null) ?? null,
      viviendasOferta: (frenteRes.data?.viviendas_oferta as number | null) ?? null,
    });
    setLotes((lotesRes.data ?? []) as LoteRow[]);

    const estadoPorDoc = new Map(
      (estadoRes.data ?? []).map((e) => [e.documento_catalogo_id, e] as const)
    );
    setChecklist(
      (catRes.data ?? [])
        .map((d) => {
          const e = estadoPorDoc.get(d.id);
          return {
            id: d.id as string,
            nombre: d.nombre as string,
            orden: (d.orden as number | null) ?? null,
            estado: (e?.estado as 'cargado' | 'pendiente') ?? 'pendiente',
            fechaCarga: (e?.fecha_carga as string | null) ?? null,
            archivoUrl: (e?.archivo_url as string | null) ?? null,
          };
        })
        .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.nombre.localeCompare(b.nombre))
    );
    setLoading(false);
  }, [frenteId, empresaId]);

  useEffect(() => {
    let activo = true;
    void (async () => {
      await cargar();
      if (!activo) return;
    })();
    return () => {
      activo = false;
    };
  }, [cargar]);

  // Guardar un hito (optimista: actualiza el lote en memoria; revierte si falla).
  const guardarHito = useCallback(
    async (lote: LoteRow, hito: RuvHito, col: keyof LoteRow, nuevaFecha: string) => {
      const fecha = nuevaFecha || null;
      const anterior = (lote[col] as string | null) ?? null;
      if (fecha === anterior) return;
      setLotes((prev) => prev.map((l) => (l.id === lote.id ? { ...l, [col]: fecha } : l)));
      const res = await marcarHito({ unidadId: lote.id, hito, fecha });
      if (!res.ok) {
        toast.add({ title: 'No se pudo guardar la fecha', description: res.error, type: 'error' });
        setLotes((prev) => prev.map((l) => (l.id === lote.id ? { ...l, [col]: anterior } : l)));
      }
    },
    [toast]
  );

  // Guardar el CUV de un lote. Retorna true si guardó (para que la celda revierta
  // su input local en caso de error de validación/duplicado).
  const guardarCuv = useCallback(
    async (lote: LoteRow, cuv: string): Promise<boolean> => {
      const valor = cuv.trim() || null;
      const res = await marcarCuv({ unidadId: lote.id, cuv: valor });
      if (!res.ok) {
        toast.add({ title: 'No se pudo guardar el CUV', description: res.error, type: 'error' });
        return false;
      }
      setLotes((prev) => prev.map((l) => (l.id === lote.id ? { ...l, cuv: valor } : l)));
      return true;
    },
    [toast]
  );

  const kpis = useMemo<ModuleKpi[]>(() => {
    const total = lotes.length;
    const con = (pred: (l: LoteRow) => boolean) => lotes.filter(pred).length;
    return [
      { key: 'lotes', label: 'Lotes', value: total || '—' },
      { key: 'cuv', label: 'CUVs', value: con((l) => !!l.cuv && /^\d{16}$/.test(l.cuv)) || '—' },
      { key: 'dtu', label: 'Con DTU', value: con((l) => !!l.fecha_dtu) || '—' },
      {
        key: 'extraccion',
        label: 'Con extracción',
        value: con((l) => !!l.fecha_extraccion) || '—',
      },
      {
        key: 'seguro',
        label: 'Con seguro calidad',
        value: con((l) => !!l.fecha_seguro_calidad) || '—',
      },
    ];
  }, [lotes]);

  // ── Documentos: subir archivo / marcar (igual que el drawer del Sprint 4) ──
  const recargarChecklist = useCallback(async () => {
    const sb = createSupabaseBrowserClient();
    const { data } = await sb
      .schema('dilesa')
      .from('ruv_frente_documentos')
      .select('documento_catalogo_id, estado, fecha_carga, archivo_url')
      .eq('frente_id', frenteId)
      .is('deleted_at', null);
    const m = new Map((data ?? []).map((e) => [e.documento_catalogo_id, e] as const));
    setChecklist((prev) =>
      prev.map((it) => {
        const e = m.get(it.id);
        return {
          ...it,
          estado: (e?.estado as 'cargado' | 'pendiente') ?? 'pendiente',
          fechaCarga: (e?.fecha_carga as string | null) ?? null,
          archivoUrl: (e?.archivo_url as string | null) ?? null,
        };
      })
    );
  }, [frenteId]);

  const subirArchivo = useCallback(
    async (item: ChecklistItem, file: File) => {
      setBusyDoc(item.id);
      const sb = createSupabaseBrowserClient();
      const path = buildAdjuntoPath({
        empresa: 'dilesa',
        entidad: 'frentes',
        entidadId: frenteId,
        filename: file.name,
      });
      const { error: upErr } = await sb.storage.from('adjuntos').upload(path, file);
      if (upErr) {
        toast.add({ title: 'No se pudo subir', description: upErr.message, type: 'error' });
        setBusyDoc(null);
        return;
      }
      const res = await marcarDocumento({
        frenteId,
        documentoCatalogoId: item.id,
        estado: 'cargado',
        archivoUrl: path,
      });
      if (!res.ok) toast.add({ title: 'Error', description: res.error, type: 'error' });
      else {
        toast.add({ title: 'Documento cargado', type: 'success' });
        await recargarChecklist();
      }
      setBusyDoc(null);
    },
    [frenteId, toast, recargarChecklist]
  );

  const cambiarEstadoDoc = useCallback(
    async (item: ChecklistItem, estado: 'cargado' | 'pendiente') => {
      setBusyDoc(item.id);
      const res = await marcarDocumento({ frenteId, documentoCatalogoId: item.id, estado });
      if (!res.ok) toast.add({ title: 'Error', description: res.error, type: 'error' });
      else await recargarChecklist();
      setBusyDoc(null);
    },
    [frenteId, toast, recargarChecklist]
  );

  const cargados = checklist.filter((i) => i.estado === 'cargado').length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--text)]/60">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando frente…
      </div>
    );
  }
  if (error) {
    return <p className="p-6 text-sm text-[var(--danger)]">{error}</p>;
  }
  if (!frente) {
    return <p className="p-6 text-sm text-[var(--text)]/60">Frente no encontrado.</p>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/dilesa/ruv"
          className="inline-flex items-center gap-1 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Frentes RUV
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <FileStack className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
              {frente.nombre}
            </h1>
            {frente.proyectoNombre ? (
              <p className="text-sm text-[var(--text)]/60">{frente.proyectoNombre}</p>
            ) : null}
          </div>
        </div>
      </div>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">Datos de la oferta</h2>
          <Campo label="ID Oferta (INFONAVIT)">{frente.idOferta ?? '—'}</Campo>
          <Campo label="ID Orden">{frente.idOrden ?? '—'}</Campo>
          <Campo label="Fecha inicio">
            {frente.fechaInicio ? formatDate(frente.fechaInicio) : '—'}
          </Campo>
          <Campo label="Fecha fin">{frente.fechaFin ? formatDate(frente.fechaFin) : '—'}</Campo>
          <Campo label="Viviendas en oferta">{frente.viviendasOferta ?? '—'}</Campo>
          <Campo label="Lotes ligados">{lotes.length}</Campo>
        </div>
      </section>

      {/* ── Lotes del frente con hitos editables ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">
          Lotes del frente
          <span className="ml-2 font-normal text-[var(--text)]/50">{lotes.length}</span>
        </h2>
        {lotes.length === 0 ? (
          <p className="text-sm text-[var(--text)]/55">Este frente no tiene lotes ligados.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--card)]/40 text-left text-xs text-[var(--text)]/55">
                  <th className="px-3 py-2 font-medium">Lote</th>
                  <th className="px-3 py-2 font-medium">CUV</th>
                  {HITOS.map((h) => (
                    <th key={h.key} className="px-3 py-2 font-medium">
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--border)]/60 last:border-0">
                    <td className="whitespace-nowrap px-3 py-1.5 font-medium text-[var(--text)]">
                      {l.identificador}
                    </td>
                    <td className="px-3 py-1.5">
                      <CuvCell lote={l} onGuardar={guardarCuv} />
                    </td>
                    {HITOS.map((h) => (
                      <td key={h.key} className="px-3 py-1.5">
                        <input
                          type="date"
                          defaultValue={(l[h.col] as string | null) ?? ''}
                          onBlur={(e) => void guardarHito(l, h.key, h.col, e.target.value)}
                          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-1.5 py-1 text-xs text-[var(--text)] tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Documentos del paquete ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">
          Documentos del paquete
          <span className="ml-2 font-normal text-[var(--text)]/50">
            {cargados}/{checklist.length} cargados
          </span>
        </h2>
        <ul className="space-y-1 rounded-xl border border-[var(--border)] p-2">
          {checklist.map((item) => {
            const busy = busyDoc === item.id;
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--card)]/60"
              >
                {item.estado === 'cargado' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-[var(--text)]/30" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-[var(--text)]">{item.nombre}</span>
                  {item.estado === 'cargado' && item.fechaCarga ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--text)]/45">
                      <CalendarClock className="h-3 w-3" />
                      {formatDate(item.fechaCarga)}
                    </span>
                  ) : null}
                </div>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--text)]/50" />
                ) : item.estado === 'cargado' ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.archivoUrl ? (
                      <a
                        href={getAdjuntoProxyUrl(item.archivoUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                      >
                        <Paperclip className="h-3 w-3" /> Ver
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void cambiarEstadoDoc(item, 'pendiente')}
                      title="Marcar pendiente"
                      className="inline-flex items-center rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--text)]/60 hover:text-[var(--text)]"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/70 hover:text-[var(--text)]">
                    <Upload className="h-3 w-3" /> Subir
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void subirArchivo(item, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

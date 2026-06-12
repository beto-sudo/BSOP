'use client';

/**
 * Captura colaborativa de documentos de fase — pieza compartida del rollout
 * a las fases del pipeline (iniciativa `dilesa-ventas-captura-colaborativa`,
 * Sprint 4b).
 *
 * Cada documento PERSISTE AL SUBIRSE (storage + `erp.adjuntos` con
 * `uploaded_by`); el slot muestra quién lo subió y cuándo; "Cambiar"
 * versiona (conserva la anterior). El cierre de la fase valida contra el
 * expediente persistido (`faltantes`), no contra la memoria del navegador.
 *
 * Uso en una página de fase:
 *   const docsFase = useDocsFaseColaborativos(ventaId, SLOTS);
 *   <DocsFaseSection state={docsFase} disabled={yaCerrada} />
 *   // en el submit: if (docsFase.faltantes.length > 0) { toast…; return; }
 *   // y marcarFase(..., { docs: [] }) — los documentos ya están en el expediente.
 *
 * La Fase 13 (Facturada) tiene su propia variante especializada (slots XML
 * CFDI con validación al subir + revisión PLD) en su page — este componente
 * es la versión genérica para el resto de fases.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Upload, XCircle } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useToast } from '@/components/ui/toast';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import {
  faltantesParaCerrar,
  fetchDocsFase,
  subirDocFase,
  type DocRolEstado,
  type DocsPorRol,
} from '@/lib/dilesa/captura/docs-fase';

export type SlotColaborativo = {
  /** Rol del adjunto en `erp.adjuntos` (ej. 'avaluo_comercial'). */
  rol: string;
  label: string;
  requerido: boolean;
};

export type DocsFaseState = {
  docs: DocsPorRol | null;
  docsError: string | null;
  subiendoRol: string | null;
  /** Roles requeridos sin documento vigente en el expediente. */
  faltantes: string[];
  labelDe: (rol: string) => string;
  cargarDocs: () => Promise<void>;
  onPickDoc: (slot: SlotColaborativo, file: File) => Promise<void>;
  slots: SlotColaborativo[];
};

export function useDocsFaseColaborativos(
  ventaId: string,
  slots: SlotColaborativo[]
): DocsFaseState {
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const toast = useToast();
  const [docs, setDocs] = useState<DocsPorRol | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [subiendoRol, setSubiendoRol] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // `slots` suele declararse inline en la página — fijar por contenido.
  const slotsKey = slots.map((s) => s.rol).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- slotsKey cubre slots
  const roles = useMemo(() => slots.map((s) => s.rol), [slotsKey]);
  const labelPorRol = useMemo(
    () => new Map(slots.map((s) => [s.rol, s.label])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotsKey cubre slots
    [slotsKey]
  );

  const cargarDocs = useCallback(async () => {
    const r = await fetchDocsFase(ventaId, roles);
    if (r.ok) {
      setDocs(r.docs);
      setDocsError(null);
    } else {
      setDocsError(r.error);
    }
  }, [ventaId, roles]);

  useEffect(() => {
    if (!ventaId) return;
    void cargarDocs();
    void createSupabaseBrowserClient()
      .auth.getUser()
      .then((r) => setUserId(r.data?.user?.id ?? null));
  }, [ventaId, cargarDocs]);

  const onPickDoc = useCallback(
    async (slot: SlotColaborativo, file: File) => {
      setSubiendoRol(slot.rol);
      try {
        const r = await subirDocFase(sb, { ventaId, rol: slot.rol, archivo: file, userId });
        if (!r.ok) {
          toast.add({
            title: 'No se pudo subir el documento',
            description: r.error,
            type: 'error',
          });
          return;
        }
        toast.add({
          title: `${slot.label} guardado`,
          description: 'El documento quedó en el expediente — no se pierde al salir.',
          type: 'success',
        });
        await cargarDocs();
      } finally {
        setSubiendoRol(null);
      }
    },
    [sb, ventaId, userId, toast, cargarDocs]
  );

  const faltantes = useMemo(() => {
    const requeridos = slots.filter((s) => s.requerido).map((s) => s.rol);
    return docs ? faltantesParaCerrar(docs, requeridos) : requeridos;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotsKey cubre slots
  }, [docs, slotsKey]);

  const labelDe = useCallback((rol: string) => labelPorRol.get(rol) ?? rol, [labelPorRol]);

  return { docs, docsError, subiendoRol, faltantes, labelDe, cargarDocs, onPickDoc, slots };
}

/** `erp.adjuntos.created_at` viene en UTC — formatear en hora local. */
function fmtMomento(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Sección "Documentos" con slots de persistencia inmediata. */
export function DocsFaseSection({
  state,
  disabled = false,
  titulo = 'Documentos',
}: {
  state: DocsFaseState;
  /** Bloquea la subida (no la vista) — ej. fase previa sin cerrar. */
  disabled?: boolean;
  titulo?: string;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
        {titulo}
      </h2>
      {state.docsError ? (
        <p className="mb-2 text-xs text-destructive">
          {state.docsError}{' '}
          <button type="button" className="underline" onClick={() => void state.cargarDocs()}>
            Reintentar
          </button>
        </p>
      ) : null}
      <div className="space-y-2">
        {state.slots.map((s) => (
          <DocSlotColaborativo
            key={s.rol}
            slot={s}
            estado={state.docs?.[s.rol]}
            cargando={state.docs == null && !state.docsError}
            subiendo={state.subiendoRol === s.rol}
            deshabilitado={disabled || (state.subiendoRol != null && state.subiendoRol !== s.rol)}
            onPick={(f) => void state.onPickDoc(s, f)}
          />
        ))}
      </div>
    </section>
  );
}

function DocSlotColaborativo({
  slot,
  estado,
  cargando,
  subiendo,
  deshabilitado,
  onPick,
}: {
  slot: SlotColaborativo;
  estado: DocRolEstado | undefined;
  cargando: boolean;
  subiendo: boolean;
  deshabilitado: boolean;
  onPick: (f: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const doc = estado?.vigente;

  const aceptar = (f: File | undefined) => {
    if (!f || subiendo || deshabilitado) return;
    const nombre = f.name.toLowerCase();
    if (!(f.type === 'application/pdf' || f.type.startsWith('image/') || nombre.endsWith('.pdf'))) {
      return;
    }
    onPick(f);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        aceptar(e.dataTransfer.files?.[0]);
      }}
      className={`flex items-center justify-between gap-3 rounded-lg border bg-[var(--card)] px-4 py-3 transition-colors ${
        dragOver
          ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/40'
          : 'border-[var(--border)]'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        {doc ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-[var(--text)]/35" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {slot.label}
              {slot.requerido ? ' *' : ''}
            </span>
            {doc ? (
              <a
                href={getAdjuntoProxyUrl(doc.url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-0.5 text-xs text-[var(--accent)] hover:underline"
              >
                Ver <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          {cargando ? (
            <p className="text-xs text-[var(--text)]/45">Cargando expediente…</p>
          ) : doc ? (
            <p className="truncate text-xs text-[var(--text)]/60">
              <span className="font-mono">{doc.nombre}</span>
              {' · '}
              {doc.subidoPorNombre ? `Subió ${doc.subidoPorNombre}` : 'Subido'} ·{' '}
              {fmtMomento(doc.subidoAt)}
              {estado && estado.versiones > 1 ? ` · v${estado.versiones}` : ''}
            </p>
          ) : (
            <p className="text-xs text-[var(--text)]/45">Sin documento en el expediente.</p>
          )}
        </div>
      </div>
      <label
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium ${
          subiendo || deshabilitado
            ? 'cursor-not-allowed text-[var(--text)]/40'
            : 'cursor-pointer text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]'
        }`}
      >
        {subiendo ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo…
          </>
        ) : (
          <>
            <Upload className="h-3.5 w-3.5" />
            {doc ? 'Cambiar' : 'Subir'}
          </>
        )}
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          disabled={subiendo || deshabilitado}
          onChange={(e) => {
            aceptar(e.target.files?.[0] ?? undefined);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}

'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: el useEffect dispara la carga inicial de adjuntos y
 * actualiza state interno. Reestructurar a un data-loader (RSC, SWR, etc.)
 * saca este componente del alcance de este PR.
 */

/**
 * EmpleadoAdjuntos — sección de documentos del empleado.
 *
 * Los 10 roles migrados desde Coda + cualquier otro se muestran agrupados
 * por categoría. Cada archivo es clickeable (abre vía `/api/adjuntos/...`
 * proxy autenticado — el bucket `adjuntos` es privado).
 *
 * Capacidades:
 *   - Agrupar por rol conocido ("cv", "ine", etc.) con icono y label.
 *   - Subir archivo por rol.
 *   - Eliminar (con confirmación).
 *   - Drag & drop via <input type=file>.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  Download,
} from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

type Adjunto = {
  id: string;
  nombre: string;
  url: string;
  rol: string;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  created_at: string;
};

export const EMPLEADO_ROLES: Array<{ id: string; label: string; icon: string }> = [
  { id: 'foto', label: 'Fotografía', icon: '🖼️' },
  { id: 'cv', label: 'Curriculum Vitae', icon: '📄' },
  { id: 'solicitud', label: 'Solicitud de Empleo', icon: '📝' },
  { id: 'constancia_estudios', label: 'Constancia de Estudios', icon: '🎓' },
  { id: 'acta_nacimiento', label: 'Acta de Nacimiento', icon: '📋' },
  { id: 'ine', label: 'Credencial de Elector (INE)', icon: '🪪' },
  { id: 'curp', label: 'CURP', icon: '🆔' },
  { id: 'imss', label: 'IMSS', icon: '🏥' },
  { id: 'licencia_conducir', label: 'Licencia de Conducir', icon: '🚗' },
  { id: 'finiquito', label: 'Finiquito', icon: '📑' },
  { id: 'otro', label: 'Otro', icon: '📎' },
];

const ROLE_LABELS = Object.fromEntries(EMPLEADO_ROLES.map((r) => [r.id, r.label]));

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(a: Adjunto): boolean {
  return a.tipo_mime?.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(a.nombre);
}

function isPdf(a: Adjunto): boolean {
  return a.tipo_mime === 'application/pdf' || a.nombre.toLowerCase().endsWith('.pdf');
}

export function EmpleadoAdjuntos({
  empleadoId,
  empresaId,
  readOnly,
}: {
  empleadoId: string;
  empresaId: string;
  readOnly?: boolean;
}) {
  const supabase = createSupabaseERPClient();
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadRole, setUploadRole] = useState<string>('cv');
  const [pendingDelete, setPendingDelete] = useState<Adjunto | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .schema('erp')
      .from('adjuntos')
      .select('id, nombre, url, rol, tipo_mime, tamano_bytes, created_at')
      .eq('empresa_id', empresaId)
      .eq('entidad_tipo', 'empleado')
      .eq('entidad_id', empleadoId)
      .order('rol')
      .order('created_at');
    if (!error) setAdjuntos((data ?? []) as Adjunto[]);
    setLoading(false);
  }, [supabase, empresaId, empleadoId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const safe = file.name
        .replace(/\.[^.]+$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100);
      const path = `empleados/${empleadoId}/${Date.now()}-${uploadRole}-${safe || uploadRole}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('adjuntos')
        .upload(path, file, { upsert: false });
      if (upErr) {
        alert(`Error subiendo: ${upErr.message}`);
        break;
      }
      const { error: insErr } = await supabase
        .schema('erp')
        .from('adjuntos')
        .insert({
          empresa_id: empresaId,
          entidad_tipo: 'empleado',
          entidad_id: empleadoId,
          nombre: file.name,
          url: path,
          tipo_mime: file.type || null,
          tamano_bytes: file.size,
          rol: uploadRole,
        });
      if (insErr) {
        // Borra el archivo para no dejar huérfano
        await supabase.storage.from('adjuntos').remove([path]);
        alert(`Error registrando adjunto: ${insErr.message}`);
        break;
      }
    }
    setUploading(false);
    e.target.value = '';
    await refresh();
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    // Borra DB + storage
    await supabase.schema('erp').from('adjuntos').delete().eq('id', pendingDelete.id);
    await supabase.storage.from('adjuntos').remove([pendingDelete.url]);
    setPendingDelete(null);
    await refresh();
  };

  // Agrupa por rol: primero los roles conocidos en orden, luego cualquier otro
  const byRol = new Map<string, Adjunto[]>();
  for (const a of adjuntos) {
    const arr = byRol.get(a.rol) ?? [];
    arr.push(a);
    byRol.set(a.rol, arr);
  }
  const orderedRoles = [
    ...EMPLEADO_ROLES.map((r) => r.id).filter((r) => byRol.has(r)),
    ...Array.from(byRol.keys()).filter((r) => !EMPLEADO_ROLES.some((er) => er.id === r)),
  ];

  if (loading) {
    return <p className="text-xs text-[var(--text)]/40">Cargando documentos…</p>;
  }

  return (
    <div className="space-y-3">
      {orderedRoles.length === 0 ? (
        <p className="text-xs text-[var(--text)]/40">Sin documentos registrados todavía.</p>
      ) : (
        // Lista vertical: cada documento ocupa una fila completa con el nombre
        // del archivo visible sin truncar. Ocupa más espacio pero es mucho más
        // escaneable — Beto explícitamente pidió ver los nombres directos.
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--panel)] overflow-hidden">
          {orderedRoles.flatMap((rol) => {
            const items = byRol.get(rol) ?? [];
            const meta = EMPLEADO_ROLES.find((r) => r.id === rol);
            const label = meta?.label ?? ROLE_LABELS[rol] ?? rol;
            const icon = meta?.icon ?? '📎';
            return items.map((a, idx) => {
              const href = getAdjuntoProxyUrl(a.url);
              const img = isImage(a);
              const pdf = isPdf(a);
              return (
                <li
                  key={a.id}
                  className="group flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--card)]/50 transition"
                >
                  {/* Etiqueta del rol, visible solo en el primer archivo del grupo
                      para que el listado se lea como secciones visuales. */}
                  <div className="flex w-40 shrink-0 items-center gap-1.5">
                    {idx === 0 ? (
                      <>
                        <span className="text-base">{icon}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text)]/65">
                          {label}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-[var(--text)]/30 pl-6">↳</span>
                    )}
                  </div>

                  {/* Thumbnail de imagen (solo si es imagen) */}
                  {img ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                      title="Abrir"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={href}
                        alt={a.nombre}
                        className="h-12 w-12 rounded-lg border border-[var(--border)] object-cover"
                      />
                    </a>
                  ) : (
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] ${
                        pdf
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-[var(--card)] text-[var(--text)]/40'
                      }`}
                    >
                      {pdf ? <FileText className="h-5 w-5" /> : <Paperclip className="h-4 w-4" />}
                    </div>
                  )}

                  {/* Nombre del archivo + metadata. Se permite wrap para que no
                      se trunque — Beto pidió poder leer el nombre completo. */}
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 hover:underline"
                    title={`Abrir ${a.nombre}`}
                  >
                    <div className="text-sm text-[var(--text)] break-words leading-snug">
                      {a.nombre}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--text)]/40">
                      {a.tamano_bytes != null && <span>{formatSize(a.tamano_bytes)}</span>}
                      <span>
                        ·{' '}
                        {new Date(a.created_at).toLocaleDateString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </a>

                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] text-[var(--text)]/70 transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
                  >
                    <Download className="h-3 w-3" />
                    Abrir
                  </a>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(a)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text)]/30 hover:text-red-400"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            });
          })}
        </ul>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]">
          <Select value={uploadRole} onValueChange={(v) => setUploadRole(v ?? 'otro')}>
            <SelectTrigger className="h-8 w-56 rounded-xl border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLEADO_ROLES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.icon} {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.tiff"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--text)]/70 transition hover:bg-[var(--card)] hover:text-[var(--text)]">
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              {uploading ? 'Subiendo…' : 'Subir archivo'}
            </span>
          </label>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="¿Eliminar este archivo?"
        description={pendingDelete ? `Se eliminará "${pendingDelete.nombre}".` : undefined}
        confirmLabel="Eliminar"
      />
    </div>
  );
}

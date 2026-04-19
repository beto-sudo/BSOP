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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {orderedRoles.map((rol) => {
            const items = byRol.get(rol) ?? [];
            const meta = EMPLEADO_ROLES.find((r) => r.id === rol);
            const label = meta?.label ?? ROLE_LABELS[rol] ?? rol;
            const icon = meta?.icon ?? '📎';
            return (
              <div
                key={rol}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span>{icon}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]/60">
                    {label}
                  </span>
                  <span className="text-[10px] text-[var(--text)]/30">({items.length})</span>
                </div>
                <ul className="space-y-1">
                  {items.map((a) => {
                    const href = getAdjuntoProxyUrl(a.url);
                    return (
                      <li key={a.id} className="group flex items-center gap-2">
                        {isImage(a) ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={href}
                              alt={a.nombre}
                              className="h-10 w-10 rounded-lg border border-[var(--border)] object-cover"
                            />
                          </a>
                        ) : null}
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs transition hover:bg-[var(--card)]/80 ${
                            isPdf(a)
                              ? 'text-red-400'
                              : isImage(a)
                                ? 'text-blue-400'
                                : 'text-[var(--accent)]'
                          }`}
                          title={a.nombre}
                        >
                          {isPdf(a) ? (
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                          ) : isImage(a) ? (
                            <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Paperclip className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span className="min-w-0 truncate">{a.nombre}</span>
                          {a.tamano_bytes != null && (
                            <span className="shrink-0 text-[var(--text)]/30">
                              {formatSize(a.tamano_bytes)}
                            </span>
                          )}
                          <Download className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition" />
                        </a>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => setPendingDelete(a)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10 text-[var(--text)]/30 hover:text-red-400"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
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

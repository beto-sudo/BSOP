'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Loader2,
  Save,
  Send,
  Lock,
  Globe,
  Paperclip,
  Bug,
  TicketCheck,
  Sparkles,
  MessageSquare,
  ExternalLink,
  Pencil,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  empresa_id: string;
  kind: 'task' | 'bug' | 'feature' | 'request';
  titulo: string;
  descripcion: string | null;
  prioridad_id: string | null;
  categoria_id: string | null;
  estado_id: string | null;
  creador_id: string | null;
  responsable_id: string | null;
  fecha_limite: string | null;
  fecha_resolucion: string | null;
  severidad: string | null;
  modulo: string | null;
  url_referencia: string | null;
  created_at: string;
  updated_at: string;
};

type Prioridad = { id: string; nombre: string; peso: number; color: string };
type Estado = { id: string; nombre: string; tipo: string; color: string; orden: number };
type Categoria = { id: string; nombre: string; icono: string | null };
type Usuario = { id: string; email: string; first_name: string | null };

type Comment = {
  id: string;
  task_id: string;
  usuario_id: string | null;
  comentario: string;
  es_interno: boolean;
  created_at: string;
};

type Attachment = {
  id: string;
  task_id: string;
  nombre_archivo: string;
  url_archivo: string;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  task: {
    label: 'Tarea',
    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    icon: <TicketCheck className="h-3.5 w-3.5" />,
  },
  bug: {
    label: 'Bug',
    cls: 'bg-red-500/15 text-red-400 border-red-500/20',
    icon: <Bug className="h-3.5 w-3.5" />,
  },
  feature: {
    label: 'Feature',
    cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  request: {
    label: 'Solicitud',
    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    icon: <MessageSquare className="h-3.5 w-3.5" />,
  },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
      {children}
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const cfg = KIND_CONFIG[kind] ?? {
    label: kind,
    cls: 'bg-[var(--border)] text-[var(--text)]/70 border-[var(--border)]',
    icon: null,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function TaskDetailInner() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  // Reference data
  const [prioridades, setPrioridades] = useState<Prioridad[]>([]);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  // Task
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline editing
  const [editingTitulo, setEditingTitulo] = useState(false);
  const [tituloVal, setTituloVal] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState('');
  const tituloRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isInterno, setIsInterno] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  const fetchRefData = useCallback(async () => {
    const [priRes, estRes, catRes] = await Promise.all([
      supabase.schema('shared' as any).from('prioridades').select('*').order('peso'),
      supabase.schema('shared' as any).from('estados').select('*').order('orden'),
      supabase.schema('shared' as any).from('categorias').select('*').order('nombre'),
    ]);
    setPrioridades(priRes.data ?? []);
    setEstados(estRes.data ?? []);
    setCategorias(catRes.data ?? []);
  }, [supabase]);

  const fetchUsersForTask = useCallback(
    async (empresaId: string) => {
      const { data: ueData } = await supabase
        .schema('core' as any)
        .from('usuarios_empresas')
        .select('usuario_id')
        .eq('empresa_id', empresaId)
        .eq('activo', true);

      const userIds = (ueData ?? []).map((u: any) => u.usuario_id);
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .schema('core' as any)
          .from('usuarios')
          .select('id, email, first_name')
          .in('id', userIds)
          .eq('activo', true);
        setUsuarios(usersData ?? []);
      }
    },
    [supabase],
  );

  const fetchTask = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('core' as any)
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .is('deleted_at', null)
      .single();

    if (err || !data) {
      setError(err?.message ?? 'Tarea no encontrada');
      return null;
    }
    setTask(data);
    return data as Task;
  }, [supabase, taskId]);

  const fetchComments = useCallback(async () => {
    setCommentsLoading(true);
    const { data } = await supabase
      .schema('core' as any)
      .from('task_comentarios')
      .select('*')
      .eq('task_id', taskId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    setComments(data ?? []);
    setCommentsLoading(false);
  }, [supabase, taskId]);

  const fetchAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    const { data } = await supabase
      .schema('core' as any)
      .from('task_adjuntos')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    setAttachments(data ?? []);
    setAttachmentsLoading(false);
  }, [supabase, taskId]);

  const fetchCurrentUser = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return;
    const { data: coreUser } = await supabase
      .schema('core' as any)
      .from('usuarios')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();
    setCurrentUserId(coreUser?.id ?? null);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const init = async () => {
      await Promise.all([fetchRefData(), fetchCurrentUser()]);
      const taskData = await fetchTask();
      if (cancelled || !taskData) return;
      await fetchUsersForTask(taskData.empresa_id);
      await Promise.all([fetchComments(), fetchAttachments()]);
      if (!cancelled) setLoading(false);
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchRefData, fetchTask, fetchComments, fetchAttachments, fetchCurrentUser, fetchUsersForTask]);

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (editingTitulo) tituloRef.current?.focus();
  }, [editingTitulo]);

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const patchTask = useCallback(
    async (updates: Partial<Task>) => {
      if (!task) return;
      setSaving(true);
      const { data, error: err } = await supabase
        .schema('core' as any)
        .from('tasks')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', task.id)
        .select()
        .single();
      setSaving(false);
      if (!err && data) setTask(data as Task);
    },
    [supabase, task],
  );

  const saveTitulo = async () => {
    if (!tituloVal.trim()) return;
    setEditingTitulo(false);
    await patchTask({ titulo: tituloVal.trim() });
  };

  const saveDesc = async () => {
    setEditingDesc(false);
    await patchTask({ descripcion: descVal.trim() || null });
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    setSendingComment(true);
    await supabase
      .schema('core' as any)
      .from('task_comentarios')
      .insert({
        task_id: taskId,
        usuario_id: currentUserId,
        comentario: newComment.trim(),
        es_interno: isInterno,
      });
    setNewComment('');
    await fetchComments();
    setSendingComment(false);
  };

  const prioridadMap = new Map(prioridades.map((p) => [p.id, p]));
  const estadoMap = new Map(estados.map((e) => [e.id, e]));
  const categoriaMap = new Map(categorias.map((c) => [c.id, c]));
  const usuarioMap = new Map(usuarios.map((u) => [u.id, u]));

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-10 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-red-400" />
        <p className="text-[var(--text)]/70">{error ?? 'Tarea no encontrada'}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/rdb/tasks')}
          className="mt-4 rounded-xl border-[var(--border)] text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Tareas
        </Button>
      </div>
    );
  }

  const estado = estadoMap.get(task.estado_id ?? '');
  const prioridad = prioridadMap.get(task.prioridad_id ?? '');
  const categoria = categoriaMap.get(task.categoria_id ?? '');
  const responsable = usuarioMap.get(task.responsable_id ?? '');
  const creador = usuarioMap.get(task.creador_id ?? '');

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/rdb/tasks')}
          className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Tareas
        </Button>
        <span className="text-[var(--text)]/30">/</span>
        <span className="text-sm text-[var(--text)]/55 line-clamp-1 max-w-xs">{task.titulo}</span>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text)]/40 ml-1" />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-2">
          {/* Titulo */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <KindBadge kind={task.kind} />
                {task.modulo && (
                  <span className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-xs text-[var(--text)]/60">
                    {task.modulo}
                  </span>
                )}
                {task.kind === 'bug' && task.severidad && (
                  <span className="rounded-lg border border-orange-500/25 bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-400">
                    ⚠ {task.severidad}
                  </span>
                )}
              </div>
              {!editingTitulo && (
                <button
                  onClick={() => {
                    setTituloVal(task.titulo);
                    setEditingTitulo(true);
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text)]/30 transition hover:bg-[var(--panel)] hover:text-[var(--text)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {editingTitulo ? (
              <div className="flex gap-2">
                <Input
                  ref={tituloRef}
                  value={tituloVal}
                  onChange={(e) => setTituloVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveTitulo();
                    if (e.key === 'Escape') setEditingTitulo(false);
                  }}
                  className="flex-1 rounded-xl border-[var(--border)] bg-[var(--panel)] text-lg font-semibold text-[var(--text)]"
                />
                <Button
                  size="sm"
                  onClick={saveTitulo}
                  className="rounded-xl bg-[var(--accent)] text-white"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingTitulo(false)}
                  className="rounded-xl border-[var(--border)]"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <h1 className="text-xl font-semibold text-[var(--text)] leading-snug">
                {task.titulo}
              </h1>
            )}
          </div>

          {/* Descripcion */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <FieldLabel>Descripción</FieldLabel>
              {!editingDesc && (
                <button
                  onClick={() => {
                    setDescVal(task.descripcion ?? '');
                    setEditingDesc(true);
                  }}
                  className="rounded-lg p-1.5 text-[var(--text)]/30 transition hover:bg-[var(--panel)] hover:text-[var(--text)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {editingDesc ? (
              <div className="space-y-2">
                <Textarea
                  ref={descRef}
                  value={descVal}
                  onChange={(e) => setDescVal(e.target.value)}
                  rows={6}
                  placeholder="Agrega una descripción..."
                  className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={saveDesc}
                    className="gap-1.5 rounded-xl bg-[var(--accent)] text-white"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingDesc(false)}
                    className="rounded-xl border-[var(--border)]"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : task.descripcion ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]/75">
                {task.descripcion}
              </p>
            ) : (
              <button
                onClick={() => {
                  setDescVal('');
                  setEditingDesc(true);
                }}
                className="text-sm italic text-[var(--text)]/35 hover:text-[var(--text)]/55 transition-colors"
              >
                Sin descripción. Haz clic para agregar.
              </button>
            )}
          </div>

          {/* Adjuntos */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <FieldLabel>Archivos adjuntos ({attachments.length})</FieldLabel>
            </div>

            {attachmentsLoading ? (
              <Skeleton className="h-12 w-full rounded-xl" />
            ) : attachments.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text)]/35">
                <Paperclip className="h-4 w-4" />
                Sin archivos adjuntos
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.url_archivo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm transition hover:border-[var(--accent)]/40"
                  >
                    <Paperclip className="h-4 w-4 shrink-0 text-[var(--text)]/40" />
                    <span className="flex-1 truncate text-[var(--text)]/80">{att.nombre_archivo}</span>
                    {att.tamano_bytes && (
                      <span className="shrink-0 text-xs text-[var(--text)]/40">
                        {formatBytes(att.tamano_bytes)}
                      </span>
                    )}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--text)]/30" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Comentarios */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <FieldLabel>Comentarios ({comments.length})</FieldLabel>

            {commentsLoading ? (
              <div className="space-y-3 mt-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : comments.length === 0 ? (
              <p className="mt-3 text-sm italic text-[var(--text)]/35">Sin comentarios aún.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {comments.map((c) => {
                  const author = usuarioMap.get(c.usuario_id ?? '');
                  return (
                    <div
                      key={c.id}
                      className={`rounded-xl border p-3 ${
                        c.es_interno
                          ? 'border-amber-500/20 bg-amber-500/8'
                          : 'border-[var(--border)] bg-[var(--panel)]'
                      }`}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text)]/70">
                          {author ? (author.first_name ?? author.email) : 'Usuario'}
                        </span>
                        {c.es_interno && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                            <Lock className="h-2.5 w-2.5" />
                            Interno
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-[var(--text)]/35">
                          {formatDateTime(c.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-[var(--text)]/80">
                        {c.comentario}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add comment */}
            <div className="mt-4 space-y-2">
              <Separator className="bg-[var(--border)]" />
              <Textarea
                placeholder="Escribe un comentario..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                className="mt-3 resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsInterno((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    isInterno
                      ? 'border-amber-500/30 bg-amber-500/15 text-amber-400'
                      : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]/55 hover:text-[var(--text)]'
                  }`}
                >
                  {isInterno ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                  {isInterno ? 'Interno' : 'Público'}
                </button>
                <Button
                  size="sm"
                  onClick={handleSendComment}
                  disabled={sendingComment || !newComment.trim()}
                  className="ml-auto gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
                >
                  {sendingComment ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Comentar
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Estado */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <FieldLabel>Estado</FieldLabel>
            <Select
              value={task.estado_id ?? ''}
              onValueChange={(v) => void patchTask({ estado_id: v || null })}
            >
              <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue placeholder="Sin estado">
                  {estado ? (
                    <span
                      className="inline-flex items-center gap-1.5"
                      style={{ color: estado.color }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: estado.color }}
                      />
                      {estado.nombre}
                    </span>
                  ) : (
                    <span className="text-[var(--text)]/40">Sin estado</span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {estados.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Metadata card */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
            {/* Prioridad */}
            <div>
              <FieldLabel>Prioridad</FieldLabel>
              <Select
                value={task.prioridad_id ?? ''}
                onValueChange={(v) => void patchTask({ prioridad_id: v || null })}
              >
                <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                  <SelectValue placeholder="Sin prioridad">
                    {prioridad ? (
                      <span
                        className="inline-flex items-center gap-1.5"
                        style={{ color: prioridad.color }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: prioridad.color }}
                        />
                        {prioridad.nombre}
                      </span>
                    ) : (
                      <span className="text-[var(--text)]/40">Sin prioridad</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {prioridades.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-[var(--border)]" />

            {/* Responsable */}
            <div>
              <FieldLabel>Responsable</FieldLabel>
              <Select
                value={task.responsable_id ?? ''}
                onValueChange={(v) => void patchTask({ responsable_id: v || null })}
              >
                <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                  <SelectValue placeholder="Sin asignar">
                    {responsable
                      ? (responsable.first_name ?? responsable.email)
                      : <span className="text-[var(--text)]/40">Sin asignar</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin asignar</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name ?? u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-[var(--border)]" />

            {/* Categoria */}
            <div>
              <FieldLabel>Categoría</FieldLabel>
              <Select
                value={task.categoria_id ?? ''}
                onValueChange={(v) => void patchTask({ categoria_id: v || null })}
              >
                <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                  <SelectValue placeholder="Sin categoría">
                    {categoria
                      ? `${categoria.icono ? `${categoria.icono} ` : ''}${categoria.nombre}`
                      : <span className="text-[var(--text)]/40">Sin categoría</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin categoría</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.icono ? `${c.icono} ` : ''}
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-[var(--border)]" />

            {/* Severidad (bugs only) */}
            {task.kind === 'bug' && (
              <>
                <div>
                  <FieldLabel>Severidad</FieldLabel>
                  <Select
                    value={task.severidad ?? ''}
                    onValueChange={(v) => void patchTask({ severidad: v || null })}
                  >
                    <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                      <SelectValue placeholder="Sin severidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin severidad</SelectItem>
                      <SelectItem value="critica">Crítica</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator className="bg-[var(--border)]" />
              </>
            )}

            {/* Fechas */}
            <div>
              <FieldLabel>Fecha límite</FieldLabel>
              <Input
                type="date"
                value={task.fecha_limite?.substring(0, 10) ?? ''}
                onChange={(e) =>
                  void patchTask({ fecha_limite: e.target.value || null })
                }
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            {task.fecha_resolucion && (
              <div>
                <FieldLabel>Fecha resolución</FieldLabel>
                <p className="text-sm text-[var(--text)]/70">{formatDate(task.fecha_resolucion)}</p>
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text)]/45">Creado por</span>
              <span className="text-[var(--text)]/70 font-medium">
                {creador ? (creador.first_name ?? creador.email) : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text)]/45">Creado</span>
              <span className="text-[var(--text)]/70">{formatDate(task.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text)]/45">Actualizado</span>
              <span className="text-[var(--text)]/70">{formatDate(task.updated_at)}</span>
            </div>
            {task.modulo && (
              <div className="flex justify-between">
                <span className="text-[var(--text)]/45">Módulo</span>
                <span className="text-[var(--text)]/70 font-medium">{task.modulo}</span>
              </div>
            )}
            {task.url_referencia && (
              <div className="flex justify-between items-center">
                <span className="text-[var(--text)]/45">Referencia</span>
                <a
                  href={task.url_referencia}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[var(--accent)] hover:underline"
                >
                  Abrir <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.tasks">
      <TaskDetailInner />
    </RequireAccess>
  );
}

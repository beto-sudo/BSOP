'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Cleanup PR (#30): pre-existing `any` on Supabase row mapping for meeting
 * data. Proper typing requires schema refactor — out of scope for lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { rewriteHtmlImagesToSigned, normalizeHtmlImagesToPaths } from '@/lib/adjuntos';
import { htmlHasCodaImages, importCodaImagesInHtml } from '@/lib/coda-paste-import';
import { fetchJuntaUpdates } from '@/lib/juntas/fetch-updates';
import { TasksCreateForm } from '@/components/tasks/tasks-create-form';
import { emptyTaskForm, type TaskFormValues } from '@/components/tasks/tasks-shared';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Combobox } from '@/components/ui/combobox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Save,
  Loader2,
  Users,
  TicketCheck,
  Plus,
  Trash2,
  Check,
  X,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Table2,
  Heading2,
  Heading3,
  CheckCircle2,
  ImagePlus,
  MessageSquarePlus,
  Clock,
  Send,
} from 'lucide-react';

type Junta = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  fecha_hora: string;
  duracion_minutos: number | null;
  lugar: string | null;
  estado: 'programada' | 'en_curso' | 'completada' | 'cancelada';
  tipo: string | null;
  enviar_a_consejo: boolean;
  creado_por: string | null;
  created_at: string;
  updated_at: string | null;
  fecha_terminada: string | null;
};

type Asistencia = {
  id: string;
  junta_id: string;
  persona_id: string | null;
  asistio: boolean | null;
  notas: string | null;
  persona?: { nombre: string; apellido_paterno: string | null } | null;
};

type JuntaTask = {
  id: string;
  titulo: string;
  estado: 'pendiente' | 'en_progreso' | 'bloqueado' | 'completado' | 'cancelado';
  asignado_a: string | null;
  fecha_vence: string | null;
};

type Persona = { id: string; nombre: string };
type Empleado = { id: string; nombre: string };

type TaskUpdate = {
  id: string;
  task_id: string;
  tipo: string;
  contenido: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  creado_por: string | null;
  created_at: string;
  usuario?: { nombre: string } | null;
  task?: {
    titulo: string;
    estado: string;
    asignado_a: string | null;
    fecha_vence: string | null;
  } | null;
};

const PRIORIDAD_OPTIONS = ['Urgente', 'Alta', 'Media', 'Baja'] as const;

const ESTADO_JUNTA: Record<Junta['estado'], { label: string; cls: string }> = {
  programada: { label: 'Programada', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  en_curso: { label: 'En curso', cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  completada: {
    label: 'Completada',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/50 border-[var(--border)]',
  },
  cancelada: { label: 'Cancelada', cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
};

const ESTADO_TASK: Record<string, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  en_progreso: { label: 'En progreso', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  bloqueado: { label: 'Bloqueado', cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  completado: { label: 'Completado', cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  cancelado: {
    label: 'Cancelado',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/40 border-[var(--border)]',
  },
};

const TIPO_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'Comité Ejecutivo', label: 'Comité Ejecutivo', icon: '👔' },
  { value: 'Consejo', label: 'Consejo', icon: '🏢' },
  { value: 'Ventas', label: 'Ventas', icon: '💰' },
  { value: 'Atención PosVenta', label: 'Atención PosVenta', icon: '🔧' },
  { value: 'Administración', label: 'Administración', icon: '📁' },
  { value: 'Mercadotecnia', label: 'Mercadotecnia', icon: '📣' },
  { value: 'Construcción', label: 'Construcción', icon: '🏗️' },
  { value: 'Compras y Admon. Inventario', label: 'Compras y Admon. Inv.', icon: '📦' },
  { value: 'Maquinaria', label: 'Maquinaria', icon: '🚜' },
  { value: 'Proyectos', label: 'Proyectos', icon: '🗂️' },
  { value: 'Rincón del Bosque', label: 'Rincón del Bosque', icon: '🌲' },
  { value: 'Extraordinaria', label: 'Extraordinaria', icon: '🚨' },
  { value: 'Otro', label: 'Otro', icon: '📌' },
];

const TIPO_CONFIG: Record<string, string> = Object.fromEntries([
  ...TIPO_OPTIONS.map((t) => [t.value, `${t.icon} ${t.label}`]),
  ['Comite Ejecutivo', '👔 Comité Ejecutivo'],
  ['Junta Operativa', '⚙️ Junta Operativa'],
  ['Junta de Área', '📋 Junta de Área'],
  ['operativa', '⚙️ Operativa'],
  ['directiva', '🏛️ Directiva'],
  ['seguimiento', '📊 Seguimiento'],
  ['emergencia', '🚨 Emergencia'],
]);

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(s: string | null) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Date + hora, usado en los comentarios de actualizaciones de tareas para
 * tener contexto de cuándo se capturó cada nota ("18 abr 2026, 10:35").
 */
function formatDateTime(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-3">
      {children}
    </h2>
  );
}

// Combobox local eliminado — ahora se usa el universal `@/components/ui/combobox`.

function EditorToolbar({
  editor,
  onInsertImage,
}: {
  // Con `immediatelyRender: false` (requerido por Next SSR), `useEditor`
  // puede devolver null en el primer render antes de hidratar.
  editor: ReturnType<typeof useEditor> | null;
  onInsertImage: () => void;
}) {
  if (!editor) return null;
  const btn = (active: boolean, onClick: () => void, title: string, icon: React.ReactNode) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        'inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm transition',
        active
          ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
          : 'text-[var(--text)]/60 hover:bg-[var(--panel)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {icon}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-xl border border-[var(--border)] bg-[var(--card)] p-1.5">
      {btn(
        editor.isActive('bold'),
        () => editor.chain().focus().toggleBold().run(),
        'Negrita',
        <Bold className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('italic'),
        () => editor.chain().focus().toggleItalic().run(),
        'Cursiva',
        <Italic className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('underline'),
        () => editor.chain().focus().toggleUnderline().run(),
        'Subrayado',
        <UnderlineIcon className="h-3.5 w-3.5" />
      )}
      <div className="mx-1 h-5 w-px bg-[var(--border)]" />
      {btn(
        editor.isActive('heading', { level: 2 }),
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        'H2',
        <Heading2 className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('heading', { level: 3 }),
        () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        'H3',
        <Heading3 className="h-3.5 w-3.5" />
      )}
      <div className="mx-1 h-5 w-px bg-[var(--border)]" />
      {btn(
        editor.isActive('bulletList'),
        () => editor.chain().focus().toggleBulletList().run(),
        'Lista',
        <List className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('orderedList'),
        () => editor.chain().focus().toggleOrderedList().run(),
        'Lista numerada',
        <ListOrdered className="h-3.5 w-3.5" />
      )}
      <div className="mx-1 h-5 w-px bg-[var(--border)]" />
      <button
        type="button"
        title="Insertar tabla"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm text-[var(--text)]/60 hover:bg-[var(--panel)] hover:text-[var(--text)] transition"
      >
        <Table2 className="h-3.5 w-3.5" />
      </button>
      <div className="mx-1 h-5 w-px bg-[var(--border)]" />
      <button
        type="button"
        title="Insertar imagen"
        onClick={onInsertImage}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm text-[var(--text)]/60 hover:bg-[var(--panel)] hover:text-[var(--text)] transition"
      >
        <ImagePlus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function JuntaDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [junta, setJunta] = useState<Junta | null>(null);
  const [asistencia, setAsistencia] = useState<Asistencia[]>([]);
  const [tasks, setTasks] = useState<JuntaTask[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [fechaHora, setFechaHora] = useState('');
  const [duracion, setDuracion] = useState('60');
  const [lugar, setLugar] = useState('');
  const [estado, setEstado] = useState<Junta['estado']>('programada');
  const [tipo, setTipo] = useState<string>('');
  const [enviarAConsejo, setEnviarAConsejo] = useState(true);

  const [terminating, setTerminating] = useState(false);
  const [showTerminarDialog, setShowTerminarDialog] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [showReenviarDialog, setShowReenviarDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDireccion, setIsDireccion] = useState(false);

  const editor = useEditor({
    // TipTap v3 exige `immediatelyRender: false` cuando corre bajo Next.js
    // con SSR/RSC. Evita el hydration mismatch entre el HTML del server y
    // el del cliente (el server no puede renderizar ProseMirror).
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] p-4 text-[var(--text)]',
      },
      handleDrop(view, event, _slice, moved) {
        if (moved || !event.dataTransfer?.files.length) return false;
        const file = event.dataTransfer.files[0];
        if (!file?.type.startsWith('image/')) return false;
        event.preventDefault();
        void handleImageUpload(file);
        return true;
      },
      handlePaste(view, event) {
        // 1) Single image blob (right-click → Copy image in Coda, or screenshot)
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) void handleImageUpload(file);
              return true;
            }
          }
        }
        // 2) HTML paste with external Coda <img> URLs (Cmd+A + Cmd+C from Coda junta).
        //    Intercept only when we actually see Coda-hosted image references.
        const html = event.clipboardData?.getData('text/html') || '';
        if (htmlHasCodaImages(html)) {
          event.preventDefault();
          void handlePasteWithCodaImages(html);
          return true;
        }
        return false;
      },
    },
  });

  const [showAddPersona, setShowAddPersona] = useState(false);
  const [addingPersona, setAddingPersona] = useState(false);

  const [showAddTask, setShowAddTask] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskFormValues>(emptyTaskForm());
  const [addingTask, setAddingTask] = useState(false);
  const [completingTask, setCompletingTask] = useState<string | null>(null);

  const [taskUpdates, setTaskUpdates] = useState<TaskUpdate[]>([]);
  const [showAddUpdate, setShowAddUpdate] = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState({ contenido: '', nuevoEstado: '', nuevaFecha: '' });
  const [savingUpdate, setSavingUpdate] = useState(false);

  /**
   * Paste handler for HTML blobs that contain Coda-hosted image references.
   * Triggered when the user does Cmd+A + Cmd+C on a Coda junta and pastes
   * into this editor.
   *
   * For each <img src="codahosted.io/...">:
   *   1. POST the URL to /api/adjuntos/import-url which downloads server-side
   *      (avoids CORS) and stores in the private adjuntos bucket under this
   *      junta's folder.
   *   2. Replace the src with the returned /api/adjuntos/<path> proxy URL.
   *
   * After all images are imported, insert the rewritten HTML into the editor.
   */
  const handlePasteWithCodaImages = async (html: string) => {
    if (!editor) return;
    setUploadingImage(true);
    try {
      const { html: rewritten, imported, failed } = await importCodaImagesInHtml(html, id);
      // Insert into the editor at the current cursor position.
      editor.chain().focus().insertContent(rewritten).run();
      if (failed > 0) {
        alert(
          `Imágenes importadas: ${imported}. Fallaron ${failed} — revisa la consola del navegador.`
        );
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!editor || uploadingImage) return;
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `juntas/${id}/${filename}`;
      const { error: uploadErr } = await supabase.storage
        .from('adjuntos')
        .upload(path, file, { upsert: false });
      if (uploadErr) {
        alert(`Error al subir imagen: ${uploadErr.message}`);
        return;
      }
      // Use the same-origin proxy URL. It persists as-is in the DB and the
      // browser authenticates via session cookie — no signed URL expiry,
      // no rewrite race, no broken images on reload.
      editor
        .chain()
        .focus()
        .setImage({ src: `/api/adjuntos/${path}` })
        .run();
    } finally {
      setUploadingImage(false);
    }
  };

  const handleInsertImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleImageUpload(file);
    e.target.value = '';
  };

  const fetchAll = useCallback(async () => {
    const { data: juntaData, error: jErr } = await supabase
      .schema('erp')
      .from('juntas')
      .select('*')
      .eq('id', id)
      .single();
    if (jErr || !juntaData) {
      setError(jErr?.message ?? 'Junta no encontrada');
      setLoading(false);
      return;
    }

    setJunta(juntaData as Junta);
    setTitulo(juntaData.titulo);
    setFechaHora(toDatetimeLocal(juntaData.fecha_hora));
    setDuracion(String(juntaData.duracion_minutos ?? 60));
    setLugar(juntaData.lugar ?? '');
    setEstado(juntaData.estado as Junta['estado']);
    setTipo(juntaData.tipo ?? '');
    setEnviarAConsejo(juntaData.enviar_a_consejo ?? true);
    // Content is set in a separate useEffect that depends on editor readiness

    const { data: asistData } = await supabase
      .schema('erp')
      .from('juntas_asistencia')
      .select('*, persona:persona_id(nombre, apellido_paterno)')
      .eq('junta_id', id)
      .order('created_at');
    setAsistencia((asistData ?? []) as Asistencia[]);

    const { data: tasksData } = await supabase
      .schema('erp')
      .from('tasks')
      .select('id, titulo, estado, asignado_a, fecha_vence')
      .eq('entidad_tipo', 'junta')
      .eq('entidad_id', id)
      .order('created_at');
    setTasks((tasksData ?? []) as JuntaTask[]);

    // Avances de CUALQUIER tarea de la empresa creados dentro de la ventana
    // de la junta (desde fecha_hora; hasta fecha_terminada si ya cerró).
    // Durante la sesión se actualizan tareas que pertenecen a OTRAS juntas,
    // así que filtrar por task_id local dejaría fuera la mayoría.
    // Avances ligados a esta junta por junta_id (trigger de DB).
    const { data: updatesData, error: updatesErr } = await fetchJuntaUpdates(supabase as any, {
      juntaId: id,
    });
    if (updatesErr) console.error('[juntas] task_updates query error:', updatesErr);
    if (updatesData && updatesData.length > 0) {
      const userIds = [...new Set(updatesData.map((u: any) => u.creado_por).filter(Boolean))];
      const uTaskIds = [...new Set(updatesData.map((u: any) => u.task_id).filter(Boolean))];
      const [{ data: usersData }, { data: uTasksData }] = await Promise.all([
        userIds.length > 0
          ? supabase.schema('core').from('usuarios').select('id, first_name').in('id', userIds)
          : Promise.resolve({ data: [] as any[] }),
        uTaskIds.length > 0
          ? supabase
              .schema('erp')
              .from('tasks')
              .select('id, titulo, estado, asignado_a, fecha_vence')
              .in('id', uTaskIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const userMap = new Map((usersData ?? []).map((u: any) => [u.id, u.first_name]));
      const taskMap = new Map(
        (uTasksData ?? []).map((t: any) => [
          t.id,
          {
            titulo: t.titulo,
            estado: t.estado,
            asignado_a: t.asignado_a,
            fecha_vence: t.fecha_vence,
          },
        ])
      );
      setTaskUpdates(
        updatesData.map((u: any) => ({
          ...u,
          usuario: u.creado_por ? { nombre: userMap.get(u.creado_por) ?? 'Usuario' } : null,
          task: taskMap.get(u.task_id) ?? null,
        }))
      );
    } else {
      setTaskUpdates([]);
    }

    const { data: personasData } = await supabase
      .schema('erp')
      .from('personas')
      .select('id, nombre, apellido_paterno')
      .eq('empresa_id', juntaData.empresa_id)
      .eq('activo', true)
      .is('deleted_at', null)
      .order('nombre');
    setPersonas(
      (personasData ?? []).map((p: any) => ({
        id: p.id,
        nombre: [p.nombre, p.apellido_paterno].filter(Boolean).join(' '),
      }))
    );

    const { data: empData } = await supabase
      .schema('erp')
      .from('empleados')
      .select('id, persona:persona_id(nombre, apellido_paterno)')
      .eq('empresa_id', juntaData.empresa_id)
      .eq('activo', true)
      .is('deleted_at', null);
    setEmpleados(
      (empData ?? []).map((e: any) => ({
        id: e.id,
        nombre: [e.persona?.nombre, e.persona?.apellido_paterno].filter(Boolean).join(' '),
      }))
    );

    // Check if user is admin/direccion
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) {
      const { data: coreUser } = await supabase
        .schema('core')
        .from('usuarios')
        .select('rol')
        .eq('email', user.email)
        .maybeSingle();
      if (coreUser?.rol === 'admin') setIsDireccion(true);
    }

    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Marca esta junta como activa del usuario mientras esté en curso (liga
  // avances del módulo de tareas a esta junta via trigger de DB).
  useEffect(() => {
    if (junta?.estado === 'en_curso') {
      void fetch(`/api/juntas/${id}/activar`, { method: 'POST' }).catch(() => {});
    }
  }, [id, junta?.estado]);

  useEffect(() => {
    if (editor && junta?.descripcion) {
      // Always set content when editor becomes ready or junta data changes.
      // Rewrite any stored <img src> (bare path or legacy public URL) to a
      // signed URL so the private bucket renders inside the editor.
      const currentContent = editor.getHTML();
      if (currentContent === '' || currentContent === '<p></p>') {
        void (async () => {
          const hydrated = await rewriteHtmlImagesToSigned(supabase, junta.descripcion, 6 * 3600);
          editor.commands.setContent(hydrated);
        })();
      }
    }
  }, [editor, junta, supabase]);

  const handleSave = async () => {
    if (!junta) return;
    setSaving(true);
    // Normalize signed URLs back to bare paths so the DB never holds a
    // soon-to-expire URL — getAdjuntoPath handles legacy rows too.
    const notesHtml = normalizeHtmlImagesToPaths(editor?.getHTML() ?? null) || null;
    const { error: err } = await supabase
      .schema('erp')
      .from('juntas')
      .update({
        titulo: titulo.trim(),
        fecha_hora: fechaHora,
        lugar: lugar.trim() || null,
        estado,
        tipo: tipo || null,
        enviar_a_consejo: enviarAConsejo,
        descripcion: notesHtml && notesHtml !== '<p></p>' ? notesHtml : null,
      })
      .eq('id', junta.id);
    setSaving(false);
    if (err) alert(`Error al guardar: ${err.message}`);
  };

  const toggleEnviarAConsejo = async (next: boolean) => {
    if (!junta) return;
    const prev = enviarAConsejo;
    setEnviarAConsejo(next);
    const { error: err } = await supabase
      .schema('erp')
      .from('juntas')
      .update({ enviar_a_consejo: next })
      .eq('id', junta.id);
    if (err) {
      setEnviarAConsejo(prev);
      alert(`Error al actualizar: ${err.message}`);
    }
  };

  // Auto-save notes when junta is active (en_curso/programada)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedHtmlRef = useRef<string>('');

  useEffect(() => {
    if (!editor || !junta) return;
    // Only auto-save when junta is active
    if (estado === 'completada' || estado === 'cancelada') return;

    const handleUpdate = () => {
      const html = editor.getHTML();
      // Don't save if content hasn't changed from last save
      if (html === lastSavedHtmlRef.current) return;

      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(async () => {
        const currentHtml = editor.getHTML();
        if (currentHtml === lastSavedHtmlRef.current) return;
        setAutoSaveStatus('saving');
        const persisted = normalizeHtmlImagesToPaths(currentHtml) || null;
        const { error: err } = await supabase
          .schema('erp')
          .from('juntas')
          .update({
            descripcion: persisted && persisted !== '<p></p>' ? persisted : null,
          })
          .eq('id', junta.id);
        if (!err) {
          lastSavedHtmlRef.current = currentHtml;
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } else {
          setAutoSaveStatus('idle');
        }
      }, 3000); // 3 seconds debounce
    };

    editor.on('update', handleUpdate);
    // Set initial reference
    lastSavedHtmlRef.current = editor.getHTML();

    return () => {
      editor.off('update', handleUpdate);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [editor, junta, estado, supabase]);

  // Emergency save: flush unsaved notes when tab loses visibility or page unloads
  useEffect(() => {
    if (!editor || !junta) return;
    if (estado === 'completada' || estado === 'cancelada') return;
    const juntaId = junta.id;
    const flushSave = () => {
      const html = editor.getHTML();
      if (html !== lastSavedHtmlRef.current && html !== '<p></p>') {
        // Fire-and-forget save — normalize image URLs to bare paths first.
        const persisted = normalizeHtmlImagesToPaths(html);
        supabase
          .schema('erp')
          .from('juntas')
          .update({
            descripcion: persisted || null,
          })
          .eq('id', juntaId)
          .then(() => {
            lastSavedHtmlRef.current = html;
          });
      }
    };
    const handleVisChange = () => {
      if (document.visibilityState === 'hidden') flushSave();
    };
    const handleBeforeUnload = () => flushSave();
    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [editor, junta, estado, supabase]);

  // Live polling: refresh notes, tasks & attendance every 10s when junta is active
  const isEditingRef = useRef(false);
  useEffect(() => {
    if (editor) {
      const onFocus = () => {
        isEditingRef.current = true;
      };
      const onBlur = () => {
        isEditingRef.current = false;
      };
      editor.on('focus', onFocus);
      editor.on('blur', onBlur);
      return () => {
        editor.off('focus', onFocus);
        editor.off('blur', onBlur);
      };
    }
  }, [editor]);

  const [lastPoll, setLastPoll] = useState<string>('');
  useEffect(() => {
    if (!junta || estado === 'completada' || estado === 'cancelada') return;
    const juntaId = junta.id;
    const poll = async () => {
      try {
        // Refresh junta description (only if user is NOT actively editing)
        if (!isEditingRef.current && editor) {
          const { data: fresh } = await supabase
            .schema('erp')
            .from('juntas')
            .select('descripcion')
            .eq('id', juntaId)
            .maybeSingle();
          if (fresh) {
            const remoteHtml = fresh.descripcion ?? '';
            const localHtml = editor.getHTML();
            if (remoteHtml !== localHtml && remoteHtml !== lastSavedHtmlRef.current) {
              editor.commands.setContent(remoteHtml, { emitUpdate: false });
              lastSavedHtmlRef.current = remoteHtml;
            }
          }
        }
        // Refresh tasks
        const { data: tasksData } = await supabase
          .schema('erp')
          .from('tasks')
          .select('id, titulo, estado, asignado_a, fecha_vence')
          .eq('entidad_tipo', 'junta')
          .eq('entidad_id', juntaId)
          .order('created_at');
        if (tasksData) {
          setTasks(tasksData as JuntaTask[]);
        }

        // Refresh avances — toda la empresa dentro de la ventana de la junta.
        let updPollBuilder = supabase
          .schema('erp')
          .from('task_updates')
          .select('*')
          .eq('empresa_id', junta.empresa_id)
          .gte('created_at', junta.fecha_hora);
        if (junta.fecha_terminada) {
          updPollBuilder = updPollBuilder.lte('created_at', junta.fecha_terminada);
        }
        const { data: updData } = await updPollBuilder.order('created_at', { ascending: false });
        if (updData) {
          const uIds = [...new Set(updData.map((u: any) => u.creado_por).filter(Boolean))];
          const tIds = [...new Set(updData.map((u: any) => u.task_id).filter(Boolean))];
          const [{ data: uData }, { data: tData }] = await Promise.all([
            uIds.length > 0
              ? supabase.schema('core').from('usuarios').select('id, first_name').in('id', uIds)
              : Promise.resolve({ data: [] as any[] }),
            tIds.length > 0
              ? supabase
                  .schema('erp')
                  .from('tasks')
                  .select('id, titulo, estado, asignado_a, fecha_vence')
                  .in('id', tIds)
              : Promise.resolve({ data: [] as any[] }),
          ]);
          const uMap = new Map((uData ?? []).map((u: any) => [u.id, u.first_name]));
          const tMap = new Map(
            (tData ?? []).map((t: any) => [
              t.id,
              {
                titulo: t.titulo,
                estado: t.estado,
                asignado_a: t.asignado_a,
                fecha_vence: t.fecha_vence,
              },
            ])
          );
          setTaskUpdates(
            updData.map((u: any) => ({
              ...u,
              usuario: u.creado_por ? { nombre: uMap.get(u.creado_por) ?? 'Usuario' } : null,
              task: tMap.get(u.task_id) ?? null,
            }))
          );
        }
        // Refresh attendance
        const { data: asistData } = await supabase
          .schema('erp')
          .from('juntas_asistencia')
          .select('*, persona:persona_id(nombre, apellido_paterno)')
          .eq('junta_id', juntaId)
          .order('created_at');
        if (asistData) setAsistencia(asistData as Asistencia[]);
        setLastPoll(new Date().toLocaleTimeString());
      } catch {
        /* ignore poll errors */
      }
    };
    const interval = setInterval(poll, 10000);
    // Also run once immediately
    void poll();
    return () => clearInterval(interval);
  }, [junta?.id, estado, editor, supabase]);

  const handleToggleAsistio = async (asistId: string, current: boolean | null) => {
    const next = current === null ? true : current === true ? false : null;
    await supabase
      .schema('erp')
      .from('juntas_asistencia')
      .update({ asistio: next })
      .eq('id', asistId);
    setAsistencia((prev) => prev.map((a) => (a.id === asistId ? { ...a, asistio: next } : a)));
  };

  const handleRemoveParticipant = async (asistId: string) => {
    await supabase.schema('erp').from('juntas_asistencia').delete().eq('id', asistId);
    setAsistencia((prev) => prev.filter((a) => a.id !== asistId));
  };

  const handleAddParticipant = async (personaId: string) => {
    if (!personaId || !junta) return;
    setAddingPersona(true);
    const { data, error: err } = await supabase
      .schema('erp')
      .from('juntas_asistencia')
      .insert({ empresa_id: junta.empresa_id, junta_id: junta.id, persona_id: personaId })
      .select('*, persona:persona_id(nombre, apellido_paterno)')
      .single();
    setAddingPersona(false);
    if (err) {
      alert(`Error al agregar participante: ${err.message}`);
      return;
    }
    setAsistencia((prev) => [...prev, data as Asistencia]);
    setShowAddPersona(false);
  };

  const handleAddTask = async () => {
    if (
      !taskForm.titulo.trim() ||
      !taskForm.prioridad ||
      !taskForm.asignado_a ||
      !taskForm.fecha_vence ||
      !junta
    )
      return;
    setAddingTask(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: coreUser } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();
    const { data: newTask, error: err } = await supabase
      .schema('erp')
      .from('tasks')
      .insert({
        empresa_id: junta.empresa_id,
        titulo: taskForm.titulo.trim(),
        descripcion: taskForm.descripcion.trim() || null,
        asignado_a: taskForm.asignado_a || null,
        prioridad: taskForm.prioridad,
        estado: taskForm.estado,
        fecha_compromiso: taskForm.fecha_compromiso || null,
        creado_por: coreUser?.id ?? null,
        entidad_tipo: 'junta',
        entidad_id: junta.id,
      })
      .select('id, titulo, estado, asignado_a, fecha_vence')
      .single();
    setAddingTask(false);
    if (err) {
      alert(`Error al crear tarea: ${err.message}`);
      return;
    }
    setTasks((prev) => [...prev, newTask as JuntaTask]);
    setTaskForm(emptyTaskForm());
    setShowAddTask(false);
  };

  const handleSaveUpdate = async () => {
    const taskId = showAddUpdate;
    if (!taskId || !updateForm.contenido.trim() || !junta) return;
    setSavingUpdate(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: coreUser } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id, first_name')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();
    const userId = coreUser?.id ?? null;
    const userName = coreUser?.first_name ?? 'Usuario';

    const inserts: any[] = [];
    inserts.push({
      task_id: taskId,
      empresa_id: junta.empresa_id,
      tipo: 'avance',
      contenido: updateForm.contenido.trim(),
      creado_por: userId,
    });

    const task = tasks.find((t) => t.id === taskId);
    if (updateForm.nuevoEstado && task && updateForm.nuevoEstado !== task.estado) {
      inserts.push({
        task_id: taskId,
        empresa_id: junta.empresa_id,
        tipo: 'cambio_estado',
        valor_anterior: task.estado,
        valor_nuevo: updateForm.nuevoEstado,
        creado_por: userId,
      });
    }
    if (updateForm.nuevaFecha && task && updateForm.nuevaFecha !== (task.fecha_vence ?? '')) {
      inserts.push({
        task_id: taskId,
        empresa_id: junta.empresa_id,
        tipo: 'cambio_fecha',
        valor_anterior: task.fecha_vence ?? '',
        valor_nuevo: updateForm.nuevaFecha,
        creado_por: userId,
      });
    }

    const { error: insErr } = await supabase.schema('erp').from('task_updates').insert(inserts);
    if (insErr) {
      alert(`Error: ${insErr.message}`);
      setSavingUpdate(false);
      return;
    }

    const taskPatch: any = {};
    if (updateForm.nuevoEstado && task && updateForm.nuevoEstado !== task.estado) {
      taskPatch.estado = updateForm.nuevoEstado;
      if (updateForm.nuevoEstado === 'completado') taskPatch.porcentaje_avance = 100;
    }
    if (updateForm.nuevaFecha && task && updateForm.nuevaFecha !== (task.fecha_vence ?? '')) {
      taskPatch.fecha_compromiso = updateForm.nuevaFecha;
      taskPatch.fecha_vence = updateForm.nuevaFecha;
    }
    if (Object.keys(taskPatch).length > 0) {
      await supabase.schema('erp').from('tasks').update(taskPatch).eq('id', taskId);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...taskPatch } : t)));
    }

    const now = new Date().toISOString();
    const newUpdates: TaskUpdate[] = inserts.map((ins, i) => ({
      id: `temp-${Date.now()}-${i}`,
      task_id: taskId,
      tipo: ins.tipo,
      contenido: ins.contenido ?? null,
      valor_anterior: ins.valor_anterior ?? null,
      valor_nuevo: ins.valor_nuevo ?? null,
      creado_por: userId,
      created_at: now,
      usuario: { nombre: userName },
    }));
    setTaskUpdates((prev) => [...newUpdates, ...prev]);

    setSavingUpdate(false);
    setShowAddUpdate(null);
    setUpdateForm({ contenido: '', nuevoEstado: '', nuevaFecha: '' });
  };

  const handleTerminar = async () => {
    if (!junta) return;
    setTerminating(true);
    try {
      // Auto-save notes before finishing to ensure they are in the email/DB
      const notesHtml = editor?.getHTML() ?? null;
      await supabase
        .schema('erp')
        .from('juntas')
        .update({
          descripcion: notesHtml && notesHtml !== '<p></p>' ? notesHtml : null,
        })
        .eq('id', junta.id);

      const res = await fetch('/api/juntas/terminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ juntaId: junta.id }),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(`Error al terminar junta: ${result.error ?? 'Error desconocido'}`);
        return;
      }
      setEstado('completada');
      setJunta((prev) => (prev ? { ...prev, estado: 'completada' } : null));
      setShowTerminarDialog(false);
      const emailMsg =
        result.emailsSent > 0
          ? ` Minuta enviada a ${result.emailsSent} participante(s).`
          : result.warning
            ? ` (${result.warning})`
            : '';
      alert(`Junta terminada.${emailMsg}`);
    } finally {
      setTerminating(false);
    }
  };

  const handleReenviar = async () => {
    if (!junta) return;
    setReenviando(true);
    try {
      const res = await fetch('/api/juntas/reenviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ juntaId: junta.id }),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(`Error al reenviar minuta: ${result.error ?? 'Error desconocido'}`);
        return;
      }
      setShowReenviarDialog(false);
      const emailMsg =
        result.emailsSent > 0
          ? `Minuta reenviada a ${result.emailsSent} participante(s).`
          : (result.warning ?? 'No se envió el correo.');
      alert(emailMsg);
    } finally {
      setReenviando(false);
    }
  };

  const handleDelete = async () => {
    if (!junta) return;
    setDeleting(true);
    try {
      // Delete related records first
      await supabase.schema('erp').from('juntas_asistencia').delete().eq('junta_id', junta.id);
      await supabase
        .schema('erp')
        .from('tasks')
        .update({ entidad_tipo: null, entidad_id: null })
        .eq('entidad_tipo', 'junta')
        .eq('entidad_id', junta.id);
      const { error: err } = await supabase
        .schema('erp')
        .from('juntas')
        .delete()
        .eq('id', junta.id);
      if (err) {
        alert(`Error al eliminar: ${err.message}`);
        return;
      }
      router.push('/dilesa/admin/juntas');
    } finally {
      setDeleting(false);
    }
  };

  const empleadoMap = new Map(empleados.map((e) => [e.id, e]));
  const empleadoOptions = useMemo(
    () => empleados.map((e) => ({ value: e.id, label: e.nombre })),
    [empleados]
  );

  const addedPersonaIds = useMemo(() => new Set(asistencia.map((a) => a.persona_id)), [asistencia]);
  const availablePersonaOptions = useMemo(
    () =>
      personas
        .filter((p) => !addedPersonaIds.has(p.id))
        .map((p) => ({ value: p.id, label: p.nombre })),
    [personas, addedPersonaIds]
  );

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );

  if (error || !junta)
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-red-400">{error ?? 'Junta no encontrada'}</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4 rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
      </div>
    );

  const canCreateTask =
    taskForm.titulo.trim() && taskForm.prioridad && taskForm.asignado_a && taskForm.fecha_vence;

  return (
    <div className="space-y-6 pb-12">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dilesa/admin/juntas')}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)] line-clamp-1">
              {junta.titulo}
            </h1>
            <p className="text-xs text-[var(--text)]/50 mt-0.5">
              {new Date(junta.fecha_hora).toLocaleString('es-MX', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isDireccion && (
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleting}
              className="gap-1.5 rounded-xl border-red-500/40 text-red-500 hover:bg-red-500/10 hover:border-red-500/60"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}
          {estado !== 'completada' && estado !== 'cancelada' && (
            <Button
              variant="outline"
              onClick={() => {
                if (asistencia.length === 0) {
                  alert('Debes agregar al menos 1 participante antes de terminar la junta.');
                  return;
                }
                setShowTerminarDialog(true);
              }}
              disabled={terminating}
              className="gap-1.5 rounded-xl border-green-500/40 text-green-500 hover:bg-green-500/10 hover:border-green-500/60"
            >
              <CheckCircle2 className="h-4 w-4" />
              Terminar junta
            </Button>
          )}
          {estado === 'completada' && (
            <Button
              variant="outline"
              onClick={() => setShowReenviarDialog(true)}
              disabled={reenviando}
              className="gap-1.5 rounded-xl border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/60"
            >
              {reenviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Reenviar minuta
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <SectionTitle>Información de la junta</SectionTitle>
        <div>
          <FieldLabel>Título</FieldLabel>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Estado</FieldLabel>
            <Combobox
              value={estado}
              onChange={(v) => setEstado(v as Junta['estado'])}
              options={Object.entries(ESTADO_JUNTA).map(([k, v]) => ({
                value: k,
                label: v.label,
              }))}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Tipo</FieldLabel>
            <Combobox
              value={tipo ?? ''}
              onChange={(v) => setTipo(v)}
              options={TIPO_OPTIONS.map((t) => ({
                value: t.value,
                label: `${t.icon} ${t.label}`,
              }))}
              placeholder="Sin tipo"
              allowClear
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
        </div>
        <div>
          <FieldLabel>Lugar</FieldLabel>
          <Input
            placeholder="Ej: Sala de juntas, Zoom..."
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>

        {/* ── Participantes (inline dentro de info) ─────────────────── */}
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <SectionTitle>Participantes</SectionTitle>
            <div className="flex items-center gap-3">
              <label
                className={`flex items-center gap-2 text-xs text-[var(--text)]/80 select-none ${
                  estado === 'completada' || estado === 'cancelada'
                    ? 'opacity-60 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
                title="Al terminar la junta, enviar también la minuta a consejo@dilesa.mx"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
                  checked={enviarAConsejo}
                  disabled={estado === 'completada' || estado === 'cancelada'}
                  onChange={(e) => toggleEnviarAConsejo(e.target.checked)}
                />
                Enviar Junta a Consejo
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddPersona(true)}
                className="gap-1.5 rounded-xl border-[var(--border)] text-[var(--text)] hover:bg-[var(--panel)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </Button>
            </div>
          </div>
          {asistencia.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Users className="mb-2 h-8 w-8 text-[var(--text)]/20" />
              <p className="text-sm text-[var(--text)]/50">No hay participantes registrados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {asistencia.map((a) => {
                const nombre = a.persona
                  ? [a.persona.nombre, a.persona.apellido_paterno].filter(Boolean).join(' ')
                  : 'Persona desconocida';
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-xs font-semibold text-[var(--accent)]">
                      {nombre.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm text-[var(--text)]">{nombre}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleAsistio(a.id, a.asistio)}
                      title={
                        a.asistio === null ? 'Sin confirmar' : a.asistio ? 'Asistió' : 'No asistió'
                      }
                      className={[
                        'inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs transition',
                        a.asistio === true
                          ? 'border-green-500/50 bg-green-500/15 text-green-400'
                          : a.asistio === false
                            ? 'border-red-500/50 bg-red-500/15 text-red-400'
                            : 'border-[var(--border)] bg-[var(--card)] text-[var(--text)]/40',
                      ].join(' ')}
                    >
                      {a.asistio === true ? (
                        <Check className="h-3 w-3" />
                      ) : a.asistio === false ? (
                        <X className="h-3 w-3" />
                      ) : (
                        '?'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveParticipant(a.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text)]/30 hover:bg-red-500/10 hover:text-red-400 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {showAddPersona && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3">
              <div className="flex-1">
                <Combobox
                  value=""
                  onChange={(personaId) => void handleAddParticipant(personaId)}
                  options={availablePersonaOptions}
                  placeholder="Buscar persona..."
                  searchPlaceholder="Escriba un nombre..."
                  emptyText="Sin resultados"
                />
              </div>
              {addingPersona && <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddPersona(false)}
                className="rounded-xl border-[var(--border)] text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <SectionTitle>Notas y minuta</SectionTitle>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <EditorToolbar editor={editor} onInsertImage={handleInsertImageClick} />
          <div className="bg-[var(--panel)]">
            <style>{`.ProseMirror { color: var(--text); } .ProseMirror p { margin: 0.4em 0; } .ProseMirror h2 { font-size: 1.1rem; font-weight: 700; margin: 0.8em 0 0.4em; } .ProseMirror h3 { font-size: 1rem; font-weight: 600; margin: 0.7em 0 0.35em; } .ProseMirror ul, .ProseMirror ol { padding-left: 1.4em; margin: 0.4em 0; } .ProseMirror li { margin: 0.2em 0; } .ProseMirror table { border-collapse: collapse; width: 100%; margin: 0.6em 0; } .ProseMirror td, .ProseMirror th { border: 1px solid var(--border); padding: 0.4em 0.6em; } .ProseMirror th { background: var(--card); font-weight: 600; } .ProseMirror p.is-editor-empty:first-child::before { color: var(--text); opacity: 0.35; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; } .ProseMirror img { max-width: 100%; border-radius: 0.75rem; margin: 0.5em 0; }`}</style>
            <EditorContent editor={editor} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <p className="text-[10px] text-[var(--text)]/40 flex-1">
            {estado !== 'completada' && estado !== 'cancelada'
              ? autoSaveStatus === 'saving'
                ? '⏳ Guardando notas...'
                : autoSaveStatus === 'saved'
                  ? '✅ Notas guardadas'
                  : 'Las notas se auto-guardan mientras escribes'
              : 'Las notas se guardan al presionar "Guardar cambios"'}
          </p>
          {uploadingImage && (
            <span className="text-[10px] text-[var(--accent)] flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Subiendo imagen...
            </span>
          )}
          {lastPoll && estado !== 'completada' && estado !== 'cancelada' && (
            <span className="text-[10px] text-[var(--text)]/30">• Sync: {lastPoll}</span>
          )}
        </div>
      </div>

      {/* ── Actualizaciones de tareas ─────────────────────────── */}
      {(tasks.length > 0 || taskUpdates.length > 0) && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <SectionTitle>Actualizaciones de tareas</SectionTitle>
          {taskUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Clock className="mb-2 h-8 w-8 text-[var(--text)]/20" />
              <p className="text-sm text-[var(--text)]/50">No hay actualizaciones registradas</p>
            </div>
          ) : (
            (() => {
              // Agrupar actualizaciones por tarea y ordenar ASC dentro del
              // grupo para que se lea como timeline (antigua → reciente).
              // El fetch global las baja DESC, pero aquí una tarea a la vez
              // luce más natural cronológicamente.
              const grouped = new Map<string, TaskUpdate[]>();
              for (const u of taskUpdates) {
                const arr = grouped.get(u.task_id) ?? [];
                arr.push(u);
                grouped.set(u.task_id, arr);
              }
              for (const arr of grouped.values()) {
                arr.sort(
                  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
              }
              const tipoCfg: Record<string, { label: string; cls: string }> = {
                avance: {
                  label: 'Avance',
                  cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
                },
                cambio_estado: {
                  label: 'Estado',
                  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
                },
                cambio_fecha: {
                  label: 'Fecha',
                  cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
                },
                nota: {
                  label: 'Nota',
                  cls: 'bg-[var(--border)]/60 text-[var(--text)]/60 border-[var(--border)]',
                },
                cambio_responsable: {
                  label: 'Responsable',
                  cls: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
                },
              };
              return (
                <div className="divide-y divide-[var(--border)]">
                  {Array.from(grouped.entries()).map(([taskId, updates]) => {
                    const task = updates[0]?.task ?? tasks.find((t) => t.id === taskId);
                    if (!task) return null;
                    const estadoCfg = ESTADO_TASK[task.estado] ?? {
                      label: task.estado,
                      cls: '',
                    };
                    const asignado = empleadoMap.get(task.asignado_a ?? '');
                    return (
                      <div key={taskId} className="py-2.5 first:pt-0 last:pb-0">
                        {/* Encabezado compacto: nombre + estado + meta en una
                            sola línea. Si hay muchas tareas con movimiento
                            la vista sigue siendo escaneable. */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1.5">
                          <span className="text-sm font-medium text-[var(--text)]">
                            {task.titulo}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-md border px-1.5 py-px text-[10px] font-medium ${estadoCfg.cls}`}
                          >
                            {estadoCfg.label}
                          </span>
                          <span className="text-[10px] text-[var(--text)]/45">
                            {asignado?.nombre ?? '—'}
                            {task.fecha_vence && ` · vence ${formatDate(task.fecha_vence)}`}
                            {` · ${updates.length} ${updates.length === 1 ? 'nota' : 'notas'}`}
                          </span>
                        </div>
                        <ul className="space-y-1 pl-2 border-l-2 border-[var(--border)]">
                          {updates.map((u) => {
                            const tc = tipoCfg[u.tipo] ?? { label: u.tipo, cls: '' };
                            const hasDelta = u.valor_anterior != null && u.valor_nuevo != null;
                            return (
                              <li key={u.id} className="text-xs leading-snug text-[var(--text)]/80">
                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text)]/45">
                                  <span
                                    className={`inline-flex items-center rounded border px-1.5 py-px font-medium ${tc.cls}`}
                                  >
                                    {tc.label}
                                  </span>
                                  <span className="text-[var(--text)]/65">
                                    {u.usuario?.nombre ?? 'Sistema'}
                                  </span>
                                  <span>·</span>
                                  <span>{formatDateTime(u.created_at)}</span>
                                </div>
                                {u.contenido && (
                                  <p className="text-xs text-[var(--text)]/80 whitespace-pre-wrap">
                                    {u.contenido}
                                  </p>
                                )}
                                {hasDelta && (
                                  <p className="text-[11px] text-[var(--text)]/50">
                                    {u.tipo === 'cambio_estado'
                                      ? `${ESTADO_TASK[u.valor_anterior!]?.label ?? u.valor_anterior} → ${ESTADO_TASK[u.valor_nuevo!]?.label ?? u.valor_nuevo}`
                                      : `${u.valor_anterior || '—'} → ${u.valor_nuevo || '—'}`}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>
            Tareas de esta junta{' '}
            {tasks.length > 0 && (
              <span className="text-[var(--text)]/40 font-normal">({tasks.length})</span>
            )}
          </SectionTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddTask(true)}
            className="gap-1.5 rounded-xl border-[var(--border)] text-[var(--text)] hover:bg-[var(--panel)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar tarea
          </Button>
        </div>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <TicketCheck className="mb-2 h-8 w-8 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/50">No hay tareas asociadas a esta junta</p>
          </div>
        ) : (
          (() => {
            const openTasks = tasks.filter(
              (t) => t.estado !== 'completado' && t.estado !== 'cancelado'
            );
            const closedTasks = tasks.filter(
              (t) => t.estado === 'completado' || t.estado === 'cancelado'
            );
            const renderTask = (task: JuntaTask) => {
              const cfg = ESTADO_TASK[task.estado] ?? { label: task.estado, cls: '' };
              const asignado = empleadoMap.get(task.asignado_a ?? '');
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
                >
                  {task.estado !== 'completado' && task.estado !== 'cancelado' ? (
                    <button
                      type="button"
                      title="Completar tarea"
                      disabled={completingTask === task.id}
                      onClick={async () => {
                        setCompletingTask(task.id);
                        const { error: err } = await supabase
                          .schema('erp')
                          .from('tasks')
                          .update({ estado: 'completado', porcentaje_avance: 100 })
                          .eq('id', task.id);
                        setCompletingTask(null);
                        if (err) {
                          alert(`Error: ${err.message}`);
                          return;
                        }
                        setTasks((prev) =>
                          prev.map((t) => (t.id === task.id ? { ...t, estado: 'completado' } : t))
                        );
                      }}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 transition hover:bg-green-500/20 disabled:opacity-50"
                    >
                      {completingTask === task.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </button>
                  ) : (
                    <TicketCheck className="h-4 w-4 shrink-0 text-green-400/60" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm font-medium line-clamp-1 ${task.estado === 'completado' ? 'text-[var(--text)]/40 line-through' : 'text-[var(--text)]'}`}
                    >
                      {task.titulo}
                    </span>
                    {asignado && (
                      <span className="block text-xs text-[var(--text)]/50">{asignado.nombre}</span>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
                  >
                    {cfg.label}
                  </span>
                  {task.fecha_vence && (
                    <span className="text-xs text-[var(--text)]/40 shrink-0">
                      {formatDate(task.fecha_vence)}
                    </span>
                  )}
                  {task.estado !== 'completado' && task.estado !== 'cancelado' && (
                    <button
                      type="button"
                      title="Agregar avance"
                      onClick={() => {
                        setShowAddUpdate(task.id);
                        setUpdateForm({ contenido: '', nuevoEstado: '', nuevaFecha: '' });
                      }}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
                    >
                      <MessageSquarePlus className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            };
            return (
              <div className="space-y-4">
                {openTasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[var(--text)]/50 uppercase tracking-wide">
                      Pendientes ({openTasks.length})
                    </p>
                    {openTasks.map(renderTask)}
                  </div>
                )}
                {closedTasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[var(--text)]/50 uppercase tracking-wide">
                      Completadas ({closedTasks.length})
                    </p>
                    {closedTasks.map(renderTask)}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* ── Sheet: Agregar avance ──────────────────────────────── */}
      <Sheet
        open={!!showAddUpdate}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddUpdate(null);
            setUpdateForm({ contenido: '', nuevoEstado: '', nuevaFecha: '' });
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)] overflow-y-auto"
        >
          <SheetHeader className="pb-2">
            <SheetTitle className="text-[var(--text)] text-lg">Agregar avance</SheetTitle>
            <SheetDescription className="text-[var(--text)]/50">
              {showAddUpdate ? (tasks.find((t) => t.id === showAddUpdate)?.titulo ?? '') : ''}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5 py-4">
            <div>
              <FieldLabel required>Avance / Comentario</FieldLabel>
              <Textarea
                placeholder="Describe el avance o actualización..."
                value={updateForm.contenido}
                onChange={(e) => setUpdateForm((f) => ({ ...f, contenido: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] min-h-[100px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Cambiar estado</FieldLabel>
                <Combobox
                  value={updateForm.nuevoEstado}
                  onChange={(v) => setUpdateForm((f) => ({ ...f, nuevoEstado: v }))}
                  options={Object.entries(ESTADO_TASK).map(([k, v]) => ({
                    value: k,
                    label: v.label,
                  }))}
                  placeholder="Sin cambio"
                  allowClear
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
              <div>
                <FieldLabel>Cambiar fecha compromiso</FieldLabel>
                <Input
                  type="date"
                  value={updateForm.nuevaFecha}
                  onChange={(e) => setUpdateForm((f) => ({ ...f, nuevaFecha: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-4 border-t border-[var(--border)]">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddUpdate(null);
                setUpdateForm({ contenido: '', nuevoEstado: '', nuevaFecha: '' });
              }}
              className="flex-1 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveUpdate}
              disabled={savingUpdate || !updateForm.contenido.trim()}
              className="flex-1 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {savingUpdate ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-4 w-4" />
              )}
              Guardar avance
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <TasksCreateForm
        variant="rich"
        open={showAddTask}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddTask(false);
            setTaskForm(emptyTaskForm());
          }
        }}
        value={taskForm}
        onChange={setTaskForm}
        onCreate={handleAddTask}
        creating={addingTask}
        empleados={empleados}
        empleadoOptions={empleadoOptions as any}
      />

      <Dialog open={showReenviarDialog} onOpenChange={setShowReenviarDialog}>
        <DialogContent className="max-w-sm rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Reenviar minuta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text)]/70 pb-2">
            Se enviará nuevamente la minuta por correo a los participantes con email registrado, con
            el contenido actual de las notas, tareas y avances.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowReenviarDialog(false)}
              disabled={reenviando}
              className="rounded-xl border-[var(--border)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReenviar}
              disabled={reenviando}
              className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {reenviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Sí, reenviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTerminarDialog} onOpenChange={setShowTerminarDialog}>
        <DialogContent className="max-w-sm rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Terminar junta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text)]/70 pb-2">
            Esta acción marcará la junta como <strong>completada</strong> y enviará la minuta por
            correo a los participantes que tienen email registrado. ¿Continuar?
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowTerminarDialog(false)}
              disabled={terminating}
              className="rounded-xl border-[var(--border)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleTerminar}
              disabled={terminating}
              className="gap-1.5 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            >
              {terminating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Sí, terminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-red-400">Eliminar junta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text)]/70 pb-2">
            Esta acción es <strong>irreversible</strong>. Se eliminará la junta, su asistencia y se
            desvincularán las tareas asociadas. ¿Estás seguro?
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
              className="rounded-xl border-[var(--border)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <JuntaDetailInner />
    </RequireAccess>
  );
}

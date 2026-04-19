'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Cleanup PR (#30): pre-existing `any` on Supabase row mapping for meeting
 * data. Proper typing requires schema refactor — out of scope for lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { normalizeHtmlImagesToPaths, rewriteHtmlImagesToSigned } from '@/lib/adjuntos';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Separator } from '@/components/ui/separator';
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
  MessageSquarePlus,
  Clock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  creado_por: string | null;
  created_at: string;
  updated_at: string | null;
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
};

// ─── Constants ────────────────────────────────────────────────────────────────

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

const PRIORIDAD_OPTIONS = ['Urgente', 'Alta', 'Media', 'Baja'] as const;

const TIPO_CONFIG: Record<string, string> = {
  operativa: '⚙️ Operativa',
  directiva: '🏛️ Directiva',
  seguimiento: '📊 Seguimiento',
  emergencia: '🚨 Emergencia',
  Consejo: '🏢 Consejo',
  'Comite Ejecutivo': '👔 Comité Ejecutivo',
  Ventas: '💰 Ventas',
  'Atención PosVenta': '🔧 Atención PosVenta',
  Administración: '📁 Administración',
  Mercadotecnia: '📣 Mercadotecnia',
  Construcción: '🏗️ Construcción',
  'Compras y Admon. Inventario': '📦 Compras y Admon. Inventario',
  Maquinaria: '🚜 Maquinaria',
  Proyectos: '🗂️ Proyectos',
  'Rincón del Bosque': '🌲 Rincón del Bosque',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
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

// ─── Tiptap toolbar ──────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> | null }) {
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
        'Encabezado 2',
        <Heading2 className="h-3.5 w-3.5" />
      )}
      {btn(
        editor.isActive('heading', { level: 3 }),
        () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        'Encabezado 3',
        <Heading3 className="h-3.5 w-3.5" />
      )}
      <div className="mx-1 h-5 w-px bg-[var(--border)]" />
      {btn(
        editor.isActive('bulletList'),
        () => editor.chain().focus().toggleBulletList().run(),
        'Lista con viñetas',
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
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function JuntaDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createSupabaseERPClient();

  const [junta, setJunta] = useState<Junta | null>(null);
  const [asistencia, setAsistencia] = useState<Asistencia[]>([]);
  const [tasks, setTasks] = useState<JuntaTask[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [titulo, setTitulo] = useState('');
  const [fechaHora, setFechaHora] = useState('');
  const [duracion, setDuracion] = useState('60');
  const [lugar, setLugar] = useState('');
  const [estado, setEstado] = useState<Junta['estado']>('programada');
  const [tipo, setTipo] = useState<string>('');

  const [terminating, setTerminating] = useState(false);
  const [showTerminarDialog, setShowTerminarDialog] = useState(false);

  // Tiptap editor
  const editor = useEditor({
    // TipTap v3 exige `immediatelyRender: false` para Next.js SSR/RSC; evita
    // el hydration mismatch "SSR has been detected".
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Image,
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
    },
  });

  // Add participant panel
  const [showAddPersona, setShowAddPersona] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState('');
  const [addingPersona, setAddingPersona] = useState(false);

  // Add task dialog
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    titulo: '',
    descripcion: '',
    asignado_a: '',
    prioridad: '',
    estado: 'pendiente' as JuntaTask['estado'],
    fecha_vence: '',
  });
  const [addingTask, setAddingTask] = useState(false);
  const [completingTask, setCompletingTask] = useState<string | null>(null);

  const [taskUpdates, setTaskUpdates] = useState<TaskUpdate[]>([]);
  const [showAddUpdate, setShowAddUpdate] = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState({ contenido: '', nuevoEstado: '', nuevaFecha: '' });
  const [savingUpdate, setSavingUpdate] = useState(false);

  const fetchAll = useCallback(async () => {
    // Load junta
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

    if (editor && juntaData.descripcion) {
      // Rewrite bare paths / legacy public URLs to signed URLs so the private
      // adjuntos bucket renders inside the editor.
      const hydrated = await rewriteHtmlImagesToSigned(supabase, juntaData.descripcion, 6 * 3600);
      editor.commands.setContent(hydrated);
    }

    // Load asistencia with personas
    const { data: asistData } = await supabase
      .schema('erp')
      .from('juntas_asistencia')
      .select('*, persona:persona_id(nombre, apellido_paterno)')
      .eq('junta_id', id)
      .order('created_at');

    setAsistencia((asistData ?? []) as Asistencia[]);

    // Load related tasks
    const { data: tasksData } = await supabase
      .schema('erp')
      .from('tasks')
      .select('id, titulo, estado, asignado_a, fecha_vence')
      .eq('entidad_tipo', 'junta')
      .eq('entidad_id', id)
      .order('created_at');

    setTasks((tasksData ?? []) as JuntaTask[]);

    const taskIds = (tasksData ?? []).map((t: any) => t.id);
    if (taskIds.length > 0) {
      const { data: updatesData } = await supabase
        .schema('erp')
        .from('task_updates')
        .select('*')
        .in('task_id', taskIds)
        .order('created_at', { ascending: false });
      if (updatesData && updatesData.length > 0) {
        const userIds = [...new Set(updatesData.map((u: any) => u.creado_por).filter(Boolean))];
        const { data: usersData } =
          userIds.length > 0
            ? await supabase
                .schema('core')
                .from('usuarios')
                .select('id, first_name')
                .in('id', userIds)
            : { data: [] };
        const userMap = new Map((usersData ?? []).map((u: any) => [u.id, u.first_name]));
        setTaskUpdates(
          updatesData.map((u: any) => ({
            ...u,
            usuario: u.creado_por ? { nombre: userMap.get(u.creado_por) ?? 'Usuario' } : null,
          }))
        );
      } else {
        setTaskUpdates([]);
      }
    }

    // Load personas for this empresa
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

    // Load empleados for task assignment
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

    setLoading(false);
  }, [id, supabase, editor]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Sync editor content once junta loads (editor might not be ready on first render).
  // Rewrite any stored <img src> (bare path or legacy public URL) to a signed URL
  // so the private `adjuntos` bucket renders correctly.
  useEffect(() => {
    if (editor && junta?.descripcion && editor.isEmpty) {
      void (async () => {
        const hydrated = await rewriteHtmlImagesToSigned(supabase, junta.descripcion, 6 * 3600);
        editor.commands.setContent(hydrated);
      })();
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
        duracion_minutos: parseInt(duracion) || 60,
        lugar: lugar.trim() || null,
        estado,
        tipo: tipo || null,
        descripcion: notesHtml && notesHtml !== '<p></p>' ? notesHtml : null,
      })
      .eq('id', junta.id);

    setSaving(false);

    if (err) {
      alert(`Error al guardar: ${err.message}`);
    }
  };

  // Auto-save notes when junta is active
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedHtmlRef = useRef<string>('');

  useEffect(() => {
    if (!editor || !junta) return;
    if (estado === 'completada' || estado === 'cancelada') return;
    const handleUpdate = () => {
      const html = editor.getHTML();
      if (html === lastSavedHtmlRef.current) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(async () => {
        const currentHtml = editor.getHTML();
        if (currentHtml === lastSavedHtmlRef.current) return;
        setAutoSaveStatus('saving');
        const { error: err } = await supabase
          .schema('erp')
          .from('juntas')
          .update({
            descripcion: currentHtml && currentHtml !== '<p></p>' ? currentHtml : null,
          })
          .eq('id', junta.id);
        if (!err) {
          lastSavedHtmlRef.current = currentHtml;
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } else {
          setAutoSaveStatus('idle');
        }
      }, 3000);
    };
    editor.on('update', handleUpdate);
    lastSavedHtmlRef.current = editor.getHTML();
    return () => {
      editor.off('update', handleUpdate);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [editor, junta, estado, supabase]);

  // Emergency save on tab hide / page unload
  useEffect(() => {
    if (!editor || !junta) return;
    if (estado === 'completada' || estado === 'cancelada') return;
    const juntaId = junta.id;
    const flushSave = () => {
      const html = editor.getHTML();
      if (html !== lastSavedHtmlRef.current && html !== '<p></p>') {
        supabase
          .schema('erp')
          .from('juntas')
          .update({ descripcion: html })
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

  // Live polling: refresh notes, tasks & attendance every 10s when active
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
        const { data: tasksData } = await supabase
          .schema('erp')
          .from('tasks')
          .select('id, titulo, estado, asignado_a, fecha_vence')
          .eq('entidad_tipo', 'junta')
          .eq('entidad_id', juntaId)
          .order('created_at');
        if (tasksData) {
          setTasks(tasksData as JuntaTask[]);
          const tIds = tasksData.map((t: any) => t.id);
          if (tIds.length > 0) {
            const { data: updData } = await supabase
              .schema('erp')
              .from('task_updates')
              .select('*')
              .in('task_id', tIds)
              .order('created_at', { ascending: false });
            if (updData) {
              const uIds = [...new Set(updData.map((u: any) => u.creado_por).filter(Boolean))];
              const { data: uData } =
                uIds.length > 0
                  ? await supabase
                      .schema('core')
                      .from('usuarios')
                      .select('id, first_name')
                      .in('id', uIds)
                  : { data: [] };
              const uMap = new Map((uData ?? []).map((u: any) => [u.id, u.first_name]));
              setTaskUpdates(
                updData.map((u: any) => ({
                  ...u,
                  usuario: u.creado_por ? { nombre: uMap.get(u.creado_por) ?? 'Usuario' } : null,
                }))
              );
            }
          }
        }
        const { data: asistData } = await supabase
          .schema('erp')
          .from('juntas_asistencia')
          .select('*, persona:persona_id(nombre, apellido_paterno)')
          .eq('junta_id', juntaId)
          .order('created_at');
        if (asistData) setAsistencia(asistData as Asistencia[]);
        setLastPoll(new Date().toLocaleTimeString());
      } catch {
        /* ignore */
      }
    };
    const interval = setInterval(poll, 10000);
    void poll();
    return () => clearInterval(interval);
  }, [junta?.id, estado, editor, supabase]);

  const handleToggleAsistio = async (asistId: string, current: boolean | null) => {
    // Cycle: null → true → false → null
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

  const handleAddParticipant = async () => {
    if (!selectedPersonaId || !junta) return;
    setAddingPersona(true);

    const { data, error: err } = await supabase
      .schema('erp')
      .from('juntas_asistencia')
      .insert({
        empresa_id: junta.empresa_id,
        junta_id: junta.id,
        persona_id: selectedPersonaId,
      })
      .select('*, persona:persona_id(nombre, apellido_paterno)')
      .single();

    setAddingPersona(false);

    if (err) {
      alert(`Error al agregar participante: ${err.message}`);
      return;
    }

    setAsistencia((prev) => [...prev, data as Asistencia]);
    setSelectedPersonaId('');
    setShowAddPersona(false);
  };

  const handleAddTask = async () => {
    if (!taskForm.titulo.trim() || !junta) return;
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
        prioridad: taskForm.prioridad || null,
        estado: taskForm.estado,
        fecha_vence: taskForm.fecha_vence || null,
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
    setTaskForm({
      titulo: '',
      descripcion: '',
      asignado_a: '',
      prioridad: '',
      estado: 'pendiente',
      fecha_vence: '',
    });
    setShowAddTask(false);
  };

  const handleTerminar = async () => {
    if (!junta) return;
    setTerminating(true);
    try {
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

  const empleadoMap = new Map(empleados.map((e) => [e.id, e]));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !junta) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-red-400">{error ?? 'Junta no encontrada'}</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4 rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
      </div>
    );
  }

  // Filter out already-added personas
  const addedPersonaIds = new Set(asistencia.map((a) => a.persona_id));
  const availablePersonas = personas.filter((p) => !addedPersonaIds.has(p.id));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/inicio/juntas')}
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

      {/* Main info card */}
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
            <FieldLabel>Fecha y hora</FieldLabel>
            <Input
              type="datetime-local"
              value={fechaHora}
              onChange={(e) => setFechaHora(e.target.value)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <div>
            <FieldLabel>Duración (minutos)</FieldLabel>
            <Input
              type="number"
              min="15"
              step="15"
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Estado</FieldLabel>
            <Select value={estado} onValueChange={(v) => setEstado(v as Junta['estado'])}>
              <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ESTADO_JUNTA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Tipo</FieldLabel>
            <Select value={tipo ?? ''} onValueChange={(v) => setTipo(v || '')}>
              <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue placeholder="Sin tipo" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      </div>

      {/* Notes / Rich text */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <SectionTitle>Notas y minuta</SectionTitle>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <EditorToolbar editor={editor} />
          <div className="bg-[var(--panel)]">
            <style>{`
              .ProseMirror {
                color: var(--text);
              }
              .ProseMirror p { margin: 0.4em 0; }
              .ProseMirror h2 { font-size: 1.1rem; font-weight: 700; margin: 0.8em 0 0.4em; }
              .ProseMirror h3 { font-size: 1rem; font-weight: 600; margin: 0.7em 0 0.35em; }
              .ProseMirror ul, .ProseMirror ol { padding-left: 1.4em; margin: 0.4em 0; }
              .ProseMirror li { margin: 0.2em 0; }
              .ProseMirror table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
              .ProseMirror td, .ProseMirror th { border: 1px solid var(--border); padding: 0.4em 0.6em; }
              .ProseMirror th { background: var(--card); font-weight: 600; }
              .ProseMirror p.is-editor-empty:first-child::before {
                color: var(--text);
                opacity: 0.35;
                content: attr(data-placeholder);
                float: left;
                height: 0;
                pointer-events: none;
              }
            `}</style>
            <EditorContent editor={editor} />
          </div>
        </div>
        <p className="mt-2 text-[10px] text-[var(--text)]/40">
          {estado !== 'completada' && estado !== 'cancelada'
            ? autoSaveStatus === 'saving'
              ? '⏳ Guardando notas...'
              : autoSaveStatus === 'saved'
                ? '✅ Notas guardadas'
                : 'Las notas se auto-guardan mientras escribes'
            : 'Las notas se guardan al presionar "Guardar cambios"'}
        </p>
        {lastPoll && estado !== 'completada' && estado !== 'cancelada' && (
          <span className="text-[10px] text-[var(--text)]/30">• Sync: {lastPoll}</span>
        )}
      </div>

      {/* ── Actualizaciones de tareas ─────────────────────────── */}
      {tasks.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <SectionTitle>Actualizaciones de tareas</SectionTitle>
          {taskUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Clock className="mb-2 h-8 w-8 text-[var(--text)]/20" />
              <p className="text-sm text-[var(--text)]/50">No hay actualizaciones registradas</p>
            </div>
          ) : (
            (() => {
              const grouped = new Map<string, TaskUpdate[]>();
              for (const u of taskUpdates) {
                const arr = grouped.get(u.task_id) ?? [];
                arr.push(u);
                grouped.set(u.task_id, arr);
              }
              return (
                <div className="space-y-4">
                  {Array.from(grouped.entries()).map(([taskId, updates]) => {
                    const task = tasks.find((t) => t.id === taskId);
                    if (!task) return null;
                    return (
                      <div key={taskId} className="space-y-2">
                        <p className="text-xs font-semibold text-[var(--text)]/50 uppercase tracking-wide">
                          {task.titulo}
                        </p>
                        {updates.map((u) => {
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
                          const tc = tipoCfg[u.tipo] ?? { label: u.tipo, cls: '' };
                          return (
                            <div
                              key={u.id}
                              className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-medium ${tc.cls}`}
                                >
                                  {tc.label}
                                </span>
                                <span className="text-[10px] text-[var(--text)]/40">
                                  {u.usuario?.nombre ?? 'Sistema'}
                                </span>
                                <span className="text-[10px] text-[var(--text)]/30 ml-auto">
                                  {formatDate(u.created_at)}
                                </span>
                              </div>
                              {u.contenido && (
                                <p className="text-sm text-[var(--text)]/80">{u.contenido}</p>
                              )}
                              {u.valor_anterior != null && u.valor_nuevo != null && (
                                <p className="text-xs text-[var(--text)]/50">
                                  {u.tipo === 'cambio_estado'
                                    ? `${ESTADO_TASK[u.valor_anterior]?.label ?? u.valor_anterior} → ${ESTADO_TASK[u.valor_nuevo]?.label ?? u.valor_nuevo}`
                                    : `${u.valor_anterior || '—'} → ${u.valor_nuevo || '—'}`}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Participants */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Participantes</SectionTitle>
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

        {asistencia.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
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

                  {/* Asistio toggle */}
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

        {/* Add participant inline */}
        {showAddPersona && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3">
            <Select value={selectedPersonaId} onValueChange={(v) => setSelectedPersonaId(v ?? '')}>
              <SelectTrigger className="flex-1 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue placeholder="Seleccionar persona..." />
              </SelectTrigger>
              <SelectContent>
                {availablePersonas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleAddParticipant}
              disabled={addingPersona || !selectedPersonaId}
              className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {addingPersona ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddPersona(false);
                setSelectedPersonaId('');
              }}
              className="rounded-xl border-[var(--border)] text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Tasks */}
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

      {/* Sheet: Agregar avance */}
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
              <FieldLabel>Avance / Comentario *</FieldLabel>
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
                <Select
                  value={updateForm.nuevoEstado}
                  onValueChange={(v) => setUpdateForm((f) => ({ ...f, nuevoEstado: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin cambio" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_TASK).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

      {/* Add task dialog */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Nueva tarea para esta junta</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <FieldLabel>Título *</FieldLabel>
              <Input
                placeholder="Descripción de la tarea..."
                value={taskForm.titulo}
                onChange={(e) => setTaskForm((f) => ({ ...f, titulo: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Estado</FieldLabel>
                <Select
                  value={taskForm.estado}
                  onValueChange={(v) =>
                    setTaskForm((f) => ({ ...f, estado: v as JuntaTask['estado'] }))
                  }
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_TASK).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Prioridad</FieldLabel>
                <Select
                  value={taskForm.prioridad}
                  onValueChange={(v) => setTaskForm((f) => ({ ...f, prioridad: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDAD_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Asignar a</FieldLabel>
                <Select
                  value={taskForm.asignado_a}
                  onValueChange={(v) => setTaskForm((f) => ({ ...f, asignado_a: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    {empleados.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Fecha límite</FieldLabel>
                <Input
                  type="date"
                  value={taskForm.fecha_vence}
                  onChange={(e) => setTaskForm((f) => ({ ...f, fecha_vence: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAddTask(false)}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddTask}
              disabled={addingTask || !taskForm.titulo.trim()}
              className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {addingTask ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Crear tarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminar junta confirmation */}
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
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="rdb">
      <JuntaDetailInner />
    </RequireAccess>
  );
}

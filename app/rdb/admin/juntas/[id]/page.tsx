'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
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
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';

const EMPRESA_ID = '41c0b58f-5483-439b-aaa6-17b9d995697f';

type Junta = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  fecha_hora: string;
  duracion_minutos: number;
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
  persona?: { nombre: string; apellido_paterno: string | null };
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
type Prioridad = { id: string; nombre: string; color: string; peso: number };

const ESTADO_JUNTA: Record<Junta['estado'], { label: string; cls: string }> = {
  programada:  { label: 'Programada',  cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  en_curso:    { label: 'En curso',    cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  completada:  { label: 'Completada',  cls: 'bg-[var(--border)]/60 text-[var(--text)]/50 border-[var(--border)]' },
  cancelada:   { label: 'Cancelada',   cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
};

const ESTADO_TASK: Record<string, { label: string; cls: string }> = {
  pendiente:   { label: 'Pendiente',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  en_progreso: { label: 'En progreso', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  bloqueado:   { label: 'Bloqueado',   cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  completado:  { label: 'Completado',  cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  cancelado:   { label: 'Cancelado',   cls: 'bg-[var(--border)]/60 text-[var(--text)]/40 border-[var(--border)]' },
};

const TIPO_CONFIG: Record<string, string> = {
  operativa:                    '⚙️ Operativa',
  directiva:                    '🏛️ Directiva',
  seguimiento:                  '📊 Seguimiento',
  emergencia:                   '🚨 Emergencia',
  Consejo:                      '🏢 Consejo',
  'Comite Ejecutivo':           '👔 Comité Ejecutivo',
  Ventas:                       '💰 Ventas',
  'Atención PosVenta':          '🔧 Atención PosVenta',
  Administración:               '📁 Administración',
  Mercadotecnia:                '📣 Mercadotecnia',
  Construcción:                 '🏗️ Construcción',
  'Compras y Admon. Inventario':'📦 Compras y Admon. Inventario',
  Maquinaria:                   '🚜 Maquinaria',
  Proyectos:                    '🗂️ Proyectos',
  'Rincón del Bosque':          '🌲 Rincón del Bosque',
};

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

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
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
      {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Negrita', <Bold className="h-3.5 w-3.5" />)}
      {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Cursiva', <Italic className="h-3.5 w-3.5" />)}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Subrayado', <UnderlineIcon className="h-3.5 w-3.5" />)}
      <div className="mx-1 h-5 w-px bg-[var(--border)]" />
      {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Encabezado 2', <Heading2 className="h-3.5 w-3.5" />)}
      {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Encabezado 3', <Heading3 className="h-3.5 w-3.5" />)}
      <div className="mx-1 h-5 w-px bg-[var(--border)]" />
      {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Lista con viñetas', <List className="h-3.5 w-3.5" />)}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Lista numerada', <ListOrdered className="h-3.5 w-3.5" />)}
      <div className="mx-1 h-5 w-px bg-[var(--border)]" />
      <button
        type="button"
        title="Insertar tabla"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm text-[var(--text)]/60 hover:bg-[var(--panel)] hover:text-[var(--text)] transition"
      >
        <Table2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

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
  const [prioridades, setPrioridades] = useState<Prioridad[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [titulo, setTitulo] = useState('');
  const [fechaHora, setFechaHora] = useState('');
  const [duracion, setDuracion] = useState('60');
  const [lugar, setLugar] = useState('');
  const [estado, setEstado] = useState<Junta['estado']>('programada');
  const [tipo, setTipo] = useState<string>('');

  const [terminating, setTerminating] = useState(false);
  const [showTerminarDialog, setShowTerminarDialog] = useState(false);

  const editor = useEditor({
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

  const [showAddPersona, setShowAddPersona] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState('');
  const [addingPersona, setAddingPersona] = useState(false);

  const [showAddTask, setShowAddTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    titulo: '',
    descripcion: '',
    asignado_a: '',
    prioridad_id: '',
    estado: 'pendiente' as JuntaTask['estado'],
    fecha_vence: '',
  });
  const [addingTask, setAddingTask] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: juntaData, error: jErr } = await supabase
      .schema('erp' as any)
      .from('juntas')
      .select('*')
      .eq('id', id)
      .single();

    if (jErr || !juntaData) {
      setError(jErr?.message ?? 'Junta no encontrada');
      setLoading(false);
      return;
    }

    setJunta(juntaData);
    setTitulo(juntaData.titulo);
    setFechaHora(toDatetimeLocal(juntaData.fecha_hora));
    setDuracion(String(juntaData.duracion_minutos ?? 60));
    setLugar(juntaData.lugar ?? '');
    setEstado(juntaData.estado);
    setTipo(juntaData.tipo ?? '');

    if (editor && juntaData.descripcion) {
      editor.commands.setContent(juntaData.descripcion);
    }

    const { data: asistData } = await supabase
      .schema('erp' as any)
      .from('juntas_asistencia')
      .select('*, persona:persona_id(nombre, apellido_paterno)')
      .eq('junta_id', id)
      .order('created_at');

    setAsistencia(asistData ?? []);

    const { data: tasksData } = await supabase
      .schema('erp' as any)
      .from('tasks')
      .select('id, titulo, estado, asignado_a, fecha_vence')
      .eq('entidad_tipo', 'junta')
      .eq('entidad_id', id)
      .order('created_at');

    setTasks(tasksData ?? []);

    const { data: personasData } = await supabase
      .schema('erp' as any)
      .from('personas')
      .select('id, nombre, apellido_paterno')
      .eq('empresa_id', EMPRESA_ID)
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
      .schema('erp' as any)
      .from('empleados')
      .select('id, persona:persona_id(nombre, apellido_paterno)')
      .eq('empresa_id', EMPRESA_ID)
      .eq('activo', true)
      .is('deleted_at', null);

    setEmpleados(
      (empData ?? []).map((e: any) => ({
        id: e.id,
        nombre: [e.persona?.nombre, e.persona?.apellido_paterno].filter(Boolean).join(' '),
      }))
    );

    const { data: priData } = await supabase
      .schema('shared' as any)
      .from('prioridades')
      .select('*')
      .order('peso');
    setPrioridades(priData ?? []);

    setLoading(false);
  }, [id, supabase, editor]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (editor && junta?.descripcion && editor.isEmpty) {
      editor.commands.setContent(junta.descripcion);
    }
  }, [editor, junta]);

  const handleSave = async () => {
    if (!junta) return;
    setSaving(true);

    const notesHtml = editor?.getHTML() ?? null;

    const { error: err } = await supabase
      .schema('erp' as any)
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

  const handleToggleAsistio = async (asistId: string, current: boolean | null) => {
    const next = current === null ? true : current === true ? false : null;
    await supabase
      .schema('erp' as any)
      .from('juntas_asistencia')
      .update({ asistio: next })
      .eq('id', asistId);

    setAsistencia((prev) =>
      prev.map((a) => (a.id === asistId ? { ...a, asistio: next } : a))
    );
  };

  const handleRemoveParticipant = async (asistId: string) => {
    await supabase
      .schema('erp' as any)
      .from('juntas_asistencia')
      .delete()
      .eq('id', asistId);

    setAsistencia((prev) => prev.filter((a) => a.id !== asistId));
  };

  const handleAddParticipant = async () => {
    if (!selectedPersonaId || !junta) return;
    setAddingPersona(true);

    const { data, error: err } = await supabase
      .schema('erp' as any)
      .from('juntas_asistencia')
      .insert({
        empresa_id: EMPRESA_ID,
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

    setAsistencia((prev) => [...prev, data]);
    setSelectedPersonaId('');
    setShowAddPersona(false);
  };

  const handleAddTask = async () => {
    if (!taskForm.titulo.trim() || !junta) return;
    setAddingTask(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: coreUser } = await supabase
      .schema('core' as any)
      .from('usuarios')
      .select('id')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();

    const { data: newTask, error: err } = await supabase
      .schema('erp' as any)
      .from('tasks')
      .insert({
        empresa_id: EMPRESA_ID,
        titulo: taskForm.titulo.trim(),
        descripcion: taskForm.descripcion.trim() || null,
        asignado_a: taskForm.asignado_a || null,
        prioridad_id: taskForm.prioridad_id || null,
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

    setTasks((prev) => [...prev, newTask]);
    setTaskForm({ titulo: '', descripcion: '', asignado_a: '', prioridad_id: '', estado: 'pendiente', fecha_vence: '' });
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
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="mt-4 rounded-xl"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
      </div>
    );
  }

  const addedPersonaIds = new Set(asistencia.map((a) => a.persona_id));
  const availablePersonas = personas.filter((p) => !addedPersonaIds.has(p.id));

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/rdb/admin/juntas')}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)] line-clamp-1">{junta.titulo}</h1>
            <p className="text-xs text-[var(--text)]/50 mt-0.5">
              {new Date(junta.fecha_hora).toLocaleString('es-MX', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
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
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
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
                  <SelectItem key={k} value={k}>{v}</SelectItem>
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
          Las notas se guardan al presionar "Guardar cambios".
        </p>
      </div>

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

                  <button
                    type="button"
                    onClick={() => handleToggleAsistio(a.id, a.asistio)}
                    title={a.asistio === null ? 'Sin confirmar' : a.asistio ? 'Asistió' : 'No asistió'}
                    className={[
                      'inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs transition',
                      a.asistio === true
                        ? 'border-green-500/50 bg-green-500/15 text-green-400'
                        : a.asistio === false
                        ? 'border-red-500/50 bg-red-500/15 text-red-400'
                        : 'border-[var(--border)] bg-[var(--card)] text-[var(--text)]/40',
                    ].join(' ')}
                  >
                    {a.asistio === true ? <Check className="h-3 w-3" /> : a.asistio === false ? <X className="h-3 w-3" /> : '?'}
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
            <Select value={selectedPersonaId} onValueChange={(v) => setSelectedPersonaId(v ?? '')}>
              <SelectTrigger className="flex-1 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue placeholder="Seleccionar persona..." />
              </SelectTrigger>
              <SelectContent>
                {availablePersonas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleAddParticipant}
              disabled={addingPersona || !selectedPersonaId}
              className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {addingPersona ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowAddPersona(false); setSelectedPersonaId(''); }}
              className="rounded-xl border-[var(--border)] text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Tareas de esta junta</SectionTitle>
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
          <div className="space-y-2">
            {tasks.map((task) => {
              const cfg = ESTADO_TASK[task.estado] ?? { label: task.estado, cls: '' };
              const asignado = empleadoMap.get(task.asignado_a ?? '');
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
                >
                  <TicketCheck className="h-4 w-4 shrink-0 text-[var(--text)]/40" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[var(--text)] line-clamp-1">{task.titulo}</span>
                    {asignado && (
                      <span className="block text-xs text-[var(--text)]/50">{asignado.nombre}</span>
                    )}
                  </div>
                  <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                  {task.fecha_vence && (
                    <span className="text-xs text-[var(--text)]/40 shrink-0">{formatDate(task.fecha_vence)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                  onValueChange={(v) => setTaskForm((f) => ({ ...f, estado: v as JuntaTask['estado'] }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_TASK).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Prioridad</FieldLabel>
                <Select
                  value={taskForm.prioridad_id}
                  onValueChange={(v) => setTaskForm((f) => ({ ...f, prioridad_id: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    {prioridades.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
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
                      <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
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
              {addingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear tarea
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
            Esta acción marcará la junta como <strong>completada</strong> y enviará la minuta por correo a los participantes que tienen email registrado. ¿Continuar?
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
              {terminating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
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
    <RequireAccess empresa="rdb" modulo="rdb.admin.juntas">
      <JuntaDetailInner />
    </RequireAccess>
  );
}

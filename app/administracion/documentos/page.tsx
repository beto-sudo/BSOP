'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import * as tus from 'tus-js-client';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, RefreshCw, Loader2, FileText, Paperclip, AlertTriangle, Clock, Pencil, Save } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Documento = {
  id: string;
  empresa_id: string;
  titulo: string;
  numero_documento: string | null;
  tipo: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  notaria: string | null;
  notario_proveedor_id: string | null;
  notas: string | null;
  archivo_url: string | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

type Adjunto = {
  id: string;
  nombre: string;
  url: string;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  created_at: string;
};

type CreateForm = {
  titulo: string;
  numero_documento: string;
  tipo: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  notario_proveedor_id: string;
  notaria: string;
  notas: string;
};

type NotariaOption = {
  id: string;
  nombre: string;
  empresa_id: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────────

const TIPOS_DOCUMENTO = [
  'Acta Constitutiva',
  'Compra-Venta',
  'Seguro',
  'Poder',
  'Contrato',
  'Arrendamiento',
  'Hipoteca',
  'Constitución de Empresa',
  'Testamento',
  'Donación',
  'Permuta',
  'Otro',
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function parseLocalDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = parseLocalDate(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getVencimientoStatus(dateStr: string | null): 'expired' | 'soon' | 'ok' | null {
  if (!dateStr) return null;
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'expired';
  if (diff <= 60) return 'soon';
  return 'ok';
}

function VencimientoBadge({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-[var(--text)]/40">—</span>;
  const status = getVencimientoStatus(dateStr);
  const formatted = formatDate(dateStr);

  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
        <AlertTriangle className="h-3 w-3" />
        {formatted}
      </span>
    );
  }
  if (status === 'soon') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
        <Clock className="h-3 w-3" />
        {formatted}
      </span>
    );
  }
  return <span className="text-sm text-[var(--text)]/70">{formatted}</span>;
}

function TipoBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return <span className="text-[var(--text)]/40">—</span>;
  return (
    <span className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-xs font-medium text-[var(--text)]/70">
      {tipo}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

const RESUMABLE_UPLOAD_THRESHOLD = 5 * 1024 * 1024;
const RESUMABLE_CHUNK_SIZE = 5 * 1024 * 1024;

function getStorageResumableEndpoint() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL');

  const parsed = new URL(baseUrl);
  parsed.hostname = parsed.hostname.replace('.supabase.co', '.storage.supabase.co');
  parsed.pathname = '/storage/v1/upload/resumable';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

async function uploadFileResumable(
  supabase: ReturnType<typeof createSupabaseERPClient>,
  file: File,
  path: string,
  onProgress?: (percent: number) => void,
) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('No encontré sesión activa para subir el archivo.');

  const endpoint = getStorageResumableEndpoint();

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      chunkSize: RESUMABLE_CHUNK_SIZE,
      metadata: {
        bucketName: 'adjuntos',
        objectName: path,
        contentType: file.type || 'application/octet-stream',
      },
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (!bytesTotal) return;
        onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch(reject);
  });
}

// ─── Adjuntos subcomponent ──────────────────────────────────────────────────────

function DocumentoAdjuntos({ documentoId, empresaId }: { documentoId: string; empresaId: string }) {
  const supabase = createSupabaseERPClient();
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const fetchAdjuntos = useCallback(async () => {
    const { data } = await supabase
      .schema('erp' as any)
      .from('adjuntos')
      .select('id, nombre, url, tipo_mime, tamano_bytes, created_at')
      .eq('empresa_id', empresaId)
      .eq('entidad_tipo', 'documento')
      .eq('entidad_id', documentoId)
      .order('created_at', { ascending: false });
    setAdjuntos(data ?? []);
  }, [supabase, documentoId, empresaId]);

  useEffect(() => { void fetchAdjuntos(); }, [fetchAdjuntos]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `documentos/${empresaId}/${documentoId}/${Date.now()}-${i}.${ext}`;
      let uploadErr: string | null = null;

      try {
        if (file.size > RESUMABLE_UPLOAD_THRESHOLD) {
          await uploadFileResumable(supabase, file, path, (pct) => {
            setUploadProgress(Math.round(((i + pct / 100) / files.length) * 100));
          });
        } else {
          const { error } = await supabase.storage
            .from('adjuntos')
            .upload(path, file, { upsert: false });
          if (error) {
            if (error.message?.includes('Payload too large') || error.message?.includes('413')) {
              uploadErr = `El archivo "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB) excede el límite. Intenta con el método resumable.`;
            } else {
              uploadErr = error.message;
            }
          }
          setUploadProgress(Math.round(((i + 1) / files.length) * 100));
        }
      } catch (err: any) {
        const msg = err?.message ?? 'Error desconocido';
        if (msg.includes('413') || msg.includes('too large') || msg.includes('exceeded')) {
          uploadErr = `El archivo "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB) es demasiado grande para subirlo directamente.\n\nSolución: intenta subirlo individualmente o reduce su tamaño.`;
        } else {
          uploadErr = msg;
        }
      }

      if (uploadErr) {
        alert(`Error al subir ${file.name}: ${uploadErr}`);
        setUploading(false);
        setUploadProgress(null);
        e.target.value = '';
        return;
      }

      const { data: urlData } = supabase.storage.from('adjuntos').getPublicUrl(path);

      const { data: coreUser } = await supabase
        .schema('core' as any)
        .from('usuarios')
        .select('id')
        .eq('email', (await supabase.auth.getUser()).data.user?.email?.toLowerCase() ?? '')
        .maybeSingle();

      const { error: insertErr } = await supabase
        .schema('erp' as any)
        .from('adjuntos')
        .insert({
          empresa_id: empresaId,
          entidad_tipo: 'documento',
          entidad_id: documentoId,
          uploaded_by: coreUser?.id ?? null,
          nombre: file.name,
          url: urlData.publicUrl,
          tipo_mime: file.type || null,
          tamano_bytes: file.size,
        });

      if (insertErr) {
        alert(`Archivo "${file.name}" subido, pero falló el registro: ${insertErr.message}`);
      }
    }

    setUploading(false);
    setUploadProgress(null);
    e.target.value = '';
    void fetchAdjuntos();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel>Archivos adjuntos</FieldLabel>
        <label className="cursor-pointer">
          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--text)]/70 transition hover:bg-[var(--card)] hover:text-[var(--text)] cursor-pointer">
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            {uploading ? `Subiendo${uploadProgress != null ? ` ${uploadProgress}%` : '...'}` : 'Adjuntar archivo(s)'}
          </span>
        </label>
      </div>
      {adjuntos.length === 0 ? (
        <p className="text-xs text-[var(--text)]/40">Sin archivos adjuntos.</p>
      ) : (
        <ul className="space-y-1">
          {adjuntos.map((a) => {
            const isImage = a.tipo_mime?.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(a.nombre);
            const isPdf = a.tipo_mime === 'application/pdf' || a.nombre.toLowerCase().endsWith('.pdf');
            return (
              <li key={a.id} className="flex items-center gap-2">
                {isImage && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <img src={a.url} alt={a.nombre} className="h-10 w-10 rounded-lg border border-[var(--border)] object-cover" />
                  </a>
                )}
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs transition hover:bg-[var(--card)] ${isPdf ? 'text-red-400' : isImage ? 'text-blue-400' : 'text-[var(--accent)]'}`}
                >
                  {isPdf ? (
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  ) : isImage ? (
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  ) : (
                    <Paperclip className="h-3 w-3 shrink-0" />
                  )}
                  <span className="min-w-0 truncate">{a.nombre}</span>
                  {a.tamano_bytes != null && (
                    <span className="shrink-0 text-[var(--text)]/30">{(a.tamano_bytes / 1024 / 1024).toFixed(1)} MB</span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function emptyDocumentoForm(): CreateForm {
  return {
    titulo: '',
    numero_documento: '',
    tipo: '',
    fecha_emision: '',
    fecha_vencimiento: '',
    notario_proveedor_id: '',
    notaria: '',
    notas: '',
  };
}

function documentoToForm(doc: Documento): CreateForm {
  return {
    titulo: doc.titulo ?? '',
    numero_documento: doc.numero_documento ?? '',
    tipo: doc.tipo ?? '',
    fecha_emision: doc.fecha_emision ?? '',
    fecha_vencimiento: doc.fecha_vencimiento ?? '',
    notario_proveedor_id: doc.notario_proveedor_id ?? '',
    notaria: doc.notaria ?? '',
    notas: doc.notas ?? '',
  };
}

function DocumentoFormFields({
  form,
  setForm,
  notarias,
  onOpenCreateNotaria,
}: {
  form: CreateForm;
  setForm: React.Dispatch<React.SetStateAction<CreateForm>>;
  notarias: NotariaOption[];
  onOpenCreateNotaria: () => void;
}) {
  const handleNotariaChange = (value: string | null) => {
    if (!value || value === '__none__') {
      setForm((f) => ({ ...f, notario_proveedor_id: '', notaria: '' }));
      return;
    }

    const selected = notarias.find((n) => n.id === value);
    setForm((f) => ({
      ...f,
      notario_proveedor_id: value,
      notaria: selected?.nombre ?? '',
    }));
  };

  return (
    <div className="space-y-4 py-2">
      <div>
        <FieldLabel>Título *</FieldLabel>
        <Input
          placeholder="Ej: Escritura No. 1234 — Compra-Venta Lote A"
          value={form.titulo}
          onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>Número de documento</FieldLabel>
          <Input
            placeholder="Ej: 4521"
            value={form.numero_documento}
            onChange={(e) => setForm((f) => ({ ...f, numero_documento: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Tipo</FieldLabel>
          <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v ?? '' }))}>
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_DOCUMENTO.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>Fecha de emisión</FieldLabel>
          <Input
            type="date"
            value={form.fecha_emision}
            onChange={(e) => setForm((f) => ({ ...f, fecha_emision: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
        <div>
          <FieldLabel>Fecha de vencimiento</FieldLabel>
          <Input
            type="date"
            value={form.fecha_vencimiento}
            onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>Notaría</FieldLabel>
          <button
            type="button"
            onClick={onOpenCreateNotaria}
            className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80"
          >
            + Nueva notaría
          </button>
        </div>
        <Select value={form.notario_proveedor_id || '__none__'} onValueChange={handleNotariaChange}>
          <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
            <SelectValue placeholder="Seleccionar notaría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sin asignar</SelectItem>
            {notarias.map((n) => (
              <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <FieldLabel>Notas</FieldLabel>
        <Textarea
          placeholder="Observaciones adicionales..."
          value={form.notas}
          onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
          rows={3}
          className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

function DocumentosInner() {
  const supabase = createSupabaseERPClient();

  const [empresaIds, setEmpresaIds] = useState<string[]>([]);
  const [primaryEmpresaId, setPrimaryEmpresaId] = useState<string>('');
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingDoc, setEditingDoc] = useState(false);
  const [showCreateNotaria, setShowCreateNotaria] = useState(false);
  const [creatingNotaria, setCreatingNotaria] = useState(false);
  const [newNotariaNombre, setNewNotariaNombre] = useState('');

  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);
  const [notarias, setNotarias] = useState<NotariaOption[]>([]);

  const [adjuntosPorDoc, setAdjuntosPorDoc] = useState<Record<string, Adjunto[]>>({});

  const [createForm, setCreateForm] = useState<CreateForm>(emptyDocumentoForm());
  const [editForm, setEditForm] = useState<CreateForm>(emptyDocumentoForm());

  const fetchEmpresaIds = useCallback(async (): Promise<string[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: coreUser } = await supabase
      .schema('core' as any)
      .from('usuarios')
      .select('id')
      .eq('email', (user.email ?? '').toLowerCase())
      .maybeSingle();

    if (!coreUser) return [];

    const { data: ueData } = await supabase
      .schema('core' as any)
      .from('usuarios_empresas')
      .select('empresa_id')
      .eq('usuario_id', coreUser.id)
      .eq('activo', true);

    const ids = (ueData ?? []).map((r: any) => r.empresa_id as string);
    setEmpresaIds(ids);
    if (ids.length > 0) setPrimaryEmpresaId(ids[0]);
    return ids;
  }, [supabase]);

  const fetchDocumentos = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setDocumentos([]); return; }
    const { data, error: err } = await supabase
      .schema('erp' as any)
      .from('documentos')
      .select('*')
      .in('empresa_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (err) { setError(err.message); return; }
    setDocumentos(data ?? []);
  }, [supabase]);

  const fetchNotarias = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setNotarias([]);
      return;
    }

    const { data: proveedoresData, error: proveedoresErr } = await supabase
      .schema('erp' as any)
      .from('proveedores')
      .select('id, persona_id, empresa_id')
      .in('empresa_id', ids)
      .eq('categoria', 'notaria')
      .eq('activo', true)
      .is('deleted_at', null);

    if (proveedoresErr) {
      setError(proveedoresErr.message);
      return;
    }

    const personaIds = [...new Set((proveedoresData ?? []).map((p: any) => p.persona_id).filter(Boolean))];
    if (personaIds.length === 0) {
      setNotarias([]);
      return;
    }

    const { data: personasData, error: personasErr } = await supabase
      .schema('erp' as any)
      .from('personas')
      .select('id, nombre')
      .in('id', personaIds)
      .is('deleted_at', null);

    if (personasErr) {
      setError(personasErr.message);
      return;
    }

    const personasMap = new Map((personasData ?? []).map((p: any) => [p.id, p.nombre as string]));
    const options = (proveedoresData ?? [])
      .map((p: any) => ({
        id: p.id as string,
        empresa_id: p.empresa_id as string,
        nombre: personasMap.get(p.persona_id) ?? 'Sin nombre',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX'));

    setNotarias(options);
  }, [supabase]);

  const fetchAdjuntosBulk = useCallback(async (docIds: string[]) => {
    if (docIds.length === 0) {
      setAdjuntosPorDoc({});
      return;
    }
    const { data, error: err } = await supabase
      .schema('erp' as any)
      .from('adjuntos')
      .select('id, nombre, url, tipo_mime, tamano_bytes, created_at, entidad_id')
      .eq('entidad_tipo', 'documento')
      .in('entidad_id', docIds)
      .order('created_at', { ascending: false });
    if (err) return;
    const map: Record<string, Adjunto[]> = {};
    for (const a of data ?? []) {
      const key = a.entidad_id as string;
      if (!map[key]) map[key] = [];
      map[key].push({ id: a.id, nombre: a.nombre, url: a.url, tipo_mime: a.tipo_mime, tamano_bytes: a.tamano_bytes, created_at: a.created_at });
    }
    setAdjuntosPorDoc(map);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      const ids = await fetchEmpresaIds();
      if (cancelled) return;
      await Promise.all([fetchDocumentos(ids), fetchNotarias(ids)]);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => { cancelled = true; };
  }, [fetchEmpresaIds, fetchDocumentos, fetchNotarias]);

  useEffect(() => {
    if (documentos.length === 0) return;
    void fetchAdjuntosBulk(documentos.map((d) => d.id));
  }, [documentos, fetchAdjuntosBulk]);

  useEffect(() => {
    if (!selectedDoc) return;
    setEditForm(documentoToForm(selectedDoc));
    setEditingDoc(false);
  }, [selectedDoc]);

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchDocumentos(empresaIds), fetchNotarias(empresaIds)]);
    setLoading(false);
  };

  const resetForm = () => setCreateForm(emptyDocumentoForm());

  const handleCreate = async () => {
    if (!createForm.titulo.trim() || !primaryEmpresaId) return;
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: coreUser } = await supabase
      .schema('core' as any)
      .from('usuarios')
      .select('id')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();

    const { error: err } = await supabase
      .schema('erp' as any)
      .from('documentos')
      .insert({
        empresa_id: primaryEmpresaId,
        titulo: createForm.titulo.trim(),
        numero_documento: createForm.numero_documento.trim() || null,
        tipo: createForm.tipo || null,
        fecha_emision: createForm.fecha_emision || null,
        fecha_vencimiento: createForm.fecha_vencimiento || null,
        notario_proveedor_id: createForm.notario_proveedor_id || null,
        notaria: createForm.notaria.trim() || null,
        notas: createForm.notas.trim() || null,
        creado_por: coreUser?.id ?? null,
      });

    setCreating(false);
    if (err) { alert(`Error al crear documento: ${err.message}`); return; }
    setShowCreate(false);
    resetForm();
    await fetchDocumentos(empresaIds);
  };

  const handleUpdate = async () => {
    if (!selectedDoc || !editForm.titulo.trim()) return;
    setSavingEdit(true);

    const { error: err } = await supabase
      .schema('erp' as any)
      .from('documentos')
      .update({
        titulo: editForm.titulo.trim(),
        numero_documento: editForm.numero_documento.trim() || null,
        tipo: editForm.tipo || null,
        fecha_emision: editForm.fecha_emision || null,
        fecha_vencimiento: editForm.fecha_vencimiento || null,
        notario_proveedor_id: editForm.notario_proveedor_id || null,
        notaria: editForm.notaria.trim() || null,
        notas: editForm.notas.trim() || null,
      })
      .eq('id', selectedDoc.id);

    setSavingEdit(false);
    if (err) {
      alert(`Error al guardar documento: ${err.message}`);
      return;
    }

    const nextSelectedDoc = {
      ...selectedDoc,
      titulo: editForm.titulo.trim(),
      numero_documento: editForm.numero_documento.trim() || null,
      tipo: editForm.tipo || null,
      fecha_emision: editForm.fecha_emision || null,
      fecha_vencimiento: editForm.fecha_vencimiento || null,
      notario_proveedor_id: editForm.notario_proveedor_id || null,
      notaria: editForm.notaria.trim() || null,
      notas: editForm.notas.trim() || null,
    };

    setSelectedDoc(nextSelectedDoc);
    setDocumentos((prev) => prev.map((doc) => (doc.id === selectedDoc.id ? nextSelectedDoc : doc)));
    setEditingDoc(false);
  };

  const handleCreateNotaria = async () => {
    if (!newNotariaNombre.trim() || !primaryEmpresaId) return;
    setCreatingNotaria(true);

    try {
      const { data: persona, error: personaErr } = await supabase
        .schema('erp' as any)
        .from('personas')
        .insert({
          empresa_id: primaryEmpresaId,
          nombre: newNotariaNombre.trim(),
          tipo: 'proveedor',
        })
        .select('id')
        .single();

      if (personaErr) throw personaErr;

      const { data: proveedor, error: proveedorErr } = await supabase
        .schema('erp' as any)
        .from('proveedores')
        .insert({
          empresa_id: primaryEmpresaId,
          persona_id: persona.id,
          categoria: 'notaria',
          activo: true,
        })
        .select('id, empresa_id')
        .single();

      if (proveedorErr) throw proveedorErr;

      const nuevaNotaria = {
        id: proveedor.id as string,
        empresa_id: proveedor.empresa_id as string,
        nombre: newNotariaNombre.trim(),
      };

      setNotarias((prev) => [...prev, nuevaNotaria].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX')));
      setCreateForm((f) => ({ ...f, notario_proveedor_id: nuevaNotaria.id, notaria: nuevaNotaria.nombre }));
      setEditForm((f) => ({ ...f, notario_proveedor_id: nuevaNotaria.id, notaria: nuevaNotaria.nombre }));
      setNewNotariaNombre('');
      setShowCreateNotaria(false);
    } catch (e: any) {
      alert(`Error al crear notaría: ${e?.message ?? 'desconocido'}`);
    } finally {
      setCreatingNotaria(false);
    }
  };

  const tiposPresentes = [...new Set(documentos.map((d) => d.tipo).filter(Boolean))] as string[];

  const filtered = documentos.filter((d) => {
    if (search && !d.titulo.toLowerCase().includes(search.toLowerCase()) &&
        !(d.numero_documento ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTipo !== 'all' && d.tipo !== filterTipo) return false;
    return true;
  });

  const expiredCount = documentos.filter((d) => getVencimientoStatus(d.fecha_vencimiento) === 'expired').length;
  const soonCount = documentos.filter((d) => getVencimientoStatus(d.fecha_vencimiento) === 'soon').length;

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('fecha_emision', 'desc');
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Documentos</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">Escrituras, contratos y documentos legales</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nuevo Documento
          </Button>
        </div>
      </div>

      {/* Alert banners */}
      {(expiredCount > 0 || soonCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {expiredCount} {expiredCount === 1 ? 'documento vencido' : 'documentos vencidos'}
            </div>
          )}
          {soonCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
              <Clock className="h-4 w-4 shrink-0" />
              {soonCount} {soonCount === 1 ? 'documento vence en ≤60 días' : 'documentos vencen en ≤60 días'}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
            <Input
              placeholder="Buscar por título o número..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <Select value={filterTipo} onValueChange={(v) => setFilterTipo(v ?? 'all')}>
            <SelectTrigger className="w-48 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {tiposPresentes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="space-y-0 divide-y divide-[var(--border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-5 w-24 ml-auto" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <FileText className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">
              {documentos.length === 0 ? 'No hay documentos capturados aún' : 'Sin resultados para los filtros aplicados'}
            </p>
            {documentos.length === 0 && (
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="mt-4 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              >
                <Plus className="h-4 w-4" />
                Capturar primer documento
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead sortKey="titulo" label="Título" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHead sortKey="numero_documento" label="No. Documento" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-32" />
                <SortableHead sortKey="tipo" label="Tipo" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-44" />
                <TableHead className="w-32 font-medium text-[var(--text)]/55">Adjuntos</TableHead>
                <SortableHead sortKey="fecha_emision" label="Emisión" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-32" />
                <SortableHead sortKey="fecha_vencimiento" label="Vencimiento" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(filtered).map((doc) => {
                const docAdjuntos = adjuntosPorDoc[doc.id] ?? [];
                const pdfs = docAdjuntos.filter((a) => a.tipo_mime === 'application/pdf' || a.nombre.toLowerCase().endsWith('.pdf'));
                const imagenes = docAdjuntos.filter((a) => a.tipo_mime?.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(a.nombre));
                const otros = docAdjuntos.filter((a) => !pdfs.includes(a) && !imagenes.includes(a));
                return (
                  <TableRow
                    key={doc.id}
                    className="border-[var(--border)] cursor-pointer hover:bg-[var(--panel)]/50"
                    onClick={() => setSelectedDoc(doc)}
                  >
                    <TableCell>
                      <span className="line-clamp-1 font-medium text-[var(--text)]">{doc.titulo}</span>
                      {doc.notaria && (
                        <span className="mt-0.5 block text-xs text-[var(--text)]/40">{doc.notaria}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-[var(--text)]/70">{doc.numero_documento ?? '—'}</span>
                    </TableCell>
                    <TableCell><TipoBadge tipo={doc.tipo} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {docAdjuntos.length === 0 ? (
                          <span className="text-xs text-[var(--text)]/25">Sin archivos</span>
                        ) : (
                          <>
                            {/* PDF badges */}
                            {pdfs.map((a) => (
                              <a
                                key={a.id}
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                                title={a.nombre}
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                PDF
                              </a>
                            ))}
                            {/* Image badges with hover preview */}
                            {imagenes.map((a) => (
                              <a
                                key={a.id}
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group/img relative inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
                                title={a.nombre}
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                IMG
                                {/* Hover preview popover */}
                                <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 scale-95 opacity-0 transition-all duration-150 group-hover/img:scale-100 group-hover/img:opacity-100">
                                  <img
                                    src={a.url}
                                    alt={a.nombre}
                                    className="max-h-48 max-w-64 rounded-xl border border-[var(--border)] shadow-xl object-contain bg-white"
                                  />
                                  <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-[var(--border)] bg-white" />
                                </span>
                              </a>
                            ))}
                            {/* Other files badge */}
                            {otros.length > 0 && (
                              <span
                                className="inline-flex items-center gap-1 rounded-lg bg-[var(--panel)] px-2 py-1 text-xs font-medium text-[var(--text)]/50"
                                title={otros.map((a) => a.nombre).join(', ')}
                              >
                                +{otros.length}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-[var(--text)]/70">{formatDate(doc.fecha_emision)}</span>
                    </TableCell>
                    <TableCell>
                      <VencimientoBadge dateStr={doc.fecha_vencimiento} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && documentos.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">
          {filtered.length} de {documentos.length} {documentos.length === 1 ? 'documento' : 'documentos'}
        </p>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Nuevo Documento</DialogTitle>
          </DialogHeader>

          <DocumentoFormFields
            form={createForm}
            setForm={setCreateForm}
            notarias={notarias}
            onOpenCreateNotaria={() => setShowCreateNotaria(true)}
          />

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowCreate(false); resetForm(); }}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createForm.titulo.trim()}
              className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / Edit Dialog */}
      {selectedDoc && (
        <Dialog open={!!selectedDoc} onOpenChange={(open) => { if (!open) setSelectedDoc(null); }}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3 pr-8">
                <DialogTitle className="text-[var(--text)]">{editingDoc ? 'Editar Documento' : selectedDoc.titulo}</DialogTitle>
                {!editingDoc && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingDoc(true)}
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                )}
              </div>
            </DialogHeader>

            {editingDoc ? (
              <DocumentoFormFields
                form={editForm}
                setForm={setEditForm}
                notarias={notarias}
                onOpenCreateNotaria={() => setShowCreateNotaria(true)}
              />
            ) : (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <FieldLabel>Número</FieldLabel>
                    <p className="text-[var(--text)]/80">{selectedDoc.numero_documento ?? '—'}</p>
                  </div>
                  <div>
                    <FieldLabel>Tipo</FieldLabel>
                    <TipoBadge tipo={selectedDoc.tipo} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <FieldLabel>Fecha de emisión</FieldLabel>
                    <p className="text-[var(--text)]/80">{formatDate(selectedDoc.fecha_emision)}</p>
                  </div>
                  <div>
                    <FieldLabel>Vencimiento</FieldLabel>
                    <VencimientoBadge dateStr={selectedDoc.fecha_vencimiento} />
                  </div>
                </div>

                {selectedDoc.notaria && (
                  <div>
                    <FieldLabel>Notaría</FieldLabel>
                    <p className="text-sm text-[var(--text)]/80">{selectedDoc.notaria}</p>
                  </div>
                )}

                {selectedDoc.notas && (
                  <div>
                    <FieldLabel>Notas</FieldLabel>
                    <p className="text-sm text-[var(--text)]/70 whitespace-pre-wrap">{selectedDoc.notas}</p>
                  </div>
                )}

                <div className="border-t border-[var(--border)] pt-4">
                  <DocumentoAdjuntos
                    documentoId={selectedDoc.id}
                    empresaId={selectedDoc.empresa_id}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              {editingDoc ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditForm(documentoToForm(selectedDoc));
                      setEditingDoc(false);
                    }}
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleUpdate}
                    disabled={savingEdit || !editForm.titulo.trim()}
                    className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
                  >
                    {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar cambios
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setSelectedDoc(null)}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                >
                  Cerrar
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showCreateNotaria} onOpenChange={setShowCreateNotaria}>
        <DialogContent className="max-w-md rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Nueva notaría</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <FieldLabel>Nombre de la notaría</FieldLabel>
              <Input
                placeholder="Ej: Notaría Pública No. 45 — Lic. González"
                value={newNotariaNombre}
                onChange={(e) => setNewNotariaNombre(e.target.value)}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <p className="text-xs text-[var(--text)]/50">
              Por ahora las notarías se alimentan aquí mismo para no abrir otro módulo raro. Si vemos más catálogos de poco uso, los movemos a Settings &gt; Catálogos.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateNotaria(false);
                setNewNotariaNombre('');
              }}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateNotaria}
              disabled={creatingNotaria || !newNotariaNombre.trim()}
              className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
            >
              {creatingNotaria ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Guardar notaría
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess>
      <DocumentosInner />
    </RequireAccess>
  );
}

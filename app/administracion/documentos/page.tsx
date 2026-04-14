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
import { Plus, Search, RefreshCw, Loader2, FileText, Paperclip, AlertTriangle, Clock } from 'lucide-react';

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
  created_at: string;
};

type CreateForm = {
  titulo: string;
  numero_documento: string;
  tipo: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  notaria: string;
  notas: string;
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

const RESUMABLE_UPLOAD_THRESHOLD = 6 * 1024 * 1024;
const RESUMABLE_CHUNK_SIZE = 6 * 1024 * 1024;

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
      uploadDataDuringCreation: true,
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
      .select('id, nombre, url, tipo_mime, created_at')
      .eq('empresa_id', empresaId)
      .eq('entidad_tipo', 'documento')
      .eq('entidad_id', documentoId)
      .order('created_at', { ascending: false });
    setAdjuntos(data ?? []);
  }, [supabase, documentoId, empresaId]);

  useEffect(() => { void fetchAdjuntos(); }, [fetchAdjuntos]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);

    const ext = file.name.split('.').pop() ?? 'pdf';
    const path = `documentos/${empresaId}/${documentoId}/${Date.now()}.${ext}`;

    let uploadErr: string | null = null;

    try {
      if (file.size > RESUMABLE_UPLOAD_THRESHOLD) {
        await uploadFileResumable(supabase, file, path, setUploadProgress);
      } else {
        const { error } = await supabase.storage
          .from('adjuntos')
          .upload(path, file, { upsert: false });
        if (error) uploadErr = error.message;
        setUploadProgress(100);
      }
    } catch (err: any) {
      uploadErr = err?.message ?? 'Error desconocido';
    }

    if (uploadErr) {
      alert(`Error al subir archivo: ${uploadErr}`);
      setUploading(false);
      setUploadProgress(null);
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
      alert(`Archivo subido, pero falló el registro del adjunto: ${insertErr.message}`);
      setUploading(false);
      setUploadProgress(null);
      e.target.value = '';
      return;
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
          <input type="file" accept=".pdf,.doc,.docx,.jpg,.png" className="hidden" onChange={handleUpload} disabled={uploading} />
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--text)]/70 transition hover:bg-[var(--card)] hover:text-[var(--text)] cursor-pointer">
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            {uploading ? `Subiendo${uploadProgress != null ? ` ${uploadProgress}%` : '...'}` : 'Adjuntar'}
          </span>
        </label>
      </div>
      {adjuntos.length === 0 ? (
        <p className="text-xs text-[var(--text)]/40">Sin archivos adjuntos.</p>
      ) : (
        <ul className="space-y-1">
          {adjuntos.map((a) => (
            <li key={a.id}>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--accent)] hover:bg-[var(--card)] transition"
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="min-w-0 truncate">{a.nombre}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
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

  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);

  const [createForm, setCreateForm] = useState<CreateForm>({
    titulo: '',
    numero_documento: '',
    tipo: '',
    fecha_emision: '',
    fecha_vencimiento: '',
    notaria: '',
    notas: '',
  });

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      const ids = await fetchEmpresaIds();
      if (cancelled) return;
      await fetchDocumentos(ids);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => { cancelled = true; };
  }, [fetchEmpresaIds, fetchDocumentos]);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchDocumentos(empresaIds);
    setLoading(false);
  };

  const resetForm = () =>
    setCreateForm({ titulo: '', numero_documento: '', tipo: '', fecha_emision: '', fecha_vencimiento: '', notaria: '', notas: '' });

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
                <TableHead className="w-28 font-medium text-[var(--text)]/55">PDF</TableHead>
                <SortableHead sortKey="fecha_emision" label="Emisión" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-32" />
                <SortableHead sortKey="fecha_vencimiento" label="Vencimiento" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(filtered).map((doc) => {
                const pdfUrl = doc.archivo_url
                  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/adjuntos/${doc.archivo_url}`
                  : null;
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
                      {pdfUrl ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            PDF
                          </a>
                          <a
                            href={pdfUrl}
                            download
                            className="inline-flex items-center justify-center rounded-lg p-1 text-[var(--text)]/40 hover:text-[var(--text)]/70 hover:bg-[var(--panel)] transition-colors"
                            title="Descargar"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text)]/25">Sin archivo</span>
                      )}
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

          <div className="space-y-4 py-2">
            <div>
              <FieldLabel>Título *</FieldLabel>
              <Input
                placeholder="Ej: Escritura No. 1234 — Compra-Venta Lote A"
                value={createForm.titulo}
                onChange={(e) => setCreateForm((f) => ({ ...f, titulo: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Número de documento</FieldLabel>
                <Input
                  placeholder="Ej: 4521"
                  value={createForm.numero_documento}
                  onChange={(e) => setCreateForm((f) => ({ ...f, numero_documento: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
              <div>
                <FieldLabel>Tipo</FieldLabel>
                <Select
                  value={createForm.tipo}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, tipo: v ?? '' }))}
                >
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
                  value={createForm.fecha_emision}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fecha_emision: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
              <div>
                <FieldLabel>Fecha de vencimiento</FieldLabel>
                <Input
                  type="date"
                  value={createForm.fecha_vencimiento}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Notaría</FieldLabel>
              <Input
                placeholder="Ej: Notaría Pública No. 45 — Lic. González"
                value={createForm.notaria}
                onChange={(e) => setCreateForm((f) => ({ ...f, notaria: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div>
              <FieldLabel>Notas</FieldLabel>
              <Textarea
                placeholder="Observaciones adicionales..."
                value={createForm.notas}
                onChange={(e) => setCreateForm((f) => ({ ...f, notas: e.target.value }))}
                rows={3}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          </div>

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
              <DialogTitle className="text-[var(--text)]">{selectedDoc.titulo}</DialogTitle>
            </DialogHeader>

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

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSelectedDoc(null)}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              >
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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

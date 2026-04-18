'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import * as tus from 'tus-js-client';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { getAdjuntoPath, getAdjuntoSignedUrls } from '@/lib/adjuntos';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Search, RefreshCw, Loader2, FileText, Paperclip,
  AlertTriangle, Clock, Pencil, Save, Trash2, Image as ImageIcon,
  Upload,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────────────────────

const EMPRESA_ID = '41c0b58f-5483-439b-aaa6-17b9d995697f';

// ─── Types ──────────────────────────────────────────────────────────────────────

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
  subtipo_meta: Record<string, any> | null;
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
  rol: string;
  created_at: string;
};

type NotariaOption = { id: string; nombre: string; empresa_id: string };

type DocForm = {
  titulo: string;
  numero_documento: string;
  tipo: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  notario_proveedor_id: string;
  notaria: string;
  notas: string;
  subtipo_meta: Record<string, any>;
};

const TIPOS_DOCUMENTO = [
  { value: 'Escritura', label: 'Escritura', icon: '📜' },
  { value: 'Contrato', label: 'Contrato', icon: '📋' },
  { value: 'Seguro', label: 'Seguro', icon: '🛡️' },
  { value: 'Acta Constitutiva', label: 'Acta Constitutiva', icon: '🏛️' },
  { value: 'Poder', label: 'Poder', icon: '⚖️' },
  { value: 'Otro', label: 'Otro', icon: '📄' },
];

type AdjuntoRol = 'documento_principal' | 'imagen_referencia' | 'anexo';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function parseLocalDate(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(s: string | null) {
  if (!s) return '—';
  const d = parseLocalDate(s);
  return d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function getVencStatus(s: string | null): 'expired' | 'soon' | 'ok' | null {
  if (!s) return null;
  const d = parseLocalDate(s);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'expired';
  if (diff <= 60) return 'soon';
  return 'ok';
}

function VencBadge({ d }: { d: string | null }) {
  if (!d) return <span className="text-[var(--text)]/40">—</span>;
  const st = getVencStatus(d);
  const txt = formatDate(d);
  if (st === 'expired') return <span className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400"><AlertTriangle className="h-3 w-3" />{txt}</span>;
  if (st === 'soon') return <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400"><Clock className="h-3 w-3" />{txt}</span>;
  return <span className="text-sm text-[var(--text)]/70">{txt}</span>;
}

function TipoBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return <span className="text-[var(--text)]/40">—</span>;
  const f = TIPOS_DOCUMENTO.find((t) => t.value === tipo);
  return <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-xs font-medium text-[var(--text)]/70">{f?.icon} {tipo}</span>;
}

function FLabel({ children, req }: { children: React.ReactNode; req?: boolean }) {
  return <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">{children}{req && <span className="text-red-400 ml-0.5">*</span>}</div>;
}

function fmtBytes(b: number | null | undefined) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function emptyForm(): DocForm {
  return { titulo: '', numero_documento: '', tipo: '', fecha_emision: '', fecha_vencimiento: '', notario_proveedor_id: '', notaria: '', notas: '', subtipo_meta: {} };
}

function docToForm(doc: Documento): DocForm {
  return {
    titulo: doc.titulo ?? '', numero_documento: doc.numero_documento ?? '',
    tipo: doc.tipo ?? '', fecha_emision: doc.fecha_emision ?? '',
    fecha_vencimiento: doc.fecha_vencimiento ?? '',
    notario_proveedor_id: doc.notario_proveedor_id ?? '',
    notaria: doc.notaria ?? '', notas: doc.notas ?? '',
    subtipo_meta: doc.subtipo_meta ?? {},
  };
}

function autoTituloEscritura(form: DocForm): string {
  const num = form.subtipo_meta.numero_escritura || form.numero_documento;
  const parts: string[] = ['Escritura'];
  if (num) parts.push(`No. ${num}`);
  if (form.notaria) parts.push(`— ${form.notaria}`);
  return parts.join(' ');
}

// ─── Upload helpers ─────────────────────────────────────────────────────────────

const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;
const RESUMABLE_CHUNK = 5 * 1024 * 1024;

function getResumableEndpoint() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL');
  const u = new URL(base);
  u.hostname = u.hostname.replace('.supabase.co', '.storage.supabase.co');
  u.pathname = '/storage/v1/upload/resumable'; u.search = ''; u.hash = '';
  return u.toString();
}

async function uploadResumable(
  supabase: ReturnType<typeof createSupabaseERPClient>,
  file: File, path: string, onProgress?: (pct: number) => void,
) {
  const { data: sd } = await supabase.auth.getSession();
  const token = sd.session?.access_token;
  if (!token) throw new Error('Sin sesión activa.');
  const endpoint = getResumableEndpoint();
  await new Promise<void>((resolve, reject) => {
    const up = new tus.Upload(file, {
      endpoint, retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'x-upsert': 'false' },
      uploadDataDuringCreation: false, removeFingerprintOnSuccess: true, chunkSize: RESUMABLE_CHUNK,
      metadata: { bucketName: 'adjuntos', objectName: path, contentType: file.type || 'application/octet-stream' },
      onError: reject,
      onProgress: (uploaded, total) => { if (total) onProgress?.(Math.round((uploaded / total) * 100)); },
      onSuccess: () => resolve(),
    });
    up.findPreviousUploads().then((prev) => { if (prev.length > 0) up.resumeFromPreviousUpload(prev[0]); up.start(); }).catch(reject);
  });
}

// ─── Adjuntos Section ───────────────────────────────────────────────────────────

function AdjuntosSection({
  documentoId, empresaId, adjuntos, onRefresh, readOnly,
}: {
  documentoId: string; empresaId: string; adjuntos: Adjunto[];
  onRefresh: () => void; readOnly?: boolean;
}) {
  const supabase = createSupabaseERPClient();
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadRole, setUploadRole] = useState<AdjuntoRol>('documento_principal');

  const principal = adjuntos.filter((a) => a.rol === 'documento_principal');
  const imagenes = adjuntos.filter((a) => a.rol === 'imagen_referencia');
  const anexos = adjuntos.filter((a) => a.rol === 'anexo');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true); setUploadPct(0);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `documentos/${empresaId}/${documentoId}/${Date.now()}-${i}.${ext}`;
      let err: string | null = null;
      try {
        if (file.size > RESUMABLE_THRESHOLD) {
          await uploadResumable(supabase, file, path, (pct) => setUploadPct(Math.round(((i + pct / 100) / files.length) * 100)));
        } else {
          const { error } = await supabase.storage.from('adjuntos').upload(path, file, { upsert: false });
          if (error) err = error.message;
          setUploadPct(Math.round(((i + 1) / files.length) * 100));
        }
      } catch (ex: any) { err = ex?.message ?? 'Error'; }
      if (err) { alert(`Error: ${err}`); break; }
      // Bucket is private. Store ONLY the object path — UI generates short-lived
      // signed URLs on render (see lib/adjuntos.ts).
      const { data: cu } = await supabase.schema('core').from('usuarios').select('id').eq('email', (await supabase.auth.getUser()).data.user?.email?.toLowerCase() ?? '').maybeSingle();
      await supabase.schema('erp').from('adjuntos').insert({
        empresa_id: empresaId, entidad_tipo: 'documento', entidad_id: documentoId,
        uploaded_by: cu?.id ?? null, nombre: file.name, url: path,
        tipo_mime: file.type || null, tamano_bytes: file.size, rol: uploadRole,
      });
    }
    setUploading(false); setUploadPct(null); e.target.value = '';
    onRefresh();
  };

  const handleDelete = async (a: Adjunto) => {
    if (!confirm(`¿Eliminar "${a.nombre}"?`)) return;
    await supabase.schema('erp').from('adjuntos').delete().eq('id', a.id);
    onRefresh();
  };

  const renderGroup = (title: string, icon: React.ReactNode, items: Adjunto[]) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]/50">{title}</span>
        <span className="text-[10px] text-[var(--text)]/30">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--text)]/30 pl-6">Sin archivos</p>
      ) : (
        <ul className="space-y-1 pl-6">
          {items.map((a) => {
            const isImg = a.tipo_mime?.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(a.nombre);
            const isPdf = a.tipo_mime === 'application/pdf' || a.nombre.toLowerCase().endsWith('.pdf');
            return (
              <li key={a.id} className="group flex items-center gap-2">
                {isImg && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <img src={a.url} alt={a.nombre} className="h-10 w-10 rounded-lg border border-[var(--border)] object-cover" />
                  </a>
                )}
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs transition hover:bg-[var(--card)] ${isPdf ? 'text-red-400' : isImg ? 'text-blue-400' : 'text-[var(--accent)]'}`}
                >
                  {isPdf ? <FileText className="h-3.5 w-3.5 shrink-0" /> : isImg ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />}
                  <span className="min-w-0 truncate">{a.nombre}</span>
                  {a.tamano_bytes != null && <span className="shrink-0 text-[var(--text)]/30">{fmtBytes(a.tamano_bytes)}</span>}
                </a>
                {!readOnly && (
                  <button onClick={() => handleDelete(a)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10 text-[var(--text)]/30 hover:text-red-400" title="Eliminar">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {renderGroup('Documento principal (PDF)', <FileText className="h-3.5 w-3.5 text-red-400" />, principal)}
      {renderGroup('Imagen / Plano de referencia', <ImageIcon className="h-3.5 w-3.5 text-blue-400" />, imagenes)}
      {renderGroup('Anexos / Antecedentes', <Paperclip className="h-3.5 w-3.5 text-[var(--text)]/40" />, anexos)}
      {!readOnly && (
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={uploadRole} onValueChange={(v) => setUploadRole(v as AdjuntoRol)}>
              <SelectTrigger className="w-52 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="documento_principal">📄 Documento principal</SelectItem>
                <SelectItem value="imagen_referencia">🖼️ Imagen / Plano</SelectItem>
                <SelectItem value="anexo">📎 Anexo</SelectItem>
              </SelectContent>
            </Select>
            <label className="cursor-pointer">
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.tiff" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--text)]/70 transition hover:bg-[var(--card)] hover:text-[var(--text)] cursor-pointer">
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                {uploading ? `Subiendo${uploadPct != null ? ` ${uploadPct}%` : '...'}` : 'Subir archivo(s)'}
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subtipo-specific fields ────────────────────────────────────────────────────

function EscrituraFields({ meta, onChange }: { meta: Record<string, any>; onChange: (m: Record<string, any>) => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">📜 Datos de Escritura</div>
      <div className="grid grid-cols-2 gap-3">
        <div><FLabel req>No. de Escritura</FLabel><Input placeholder="4521" value={meta.numero_escritura ?? ''} onChange={(e) => onChange({ ...meta, numero_escritura: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
        <div><FLabel req>Fecha de Escritura</FLabel><Input type="date" value={meta.fecha_escritura ?? ''} onChange={(e) => onChange({ ...meta, fecha_escritura: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
      </div>
      <div><FLabel>Volumen</FLabel><Input placeholder="XXIV" value={meta.volumen ?? ''} onChange={(e) => onChange({ ...meta, volumen: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
    </div>
  );
}

function ContratoFields({ meta, onChange }: { meta: Record<string, any>; onChange: (m: Record<string, any>) => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">📋 Datos del Contrato</div>
      <div className="grid grid-cols-2 gap-3">
        <div><FLabel>Parte A</FLabel><Input placeholder="Nombre parte A" value={meta.parte_a ?? ''} onChange={(e) => onChange({ ...meta, parte_a: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
        <div><FLabel>Parte B</FLabel><Input placeholder="Nombre parte B" value={meta.parte_b ?? ''} onChange={(e) => onChange({ ...meta, parte_b: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><FLabel>Vigencia (meses)</FLabel><Input type="number" placeholder="12" value={meta.vigencia_meses ?? ''} onChange={(e) => onChange({ ...meta, vigencia_meses: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
        <div><FLabel>Monto</FLabel><Input placeholder="$0.00" value={meta.monto ?? ''} onChange={(e) => onChange({ ...meta, monto: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
      </div>
    </div>
  );
}

function SeguroFields({ meta, onChange }: { meta: Record<string, any>; onChange: (m: Record<string, any>) => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">🛡️ Datos del Seguro</div>
      <div className="grid grid-cols-2 gap-3">
        <div><FLabel req>No. de Póliza</FLabel><Input placeholder="POL-2024-0001" value={meta.numero_poliza ?? ''} onChange={(e) => onChange({ ...meta, numero_poliza: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
        <div><FLabel req>Aseguradora</FLabel><Input placeholder="GNP, AXA, Qualitas" value={meta.aseguradora ?? ''} onChange={(e) => onChange({ ...meta, aseguradora: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><FLabel>Cobertura</FLabel><Input placeholder="Todo riesgo" value={meta.cobertura ?? ''} onChange={(e) => onChange({ ...meta, cobertura: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
        <div><FLabel>Prima anual</FLabel><Input placeholder="$0.00" value={meta.prima_anual ?? ''} onChange={(e) => onChange({ ...meta, prima_anual: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
      </div>
    </div>
  );
}

function ActaConstitutivaFields({ meta, onChange }: { meta: Record<string, any>; onChange: (m: Record<string, any>) => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">🏛️ Datos del Acta Constitutiva</div>
      <div className="grid grid-cols-2 gap-3">
        <div><FLabel>No. de Acta</FLabel><Input placeholder="12345" value={meta.numero_acta ?? ''} onChange={(e) => onChange({ ...meta, numero_acta: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
        <div><FLabel>Fecha del Acta</FLabel><Input type="date" value={meta.fecha_acta ?? ''} onChange={(e) => onChange({ ...meta, fecha_acta: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
      </div>
      <div><FLabel>Entidad Constituida</FLabel><Input placeholder="Nombre de la sociedad" value={meta.entidad ?? ''} onChange={(e) => onChange({ ...meta, entidad: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
      <div><FLabel>Objeto Social</FLabel><Input placeholder="Descripción breve" value={meta.objeto_social ?? ''} onChange={(e) => onChange({ ...meta, objeto_social: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
    </div>
  );
}

function PoderFields({ meta, onChange }: { meta: Record<string, any>; onChange: (m: Record<string, any>) => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]/70">⚖️ Datos del Poder</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FLabel>Tipo de Poder</FLabel>
          <Select value={meta.tipo_poder || undefined} onValueChange={(v) => onChange({ ...meta, tipo_poder: v })}>
            <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="General">General</SelectItem>
              <SelectItem value="Especial">Especial</SelectItem>
              <SelectItem value="Pleitos y cobranzas">Pleitos y cobranzas</SelectItem>
              <SelectItem value="Actos de administración">Actos de administración</SelectItem>
              <SelectItem value="Actos de dominio">Actos de dominio</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><FLabel>Fecha del Poder</FLabel><Input type="date" value={meta.fecha_poder ?? ''} onChange={(e) => onChange({ ...meta, fecha_poder: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><FLabel>Otorgante</FLabel><Input placeholder="Nombre del poderdante" value={meta.otorgante ?? ''} onChange={(e) => onChange({ ...meta, otorgante: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
        <div><FLabel>Apoderado</FLabel><Input placeholder="Nombre del apoderado" value={meta.apoderado ?? ''} onChange={(e) => onChange({ ...meta, apoderado: e.target.value })} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
      </div>
    </div>
  );
}

function SubtipoFields({ tipo, meta, onChange }: { tipo: string; meta: Record<string, any>; onChange: (m: Record<string, any>) => void }) {
  if (tipo === 'Escritura') return <EscrituraFields meta={meta} onChange={onChange} />;
  if (tipo === 'Contrato') return <ContratoFields meta={meta} onChange={onChange} />;
  if (tipo === 'Seguro') return <SeguroFields meta={meta} onChange={onChange} />;
  if (tipo === 'Acta Constitutiva') return <ActaConstitutivaFields meta={meta} onChange={onChange} />;
  if (tipo === 'Poder') return <PoderFields meta={meta} onChange={onChange} />;
  return null;
}

// ─── Form component ─────────────────────────────────────────────────────────────

function DocFormFields({
  form, setForm, notarias, onOpenCreateNotaria,
}: {
  form: DocForm; setForm: React.Dispatch<React.SetStateAction<DocForm>>;
  notarias: NotariaOption[]; onOpenCreateNotaria: () => void;
}) {
  const handleNotariaChange = (value: string | null) => {
    if (!value || value === '__none__') { setForm((f) => ({ ...f, notario_proveedor_id: '', notaria: '' })); return; }
    const sel = notarias.find((n) => n.id === value);
    setForm((f) => {
      const nf = { ...f, notario_proveedor_id: value, notaria: sel?.nombre ?? '' };
      if (f.tipo === 'Escritura') nf.titulo = autoTituloEscritura(nf);
      return nf;
    });
  };

  const handleTipoChange = (tipo: string | null) => {
    if (!tipo) return;
    setForm((f) => {
      const nf = { ...f, tipo };
      if (tipo === 'Escritura') nf.titulo = autoTituloEscritura(nf);
      return nf;
    });
  };

  const handleMetaChange = (meta: Record<string, any>) => {
    setForm((f) => {
      const nf = { ...f, subtipo_meta: meta };
      if (f.tipo === 'Escritura') nf.titulo = autoTituloEscritura(nf);
      return nf;
    });
  };

  const showNotaria = ['Escritura', 'Acta Constitutiva', 'Poder'].includes(form.tipo);

  return (
    <div className="space-y-4">
      <div>
        <FLabel req>Tipo de documento</FLabel>
        <Select value={form.tipo || undefined} onValueChange={handleTipoChange}>
          <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
            <SelectValue placeholder="Seleccionar tipo..." />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_DOCUMENTO.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="flex items-center gap-2">{t.icon} {t.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {form.tipo && <SubtipoFields tipo={form.tipo} meta={form.subtipo_meta} onChange={handleMetaChange} />}

      <div>
        <FLabel req>Título</FLabel>
        <Input
          placeholder={form.tipo === 'Escritura' ? 'Se genera automáticamente' : 'Ej: Contrato de arrendamiento oficina'}
          value={form.titulo}
          onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          readOnly={form.tipo === 'Escritura'}
        />
        {form.tipo === 'Escritura' && <p className="mt-1 text-[10px] text-[var(--text)]/40">Se genera a partir de los datos de la escritura.</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FLabel>No. de documento</FLabel>
          <Input placeholder="Ej: 4521" value={form.numero_documento} onChange={(e) => setForm((f) => ({ ...f, numero_documento: e.target.value }))} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
        </div>
        <div>
          <FLabel>Fecha de emisión</FLabel>
          <Input type="date" value={form.fecha_emision} onChange={(e) => setForm((f) => ({ ...f, fecha_emision: e.target.value }))} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
        </div>
      </div>

      <div>
        <FLabel>Fecha de vencimiento</FLabel>
        <Input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
      </div>

      {showNotaria && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <FLabel>Notaría</FLabel>
            <button type="button" onClick={onOpenCreateNotaria} className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80">+ Nueva notaría</button>
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
      )}

      <div>
        <FLabel>Notas</FLabel>
        <Textarea placeholder="Observaciones adicionales..." value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} rows={3} className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
      </div>
    </div>
  );
}

// ─── Detail / Edit Sheet ────────────────────────────────────────────────────────

function DetailSheet({
  doc, open, onClose, notarias, onOpenCreateNotaria,
  adjuntos, onRefreshAdjuntos, onDocUpdated,
}: {
  doc: Documento | null; open: boolean; onClose: () => void;
  notarias: NotariaOption[]; onOpenCreateNotaria: () => void;
  adjuntos: Adjunto[]; onRefreshAdjuntos: () => void;
  onDocUpdated: (d: Documento) => void;
}) {
  const supabase = createSupabaseERPClient();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<DocForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doc) { setEditForm(docToForm(doc)); setEditing(false); }
  }, [doc]);

  const handleSave = async () => {
    if (!doc || !editForm.titulo.trim()) return;
    setSaving(true);
    const { error: err } = await supabase.schema('erp').from('documentos').update({
      titulo: editForm.titulo.trim(),
      numero_documento: editForm.numero_documento.trim() || null,
      tipo: editForm.tipo || null,
      fecha_emision: editForm.fecha_emision || null,
      fecha_vencimiento: editForm.fecha_vencimiento || null,
      notario_proveedor_id: editForm.notario_proveedor_id || null,
      notaria: editForm.notaria.trim() || null,
      notas: editForm.notas.trim() || null,
      subtipo_meta: Object.keys(editForm.subtipo_meta).length > 0 ? editForm.subtipo_meta : null,
      updated_at: new Date().toISOString(),
    }).eq('id', doc.id).eq('empresa_id', EMPRESA_ID);
    setSaving(false);
    if (err) { alert(`Error: ${err.message}`); return; }
    const updated: Documento = {
      ...doc,
      titulo: editForm.titulo.trim(),
      numero_documento: editForm.numero_documento.trim() || null,
      tipo: editForm.tipo || null,
      fecha_emision: editForm.fecha_emision || null,
      fecha_vencimiento: editForm.fecha_vencimiento || null,
      notario_proveedor_id: editForm.notario_proveedor_id || null,
      notaria: editForm.notaria.trim() || null,
      notas: editForm.notas.trim() || null,
      subtipo_meta: Object.keys(editForm.subtipo_meta).length > 0 ? editForm.subtipo_meta : null,
    };
    onDocUpdated(updated);
    setEditing(false);
  };

  if (!doc) return null;

  const metaEntries = Object.entries(doc.subtipo_meta ?? {}).filter(([, v]) => v);
  const metaLabels: Record<string, string> = {
    numero_escritura: 'No. Escritura', fecha_escritura: 'Fecha Escritura', volumen: 'Volumen',
    parte_a: 'Parte A', parte_b: 'Parte B', vigencia_meses: 'Vigencia (meses)', monto: 'Monto',
    numero_poliza: 'No. Póliza', aseguradora: 'Aseguradora', cobertura: 'Cobertura', prima_anual: 'Prima Anual',
    numero_acta: 'No. Acta', fecha_acta: 'Fecha Acta', entidad: 'Entidad Constituida', objeto_social: 'Objeto Social',
    tipo_poder: 'Tipo de Poder', fecha_poder: 'Fecha del Poder', otorgante: 'Otorgante', apoderado: 'Apoderado',
  };

  const hasPrincipalPdf = adjuntos.some((a) => a.rol === 'documento_principal');
  const needsPdf = doc.tipo && doc.tipo !== 'Otro';

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar Documento' : doc.titulo}</SheetTitle>
          <div className="absolute right-12 top-4 hidden sm:flex gap-2 print:hidden">
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" />Editar
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto">
          <div className="mt-4 space-y-5 pb-6">
            {editing ? (
              <>
                <DocFormFields form={editForm} setForm={setEditForm} notarias={notarias} onOpenCreateNotaria={onOpenCreateNotaria} />
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setEditForm(docToForm(doc)); setEditing(false); }} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">Cancelar</Button>
                  <Button onClick={handleSave} disabled={saving || !editForm.titulo.trim()} className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <TipoBadge tipo={doc.tipo} />
                  <VencBadge d={doc.fecha_vencimiento} />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><FLabel>Número</FLabel><p className="text-[var(--text)]/80">{doc.numero_documento ?? '—'}</p></div>
                  <div><FLabel>Emisión</FLabel><p className="text-[var(--text)]/80">{formatDate(doc.fecha_emision)}</p></div>
                </div>
                {doc.notaria && <div><FLabel>Notaría</FLabel><p className="text-sm text-[var(--text)]/80">{doc.notaria}</p></div>}

                {metaEntries.length > 0 && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {metaEntries.map(([k, v]) => (
                        <div key={k}><FLabel>{metaLabels[k] ?? k}</FLabel><p className="text-[var(--text)]/80">{String(v)}</p></div>
                      ))}
                    </div>
                  </>
                )}

                {doc.notas && (
                  <>
                    <Separator />
                    <div><FLabel>Notas</FLabel><p className="text-sm text-[var(--text)]/70 whitespace-pre-wrap">{doc.notas}</p></div>
                  </>
                )}
              </>
            )}

            <Separator />

            {needsPdf && !hasPrincipalPdf && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Este documento requiere un PDF escaneado como documento principal.
              </div>
            )}

            <AdjuntosSection documentoId={doc.id} empresaId={doc.empresa_id} adjuntos={adjuntos} onRefresh={onRefreshAdjuntos} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Create Sheet ───────────────────────────────────────────────────────────────

function CreateSheet({
  open, onClose, notarias, onOpenCreateNotaria, onCreated,
}: {
  open: boolean; onClose: () => void;
  notarias: NotariaOption[]; onOpenCreateNotaria: () => void;
  onCreated: (doc: Documento) => void;
}) {
  const supabase = createSupabaseERPClient();
  const [form, setForm] = useState<DocForm>(emptyForm());
  const [creating, setCreating] = useState(false);

  useEffect(() => { if (open) setForm(emptyForm()); }, [open]);

  const handleCreate = async () => {
    if (!form.titulo.trim()) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: cu } = await supabase.schema('core').from('usuarios').select('id').eq('email', (user?.email ?? '').toLowerCase()).maybeSingle();
    const { data: newDoc, error: err } = await supabase.schema('erp').from('documentos').insert({
      empresa_id: EMPRESA_ID,
      titulo: form.titulo.trim(),
      numero_documento: form.numero_documento.trim() || null,
      tipo: form.tipo || null,
      fecha_emision: form.fecha_emision || null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      notario_proveedor_id: form.notario_proveedor_id || null,
      notaria: form.notaria.trim() || null,
      notas: form.notas.trim() || null,
      subtipo_meta: Object.keys(form.subtipo_meta).length > 0 ? form.subtipo_meta : null,
      creado_por: cu?.id ?? null,
    }).select('*').single();
    setCreating(false);
    if (err || !newDoc) { alert(`Error: ${err?.message ?? 'No se pudo crear'}`); return; }
    onClose();
    onCreated(newDoc as Documento);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle>Nuevo Documento</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 pr-1">
          <div className="mt-4 pb-6">
            <DocFormFields form={form} setForm={setForm} notarias={notarias} onOpenCreateNotaria={onOpenCreateNotaria} />
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={onClose} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">Cancelar</Button>
              <Button onClick={handleCreate} disabled={creating || !form.titulo.trim() || !form.tipo} className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Guardar y adjuntar archivos
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

function DocumentosInner() {
  const supabase = createSupabaseERPClient();

  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [showCreateNotaria, setShowCreateNotaria] = useState(false);
  const [creatingNotaria, setCreatingNotaria] = useState(false);
  const [newNotariaNombre, setNewNotariaNombre] = useState('');
  const [notarias, setNotarias] = useState<NotariaOption[]>([]);

  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);
  const [adjuntosPorDoc, setAdjuntosPorDoc] = useState<Record<string, Adjunto[]>>({});

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchDocumentos = useCallback(async () => {
    const { data, error: err } = await supabase.schema('erp').from('documentos').select('*').eq('empresa_id', EMPRESA_ID).is('deleted_at', null).order('created_at', { ascending: false });
    if (err) { setError(err.message); return; }
    setDocumentos((data ?? []) as Documento[]);
  }, [supabase]);

  const fetchNotarias = useCallback(async () => {
    const { data: provData } = await supabase.schema('erp').from('proveedores').select('id, persona_id, empresa_id').eq('empresa_id', EMPRESA_ID).eq('categoria', 'notaria').eq('activo', true).is('deleted_at', null);
    const pIds = [...new Set((provData ?? []).map((p: any) => p.persona_id).filter(Boolean))];
    if (pIds.length === 0) { setNotarias([]); return; }
    const { data: persData } = await supabase.schema('erp').from('personas').select('id, nombre').in('id', pIds).is('deleted_at', null);
    const pm = new Map((persData ?? []).map((p: any) => [p.id, p.nombre as string]));
    setNotarias((provData ?? []).map((p: any) => ({ id: p.id, empresa_id: p.empresa_id, nombre: pm.get(p.persona_id) ?? 'Sin nombre' })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX')));
  }, [supabase]);

  const fetchAdjuntosBulk = useCallback(async (docIds: string[]) => {
    if (docIds.length === 0) { setAdjuntosPorDoc({}); return; }
    const { data } = await supabase.schema('erp').from('adjuntos').select('id, nombre, url, tipo_mime, tamano_bytes, created_at, entidad_id, rol').eq('entidad_tipo', 'documento').in('entidad_id', docIds).order('created_at', { ascending: false });

    // Bucket is private — enrich each row with a short-lived signed URL.
    const signedMap = await getAdjuntoSignedUrls(supabase, (data ?? []).map((a: { url: string }) => a.url));

    const map: Record<string, Adjunto[]> = {};
    for (const a of data ?? []) {
      const key = a.entidad_id as string;
      if (!map[key]) map[key] = [];
      const path = getAdjuntoPath(a.url);
      const signedUrl = path ? signedMap.get(path) : null;
      map[key].push({ id: a.id, nombre: a.nombre, url: signedUrl ?? a.url, tipo_mime: a.tipo_mime, tamano_bytes: a.tamano_bytes, rol: a.rol ?? 'anexo', created_at: a.created_at });
    }
    setAdjuntosPorDoc(map);
  }, [supabase]);

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const init = async () => {
      await Promise.all([fetchDocumentos(), fetchNotarias()]);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => { cancelled = true; };
  }, [fetchDocumentos, fetchNotarias]);

  useEffect(() => {
    if (documentos.length === 0) return;
    void fetchAdjuntosBulk(documentos.map((d) => d.id));
  }, [documentos, fetchAdjuntosBulk]);

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchDocumentos(), fetchNotarias()]);
    setLoading(false);
  };

  const handleRefreshAdjuntos = () => {
    const ids = documentos.map((d) => d.id);
    if (selectedDoc && !ids.includes(selectedDoc.id)) ids.push(selectedDoc.id);
    void fetchAdjuntosBulk(ids);
  };

  const handleDocUpdated = (updated: Documento) => {
    setSelectedDoc(updated);
    setDocumentos((prev) => prev.map((d) => d.id === updated.id ? updated : d));
  };

  const handleDocCreated = (newDoc: Documento) => {
    setDocumentos((prev) => [newDoc, ...prev]);
    setSelectedDoc(newDoc);
  };

  const handleCreateNotaria = async () => {
    if (!newNotariaNombre.trim()) return;
    setCreatingNotaria(true);
    try {
      const { data: persona, error: pe } = await supabase.schema('erp').from('personas').insert({ empresa_id: EMPRESA_ID, nombre: newNotariaNombre.trim(), tipo: 'proveedor' }).select('id').single();
      if (pe) throw pe;
      const { data: prov, error: pre } = await supabase.schema('erp').from('proveedores').insert({ empresa_id: EMPRESA_ID, persona_id: persona.id, categoria: 'notaria', activo: true }).select('id, empresa_id').single();
      if (pre) throw pre;
      const nn = { id: prov.id, empresa_id: prov.empresa_id, nombre: newNotariaNombre.trim() };
      setNotarias((prev) => [...prev, nn].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX')));
      setNewNotariaNombre('');
      setShowCreateNotaria(false);
    } catch (e: any) { alert(`Error: ${e?.message ?? 'desconocido'}`); }
    finally { setCreatingNotaria(false); }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const tiposPresentes = [...new Set(documentos.map((d) => d.tipo).filter(Boolean))] as string[];

  const filtered = documentos.filter((d) => {
    if (search && !d.titulo.toLowerCase().includes(search.toLowerCase()) && !(d.numero_documento ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTipo !== 'all' && d.tipo !== filterTipo) return false;
    return true;
  });

  const expiredCount = documentos.filter((d) => getVencStatus(d.fecha_vencimiento) === 'expired').length;
  const soonCount = documentos.filter((d) => getVencStatus(d.fecha_vencimiento) === 'soon').length;
  const { sortKey, sortDir, onSort, sortData } = useSortableTable('fecha_emision', 'desc');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Documentos — Rincón del Bosque</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">Escrituras, contratos, seguros y documentos legales</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5">
            <Plus className="h-4 w-4" />Nuevo Documento
          </Button>
        </div>
      </div>

      {(expiredCount > 0 || soonCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />{expiredCount} {expiredCount === 1 ? 'documento vencido' : 'documentos vencidos'}
            </div>
          )}
          {soonCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
              <Clock className="h-4 w-4 shrink-0" />{soonCount} por vencer (≤60 días)
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
            <Input placeholder="Buscar por título o número..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
          </div>
          <Select value={filterTipo} onValueChange={(v) => setFilterTipo(v ?? 'all')}>
            <SelectTrigger className="w-48 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {tiposPresentes.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="space-y-0 divide-y divide-[var(--border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-4 w-64" /><Skeleton className="h-5 w-24 ml-auto" /><Skeleton className="h-5 w-28" /><Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <FileText className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">{documentos.length === 0 ? 'No hay documentos capturados aún' : 'Sin resultados'}</p>
            {documentos.length === 0 && (
              <Button size="sm" onClick={() => setShowCreate(true)} className="mt-4 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90">
                <Plus className="h-4 w-4" />Capturar primer documento
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead sortKey="titulo" label="Título" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHead sortKey="tipo" label="Tipo" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-40" />
                <TableHead className="w-24 font-medium text-[var(--text)]/55">PDF</TableHead>
                <TableHead className="w-24 font-medium text-[var(--text)]/55">Imagen</TableHead>
                <TableHead className="w-20 font-medium text-[var(--text)]/55">Anexos</TableHead>
                <SortableHead sortKey="fecha_emision" label="Emisión" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
                <SortableHead sortKey="fecha_vencimiento" label="Vencimiento" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(filtered).map((doc) => {
                const docAdj = adjuntosPorDoc[doc.id] ?? [];
                const pdfs = docAdj.filter((a) => a.rol === 'documento_principal');
                const imgs = docAdj.filter((a) => a.rol === 'imagen_referencia');
                const anx = docAdj.filter((a) => a.rol === 'anexo');
                return (
                  <TableRow key={doc.id} className="border-[var(--border)] cursor-pointer hover:bg-[var(--panel)]/50" onClick={() => setSelectedDoc(doc)}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="line-clamp-1 font-medium text-[var(--text)]">{doc.titulo}</span>
                        {doc.tipo && doc.tipo !== 'Otro' && pdfs.length === 0 && (
                          <span title="Sin PDF principal" className="shrink-0 text-amber-400"><AlertTriangle className="h-3 w-3" /></span>
                        )}
                      </div>
                      {doc.notaria && <span className="mt-0.5 block text-xs text-[var(--text)]/40">{doc.notaria}</span>}
                    </TableCell>
                    <TableCell><TipoBadge tipo={doc.tipo} /></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {pdfs.length > 0 ? (
                        <div className="flex gap-1">
                          {pdfs.map((a) => (
                            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors" title={a.nombre}>
                              <FileText className="h-3 w-3" />PDF
                            </a>
                          ))}
                        </div>
                      ) : <span className="text-xs text-[var(--text)]/25">—</span>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {imgs.length > 0 ? (
                        <div className="flex gap-1">
                          {imgs.map((a) => (
                            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="group/img relative inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors" title={a.nombre}>
                              <ImageIcon className="h-3 w-3" />IMG
                              <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 scale-95 opacity-0 transition-all duration-150 group-hover/img:scale-100 group-hover/img:opacity-100">
                                <img src={a.url} alt={a.nombre} className="max-h-48 max-w-64 rounded-xl border border-[var(--border)] shadow-xl object-contain bg-white" />
                              </span>
                            </a>
                          ))}
                        </div>
                      ) : <span className="text-xs text-[var(--text)]/25">—</span>}
                    </TableCell>
                    <TableCell>
                      {anx.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--panel)] px-2 py-1 text-xs font-medium text-[var(--text)]/50">
                          <Paperclip className="h-3 w-3" />{anx.length}
                        </span>
                      ) : <span className="text-xs text-[var(--text)]/25">—</span>}
                    </TableCell>
                    <TableCell><span className="text-sm text-[var(--text)]/70">{formatDate(doc.fecha_emision)}</span></TableCell>
                    <TableCell><VencBadge d={doc.fecha_vencimiento} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && documentos.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">{filtered.length} de {documentos.length} documentos</p>
      )}

      <CreateSheet
        open={showCreate} onClose={() => setShowCreate(false)}
        notarias={notarias} onOpenCreateNotaria={() => setShowCreateNotaria(true)}
        onCreated={handleDocCreated}
      />

      <DetailSheet
        doc={selectedDoc} open={!!selectedDoc} onClose={() => setSelectedDoc(null)}
        notarias={notarias} onOpenCreateNotaria={() => setShowCreateNotaria(true)}
        adjuntos={selectedDoc ? (adjuntosPorDoc[selectedDoc.id] ?? []) : []}
        onRefreshAdjuntos={handleRefreshAdjuntos} onDocUpdated={handleDocUpdated}
      />

      <Dialog open={showCreateNotaria} onOpenChange={setShowCreateNotaria}>
        <DialogContent className="max-w-md rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader><DialogTitle className="text-[var(--text)]">Nueva notaría</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <FLabel>Nombre de la notaría</FLabel>
              <Input placeholder="Ej: Notaría Pública No. 45 — Lic. González" value={newNotariaNombre} onChange={(e) => setNewNotariaNombre(e.target.value)} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateNotaria(false); setNewNotariaNombre(''); }} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">Cancelar</Button>
            <Button onClick={handleCreateNotaria} disabled={creatingNotaria || !newNotariaNombre.trim()} className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90">
              {creatingNotaria ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RdbAdminDocumentosPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.admin.documentos">
      <DocumentosInner />
    </RequireAccess>
  );
}

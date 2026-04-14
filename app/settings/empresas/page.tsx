'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Upload, Loader2, RefreshCw, CheckCircle } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

type Empresa = {
  id: string;
  nombre: string;
  slug: string;
  activa: boolean;
  logo_url: string | null;
  header_url: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

// ─── Image uploader ─────────────────────────────────────────────────────────────

function ImageUploader({
  label,
  currentUrl,
  bucket,
  storagePath,
  onUploaded,
}: {
  label: string;
  currentUrl: string | null;
  bucket: string;
  storagePath: string;
  onUploaded: (url: string) => void;
}) {
  const supabase = createSupabaseBrowserClient();
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setSaved(false);

    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${storagePath}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      alert(`Error al subir imagen: ${uploadErr.message}`);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    // Cache-bust so the new image shows immediately
    const url = `${data.publicUrl}?t=${Date.now()}`;
    onUploaded(url);
    setUploading(false);
    setSaved(true);
    e.target.value = '';
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-3">
      <FieldLabel>{label}</FieldLabel>

      {currentUrl ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt={label}
            className="max-h-24 max-w-full rounded-lg object-contain"
          />
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text)]/40">
          Sin imagen
        </div>
      )}

      <div className="flex items-center gap-3">
        <Input
          value={currentUrl ?? ''}
          placeholder="https://..."
          onChange={(e) => onUploaded(e.target.value)}
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-sm text-[var(--text)]"
        />
        <label className="shrink-0 cursor-pointer">
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={handleUpload}
          />
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]/70 transition hover:bg-[var(--panel)] hover:text-[var(--text)] cursor-pointer whitespace-nowrap">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Subiendo...' : 'Subir imagen'}
          </span>
        </label>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle className="h-3.5 w-3.5" />
            Guardado
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Empresa card ────────────────────────────────────────────────────────────────

function EmpresaCard({ empresa, onSaved }: { empresa: Empresa; onSaved: () => void }) {
  const supabase = createSupabaseBrowserClient();
  const [logoUrl, setLogoUrl] = useState(empresa.logo_url ?? '');
  const [headerUrl, setHeaderUrl] = useState(empresa.header_url ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = logoUrl !== (empresa.logo_url ?? '') || headerUrl !== (empresa.header_url ?? '');

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .schema('core' as any)
      .from('empresas')
      .update({
        logo_url: logoUrl.trim() || null,
        header_url: headerUrl.trim() || null,
      })
      .eq('id', empresa.id);

    setSaving(false);
    if (error) { alert(`Error al guardar: ${error.message}`); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved();
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--panel)]">
            <Building2 className="h-5 w-5 text-[var(--text)]/50" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text)]">{empresa.nombre}</h3>
            <p className="text-xs text-[var(--text)]/50">
              slug: <code className="font-mono">{empresa.slug}</code>
              {' · '}
              {empresa.activa ? (
                <span className="text-green-400">activa</span>
              ) : (
                <span className="text-[var(--text)]/40">inactiva</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Logo */}
      <ImageUploader
        label="Logo"
        currentUrl={logoUrl || null}
        bucket="empresas"
        storagePath={`${empresa.slug}/logo`}
        onUploaded={(url) => setLogoUrl(url)}
      />

      {/* Header */}
      <ImageUploader
        label="Encabezado para impresión (header_url)"
        currentUrl={headerUrl || null}
        bucket="empresas"
        storagePath={`${empresa.slug}/header`}
        onUploaded={(url) => setHeaderUrl(url)}
      />

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2 border-t border-[var(--border)]">
        <Button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar cambios
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-400">
            <CheckCircle className="h-4 w-4" />
            Guardado correctamente
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────────

function EmpresasSettingsInner() {
  const supabase = createSupabaseBrowserClient();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmpresas = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('core' as any)
      .from('empresas')
      .select('id, nombre, slug, activa, logo_url, header_url')
      .order('nombre');
    if (err) { setError(err.message); return; }
    setEmpresas(data ?? []);
  }, [supabase]);

  useEffect(() => {
    setLoading(true);
    fetchEmpresas().finally(() => setLoading(false));
  }, [fetchEmpresas]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Empresas</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">
            Configura el logo e imagen de encabezado de cada empresa para impresión
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setLoading(true); fetchEmpresas().finally(() => setLoading(false)); }}
          disabled={loading}
          className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-32" />
            </div>
          ))}
        </div>
      ) : empresas.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <Building2 className="mb-3 h-10 w-10 text-[var(--text)]/20" />
          <p className="text-sm text-[var(--text)]/55">No hay empresas registradas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {empresas.map((e) => (
            <EmpresaCard
              key={e.id}
              empresa={e}
              onSaved={fetchEmpresas}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess adminOnly>
      <EmpresasSettingsInner />
    </RequireAccess>
  );
}

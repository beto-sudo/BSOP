'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import { Upload, Loader2, CheckCircle } from 'lucide-react';

export function ImageUploader({
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
        <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text-subtle)]">
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
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
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

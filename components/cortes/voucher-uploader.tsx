'use client';

import { AlertCircle, ImagePlus, Loader2, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { eliminarVoucher, subirVoucher } from '@/app/rdb/cortes/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type { Voucher } from './types';
import { VOUCHER_ALLOWED_MIMES, VOUCHER_MAX_BYTES } from './types';

type Props = {
  corteId: string;
  vouchers: Voucher[];
  onUploaded: (voucher: Voucher) => void;
  onRemoved: (id: string) => void;
  disabled?: boolean;
};

type PendingItem = {
  key: string;
  name: string;
  progress: number;
  error?: string;
};

/**
 * Convierte HEIC/HEIF a JPEG en el cliente (Chrome/Firefox no muestran HEIC).
 * Import dinámico — la librería solo pesa 1.5 MB y únicamente se necesita en iPhone.
 * Si la conversión falla, devolvemos el archivo original: el server lo acepta, Safari
 * lo renderiza, y perder la foto es peor que el fallback.
 */
async function convertIfHeic(file: File): Promise<File> {
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (!isHeic) return file;
  try {
    const { default: heic2any } = await import('heic2any');
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    const jpegBlob = Array.isArray(blob) ? blob[0] : blob;
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([jpegBlob], newName, { type: 'image/jpeg' });
  } catch (err) {
    console.warn('[voucher] HEIC→JPEG falló, subiendo original:', err);
    return file;
  }
}

/**
 * Comprime fotos > 2 MB a <= 1500 px / calidad 0.8 (~400 KB para tickets).
 * Solo aplica a imágenes ya convertidas (no re-toca HEIC original).
 */
async function compressIfLarge(file: File): Promise<File> {
  if (file.size <= 2 * 1024 * 1024) return file;
  if (!file.type.startsWith('image/')) return file;
  if (/heic|heif/i.test(file.type)) return file;
  try {
    const { default: imageCompression } = await import('browser-image-compression');
    const compressed = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1500,
      initialQuality: 0.8,
      useWebWorker: true,
    });
    return new File([compressed], file.name, { type: compressed.type || file.type });
  } catch (err) {
    console.warn('[voucher] compresión falló, subiendo original:', err);
    return file;
  }
}

function validateClientSide(file: File): string | null {
  if (file.size > VOUCHER_MAX_BYTES) return `"${file.name}" excede 10 MB`;
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  const allowed = (VOUCHER_ALLOWED_MIMES as readonly string[]).includes(file.type);
  if (!allowed && !isHeic && !file.type.startsWith('image/')) {
    return `"${file.name}" no es una imagen permitida`;
  }
  return null;
}

export function VoucherUploader({ corteId, vouchers, onUploaded, onRemoved, disabled }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (disabled) return;
      const list = Array.from(files);
      for (const raw of list) {
        const validationErr = validateClientSide(raw);
        if (validationErr) {
          toast.add({ title: validationErr, type: 'error' });
          continue;
        }

        const key = crypto.randomUUID();
        setPending((p) => [...p, { key, name: raw.name, progress: 5 }]);

        try {
          setPending((p) => p.map((it) => (it.key === key ? { ...it, progress: 20 } : it)));
          const converted = await convertIfHeic(raw);
          setPending((p) => p.map((it) => (it.key === key ? { ...it, progress: 50 } : it)));
          const prepared = await compressIfLarge(converted);
          setPending((p) => p.map((it) => (it.key === key ? { ...it, progress: 70 } : it)));

          const { id, signed_url } = await subirVoucher({ corte_id: corteId, file: prepared });

          onUploaded({
            id,
            corte_id: corteId,
            storage_path: '',
            signed_url,
            nombre_original: prepared.name,
            tamano_bytes: prepared.size,
            mime_type: prepared.type,
            afiliacion: null,
            monto_reportado: null,
            uploaded_by_nombre: null,
            uploaded_at: new Date().toISOString(),
          });

          setPending((p) => p.filter((it) => it.key !== key));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error al subir';
          toast.add({ title: `Falló ${raw.name}`, description: msg, type: 'error' });
          setPending((p) => p.map((it) => (it.key === key ? { ...it, error: msg } : it)));
        }
      }
    },
    [corteId, disabled, onUploaded, toast]
  );

  async function handleRemove(voucher: Voucher) {
    if (removingId) return;
    setRemovingId(voucher.id);
    try {
      await eliminarVoucher(voucher.id);
      onRemoved(voucher.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar';
      toast.add({ title: 'No se pudo eliminar', description: msg, type: 'error' });
    } finally {
      setRemovingId(null);
    }
  }

  function onPickClick() {
    inputRef.current?.click();
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            void processFiles(e.dataTransfer.files);
          }
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <ImagePlus className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Arrastra fotos aquí o
          <Button
            type="button"
            variant="link"
            onClick={onPickClick}
            disabled={disabled}
            className="h-auto px-1 py-0 align-baseline"
          >
            selecciónalas
          </Button>
          · JPG/PNG/HEIC hasta 10 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void processFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {(vouchers.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-3 gap-2">
          {vouchers.map((v) => (
            <div
              key={v.id}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              {v.signed_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.signed_url}
                  alt={v.nombre_original ?? 'voucher'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sin preview
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleRemove(v)}
                disabled={removingId === v.id || disabled}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
                aria-label={`Eliminar ${v.nombre_original ?? 'voucher'}`}
              >
                {removingId === v.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
          {pending.map((p) => (
            <div
              key={p.key}
              className="relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              <div className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center">
                {p.error ? (
                  <>
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <span className="line-clamp-2 text-[10px] text-destructive">{p.error}</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted-foreground/20">
                      <div
                        className="h-full bg-primary transition-[width] duration-300"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                    <span className="line-clamp-1 text-[10px] text-muted-foreground">{p.name}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

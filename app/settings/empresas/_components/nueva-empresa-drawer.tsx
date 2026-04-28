'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertTriangle, Loader2, RefreshCw, Save, Sparkles, Upload } from 'lucide-react';

import type { CsfExtraccion } from '@/lib/proveedores/extract-csf';

/**
 * Drawer para alta de empresa nueva con flujo CSF.
 *
 * Flujo:
 *   A. drop: usuario sube PDF de la CSF.
 *   B. processing: extract-csf con Claude (30-90s).
 *   C. preview + form: usuario revisa los campos extraídos, captura slug
 *      (default = slugify del nombre), nombre (default = razón social),
 *      tipo_contribuyente (default según `extraccion.tipo_persona`).
 *   D. creating: POST create-with-csf, redirige al detalle.
 *
 * Errores comunes manejados friendly:
 *   - 409 rfc_duplicado: link al detalle de la empresa existente.
 *   - 409 slug_duplicado: invita a editar el slug.
 */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

export function NuevaEmpresaDrawer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const router = useRouter();

  const [csfFile, setCsfFile] = useState<File | null>(null);
  const [csfProcessing, setCsfProcessing] = useState(false);
  const [csfError, setCsfError] = useState<string | null>(null);
  const [extraccion, setExtraccion] = useState<CsfExtraccion | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tipoContribuyente, setTipoContribuyente] = useState<'persona_moral' | 'persona_fisica'>(
    'persona_moral'
  );

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<{
    message: string;
    duplicateSlug?: string;
  } | null>(null);

  const reset = () => {
    setCsfFile(null);
    setCsfProcessing(false);
    setCsfError(null);
    setExtraccion(null);
    setNombre('');
    setSlug('');
    setSlugTouched(false);
    setTipoContribuyente('persona_moral');
    setCreating(false);
    setCreateError(null);
    setDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      // Si está creando, no cerramos a media operación.
      if (creating) return;
      reset();
      onOpenChange(false);
    }
  };

  const handleFileChosen = async (file: File | null) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') {
      setCsfError(`Tipo de archivo no soportado: ${file.type}. Solo .pdf.`);
      return;
    }
    setCsfFile(file);
    setCsfProcessing(true);
    setCsfError(null);
    setExtraccion(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/empresas/extract-csf', { method: 'POST', body: fd });
      const text = await res.text();
      let json: { ok?: boolean; extraccion?: CsfExtraccion; error?: string } | null = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        const preview = text.slice(0, 160);
        throw new Error(
          `Respuesta no-JSON del servidor (${res.status}): ${preview || 'cuerpo vacío'}`
        );
      }
      if (!res.ok) {
        throw new Error(json?.error ?? `Error ${res.status} al procesar CSF`);
      }
      if (!json?.extraccion) {
        throw new Error('Respuesta del servidor sin campo "extraccion".');
      }
      const ex = json.extraccion;
      setExtraccion(ex);
      const isMoral = ex.tipo_persona === 'moral';
      setTipoContribuyente(isMoral ? 'persona_moral' : 'persona_fisica');
      const defaultNombre = isMoral
        ? ex.nombre_comercial?.trim() || ex.razon_social?.trim() || 'Empresa'
        : [ex.nombre, ex.apellido_paterno, ex.apellido_materno].filter(Boolean).join(' ').trim() ||
          'Persona';
      setNombre(defaultNombre);
      if (!slugTouched) setSlug(slugify(defaultNombre));
    } catch (err) {
      setCsfError(err instanceof Error ? err.message : String(err));
      // Si la extracción falla, soltamos el file para que el usuario reintente
      // sin re-abrir el drawer.
      setCsfFile(null);
    } finally {
      setCsfProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    void handleFileChosen(file);
  };

  const handleNombreChange = (v: string) => {
    setNombre(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleCreate = async () => {
    if (!csfFile || !extraccion || !nombre.trim() || !slug.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const fd = new FormData();
      fd.append('file', csfFile);
      fd.append(
        'payload',
        JSON.stringify({
          extraccion,
          slug: slug.trim(),
          nombre: nombre.trim(),
          tipo_contribuyente: tipoContribuyente,
        })
      );
      const res = await fetch('/api/empresas/create-with-csf', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === 'rfc_duplicado') {
          setCreateError({
            message: `Ya existe una empresa con este RFC.`,
            duplicateSlug: json.existing_slug ?? null,
          });
        } else if (json.error === 'slug_duplicado') {
          setCreateError({ message: 'Ya existe una empresa con ese slug. Edítalo y reintenta.' });
        } else {
          setCreateError({ message: json.error ?? 'Error al crear empresa' });
        }
        return;
      }
      onCreated();
      handleClose(false);
      // Navega al detalle de la empresa recién creada.
      router.push(`/settings/empresas/${json.slug}`);
    } catch (err) {
      setCreateError({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreating(false);
    }
  };

  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  const canSubmit =
    !!csfFile && !!extraccion && nombre.trim().length > 0 && slug.trim().length > 0 && slugValid;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-[700px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            Nueva empresa con CSF
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Sube el PDF de la CSF y el sistema extrae los datos fiscales. Solo necesitas confirmar
            slug y nombre.
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Estado A: drop */}
          {!csfFile && !csfProcessing && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void handleFileChosen(f);
                }}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`w-full rounded-xl border-2 border-dashed px-6 py-12 text-center transition cursor-pointer ${
                  dragActive
                    ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-[var(--border)] bg-[var(--panel)]/30 hover:bg-[var(--panel)]/60'
                }`}
              >
                <Upload className="mx-auto h-10 w-10 text-[var(--text)]/40 pointer-events-none" />
                <p className="mt-3 text-sm font-medium text-[var(--text)] pointer-events-none">
                  {dragActive ? 'Suelta el PDF aquí' : 'Arrastra el PDF o haz click para subirlo'}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)] pointer-events-none">
                  Solo .pdf, máximo 50 MB. La extracción tarda 30-90 segundos.
                </p>
              </div>
              {csfError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  {csfError}
                </div>
              )}
            </div>
          )}

          {/* Estado B: procesando */}
          {csfProcessing && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
              <p className="mt-4 text-sm font-medium text-[var(--text)]">
                Procesando con Claude...
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Tarda 30-90 segundos. No cierres este drawer.
              </p>
            </div>
          )}

          {/* Estado C: preview + form */}
          {extraccion && !csfProcessing && (
            <>
              {/* Resumen del extracto */}
              <div className="rounded-xl border border-emerald-300/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  <Sparkles className="h-4 w-4" />
                  CSF procesada — revisa y confirma
                </div>
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>{' '}
                    <span className="font-medium">{extraccion.tipo_persona}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RFC:</span>{' '}
                    <span className="font-mono">{extraccion.rfc}</span>
                  </div>
                  {extraccion.razon_social && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Razón social:</span>{' '}
                      <span className="font-medium">{extraccion.razon_social}</span>
                    </div>
                  )}
                  {extraccion.regimen_fiscal_nombre && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Régimen:</span>{' '}
                      {extraccion.regimen_fiscal_nombre}
                    </div>
                  )}
                  {extraccion.id_cif && (
                    <div>
                      <span className="text-muted-foreground">idCIF:</span>{' '}
                      <span className="font-mono">{extraccion.id_cif}</span>
                    </div>
                  )}
                  {extraccion.estatus_sat && (
                    <div>
                      <span className="text-muted-foreground">Estatus:</span>{' '}
                      {extraccion.estatus_sat}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setExtraccion(null);
                    setCsfFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  Cambiar PDF
                </button>
              </div>

              {/* Form de alta */}
              <div className="space-y-4">
                <div>
                  <FieldLabel>Nombre interno *</FieldLabel>
                  <Input
                    value={nombre}
                    onChange={(e) => handleNombreChange(e.target.value)}
                    placeholder="Cómo se llamará en el sistema (ej. RDB, ANSA)"
                    className="rounded-xl"
                    maxLength={120}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Default: nombre comercial o razón social. Editable.
                  </p>
                </div>

                <div>
                  <FieldLabel>Slug (URL) *</FieldLabel>
                  <Input
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugTouched(true);
                    }}
                    placeholder="kebab-case (ej. rdb, autos-del-norte)"
                    className="rounded-xl font-mono"
                    maxLength={40}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Solo a-z, 0-9, guiones. Aparece en `/settings/empresas/&lt;slug&gt;`.
                  </p>
                  {slug && !slugValid && (
                    <p className="mt-1 text-xs text-red-400">
                      Slug inválido. Usa kebab-case (a-z, 0-9, guiones).
                    </p>
                  )}
                </div>

                <div>
                  <FieldLabel>Tipo contribuyente</FieldLabel>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={tipoContribuyente === 'persona_moral' ? 'default' : 'outline'}
                      onClick={() => setTipoContribuyente('persona_moral')}
                      className="rounded-xl"
                    >
                      Persona moral
                    </Button>
                    <Button
                      size="sm"
                      variant={tipoContribuyente === 'persona_fisica' ? 'default' : 'outline'}
                      onClick={() => setTipoContribuyente('persona_fisica')}
                      className="rounded-xl"
                    >
                      Persona física
                    </Button>
                  </div>
                </div>
              </div>

              {createError && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{createError.message}</span>
                  </div>
                  {createError.duplicateSlug && (
                    <a
                      href={`/settings/empresas/${createError.duplicateSlug}`}
                      className="block text-xs underline hover:no-underline"
                    >
                      → Abrir empresa existente
                    </a>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => handleClose(false)} disabled={creating}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={!canSubmit || creating} className="gap-2">
                  {creating ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Crear empresa
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

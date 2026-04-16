'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Upload, Loader2, RefreshCw, CheckCircle, FileText, ExternalLink } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

type ActividadEconomica = {
  orden: number;
  actividad: string;
  porcentaje: string;
  fecha_inicio: string;
  fecha_fin: string | null;
};

type ObligacionFiscal = {
  descripcion: string;
  vencimiento: string;
  fecha_inicio: string;
  fecha_fin: string | null;
};

type Empresa = {
  id: string;
  nombre: string;
  slug: string;
  activa: boolean;
  logo_url: string | null;
  header_url: string | null;
  rfc: string | null;
  razon_social: string | null;
  regimen_capital: string | null;
  nombre_comercial: string | null;
  fecha_inicio_operaciones: string | null;
  estatus_sat: string | null;
  id_cif: string | null;
  regimen_fiscal: string | null;
  domicilio_cp: string | null;
  domicilio_calle: string | null;
  domicilio_numero_ext: string | null;
  domicilio_numero_int: string | null;
  domicilio_colonia: string | null;
  domicilio_localidad: string | null;
  domicilio_municipio: string | null;
  domicilio_estado: string | null;
  actividades_economicas: ActividadEconomica[] | null;
  obligaciones_fiscales: ObligacionFiscal[] | null;
  csf_fecha_emision: string | null;
  csf_url: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-sm font-semibold text-[var(--text)]/80 uppercase tracking-wider border-b border-[var(--border)] pb-2 mb-4">
      {children}
    </h4>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  // Dates from Supabase come as YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
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

// ─── Text field input ────────────────────────────────────────────────────────────

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-sm text-[var(--text)]"
      />
    </div>
  );
}

// ─── Empresa card ────────────────────────────────────────────────────────────────

function EmpresaCard({ empresa, onSaved }: { empresa: Empresa; onSaved: () => void }) {
  const supabase = createSupabaseBrowserClient();
  const [logoUrl, setLogoUrl] = useState(empresa.logo_url ?? '');
  const [headerUrl, setHeaderUrl] = useState(empresa.header_url ?? '');
  const [rfc, setRfc] = useState(empresa.rfc ?? '');
  const [razonSocial, setRazonSocial] = useState(empresa.razon_social ?? '');
  const [regimenCapital, setRegimenCapital] = useState(empresa.regimen_capital ?? '');
  const [nombreComercial, setNombreComercial] = useState(empresa.nombre_comercial ?? '');
  const [fechaInicioOps, setFechaInicioOps] = useState(empresa.fecha_inicio_operaciones ?? '');
  const [estatusSat, setEstatusSat] = useState(empresa.estatus_sat ?? '');
  const [idCif, setIdCif] = useState(empresa.id_cif ?? '');
  const [regimenFiscal, setRegimenFiscal] = useState(empresa.regimen_fiscal ?? '');
  const [domCp, setDomCp] = useState(empresa.domicilio_cp ?? '');
  const [domCalle, setDomCalle] = useState(empresa.domicilio_calle ?? '');
  const [domNumExt, setDomNumExt] = useState(empresa.domicilio_numero_ext ?? '');
  const [domNumInt, setDomNumInt] = useState(empresa.domicilio_numero_int ?? '');
  const [domColonia, setDomColonia] = useState(empresa.domicilio_colonia ?? '');
  const [domLocalidad, setDomLocalidad] = useState(empresa.domicilio_localidad ?? '');
  const [domMunicipio, setDomMunicipio] = useState(empresa.domicilio_municipio ?? '');
  const [domEstado, setDomEstado] = useState(empresa.domicilio_estado ?? '');
  const [csfFechaEmision, setCsfFechaEmision] = useState(empresa.csf_fecha_emision ?? '');
  const [csfUrl, setCsfUrl] = useState(empresa.csf_url ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty = () => {
    return (
      logoUrl !== (empresa.logo_url ?? '') ||
      headerUrl !== (empresa.header_url ?? '') ||
      rfc !== (empresa.rfc ?? '') ||
      razonSocial !== (empresa.razon_social ?? '') ||
      regimenCapital !== (empresa.regimen_capital ?? '') ||
      nombreComercial !== (empresa.nombre_comercial ?? '') ||
      fechaInicioOps !== (empresa.fecha_inicio_operaciones ?? '') ||
      estatusSat !== (empresa.estatus_sat ?? '') ||
      idCif !== (empresa.id_cif ?? '') ||
      regimenFiscal !== (empresa.regimen_fiscal ?? '') ||
      domCp !== (empresa.domicilio_cp ?? '') ||
      domCalle !== (empresa.domicilio_calle ?? '') ||
      domNumExt !== (empresa.domicilio_numero_ext ?? '') ||
      domNumInt !== (empresa.domicilio_numero_int ?? '') ||
      domColonia !== (empresa.domicilio_colonia ?? '') ||
      domLocalidad !== (empresa.domicilio_localidad ?? '') ||
      domMunicipio !== (empresa.domicilio_municipio ?? '') ||
      domEstado !== (empresa.domicilio_estado ?? '') ||
      csfFechaEmision !== (empresa.csf_fecha_emision ?? '') ||
      csfUrl !== (empresa.csf_url ?? '')
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .schema('core' as any)
      .from('empresas')
      .update({
        logo_url: logoUrl.trim() || null,
        header_url: headerUrl.trim() || null,
        rfc: rfc.trim() || null,
        razon_social: razonSocial.trim() || null,
        regimen_capital: regimenCapital.trim() || null,
        nombre_comercial: nombreComercial.trim() || null,
        fecha_inicio_operaciones: fechaInicioOps.trim() || null,
        estatus_sat: estatusSat.trim() || null,
        id_cif: idCif.trim() || null,
        regimen_fiscal: regimenFiscal.trim() || null,
        domicilio_cp: domCp.trim() || null,
        domicilio_calle: domCalle.trim() || null,
        domicilio_numero_ext: domNumExt.trim() || null,
        domicilio_numero_int: domNumInt.trim() || null,
        domicilio_colonia: domColonia.trim() || null,
        domicilio_localidad: domLocalidad.trim() || null,
        domicilio_municipio: domMunicipio.trim() || null,
        domicilio_estado: domEstado.trim() || null,
        csf_fecha_emision: csfFechaEmision.trim() || null,
        csf_url: csfUrl.trim() || null,
      })
      .eq('id', empresa.id);

    setSaving(false);
    if (error) { alert(`Error al guardar: ${error.message}`); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved();
  };

  const actividades = empresa.actividades_economicas ?? [];
  const obligaciones = empresa.obligaciones_fiscales ?? [];

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

      {/* ── Datos Fiscales ─────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionTitle>Datos Fiscales</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TextField label="RFC" value={rfc} onChange={setRfc} placeholder="ABC123456XX0" />
          <TextField label="Razón Social" value={razonSocial} onChange={setRazonSocial} />
          <TextField label="Régimen Capital" value={regimenCapital} onChange={setRegimenCapital} placeholder="SA de CV" />
          <TextField label="Nombre Comercial" value={nombreComercial} onChange={setNombreComercial} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TextField label="Fecha Inicio Operaciones" value={fechaInicioOps} onChange={setFechaInicioOps} placeholder="YYYY-MM-DD" />
          <TextField label="Estatus SAT" value={estatusSat} onChange={setEstatusSat} placeholder="ACTIVO" />
          <TextField label="idCIF" value={idCif} onChange={setIdCif} />
          <TextField label="Régimen Fiscal" value={regimenFiscal} onChange={setRegimenFiscal} />
        </div>
      </div>

      {/* ── Domicilio Fiscal ───────────────────────────────────── */}
      <div className="space-y-4">
        <SectionTitle>Domicilio Fiscal</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <TextField label="Calle" value={domCalle} onChange={setDomCalle} />
          </div>
          <TextField label="Número Exterior" value={domNumExt} onChange={setDomNumExt} />
          <TextField label="Número Interior" value={domNumInt} onChange={setDomNumInt} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TextField label="Colonia" value={domColonia} onChange={setDomColonia} />
          <TextField label="Localidad" value={domLocalidad} onChange={setDomLocalidad} />
          <TextField label="Municipio" value={domMunicipio} onChange={setDomMunicipio} />
          <TextField label="Estado" value={domEstado} onChange={setDomEstado} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TextField label="Código Postal" value={domCp} onChange={setDomCp} placeholder="00000" />
        </div>
      </div>

      {/* ── Actividades Económicas ─────────────────────────────── */}
      {actividades.length > 0 && (
        <div className="space-y-4">
          <SectionTitle>Actividades Económicas</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">Actividad</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">%</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">Fecha Inicio</th>
                </tr>
              </thead>
              <tbody>
                {actividades.map((a, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text)]/60 tabular-nums">{a.orden}</td>
                    <td className="px-3 py-2 text-[var(--text)]">{a.actividad}</td>
                    <td className="px-3 py-2 text-right text-[var(--text)]/70 tabular-nums">{a.porcentaje}</td>
                    <td className="px-3 py-2 text-[var(--text)]/60 tabular-nums whitespace-nowrap">{a.fecha_inicio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Obligaciones Fiscales ──────────────────────────────── */}
      {obligaciones.length > 0 && (
        <div className="space-y-4">
          <SectionTitle>Obligaciones Fiscales</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">Descripción</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">Vencimiento</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">Fecha Inicio</th>
                </tr>
              </thead>
              <tbody>
                {obligaciones.map((o, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text)]">{o.descripcion}</td>
                    <td className="px-3 py-2 text-[var(--text)]/70 text-xs">{o.vencimiento}</td>
                    <td className="px-3 py-2 text-[var(--text)]/60 tabular-nums whitespace-nowrap">{o.fecha_inicio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CSF Info ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionTitle>Constancia de Situación Fiscal (CSF)</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TextField label="Fecha de Emisión" value={csfFechaEmision} onChange={setCsfFechaEmision} placeholder="YYYY-MM-DD" />
          <div className="sm:col-span-2">
            <TextField label="Ruta del PDF (storage o URL)" value={csfUrl} onChange={setCsfUrl} placeholder="legal/empresa/csf/archivo.pdf" />
          </div>
          {empresa.csf_url && (
            <div className="flex items-end pb-0.5">
              <button
                type="button"
                onClick={async () => {
                  const url = empresa.csf_url!;
                  // If it's a full URL, open directly
                  if (url.startsWith('http')) {
                    window.open(url, '_blank');
                    return;
                  }
                  // Otherwise it's a storage path — generate signed URL
                  const bucket = url.split('/')[0];
                  const path = url.split('/').slice(1).join('/');
                  const { data, error } = await supabase.storage
                    .from(bucket)
                    .createSignedUrl(path, 3600); // 1 hour
                  if (error || !data?.signedUrl) {
                    alert(`Error al generar enlace: ${error?.message ?? 'unknown'}`);
                    return;
                  }
                  window.open(data.signedUrl, '_blank');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--accent)] transition hover:bg-[var(--card)] cursor-pointer"
              >
                <FileText className="h-4 w-4" />
                Ver CSF
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        {empresa.csf_fecha_emision && (
          <p className="text-xs text-[var(--text)]/40">
            Emitida el {formatDate(empresa.csf_fecha_emision)}
          </p>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2 border-t border-[var(--border)]">
        <Button
          onClick={handleSave}
          disabled={saving || !isDirty()}
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
      .select('id, nombre, slug, activa, logo_url, header_url, rfc, razon_social, regimen_capital, nombre_comercial, fecha_inicio_operaciones, estatus_sat, id_cif, regimen_fiscal, domicilio_cp, domicilio_calle, domicilio_numero_ext, domicilio_numero_int, domicilio_colonia, domicilio_localidad, domicilio_municipio, domicilio_estado, actividades_economicas, obligaciones_fiscales, csf_fecha_emision, csf_url')
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
            Configura los datos fiscales, logo e imagen de encabezado de cada empresa
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

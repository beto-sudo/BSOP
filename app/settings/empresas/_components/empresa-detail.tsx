'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle, FileText, ExternalLink } from 'lucide-react';
import { ImageUploader } from './image-uploader';

export type ActividadEconomica = {
  orden: number;
  actividad: string;
  porcentaje: string;
  fecha_inicio: string;
  fecha_fin: string | null;
};

export type ObligacionFiscal = {
  descripcion: string;
  vencimiento: string;
  fecha_inicio: string;
  fecha_fin: string | null;
};

export type Empresa = {
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-sm font-semibold text-[var(--text)]/80 uppercase tracking-wider border-b border-[var(--border)] pb-2 mb-4">
      {children}
    </h4>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

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

export function EmpresaDetail({ empresa, onSaved }: { empresa: Empresa; onSaved: () => void }) {
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

  const isDirty = () =>
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
    csfUrl !== (empresa.csf_url ?? '');

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .schema('core')
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
    if (error) {
      alert(`Error al guardar: ${error.message}`);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved();
  };

  const actividades = empresa.actividades_economicas ?? [];
  const obligaciones = empresa.obligaciones_fiscales ?? [];

  return (
    <div className="space-y-6">
      <ImageUploader
        label="Logo (legacy)"
        currentUrl={logoUrl || null}
        bucket="branding"
        storagePath={`${empresa.slug}/logo`}
        onUploaded={(url) => setLogoUrl(url)}
      />
      <ImageUploader
        label="Encabezado para impresión (header_url)"
        currentUrl={headerUrl || null}
        bucket="branding"
        storagePath={`${empresa.slug}/header`}
        onUploaded={(url) => setHeaderUrl(url)}
      />

      <div className="space-y-4">
        <SectionTitle>Datos Fiscales</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TextField label="RFC" value={rfc} onChange={setRfc} placeholder="ABC123456XX0" />
          <TextField label="Razón Social" value={razonSocial} onChange={setRazonSocial} />
          <TextField
            label="Régimen Capital"
            value={regimenCapital}
            onChange={setRegimenCapital}
            placeholder="SA de CV"
          />
          <TextField
            label="Nombre Comercial"
            value={nombreComercial}
            onChange={setNombreComercial}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TextField
            label="Fecha Inicio Operaciones"
            value={fechaInicioOps}
            onChange={setFechaInicioOps}
            placeholder="YYYY-MM-DD"
          />
          <TextField
            label="Estatus SAT"
            value={estatusSat}
            onChange={setEstatusSat}
            placeholder="ACTIVO"
          />
          <TextField label="idCIF" value={idCif} onChange={setIdCif} />
          <TextField label="Régimen Fiscal" value={regimenFiscal} onChange={setRegimenFiscal} />
        </div>
      </div>

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

      {actividades.length > 0 && (
        <div className="space-y-4">
          <SectionTitle>Actividades Económicas</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Actividad
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    %
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Fecha Inicio
                  </th>
                </tr>
              </thead>
              <tbody>
                {actividades.map((a, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text)]/60 tabular-nums">{a.orden}</td>
                    <td className="px-3 py-2 text-[var(--text)]">{a.actividad}</td>
                    <td className="px-3 py-2 text-right text-[var(--text)]/70 tabular-nums">
                      {a.porcentaje}
                    </td>
                    <td className="px-3 py-2 text-[var(--text)]/60 tabular-nums whitespace-nowrap">
                      {a.fecha_inicio}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {obligaciones.length > 0 && (
        <div className="space-y-4">
          <SectionTitle>Obligaciones Fiscales</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Descripción
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Vencimiento
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                    Fecha Inicio
                  </th>
                </tr>
              </thead>
              <tbody>
                {obligaciones.map((o, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text)]">{o.descripcion}</td>
                    <td className="px-3 py-2 text-[var(--text)]/70 text-xs">{o.vencimiento}</td>
                    <td className="px-3 py-2 text-[var(--text)]/60 tabular-nums whitespace-nowrap">
                      {o.fecha_inicio}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <SectionTitle>Constancia de Situación Fiscal (CSF)</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TextField
            label="Fecha de Emisión"
            value={csfFechaEmision}
            onChange={setCsfFechaEmision}
            placeholder="YYYY-MM-DD"
          />
          <div className="sm:col-span-2">
            <TextField
              label="Ruta del PDF (storage o URL)"
              value={csfUrl}
              onChange={setCsfUrl}
              placeholder="legal/empresa/csf/archivo.pdf"
            />
          </div>
          {empresa.csf_url && (
            <div className="flex items-end pb-0.5">
              <button
                type="button"
                onClick={async () => {
                  const url = empresa.csf_url!;
                  if (url.startsWith('http')) {
                    window.open(url, '_blank');
                    return;
                  }
                  const bucket = url.split('/')[0];
                  const path = url.split('/').slice(1).join('/');
                  const { data, error } = await supabase.storage
                    .from(bucket)
                    .createSignedUrl(path, 3600);
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
          <p className="text-xs text-[var(--text-subtle)]">
            Emitida el {formatDate(empresa.csf_fecha_emision)}
          </p>
        )}
      </div>

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

'use client';

 

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Building2, RefreshCw } from 'lucide-react';
import { EmpresaDetail, type Empresa } from '../_components/empresa-detail';
import { EmpresaBranding } from '../_components/empresa-branding';

type EmpresaWithBranding = Empresa & {
  color_primario: string | null;
  color_primario_dark: string | null;
  color_secundario: string | null;
  color_texto_titulo: string | null;
  color_fondo_brand: string | null;
  color_inverso: string | null;
  logo_master_url: string | null;
  logo_horizontal_light_url: string | null;
  logo_horizontal_dark_url: string | null;
  logo_vertical_url: string | null;
  isotipo_url: string | null;
  favicon_url: string | null;
  header_email_url: string | null;
  footer_doc_url: string | null;
  watermark_url: string | null;
  branding_updated_at: string | null;
};

const SELECT_COLS = [
  'id, nombre, slug, activa, logo_url, header_url, rfc, razon_social, regimen_capital,',
  'nombre_comercial, fecha_inicio_operaciones, estatus_sat, id_cif, regimen_fiscal,',
  'domicilio_cp, domicilio_calle, domicilio_numero_ext, domicilio_numero_int, domicilio_colonia,',
  'domicilio_localidad, domicilio_municipio, domicilio_estado, actividades_economicas,',
  'obligaciones_fiscales, csf_fecha_emision, csf_url,',
  'color_primario, color_primario_dark, color_secundario, color_texto_titulo,',
  'color_fondo_brand, color_inverso, logo_master_url, logo_horizontal_light_url,',
  'logo_horizontal_dark_url, logo_vertical_url, isotipo_url, favicon_url,',
  'header_email_url, footer_doc_url, watermark_url, branding_updated_at',
].join(' ');

type Tab = 'branding' | 'fiscal';

function EmpresaPageInner() {
  const supabase = createSupabaseBrowserClient();
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug;

  const [empresa, setEmpresa] = useState<EmpresaWithBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('branding');

  const fetchEmpresa = useCallback(async () => {
    if (!slug) return;
    const { data, error: err } = await supabase
      .schema('core')
      .from('empresas')
      .select(SELECT_COLS)
      .eq('slug', slug)
      .maybeSingle();
    if (err) {
      setError(err.message);
      return;
    }
    if (!data) {
      setError('Empresa no encontrada');
      return;
    }
    setEmpresa(data as unknown as EmpresaWithBranding);
  }, [supabase, slug]);

  useEffect(() => {
    void (async () => {
      try {
        await fetchEmpresa();
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchEmpresa]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !empresa) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <Building2 className="mb-3 h-10 w-10 text-[var(--text)]/20" />
        <p className="text-sm text-red-400">{error ?? 'Empresa no encontrada'}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/settings/empresas')}
          className="mt-4"
        >
          Volver al listado
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <Link
            href="/settings/empresas"
            className="mt-1 shrink-0 inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-[var(--text)]/60 hover:bg-[var(--panel)] hover:text-[var(--text)] transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] truncate">
              {empresa.nombre}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {empresa.razon_social ?? empresa.nombre_comercial ?? '—'}
              {empresa.rfc && (
                <>
                  {' · '}
                  <span className="font-mono">{empresa.rfc}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            fetchEmpresa().finally(() => setLoading(false));
          }}
          className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)] shrink-0"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {[
          { key: 'branding' as const, label: 'Branding' },
          { key: 'fiscal' as const, label: 'Datos fiscales y dirección' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px cursor-pointer ${
              tab === t.key
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'branding' && <EmpresaBranding branding={empresa} slug={empresa.slug} />}
      {tab === 'fiscal' && <EmpresaDetail empresa={empresa} onSaved={fetchEmpresa} />}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess adminOnly>
      <EmpresaPageInner />
    </RequireAccess>
  );
}

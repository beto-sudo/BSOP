'use client';

import { Download, FileImage, Palette, RefreshCw } from 'lucide-react';

type Branding = {
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

type LogoVariant = {
  key: keyof Branding;
  label: string;
  description: string;
  preview: 'light' | 'dark' | 'square' | 'wide';
};

const LOGO_VARIANTS: LogoVariant[] = [
  {
    key: 'logo_horizontal_light_url',
    label: 'Horizontal · fondo claro',
    description: 'Para emails, documentos, firmas',
    preview: 'light',
  },
  {
    key: 'logo_horizontal_dark_url',
    label: 'Horizontal · fondo oscuro',
    description: 'Sidebar BSOP, headers oscuros',
    preview: 'dark',
  },
  {
    key: 'logo_vertical_url',
    label: 'Vertical',
    description: 'Tarjetas, portadas de reportes',
    preview: 'light',
  },
  {
    key: 'isotipo_url',
    label: 'Isotipo',
    description: 'Solo el símbolo, sin wordmark',
    preview: 'light',
  },
  {
    key: 'favicon_url',
    label: 'Favicon / App icon',
    description: '512×512, fondo color primario',
    preview: 'square',
  },
  {
    key: 'header_email_url',
    label: 'Header email',
    description: 'Banner top de correos Resend',
    preview: 'wide',
  },
  {
    key: 'footer_doc_url',
    label: 'Footer documento',
    description: 'Pie con datos fiscales',
    preview: 'wide',
  },
  {
    key: 'watermark_url',
    label: 'Marca de agua',
    description: 'Para PDFs confidenciales',
    preview: 'light',
  },
];

function ColorSwatch({ hex, label }: { hex: string | null; label: string }) {
  if (!hex) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="h-16 w-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)]" />
        <div className="text-xs text-[var(--text)]/50">{label}</div>
        <div className="text-[10px] text-[var(--text)]/30 font-mono">—</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-16 w-full rounded-xl border border-[var(--border)] shadow-sm"
        style={{ backgroundColor: hex }}
      />
      <div className="text-xs text-[var(--text)]/70">{label}</div>
      <div className="text-[10px] text-[var(--text)]/50 font-mono uppercase">{hex}</div>
    </div>
  );
}

function LogoCard({ variant, url }: { variant: LogoVariant; url: string | null }) {
  const bg =
    variant.preview === 'dark'
      ? 'bg-[#1a1a1a]'
      : variant.preview === 'square'
        ? 'bg-[var(--panel)]'
        : 'bg-[#FAFAFA]';

  const sizing =
    variant.preview === 'wide'
      ? 'h-32 w-full'
      : variant.preview === 'square'
        ? 'h-40 w-40 mx-auto'
        : 'h-32 w-full';

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className={`${bg} flex items-center justify-center p-4`}>
        {url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={url} alt={variant.label} className={`${sizing} object-contain`} />
        ) : (
          <div
            className={`${sizing} flex items-center justify-center text-xs text-[var(--text)]/40`}
          >
            <FileImage className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="border-t border-[var(--border)] px-4 py-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-[var(--text)] truncate">{variant.label}</span>
          {url && (
            <a
              href={url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text)]/50 hover:text-[var(--accent)] transition shrink-0"
              title="Abrir/descargar"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
        <p className="text-xs text-[var(--text)]/50">{variant.description}</p>
      </div>
    </div>
  );
}

export function EmpresaBranding({ branding, slug }: { branding: Branding; slug: string }) {
  const hasAnyBranding =
    branding.color_primario ||
    branding.logo_master_url ||
    LOGO_VARIANTS.some((v) => branding[v.key]);

  if (!hasAnyBranding) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel)] p-8 text-center">
        <Palette className="mx-auto mb-3 h-10 w-10 text-[var(--text)]/20" />
        <p className="text-sm text-[var(--text)]/60">
          Esta empresa todavía no tiene branding configurado.
        </p>
        <p className="mt-2 text-xs text-[var(--text)]/40">
          Corre el script:{' '}
          <code className="font-mono bg-[var(--card)] px-1.5 py-0.5 rounded text-[var(--text)]/70">
            npx tsx scripts/branding/generate.ts --empresa {slug} --svg path/to/master.svg
            --primario &apos;#XXXXXX&apos; --upload
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Paleta */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-[var(--text)]/50" />
          <h4 className="text-sm font-semibold text-[var(--text)]/80 uppercase tracking-wider">
            Paleta de colores
          </h4>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <ColorSwatch hex={branding.color_primario} label="Primario" />
          <ColorSwatch hex={branding.color_primario_dark} label="Primario dark" />
          <ColorSwatch hex={branding.color_secundario} label="Secundario" />
          <ColorSwatch hex={branding.color_texto_titulo} label="Texto título" />
          <ColorSwatch hex={branding.color_fondo_brand} label="Fondo brand" />
          <ColorSwatch hex={branding.color_inverso} label="Inverso" />
        </div>
      </div>

      {/* Logos */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileImage className="h-4 w-4 text-[var(--text)]/50" />
          <h4 className="text-sm font-semibold text-[var(--text)]/80 uppercase tracking-wider">
            Variantes de logo
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LOGO_VARIANTS.map((v) => (
            <LogoCard key={v.key} variant={v} url={branding[v.key] as string | null} />
          ))}
        </div>
      </div>

      {/* Master + metadata */}
      <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-[var(--border)] text-xs text-[var(--text)]/60">
        {branding.logo_master_url && (
          <a
            href={branding.logo_master_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 hover:bg-[var(--card)] transition"
          >
            <Download className="h-3.5 w-3.5" />
            SVG master
          </a>
        )}
        {branding.branding_updated_at && (
          <span className="flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3" />
            Actualizado: {new Date(branding.branding_updated_at).toLocaleString('es-MX')}
          </span>
        )}
      </div>
    </div>
  );
}

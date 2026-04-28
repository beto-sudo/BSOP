'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, ChevronRight, FileText, Palette, Plus, RefreshCw } from 'lucide-react';

import { NuevaEmpresaDrawer } from './_components/nueva-empresa-drawer';

type EmpresaRow = {
  id: string;
  nombre: string;
  slug: string;
  activa: boolean;
  rfc: string | null;
  estatus_sat: string | null;
  regimen_fiscal: string | null;
  domicilio_municipio: string | null;
  domicilio_estado: string | null;
  csf_url: string | null;
  tipo_contribuyente: 'persona_moral' | 'persona_fisica' | null;
  color_primario: string | null;
  logo_horizontal_light_url: string | null;
  branding_updated_at: string | null;
};

type GrupoKey = 'persona_moral' | 'persona_fisica' | 'otros';

const GRUPO_LABELS: Record<GrupoKey, string> = {
  persona_moral: 'Personas Morales',
  persona_fisica: 'Personas Físicas',
  otros: 'Otros',
};

const GRUPO_ORDER: ReadonlyArray<GrupoKey> = ['persona_moral', 'persona_fisica', 'otros'];

function EstatusBadge({ estatus }: { estatus: string | null }) {
  if (!estatus) return <span className="text-[var(--text)]/30 text-xs">—</span>;
  const isActivo = estatus.toUpperCase() === 'ACTIVO';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isActivo ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
      }`}
    >
      {estatus}
    </span>
  );
}

const thClass =
  'px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50';

function EmpresaTableRow({ e }: { e: EmpresaRow }) {
  const domicilio = [e.domicilio_municipio, e.domicilio_estado].filter(Boolean).join(', ');
  return (
    <tr className="border-b border-[var(--border)] last:border-0 group hover:bg-[var(--panel)]/50 transition cursor-pointer">
      <td colSpan={9} className="p-0">
        <Link href={`/settings/empresas/${e.slug}`} className="flex items-center w-full">
          <span className="flex items-center justify-center w-16 px-3 py-3 shrink-0">
            {e.logo_horizontal_light_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={e.logo_horizontal_light_url}
                alt={e.nombre}
                className="h-8 w-8 object-contain"
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-[var(--panel)] flex items-center justify-center">
                <Building2 className="h-4 w-4 text-[var(--text)]/30" />
              </div>
            )}
          </span>
          <span className="flex-1 min-w-0 px-4 py-3.5">
            <span className="font-medium text-[var(--text)] truncate block">{e.nombre}</span>
          </span>
          <span className="hidden sm:block w-36 px-4 py-3.5 text-[var(--text)]/70 font-mono text-xs shrink-0">
            {e.rfc || '—'}
          </span>
          <span className="hidden md:flex w-28 px-4 py-3.5 shrink-0 items-center">
            <EstatusBadge estatus={e.estatus_sat} />
          </span>
          <span className="hidden lg:block w-48 px-4 py-3.5 text-[var(--text)]/60 text-xs truncate shrink-0">
            {e.regimen_fiscal || '—'}
          </span>
          <span className="hidden lg:block w-40 px-4 py-3.5 text-[var(--text)]/60 text-xs truncate shrink-0">
            {domicilio || '—'}
          </span>
          <span className="hidden sm:flex w-20 px-4 py-3.5 items-center justify-center shrink-0">
            {e.color_primario ? (
              <span className="flex items-center gap-1">
                <span
                  className="h-4 w-4 rounded-full border border-[var(--border)]"
                  style={{ backgroundColor: e.color_primario }}
                  title={e.color_primario}
                />
              </span>
            ) : (
              <Palette className="h-4 w-4 text-[var(--text)]/20" />
            )}
          </span>
          <span className="flex w-12 px-4 py-3.5 items-center justify-center shrink-0">
            {e.csf_url ? (
              <FileText className="h-4 w-4 text-[var(--accent)]" />
            ) : (
              <span className="text-[var(--text)]/20 text-xs">—</span>
            )}
          </span>
          <span className="flex w-10 px-3 py-3.5 items-center justify-center shrink-0 text-[var(--text)]/30 group-hover:text-[var(--text)]/60 transition">
            <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      </td>
    </tr>
  );
}

function EmpresaGroupTable({
  empresas,
  grupoLabel,
}: {
  empresas: EmpresaRow[];
  grupoLabel: string;
}) {
  if (empresas.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text)]/70">
          {grupoLabel}
        </h2>
        <span className="text-xs text-[var(--text)]/40">
          {empresas.length} {empresas.length === 1 ? 'empresa' : 'empresas'}
        </span>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
              <th className={`${thClass} w-16`}>Logo</th>
              <th className={thClass}>Nombre</th>
              <th className={`${thClass} hidden sm:table-cell`}>RFC</th>
              <th className={`${thClass} hidden md:table-cell`}>Estatus SAT</th>
              <th className={`${thClass} hidden lg:table-cell`}>Régimen Fiscal</th>
              <th className={`${thClass} hidden lg:table-cell`}>Domicilio</th>
              <th className={`${thClass} hidden sm:table-cell w-20 text-center`}>Branding</th>
              <th className={`${thClass} w-12 text-center`}>CSF</th>
              <th className={`${thClass} w-10`} />
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <EmpresaTableRow key={e.id} e={e} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmpresasSettingsInner() {
  const supabase = createSupabaseBrowserClient();
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchEmpresas = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('core')
      .from('empresas')
      .select(
        'id, nombre, slug, activa, rfc, estatus_sat, regimen_fiscal, domicilio_municipio, domicilio_estado, csf_url, tipo_contribuyente, color_primario, logo_horizontal_light_url, branding_updated_at'
      )
      .order('nombre');
    if (err) {
      setError(err.message);
      return;
    }
    setEmpresas((data ?? []) as EmpresaRow[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await fetchEmpresas();
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchEmpresas]);

  const grupos = useMemo<Record<GrupoKey, EmpresaRow[]>>(() => {
    const out: Record<GrupoKey, EmpresaRow[]> = {
      persona_moral: [],
      persona_fisica: [],
      otros: [],
    };
    for (const e of empresas) {
      if (e.tipo_contribuyente === 'persona_moral') out.persona_moral.push(e);
      else if (e.tipo_contribuyente === 'persona_fisica') out.persona_fisica.push(e);
      else out.otros.push(e);
    }
    return out;
  }, [empresas]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Empresas</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Selecciona una empresa para ver y editar sus datos fiscales y branding
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setDrawerOpen(true)} className="gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            Nueva empresa
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              fetchEmpresas().finally(() => setLoading(false));
            }}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="space-y-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-4 border-b border-[var(--border)] last:border-0"
              >
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : empresas.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <Building2 className="mb-3 h-10 w-10 text-[var(--text)]/20" />
          <p className="text-sm text-[var(--text-muted)]">No hay empresas registradas.</p>
          <Button size="sm" onClick={() => setDrawerOpen(true)} className="mt-4 gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            Dar de alta la primera
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {GRUPO_ORDER.map((g) => (
            <EmpresaGroupTable key={g} empresas={grupos[g]} grupoLabel={GRUPO_LABELS[g]} />
          ))}
        </div>
      )}

      <NuevaEmpresaDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCreated={() => {
          void fetchEmpresas();
        }}
      />
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

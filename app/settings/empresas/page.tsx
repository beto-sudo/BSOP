'use client';

import { RequireAccess } from '@/components/require-access';
import { usePermissions } from '@/components/providers';
import { DesktopOnlyNotice } from '@/components/responsive';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, ChevronRight, FileText, Plus, RefreshCw } from 'lucide-react';

import { NuevaEmpresaDrawer } from './_components/nueva-empresa-drawer';
import { ModoPresentacionPanel } from './_components/modo-presentacion-panel';

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

// Layout compartido entre header y filas — garantiza alineación de columnas.
// Cambiar widths aquí los aplica a ambos.
const colLogo = 'w-16 shrink-0';
const colNombre = 'flex-1 min-w-0';
const colRfc = 'hidden sm:block w-36 shrink-0';
const colEstatus = 'hidden md:flex w-28 shrink-0 items-center';
const colRegimen = 'hidden lg:block w-48 shrink-0';
const colDomicilio = 'hidden lg:block w-40 shrink-0';
const colCsf = 'flex w-12 shrink-0 items-center justify-center';
const colChevron = 'flex w-10 shrink-0 items-center justify-center';

const headerCellBase =
  'px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50';
const bodyCellBase = 'px-4 py-3.5';

function EmpresaTableRow({ e }: { e: EmpresaRow }) {
  const domicilio = [e.domicilio_municipio, e.domicilio_estado].filter(Boolean).join(', ');
  return (
    <Link
      href={`/settings/empresas/${e.slug}`}
      className="flex items-center border-b border-[var(--border)] last:border-0 group hover:bg-[var(--panel)]/50 transition"
    >
      <div className={`${colLogo} flex items-center justify-center px-3 py-3`}>
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
      </div>
      <div className={`${colNombre} ${bodyCellBase}`}>
        <span className="font-medium text-[var(--text)] truncate block">{e.nombre}</span>
      </div>
      <div className={`${colRfc} ${bodyCellBase} text-[var(--text)]/70 font-mono text-xs`}>
        {e.rfc || '—'}
      </div>
      <div className={`${colEstatus} ${bodyCellBase}`}>
        <EstatusBadge estatus={e.estatus_sat} />
      </div>
      <div className={`${colRegimen} ${bodyCellBase} text-[var(--text)]/60 text-xs truncate`}>
        {e.regimen_fiscal || '—'}
      </div>
      <div className={`${colDomicilio} ${bodyCellBase} text-[var(--text)]/60 text-xs truncate`}>
        {domicilio || '—'}
      </div>
      <div className={`${colCsf} ${bodyCellBase}`}>
        {e.csf_url ? (
          <FileText className="h-4 w-4 text-[var(--accent)]" />
        ) : (
          <span className="text-[var(--text)]/20 text-xs">—</span>
        )}
      </div>
      <div
        className={`${colChevron} px-3 py-3.5 text-[var(--text)]/30 group-hover:text-[var(--text)]/60 transition`}
      >
        <ChevronRight className="h-4 w-4" />
      </div>
    </Link>
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
        <div className="flex items-center border-b border-[var(--border)] bg-[var(--panel)]">
          <div className={`${colLogo} ${headerCellBase}`}>Logo</div>
          <div className={`${colNombre} ${headerCellBase}`}>Nombre</div>
          <div className={`${colRfc} ${headerCellBase}`}>RFC</div>
          <div className={`${colEstatus} ${headerCellBase}`}>Estatus SAT</div>
          <div className={`${colRegimen} ${headerCellBase}`}>Régimen Fiscal</div>
          <div className={`${colDomicilio} ${headerCellBase}`}>Domicilio</div>
          <div className={`${colCsf} ${headerCellBase} justify-center`}>CSF</div>
          <div className={`${colChevron} ${headerCellBase}`} aria-hidden />
        </div>
        <div>
          {empresas.map((e) => (
            <EmpresaTableRow key={e.id} e={e} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmpresasSettingsInner() {
  const supabase = createSupabaseBrowserClient();
  const { permissions } = usePermissions();
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
      if (!e.activa) continue;
      if (e.slug === 'settings') continue;
      // Solo las empresas a las que el usuario tiene acceso (admin ve todas).
      // El acceso a la página lo gobierna el módulo `settings.empresas`; QUÉ
      // empresas ve sale de core.usuarios_empresas (permissions.empresas).
      if (!permissions.isAdmin && !permissions.empresas.has(e.slug)) continue;
      if (e.tipo_contribuyente === 'persona_moral') out.persona_moral.push(e);
      else if (e.tipo_contribuyente === 'persona_fisica') out.persona_fisica.push(e);
      else out.otros.push(e);
    }
    return out;
  }, [empresas, permissions]);

  const totalVisibles =
    grupos.persona_moral.length + grupos.persona_fisica.length + grupos.otros.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Empresas</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Selecciona una empresa para ver y editar sus datos fiscales y branding
            {!loading && empresas.length > 0 ? (
              <span className="text-[var(--text)]/40">
                {' · '}
                {totalVisibles} {totalVisibles === 1 ? 'empresa' : 'empresas'}
              </span>
            ) : null}
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
            aria-label="Refrescar"
            title="Refrescar"
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

      <ModoPresentacionPanel />

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

/**
 * @module Settings — Empresas
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess modulo="settings.empresas">
      <DesktopOnlyNotice module="Empresas" />
      <div className="hidden sm:block">
        <EmpresasSettingsInner />
      </div>
    </RequireAccess>
  );
}

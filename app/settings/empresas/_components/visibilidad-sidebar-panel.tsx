'use client';

import { useState } from 'react';
import { Eye, EyeOff, PanelLeft } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { NAV_ITEMS, NAV_TO_EMPRESA } from '@/components/app-shell/nav-config';

/**
 * Admin-only panel to hide/show top-level sidebar items globally.
 *
 * Backed by `core.sidebar_oculto` (denylist; presence = hidden). Hiding is
 * cosmetic — it removes the item from the sidebar for EVERYONE (admin included)
 * but does NOT block route access (RBAC still governs that). Used e.g. to hide
 * SANREN / Personas Físicas while presenting the system to employees.
 *
 * `settings` is intentionally NOT toggleable: hiding it would remove the only
 * entry point back to this panel.
 */

type ToggleItem = { slug: string; label: string };

const TOGGLEABLE_ITEMS: ToggleItem[] = NAV_ITEMS.flatMap((item) => {
  const slug = NAV_TO_EMPRESA[item.href];
  if (!slug || slug === 'settings') return [];
  return [{ slug, label: item.labelKey }];
});

export function VisibilidadSidebarPanel() {
  const supabase = createSupabaseBrowserClient();
  const toast = useToast();
  const { permissions, sidebarHidden, refreshSidebarHidden } = usePermissions();
  const [busy, setBusy] = useState<string | null>(null);

  // Toggle is admin-only even though the page itself is RBAC-gated by module.
  if (!permissions.isAdmin) return null;

  const toggle = async (slug: string, label: string) => {
    const currentlyHidden = sidebarHidden.has(slug);
    setBusy(slug);
    try {
      if (currentlyHidden) {
        const { error } = await supabase
          .schema('core')
          .from('sidebar_oculto')
          .delete()
          .eq('nav_slug', slug);
        if (error) throw error;
        toast.add({ title: `"${label}" visible en el menú`, type: 'success' });
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase
          .schema('core')
          .from('sidebar_oculto')
          .insert({ nav_slug: slug, oculto_por: user?.id ?? null });
        if (error) throw error;
        toast.add({ title: `"${label}" oculto del menú`, type: 'success' });
      }
      refreshSidebarHidden();
    } catch (err) {
      toast.add({
        title: 'No se pudo cambiar la visibilidad',
        description: getSupabaseErrorMessage(err, 'Error al actualizar.'),
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
          <PanelLeft className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text)]">Visibilidad del menú lateral</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Oculta items del sidebar para <strong>todos</strong> (incluido tú). Es solo visual — no
            bloquea el acceso a la ruta. Útil para presentar el sistema sin mostrar módulos
            personales.
          </p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-[var(--border)]">
        {TOGGLEABLE_ITEMS.map(({ slug, label }) => {
          const hidden = sidebarHidden.has(slug);
          const isBusy = busy === slug;
          return (
            <li key={slug} className="flex items-center justify-between gap-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {hidden ? (
                  <EyeOff className="h-4 w-4 shrink-0 text-[var(--text)]/35" />
                ) : (
                  <Eye className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                )}
                <span
                  className={`truncate text-sm ${hidden ? 'text-[var(--text)]/45' : 'text-[var(--text)]'}`}
                >
                  {label}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--text)]/35">
                  {hidden ? 'Oculto' : 'Visible'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!hidden}
                aria-label={`${hidden ? 'Mostrar' : 'Ocultar'} ${label} en el menú`}
                disabled={isBusy}
                onClick={() => void toggle(slug, label)}
                className={[
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-50',
                  hidden ? 'bg-[var(--border)]' : 'bg-[var(--accent)]',
                ].join(' ')}
              >
                <span
                  className={[
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                    hidden ? 'translate-x-0.5' : 'translate-x-[1.375rem]',
                  ].join(' ')}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

'use client';

import { useState } from 'react';
import { Presentation } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

/**
 * Admin-only "Modo presentación" switch.
 *
 * Day-to-day empresa focus is now automatic — the sidebar shows only the empresa
 * you're in and the switcher jumps between the rest. This switch is the one case
 * that focus mode doesn't cover: hiding the PERSONAL modules (SANREN + Personas
 * Físicas) for EVERYONE while presenting BSOP to employees.
 *
 * Backed by the same `core.sidebar_oculto` denylist (presence = hidden). Hiding
 * is cosmetic — it never blocks route access (RBAC still governs that). On =
 * both personal slugs hidden; off = both shown.
 */

const PRESENTATION_SLUGS = ['sanren', 'personas_fisicas'] as const;

export function ModoPresentacionPanel() {
  const supabase = createSupabaseBrowserClient();
  const toast = useToast();
  const { permissions, sidebarHidden, refreshSidebarHidden } = usePermissions();
  const [busy, setBusy] = useState(false);

  // Admin-only even though the page itself is RBAC-gated by module.
  if (!permissions.isAdmin) return null;

  const isOn = PRESENTATION_SLUGS.every((slug) => sidebarHidden.has(slug));

  const toggle = async () => {
    setBusy(true);
    try {
      if (isOn) {
        const { error } = await supabase
          .schema('core')
          .from('sidebar_oculto')
          .delete()
          .in('nav_slug', PRESENTATION_SLUGS as unknown as string[]);
        if (error) throw error;
        toast.add({ title: 'Modo presentación desactivado', type: 'success' });
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        // Clear any partial state first so the insert never hits a duplicate.
        await supabase
          .schema('core')
          .from('sidebar_oculto')
          .delete()
          .in('nav_slug', PRESENTATION_SLUGS as unknown as string[]);
        const { error } = await supabase
          .schema('core')
          .from('sidebar_oculto')
          .insert(
            PRESENTATION_SLUGS.map((nav_slug) => ({ nav_slug, oculto_por: user?.id ?? null }))
          );
        if (error) throw error;
        toast.add({ title: 'Modo presentación activado', type: 'success' });
      }
      refreshSidebarHidden();
    } catch (err) {
      toast.add({
        title: 'No se pudo cambiar el modo presentación',
        description: getSupabaseErrorMessage(err, 'Error al actualizar.'),
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <Presentation className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text)]">Modo presentación</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Oculta del menú los módulos personales (<strong>SANREN</strong> y{' '}
              <strong>Personas Físicas</strong>) para <strong>todos</strong>, útil al presentar BSOP
              a empleados. Es solo visual — no bloquea el acceso a la ruta. El enfoque por empresa
              del día a día ya es automático.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-label={isOn ? 'Desactivar modo presentación' : 'Activar modo presentación'}
          disabled={busy}
          onClick={() => void toggle()}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-50',
            isOn ? 'bg-[var(--accent)]' : 'bg-[var(--border)]',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
              isOn ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
            ].join(' ')}
          />
        </button>
      </div>
    </section>
  );
}

'use client';

/**
 * /inicio — Dashboard personal del usuario.
 *
 * Arranque del panel por usuario: tareas arriba + próximas fechas importantes
 * (cumpleaños + festivos) al lado. Los widgets irán creciendo:
 * calendario semanal, mi vehículo, KPIs por rol, trámites, etc.
 *
 * Cada widget es independiente: carga su propio dato, falla solo, no tumba al resto.
 */

import { useEffect, useState } from 'react';

import { ContentShell } from '@/components/ui/content-shell';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { MisTareasWidget } from '@/components/inicio/mis-tareas-widget';
import { FechasImportantesWidget } from '@/components/inicio/fechas-importantes-widget';
import { useEffectiveUser } from '@/components/providers';
import { useLocale } from '@/lib/i18n';
import { getGreeting, formatLongDate } from '@/lib/datetime/greeting';

/**
 * @module Inicio (dashboard)
 * @responsive responsive
 */
export default function InicioPage() {
  const { t, locale } = useLocale();
  const { data: effective } = useEffectiveUser();
  const [callerName, setCallerName] = useState<string>('');

  useEffect(() => {
    // Fallback to auth metadata only when there's no effective user yet
    // (e.g. /api/me hasn't returned). Once effective is available, that wins.
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      const meta = data?.user?.user_metadata as
        | { first_name?: string; full_name?: string }
        | undefined;
      if (meta?.first_name) {
        setCallerName(meta.first_name);
      } else if (meta?.full_name) {
        setCallerName(meta.full_name.split(' ')[0]);
      } else if (data?.user?.email) {
        setCallerName(data.user.email.split('@')[0]);
      }
    });
  }, []);

  const userName = effective?.email ? effective.email.split('@')[0] : callerName;

  return (
    <ContentShell>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-[var(--text-subtle)]">
          {formatLongDate(new Date(), locale)}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
          {getGreeting(new Date(), t)}
          {userName ? `, ${userName}` : ''}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Este es tu panel personal. Aquí vas a encontrar tus pendientes y las fechas que te
          importan.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tareas toman 2/3 del ancho en desktop */}
        <div className="lg:col-span-2">
          <MisTareasWidget />
        </div>
        <div>
          <FechasImportantesWidget />
        </div>
      </div>
    </ContentShell>
  );
}

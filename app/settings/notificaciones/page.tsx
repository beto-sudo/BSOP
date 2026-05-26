import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DesktopOnlyNotice } from '@/components/responsive';
import { NotificacionesClient } from './notificaciones-client';
import type { NotificationDefinition } from '@/lib/notifications';

/**
 * @module Settings — Notificaciones
 * @responsive desktop-only
 *
 * Iniciativa notificaciones-catalogo · Sprint 3. Lista admin-only de los
 * emails configurados en `core.notification_definitions` con drill-down a
 * detalle (config + últimos 20 logs). Sprint 4 agrega edición + test send.
 */
export default async function NotificacionesPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentEmail = user?.email?.toLowerCase() ?? '';

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-xl font-semibold dark:text-white text-[var(--text)]">
          Error de configuración
        </h2>
        <p className="mt-2 text-sm dark:text-white/55 text-[var(--text-muted)]">
          SUPABASE_SERVICE_ROLE_KEY no está configurada.
        </p>
      </div>
    );
  }

  let isAdmin = false;
  if (currentEmail) {
    const { data } = await admin
      .schema('core')
      .from('usuarios')
      .select('rol')
      .eq('email', currentEmail)
      .maybeSingle();
    isAdmin = (data as { rol?: string } | null)?.rol === 'admin';
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl">🔒</div>
        <h2 className="mt-4 text-xl font-semibold dark:text-white text-[var(--text)]">
          Acceso restringido
        </h2>
        <p className="mt-2 text-sm dark:text-white/55 text-[var(--text-muted)]">
          Solo los administradores pueden ver el catálogo de notificaciones.
        </p>
      </div>
    );
  }

  const { data: defsRaw, error: defsErr } = await admin
    .schema('core')
    .from('notification_definitions')
    .select('*')
    .order('slug', { ascending: true });

  if (defsErr) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-500">Error cargando definitions: {defsErr.message}</p>
      </div>
    );
  }

  const defs = (defsRaw ?? []) as unknown as NotificationDefinition[];

  // Pre-cargar el conteo de envíos por definition para mostrar en la tabla
  // sin un round-trip por fila. Pequeña query agregada.
  const { data: logCountsRaw } = await admin
    .schema('core')
    .from('notification_log')
    .select('definition_id, status')
    .order('sent_at', { ascending: false })
    .limit(2000);

  type LogStats = { total: number; sent: number; failed: number; skipped: number; lastAt?: string };
  const logCounts = new Map<string, LogStats>();
  const { data: lastSentRaw } = await admin
    .schema('core')
    .from('notification_log')
    .select('definition_id, sent_at')
    .order('sent_at', { ascending: false })
    .limit(500);
  for (const row of (lastSentRaw ?? []) as Array<{ definition_id: string; sent_at: string }>) {
    if (!row.definition_id) continue;
    const existing = logCounts.get(row.definition_id);
    if (!existing)
      logCounts.set(row.definition_id, {
        total: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        lastAt: row.sent_at,
      });
  }
  for (const row of (logCountsRaw ?? []) as Array<{ definition_id: string; status: string }>) {
    if (!row.definition_id) continue;
    const stats = logCounts.get(row.definition_id) ?? { total: 0, sent: 0, failed: 0, skipped: 0 };
    stats.total++;
    if (row.status === 'sent') stats.sent++;
    else if (row.status === 'failed') stats.failed++;
    else if (row.status === 'skipped') stats.skipped++;
    logCounts.set(row.definition_id, stats);
  }

  // Empresas catálogo para mostrar nombre amigable en filtro/detalle.
  const { data: empresasRaw } = await admin
    .schema('core')
    .from('empresas')
    .select('id, slug, nombre')
    .order('nombre');
  const empresas = (empresasRaw ?? []) as Array<{ id: string; slug: string; nombre: string }>;

  return (
    <>
      <DesktopOnlyNotice module="Notificaciones" />
      <NotificacionesClient
        definitions={defs}
        logStats={Object.fromEntries(logCounts)}
        empresas={empresas}
      />
    </>
  );
}

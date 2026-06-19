import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DesktopOnlyNotice } from '@/components/responsive';
import { IaClient, type IaStats, type OverrideRow } from './ia-client';

/**
 * @module Settings — IA
 * @responsive desktop-only
 *
 * Iniciativa registro-ia · Sprint 3. Admin-only. Inventario de los usos de IA
 * (del registry en código), modelo efectivo por uso (override de
 * `core.ai_config` o default), editor del override (cambiar modelo sin
 * redeploy) y costo/uso agregado desde `core.ai_invocaciones`.
 */

const MUESTRA_LIMITE = 20000;

function restringido(titulo: string, msg: string) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-4xl">🔒</div>
      <h2 className="mt-4 text-xl font-semibold text-[var(--text)] dark:text-white">{titulo}</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)] dark:text-white/55">{msg}</p>
    </div>
  );
}

export default async function IaPage() {
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
    return restringido('Error de configuración', 'SUPABASE_SERVICE_ROLE_KEY no está configurada.');
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
    return restringido(
      'Acceso restringido',
      'Solo los administradores pueden ver la configuración de IA.'
    );
  }

  // core.ai_config / core.ai_invocaciones no están en los tipos generados con
  // strictness suficiente para estos selects → cast acotado. Fail-soft: si algo
  // falla, la página igual renderiza (overrides vacíos / stats en cero).
  const coreUntyped = admin.schema('core') as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts: { ascending: boolean }
        ) => { limit: (n: number) => Promise<{ data: unknown[] | null }> };
      } & Promise<{ data: unknown[] | null }>;
    };
  };

  const { data: overridesRaw } = await coreUntyped
    .from('ai_config')
    .select('uso_id, modelo, nota, actualizado_en');
  const overrides: Record<string, OverrideRow> = {};
  for (const r of (overridesRaw ?? []) as OverrideRow[]) {
    if (r?.uso_id) overrides[r.uso_id] = r;
  }

  const { data: invRaw } = await coreUntyped
    .from('ai_invocaciones')
    .select('uso_id, empresa, costo_estimado_usd, exito')
    .order('created_at', { ascending: false })
    .limit(MUESTRA_LIMITE);

  const inv = (invRaw ?? []) as Array<{
    uso_id: string;
    empresa: string | null;
    costo_estimado_usd: number | string;
    exito: boolean;
  }>;

  const porUso: Record<string, { llamadas: number; costo: number }> = {};
  const porEmpresaMap = new Map<string, { llamadas: number; costo: number }>();
  let totalCosto = 0;
  let errores = 0;
  for (const row of inv) {
    const costo =
      typeof row.costo_estimado_usd === 'string'
        ? Number(row.costo_estimado_usd)
        : row.costo_estimado_usd;
    totalCosto += costo || 0;
    if (!row.exito) errores++;
    const u = (porUso[row.uso_id] ??= { llamadas: 0, costo: 0 });
    u.llamadas++;
    u.costo += costo || 0;
    const emp = row.empresa ?? 'cross';
    const e = porEmpresaMap.get(emp) ?? { llamadas: 0, costo: 0 };
    e.llamadas++;
    e.costo += costo || 0;
    porEmpresaMap.set(emp, e);
  }

  const stats: IaStats = {
    totalCosto,
    totalLlamadas: inv.length,
    errores,
    porUso,
    porEmpresa: [...porEmpresaMap.entries()]
      .map(([empresa, v]) => ({ empresa, ...v }))
      .sort((a, b) => b.costo - a.costo),
    muestreado: inv.length >= MUESTRA_LIMITE,
  };

  return (
    <>
      <DesktopOnlyNotice module="IA" />
      <IaClient overrides={overrides} stats={stats} />
    </>
  );
}

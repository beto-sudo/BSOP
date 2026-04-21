'use client';

/**
 * MisTareasWidget — bloque del dashboard `/inicio` con las tareas del usuario
 * agrupadas por urgencia (vencidas / hoy / esta semana / después).
 *
 * Estrategia:
 *  - Resuelve `core.usuarios.id` a partir del email del auth user.
 *  - Resuelve las empresas del usuario (`core.usuarios_empresas`) → empresa_ids.
 *  - Resuelve los `erp.empleados.id` del usuario en esas empresas (1 por empresa).
 *  - Query a `erp.tasks` donde `asignado_a IN (empleado_ids)` y `estado != 'completada'`.
 *
 * Agrupa por fecha_vence (o fecha_compromiso si fecha_vence es null).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Calendar, CheckCircle2, ChevronRight, Clock, ListTodo } from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { Surface } from '@/components/ui/surface';
import { Skeleton } from '@/components/ui/skeleton';

type TaskRow = {
  id: string;
  empresa_id: string;
  titulo: string;
  estado: string;
  fecha_vence: string | null;
  fecha_compromiso: string | null;
  prioridad: string | null;
};

type Bucket = 'vencidas' | 'hoy' | 'semana' | 'despues' | 'sin_fecha';

const BUCKET_CONFIG: Record<Bucket, { label: string; tone: string; icon: typeof AlertCircle }> = {
  vencidas: {
    label: 'Vencidas',
    tone: 'text-red-400 bg-red-500/10 border-red-500/20',
    icon: AlertCircle,
  },
  hoy: { label: 'Hoy', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20', icon: Clock },
  semana: {
    label: 'Esta semana',
    tone: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
    icon: Calendar,
  },
  despues: {
    label: 'Después',
    tone: 'text-white/60 bg-white/5 border-white/10',
    icon: ListTodo,
  },
  sin_fecha: {
    label: 'Sin fecha',
    tone: 'text-white/50 bg-white/5 border-white/10',
    icon: ListTodo,
  },
};

function bucketFor(task: TaskRow, todayIso: string, endOfWeekIso: string): Bucket {
  const due = task.fecha_vence ?? task.fecha_compromiso;
  if (!due) return 'sin_fecha';
  if (due < todayIso) return 'vencidas';
  if (due === todayIso) return 'hoy';
  if (due <= endOfWeekIso) return 'semana';
  return 'despues';
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRelative(iso: string | null, todayIso: string): string {
  if (!iso) return 'Sin fecha';
  if (iso === todayIso) return 'Hoy';
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(todayIso + 'T00:00:00');
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (diffDays > 1 && diffDays <= 7) return d.toLocaleDateString('es-MX', { weekday: 'long' });
  if (diffDays < 0) return `Hace ${Math.abs(diffDays)} días`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export function MisTareasWidget() {
  const supabase = useMemo(() => createSupabaseERPClient(), []);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.email) {
          if (!cancelled) {
            setTasks([]);
            setLoading(false);
          }
          return;
        }

        // core.usuarios por email
        const { data: coreUser } = await supabase
          .schema('core')
          .from('usuarios')
          .select('id')
          .eq('email', user.email.toLowerCase())
          .maybeSingle();

        if (!coreUser) {
          if (!cancelled) {
            setTasks([]);
            setLoading(false);
          }
          return;
        }

        // empresas del usuario
        const { data: ue } = await supabase
          .schema('core')
          .from('usuarios_empresas')
          .select('empresa_id')
          .eq('usuario_id', coreUser.id)
          .eq('activo', true);

        const empresaIds = (ue ?? []).map((r: { empresa_id: string }) => r.empresa_id);
        if (empresaIds.length === 0) {
          if (!cancelled) {
            setTasks([]);
            setLoading(false);
          }
          return;
        }

        // empleados del usuario en esas empresas (match por email empresa o personal)
        const emailLower = user.email.toLowerCase();
        const { data: empleados } = await supabase
          .schema('erp')
          .from('v_empleados_full')
          .select('empleado_id, empresa_id, email_empresa, email_personal')
          .in('empresa_id', empresaIds)
          .or(`email_empresa.eq.${emailLower},email_personal.eq.${emailLower}`);

        const empleadoIds = (empleados ?? [])
          .map((e: { empleado_id: string | null }) => e.empleado_id)
          .filter((id: string | null): id is string => Boolean(id));

        if (empleadoIds.length === 0) {
          // Usuario no tiene ficha de empleado en ninguna empresa: no tareas personales.
          if (!cancelled) {
            setTasks([]);
            setLoading(false);
          }
          return;
        }

        // tareas asignadas a este usuario, no completadas
        const { data: taskRows, error: taskErr } = await supabase
          .schema('erp')
          .from('tasks')
          .select('id, empresa_id, titulo, estado, fecha_vence, fecha_compromiso, prioridad')
          .in('asignado_a', empleadoIds)
          .neq('estado', 'completada')
          .order('fecha_vence', { ascending: true, nullsFirst: false })
          .limit(50);

        if (taskErr) throw taskErr;
        if (!cancelled) {
          setTasks((taskRows ?? []) as TaskRow[]);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error cargando tareas');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const { grouped, todayIso } = useMemo(() => {
    const today = new Date();
    const endOfWeek = new Date(today);
    const daysUntilSunday = (7 - today.getDay()) % 7 || 7; // lunes=1..domingo=0
    endOfWeek.setDate(today.getDate() + daysUntilSunday);

    const todayIso = toIsoDate(today);
    const endIso = toIsoDate(endOfWeek);

    const grouped: Record<Bucket, TaskRow[]> = {
      vencidas: [],
      hoy: [],
      semana: [],
      despues: [],
      sin_fecha: [],
    };
    for (const t of tasks) {
      grouped[bucketFor(t, todayIso, endIso)].push(t);
    }
    return { grouped, todayIso };
  }, [tasks]);

  const totalPendientes = tasks.length;

  return (
    <Surface className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent)]/10">
            <ListTodo className="h-5 w-5 text-[var(--accent-soft)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Mis tareas</h2>
            <p className="text-xs text-[var(--text)]/55">
              {loading
                ? 'Cargando…'
                : totalPendientes === 0
                  ? 'No tienes tareas pendientes'
                  : `${totalPendientes} pendiente${totalPendientes === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <Link
          href="/inicio/tasks"
          className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-[var(--text)]/60 transition hover:bg-white/5 hover:text-[var(--text)]"
        >
          Ver todas
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400"
        >
          {error}
        </div>
      ) : loading ? (
        <div className="mt-4 space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : totalPendientes === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400/60" />
          <p className="mt-3 text-sm text-[var(--text)]/60">Estás al corriente 👌</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {(['vencidas', 'hoy', 'semana', 'despues', 'sin_fecha'] as Bucket[])
            .filter((b) => grouped[b].length > 0)
            .map((bucket) => {
              const cfg = BUCKET_CONFIG[bucket];
              const Icon = cfg.icon;
              return (
                <section key={bucket}>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.tone}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </span>
                    <span className="text-xs text-[var(--text)]/40">{grouped[bucket].length}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {grouped[bucket].slice(0, 5).map((t) => (
                      <li key={t.id}>
                        <Link
                          href="/inicio/tasks"
                          className="flex items-center justify-between gap-3 rounded-xl border border-transparent bg-white/[0.02] px-3 py-2.5 transition hover:border-[var(--border)] hover:bg-white/[0.04]"
                        >
                          <span className="line-clamp-1 flex-1 text-sm text-[var(--text)]">
                            {t.titulo}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--text)]/45">
                            {formatRelative(t.fecha_vence ?? t.fecha_compromiso, todayIso)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {grouped[bucket].length > 5 && (
                    <p className="mt-1.5 text-right text-xs text-[var(--text)]/40">
                      + {grouped[bucket].length - 5} más
                    </p>
                  )}
                </section>
              );
            })}
        </div>
      )}
    </Surface>
  );
}

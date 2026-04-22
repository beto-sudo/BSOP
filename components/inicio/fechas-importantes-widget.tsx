'use client';

/**
 * FechasImportantesWidget — bloque del dashboard `/inicio`.
 * Próximos 30 días: cumpleaños de compañeros + días festivos.
 *
 * Cumpleaños: `erp.v_empleados_full` filtrado por empresas del usuario.
 * Festivos: constante estática `DIAS_FESTIVOS_MX` (MVP). Mover a DB cuando se
 * quieran festivos por empresa.
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarHeart, Cake, PartyPopper, Flag } from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { Surface } from '@/components/ui/surface';
import { Skeleton } from '@/components/ui/skeleton';
import { festivosEnRango, type DiaFestivo } from '@/lib/inicio/dias-festivos';

type Cumpleanero = {
  empleado_id: string;
  empresa_id: string;
  nombre_completo: string;
  fecha_nacimiento: string; // YYYY-MM-DD
};

type EventoItem =
  | {
      kind: 'cumple';
      fecha: Date;
      diasFaltan: number;
      label: string;
      subLabel: string;
    }
  | {
      kind: 'festivo';
      fecha: Date;
      diasFaltan: number;
      label: string;
      subLabel: string;
      tipo: DiaFestivo['tipo'];
    };

const VENTANA_DIAS = 30;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Calcula el próximo cumpleaños (Date, a las 00:00 local) a partir de la fecha
 * de nacimiento, dado un "hoy". Si el cumpleaños de este año ya pasó, devuelve
 * el del año siguiente.
 */
function proximoCumple(fechaNacIso: string, today: Date): Date {
  const [, m, d] = fechaNacIso.split('-').map((x) => parseInt(x, 10));
  let year = today.getFullYear();
  const candidate = new Date(year, m - 1, d);
  if (startOfDay(candidate) < startOfDay(today)) {
    year += 1;
    return new Date(year, m - 1, d);
  }
  return candidate;
}

function diasDiferencia(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / (1000 * 60 * 60 * 24));
}

function formatDiasFaltan(dias: number): string {
  if (dias === 0) return '¡Hoy!';
  if (dias === 1) return 'Mañana';
  if (dias <= 7) return `En ${dias} días`;
  return `En ${dias} días`;
}

function formatFechaCorta(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', weekday: 'short' });
}

export function FechasImportantesWidget() {
  const supabase = useMemo(() => createSupabaseERPClient(), []);
  const [cumples, setCumples] = useState<Cumpleanero[]>([]);
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
            setCumples([]);
            setLoading(false);
          }
          return;
        }

        const { data: coreUser } = await supabase
          .schema('core')
          .from('usuarios')
          .select('id')
          .eq('email', user.email.toLowerCase())
          .maybeSingle();

        if (!coreUser) {
          if (!cancelled) {
            setCumples([]);
            setLoading(false);
          }
          return;
        }

        const { data: ue } = await supabase
          .schema('core')
          .from('usuarios_empresas')
          .select('empresa_id')
          .eq('usuario_id', coreUser.id)
          .eq('activo', true);

        const empresaIds = (ue ?? []).map((r: { empresa_id: string }) => r.empresa_id);
        if (empresaIds.length === 0) {
          if (!cancelled) {
            setCumples([]);
            setLoading(false);
          }
          return;
        }

        // Empleados activos con fecha de nacimiento en esas empresas.
        const { data: emp, error: empErr } = await supabase
          .schema('erp')
          .from('v_empleados_full')
          .select('empleado_id, empresa_id, nombre_completo, fecha_nacimiento, empleado_activo')
          .in('empresa_id', empresaIds)
          .not('fecha_nacimiento', 'is', null)
          .eq('empleado_activo', true);

        if (empErr) throw empErr;

        if (!cancelled) {
          const rows = (emp ?? []) as Array<{
            empleado_id: string | null;
            empresa_id: string | null;
            nombre_completo: string | null;
            fecha_nacimiento: string | null;
          }>;
          const mapped: Cumpleanero[] = rows
            .filter(
              (
                r
              ): r is {
                empleado_id: string;
                empresa_id: string;
                nombre_completo: string | null;
                fecha_nacimiento: string;
              } => Boolean(r.empleado_id && r.empresa_id && r.fecha_nacimiento)
            )
            .map((r) => ({
              empleado_id: r.empleado_id,
              empresa_id: r.empresa_id,
              nombre_completo: r.nombre_completo ?? '—',
              fecha_nacimiento: r.fecha_nacimiento,
            }));
          setCumples(mapped);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error cargando fechas');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const eventos = useMemo<EventoItem[]>(() => {
    const today = startOfDay(new Date());
    const limite = new Date(today);
    limite.setDate(today.getDate() + VENTANA_DIAS);

    const items: EventoItem[] = [];

    // cumpleaños
    for (const c of cumples) {
      const prox = proximoCumple(c.fecha_nacimiento, today);
      if (prox > limite) continue;
      const dias = diasDiferencia(prox, today);
      items.push({
        kind: 'cumple',
        fecha: prox,
        diasFaltan: dias,
        label: c.nombre_completo,
        subLabel: 'Cumpleaños',
      });
    }

    // festivos
    for (const f of festivosEnRango(today, limite)) {
      const fDate = new Date(f.fecha + 'T00:00:00');
      const dias = diasDiferencia(fDate, today);
      items.push({
        kind: 'festivo',
        fecha: fDate,
        diasFaltan: dias,
        label: f.nombre,
        subLabel: f.descansoObligatorio ? 'Día festivo (descanso obligatorio)' : 'Día festivo',
        tipo: f.tipo,
      });
    }

    items.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    return items;
  }, [cumples]);

  return (
    <Surface className="p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-500/10">
          <CalendarHeart className="h-5 w-5 text-pink-300" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Próximas fechas importantes</h2>
          <p className="text-xs text-[var(--text-muted)]">Cumpleaños y días festivos (30 días)</p>
        </div>
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
      ) : eventos.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-10 text-center">
          <CalendarHeart className="h-8 w-8 text-[var(--text)]/20" />
          <p className="mt-3 text-sm text-[var(--text)]/60">
            No hay fechas relevantes en los próximos {VENTANA_DIAS} días
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {eventos.map((e, idx) => {
            const Icon =
              e.kind === 'cumple'
                ? Cake
                : e.kind === 'festivo' && e.tipo === 'oficial'
                  ? Flag
                  : PartyPopper;
            const iconTone =
              e.kind === 'cumple'
                ? 'text-pink-300 bg-pink-500/10'
                : e.tipo === 'oficial'
                  ? 'text-emerald-300 bg-emerald-500/10'
                  : 'text-amber-300 bg-amber-500/10';
            const esHoy = e.diasFaltan === 0;
            return (
              <li key={`${e.kind}-${idx}-${e.fecha.toISOString()}`}>
                <div
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    esHoy
                      ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5'
                      : 'border-transparent bg-white/[0.02] hover:border-[var(--border)]'
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium text-[var(--text)]">{e.label}</p>
                    <p className="line-clamp-1 text-xs text-[var(--text)]/50">{e.subLabel}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-[var(--text)]/80">
                      {formatDiasFaltan(e.diasFaltan)}
                    </p>
                    <p className="text-[11px] text-[var(--text-subtle)]">
                      {formatFechaCorta(e.fecha)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}

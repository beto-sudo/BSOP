import { Activity, CalendarRange, CircleDollarSign, RefreshCw, Users, XCircle } from 'lucide-react';
import { KpiCard } from './kpi-card';
import type { PlaytomicKpis } from './derivations';
import { formatMoney } from './utils';

export function KpiSection({
  kpis,
  rangeLabel,
  pendingRevenue,
}: {
  kpis: PlaytomicKpis;
  rangeLabel: string;
  pendingRevenue: number;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <KpiCard
        label="Reservas"
        value={String(kpis.totalBookings)}
        hint={rangeLabel}
        icon={<CalendarRange className="h-4 w-4" />}
      />
      <KpiCard
        label="Ingresos"
        value={formatMoney(kpis.revenueTotal)}
        hint="Total del periodo"
        icon={<CircleDollarSign className="h-4 w-4" />}
      />
      <KpiCard
        label="Cancelación"
        value={`${kpis.cancellationRate.toFixed(1)}%`}
        hint="Sobre reservas del periodo"
        icon={<XCircle className="h-4 w-4" />}
      />
      <KpiCard
        label="Jugadores únicos"
        value={String(kpis.uniquePlayers)}
        hint="Owners + participantes"
        icon={<Users className="h-4 w-4" />}
      />
      <KpiCard
        label="Valor promedio"
        value={formatMoney(kpis.avgBookingValue)}
        hint="Ingreso promedio por reserva"
        icon={<Activity className="h-4 w-4" />}
      />
      <KpiCard
        label="Pendiente de cobro"
        value={formatMoney(pendingRevenue)}
        hint="Reservas con pago pendiente"
        icon={<RefreshCw className="h-4 w-4" />}
      />
    </section>
  );
}

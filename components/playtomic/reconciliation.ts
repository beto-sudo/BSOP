import { DATE_FMT, TZ } from './constants';
import type { Booking, ReconciliationDay } from './types';
import { isCanceledBooking } from './utils';

export type ReconciliationResult = {
  rows: ReconciliationDay[];
  totals: ReconciliationDay;
  truncated: boolean;
  totalDays: number;
  summary: {
    revenueBruto: number;
    appRevenue: number;
    managerRevenue: number;
    pendingRevenue: number;
  };
  csvRows: Record<string, string | number>[];
};

export function computeReconciliation(bookings: Booking[]): ReconciliationResult {
  const dayMap = new Map<string, ReconciliationDay>();

  bookings.forEach((booking) => {
    if (!booking.booking_start || isCanceledBooking(booking)) return;

    const bookingDate = new Date(booking.booking_start);
    if (Number.isNaN(bookingDate.getTime())) return;

    const fecha = bookingDate.toLocaleDateString('en-CA', { timeZone: TZ });
    const amount = booking.price_amount ?? 0;
    const paymentStatus = (booking.payment_status ?? 'NOT_APPLICABLE').toUpperCase();
    const origin = (booking.origin ?? '').toUpperCase();

    const existing =
      dayMap.get(fecha) ??
      ({
        fecha,
        label: DATE_FMT.format(new Date(`${fecha}T12:00:00`)),
        totalReservas: 0,
        canceladas: 0,
        revenueBruto: 0,
        paid: 0,
        partialPaid: 0,
        pending: 0,
        notApplicable: 0,
        paidRevenue: 0,
        partialRevenue: 0,
        pendingRevenue: 0,
        notApplicableRevenue: 0,
        appReservas: 0,
        appRevenue: 0,
        managerReservas: 0,
        managerRevenue: 0,
      } satisfies ReconciliationDay);

    existing.totalReservas += 1;
    existing.revenueBruto += amount;

    if (paymentStatus === 'PAID') {
      existing.paid += 1;
      existing.paidRevenue += amount;
    } else if (paymentStatus === 'PARTIAL_PAID') {
      existing.partialPaid += 1;
      existing.partialRevenue += amount;
    } else if (paymentStatus === 'PENDING') {
      existing.pending += 1;
      existing.pendingRevenue += amount;
    } else {
      existing.notApplicable += 1;
      existing.notApplicableRevenue += amount;
    }

    if (origin === 'APP_IOS' || origin === 'APP_ANDROID') {
      existing.appReservas += 1;
      existing.appRevenue += amount;
    } else if (origin === 'MANAGER' || origin === 'PLAYTOMIC_MANAGER') {
      existing.managerReservas += 1;
      existing.managerRevenue += amount;
    }

    dayMap.set(fecha, existing);
  });

  const allDays = Array.from(dayMap.values());
  const sortedDays = [...allDays].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const rows = sortedDays.slice(0, 60);
  const truncated = allDays.length > 60;

  const totals = allDays.reduce(
    (acc, day) => ({
      fecha: 'TOTAL',
      label: 'Totales',
      totalReservas: acc.totalReservas + day.totalReservas,
      canceladas: acc.canceladas + day.canceladas,
      revenueBruto: acc.revenueBruto + day.revenueBruto,
      paid: acc.paid + day.paid,
      partialPaid: acc.partialPaid + day.partialPaid,
      pending: acc.pending + day.pending,
      notApplicable: acc.notApplicable + day.notApplicable,
      paidRevenue: acc.paidRevenue + day.paidRevenue,
      partialRevenue: acc.partialRevenue + day.partialRevenue,
      pendingRevenue: acc.pendingRevenue + day.pendingRevenue,
      notApplicableRevenue: acc.notApplicableRevenue + day.notApplicableRevenue,
      appReservas: acc.appReservas + day.appReservas,
      appRevenue: acc.appRevenue + day.appRevenue,
      managerReservas: acc.managerReservas + day.managerReservas,
      managerRevenue: acc.managerRevenue + day.managerRevenue,
    }),
    {
      fecha: 'TOTAL',
      label: 'Totales',
      totalReservas: 0,
      canceladas: 0,
      revenueBruto: 0,
      paid: 0,
      partialPaid: 0,
      pending: 0,
      notApplicable: 0,
      paidRevenue: 0,
      partialRevenue: 0,
      pendingRevenue: 0,
      notApplicableRevenue: 0,
      appReservas: 0,
      appRevenue: 0,
      managerReservas: 0,
      managerRevenue: 0,
    } satisfies ReconciliationDay
  );

  const csvRows = sortedDays.map((day) => ({
    Fecha: day.fecha,
    Reservas: day.totalReservas,
    'Revenue Bruto': day.revenueBruto,
    Pagado: day.paid,
    'Pagado Revenue': day.paidRevenue,
    Parcial: day.partialPaid,
    'Parcial Revenue': day.partialRevenue,
    Pendiente: day.pending,
    'Pendiente Revenue': day.pendingRevenue,
    'N/A': day.notApplicable,
    'N/A Revenue': day.notApplicableRevenue,
    'Vía App': day.appReservas,
    'Vía App Revenue': day.appRevenue,
    Directo: day.managerReservas,
    'Directo Revenue': day.managerRevenue,
  }));

  return {
    rows,
    totals,
    truncated,
    totalDays: allDays.length,
    summary: {
      revenueBruto: totals.revenueBruto,
      appRevenue: totals.appRevenue,
      managerRevenue: totals.managerRevenue,
      pendingRevenue: totals.pendingRevenue,
    },
    csvRows,
  };
}

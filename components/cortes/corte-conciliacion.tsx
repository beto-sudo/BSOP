'use client';

import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  Info,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';

import type { ConciliacionEfectivo, ConciliacionEstado, ConciliacionTarjeta } from './conciliacion';
import { formatCurrency } from './helpers';

type Props = {
  tarjeta: ConciliacionTarjeta;
  efectivo: ConciliacionEfectivo;
  ingresosStripe: number;
  ingresosTransferencias: number;
};

export function CorteConciliacion({
  tarjeta,
  efectivo,
  ingresosStripe,
  ingresosTransferencias,
}: Props) {
  return (
    <section className="space-y-4 print:space-y-2">
      <HealthBanner tarjeta={tarjeta} efectivo={efectivo} />
      <div>
        <div className="mb-3 flex items-center justify-between print:mb-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground print:text-[9px] print:text-gray-500">
            Conciliación
          </h3>
          <span className="text-[10px] text-muted-foreground/70 print:text-[9px]">
            Ingresos vs evidencia
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:gap-2">
          <CardTarjeta tarjeta={tarjeta} />
          <CardEfectivo efectivo={efectivo} />
          <CardInformativa
            metodo="Stripe"
            monto={ingresosStripe}
            icon={Smartphone}
            descripcion="Conciliación contra liquidación Stripe — próximamente."
          />
          <CardInformativa
            metodo="Transferencia"
            monto={ingresosTransferencias}
            icon={ArrowLeftRight}
            descripcion="Conciliación contra estado de cuenta — próximamente."
          />
        </div>
      </div>
    </section>
  );
}

// ── HealthBanner ──────────────────────────────────────────────────────────────

function HealthBanner({
  tarjeta,
  efectivo,
}: {
  tarjeta: ConciliacionTarjeta;
  efectivo: ConciliacionEfectivo;
}) {
  const estados: ConciliacionEstado[] = [tarjeta.estado, efectivo.estado];
  const criticas = estados.filter((e) => e === 'diferencia' || e === 'sin_voucher').length;
  const pendientes = estados.filter(
    (e) => e === 'pendiente_captura' || e === 'pendiente_cierre'
  ).length;

  if (criticas > 0) {
    const titulo = criticas === 1 ? '1 alerta crítica' : `${criticas} alertas críticas`;
    const sufijo =
      pendientes > 0 ? ` · ${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}` : '';
    return (
      <BannerShell
        tone="destructive"
        Icon={AlertTriangle}
        titulo={`${titulo}${sufijo}`}
        descripcion="Revisar la conciliación para entender las diferencias."
      />
    );
  }

  if (pendientes > 0) {
    const titulo =
      pendientes === 1 ? '1 pendiente de captura' : `${pendientes} pendientes de captura`;
    return (
      <BannerShell
        tone="warning"
        Icon={Info}
        titulo={titulo}
        descripcion="El sistema no puede confirmar el cuadre hasta que se completen."
      />
    );
  }

  return (
    <BannerShell
      tone="success"
      Icon={CheckCircle2}
      titulo="Corte cuadra"
      descripcion="Tarjeta y efectivo conciliados sin discrepancias."
    />
  );
}

type BannerTone = 'destructive' | 'warning' | 'success';

const BANNER_TONES: Record<
  BannerTone,
  { wrapper: string; bubble: string; icon: string; titulo: string; descripcion: string }
> = {
  destructive: {
    wrapper: 'bg-destructive/10 border-destructive/20',
    bubble: 'bg-destructive/15',
    icon: 'text-destructive',
    titulo: 'text-destructive',
    descripcion: 'text-destructive/80',
  },
  warning: {
    wrapper: 'bg-yellow-500/10 border-yellow-500/20',
    bubble: 'bg-yellow-500/15',
    icon: 'text-yellow-600 dark:text-yellow-400',
    titulo: 'text-yellow-700 dark:text-yellow-300',
    descripcion: 'text-yellow-700/80 dark:text-yellow-400/80',
  },
  success: {
    wrapper: 'bg-emerald-500/10 border-emerald-500/20',
    bubble: 'bg-emerald-500/15',
    icon: 'text-emerald-600 dark:text-emerald-400',
    titulo: 'text-emerald-700 dark:text-emerald-300',
    descripcion: 'text-emerald-700/80 dark:text-emerald-400/80',
  },
};

function BannerShell({
  tone,
  Icon,
  titulo,
  descripcion,
}: {
  tone: BannerTone;
  Icon: LucideIcon;
  titulo: string;
  descripcion: string;
}) {
  const t = BANNER_TONES[tone];
  return (
    <div className={`rounded-lg border p-3.5 print:p-1.5 ${t.wrapper}`}>
      <div className="flex items-start gap-3 print:gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full print:hidden ${t.bubble}`}
        >
          <Icon className={`h-4 w-4 ${t.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold print:text-[11px] ${t.titulo}`}>{titulo}</div>
          <div className={`mt-0.5 text-xs print:text-[10px] ${t.descripcion}`}>{descripcion}</div>
        </div>
      </div>
    </div>
  );
}

// ── EstadoBadge ───────────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<ConciliacionEstado, { label: string; className: string }> = {
  cuadra: {
    label: '✓ Cuadra',
    className:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
  },
  cuadra_aprox: {
    label: '~ Cuadra ±',
    className: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20',
  },
  diferencia: {
    label: '✗ Diferencia',
    className: 'bg-destructive/10 text-destructive border border-destructive/20',
  },
  sin_voucher: {
    label: '✗ Sin voucher',
    className: 'bg-destructive/10 text-destructive border border-destructive/20',
  },
  pendiente_captura: {
    label: '• Pendiente captura',
    className: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20',
  },
  pendiente_cierre: {
    label: '○ Pendiente cierre',
    className: 'bg-muted text-muted-foreground border border-border',
  },
  sin_actividad: {
    label: '— Sin actividad',
    className: 'bg-muted text-muted-foreground border border-border',
  },
};

function EstadoBadge({ estado }: { estado: ConciliacionEstado }) {
  const meta = ESTADO_BADGE[estado];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium print:px-1 print:py-0 print:text-[8px] ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

// ── Helpers de formato ────────────────────────────────────────────────────────

function diferenciaColor(estado: ConciliacionEstado) {
  if (estado === 'diferencia' || estado === 'sin_voucher') return 'text-destructive';
  if (estado === 'cuadra_aprox') return 'text-yellow-600 dark:text-yellow-400';
  return 'text-foreground';
}

function formatDiferencia(value: number) {
  if (value === 0) return formatCurrency(0);
  const prefix = value > 0 ? '+' : '−';
  return `${prefix}${formatCurrency(Math.abs(value))}`;
}

// ── CardTarjeta ───────────────────────────────────────────────────────────────

function CardTarjeta({ tarjeta }: { tarjeta: ConciliacionTarjeta }) {
  const pendientes = tarjeta.evidencia_pendiente;
  const capturados = tarjeta.evidencia_count - pendientes;
  const sumaPendienteLabel = pendientes > 0 ? ` +${pendientes} s/cap` : '';
  // Cuando hay >=1 capturado, mostrar la diferencia parcial aunque queden pendientes —
  // así el operador detecta discrepancias temprano sin esperar a capturar todo.
  const difEsParcial = pendientes > 0 && capturados > 0;
  const difLabel = pendientes > 0 && capturados === 0 ? '—' : formatDiferencia(tarjeta.diferencia);

  return (
    <div className="rounded-lg border bg-card p-4 print:p-2" style={{ pageBreakInside: 'avoid' }}>
      <div className="mb-3 flex items-center justify-between print:mb-1">
        <div className="flex items-center gap-2 print:gap-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted print:hidden">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground print:text-[9px]">
            Tarjeta
          </span>
        </div>
        <EstadoBadge estado={tarjeta.estado} />
      </div>

      <dl className="space-y-1 text-sm print:space-y-0 print:text-[10px]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Pedidos</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(tarjeta.ingresos_pedidos)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            Σ Vouchers <span className="text-muted-foreground/70">({tarjeta.evidencia_count})</span>
          </dt>
          <dd
            className={`font-medium tabular-nums ${
              pendientes > 0 ? 'text-yellow-600 dark:text-yellow-400' : ''
            }`}
          >
            {formatCurrency(tarjeta.total_evidencia)}
            {sumaPendienteLabel}
          </dd>
        </div>
        <hr className="my-1 border-muted print:my-0.5" />
        <div className="flex justify-between text-sm font-semibold print:text-[10px]">
          <dt>Diferencia</dt>
          <dd className={`tabular-nums ${diferenciaColor(tarjeta.estado)}`}>
            {difLabel}
            {difEsParcial && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground print:text-[8px]">
                parcial
              </span>
            )}
          </dd>
        </div>
      </dl>

      <CardTarjetaMensaje tarjeta={tarjeta} />
    </div>
  );
}

function CardTarjetaMensaje({ tarjeta }: { tarjeta: ConciliacionTarjeta }) {
  if (tarjeta.estado === 'sin_voucher') {
    return (
      <p className="mt-3 rounded border border-destructive/20 bg-destructive/10 p-2 text-[11px] text-destructive print:mt-1 print:p-1 print:text-[9px] print:text-gray-700">
        ⚠ Hay ingresos por tarjeta sin voucher de respaldo.
      </p>
    );
  }
  if (tarjeta.estado === 'pendiente_captura') {
    const n = tarjeta.evidencia_pendiente;
    return (
      <p className="mt-3 rounded border border-yellow-500/20 bg-yellow-500/10 p-2 text-[11px] text-yellow-700 print:mt-1 print:p-1 print:text-[9px] print:text-gray-700 dark:text-yellow-400">
        • Faltan {n} {n === 1 ? 'monto' : 'montos'} por capturar para confirmar el cuadre.
      </p>
    );
  }
  if (tarjeta.estado === 'diferencia') {
    const verbo = tarjeta.diferencia > 0 ? 'exceden' : 'son menores que';
    return (
      <p className="mt-3 rounded border border-destructive/20 bg-destructive/10 p-2 text-[11px] text-destructive print:mt-1 print:p-1 print:text-[9px] print:text-gray-700">
        ⚠ Vouchers {verbo} ingresos por {formatCurrency(Math.abs(tarjeta.diferencia))}.
      </p>
    );
  }
  return null;
}

// ── CardEfectivo ──────────────────────────────────────────────────────────────

function CardEfectivo({ efectivo }: { efectivo: ConciliacionEfectivo }) {
  const difLabel =
    efectivo.estado === 'pendiente_cierre' || efectivo.diferencia == null
      ? '—'
      : formatDiferencia(efectivo.diferencia);

  return (
    <div className="rounded-lg border bg-card p-4 print:p-2" style={{ pageBreakInside: 'avoid' }}>
      <div className="mb-3 flex items-center justify-between print:mb-1">
        <div className="flex items-center gap-2 print:gap-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted print:hidden">
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground print:text-[9px]">
            Efectivo
          </span>
        </div>
        <EstadoBadge estado={efectivo.estado} />
      </div>

      <dl className="space-y-1 text-sm print:space-y-0 print:text-[10px]">
        <div className="flex justify-between">
          <dt
            className="inline-flex items-center gap-1 text-muted-foreground"
            title="Inicial + Ingresos efectivo − Salidas"
          >
            Esperado <Info className="h-3 w-3 text-muted-foreground/70" />
          </dt>
          <dd className="font-medium tabular-nums">{formatCurrency(efectivo.esperado)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Contado</dt>
          <dd className="font-medium tabular-nums">
            {efectivo.contado == null ? '—' : formatCurrency(efectivo.contado)}
          </dd>
        </div>
        <hr className="my-1 border-muted print:my-0.5" />
        <div className="flex justify-between text-sm font-semibold print:text-[10px]">
          <dt>Diferencia</dt>
          <dd className={`tabular-nums ${diferenciaColor(efectivo.estado)}`}>{difLabel}</dd>
        </div>
      </dl>

      <CardEfectivoMensaje efectivo={efectivo} />
    </div>
  );
}

function CardEfectivoMensaje({ efectivo }: { efectivo: ConciliacionEfectivo }) {
  if (efectivo.estado === 'pendiente_cierre') {
    return (
      <p className="mt-3 rounded border border-border bg-muted p-2 text-[11px] text-muted-foreground print:mt-1 print:p-1 print:text-[9px]">
        ○ Falta capturar el conteo de efectivo al cerrar el corte.
      </p>
    );
  }
  if (efectivo.estado === 'diferencia' && efectivo.diferencia != null) {
    const verbo = efectivo.diferencia < 0 ? 'Falta' : 'Sobra';
    return (
      <p className="mt-3 rounded border border-destructive/20 bg-destructive/10 p-2 text-[11px] text-destructive print:mt-1 print:p-1 print:text-[9px] print:text-gray-700">
        ⚠ {verbo} efectivo en caja por {formatCurrency(Math.abs(efectivo.diferencia))}.
      </p>
    );
  }
  return null;
}

// ── CardInformativa (Stripe / Transferencia) ──────────────────────────────────

function CardInformativa({
  metodo,
  monto,
  icon: Icon,
  descripcion,
}: {
  metodo: string;
  monto: number;
  icon: LucideIcon;
  descripcion: string;
}) {
  return (
    <div
      className="rounded-lg border bg-card p-4 opacity-90 print:p-2"
      style={{ pageBreakInside: 'avoid' }}
    >
      <div className="mb-2 flex items-center justify-between print:mb-0.5">
        <div className="flex items-center gap-2 print:gap-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted print:hidden">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground print:text-[9px]">
            {metodo}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums print:text-[10px]">
          {formatCurrency(monto)}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground print:text-[9px]">{descripcion}</p>
    </div>
  );
}

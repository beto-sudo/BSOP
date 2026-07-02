'use client';

/**
 * Fase 12 — Detonada. Pantalla informativa: la fase se cierra SOLO por CxC.
 *
 * "Detonar" el crédito = la institución libera el recurso y DILESA recibe el
 * depósito. El camino ÚNICO (2026-07-01, decisión de Beto) es: Contabilidad
 * registra el abono de la institución en el estado de cuenta de la venta y el
 * trigger `dilesa.fn_detonar_venta_desde_cxc` cierra esta fase solo — un
 * registro, un lugar, el dinero en CxC y el comprobante copiado al expediente.
 *
 * La captura manual de emergencia (solo Dirección) se retiró en la misma
 * decisión: dejaba la fecha/monto desincronizados de Cobranza y el estado de
 * cuenta en ceros (caso Ahumada Castillo 2026-06-12; drift de fechas
 * 2026-06-10/11). La fecha de detonación es la del ÚLTIMO abono de institución
 * — con cuantos recibos sean, el último salda y marca fecha — y es la base del
 * cálculo de comisiones (#1171). `trg_resync_detonacion_por_pago` la mantiene
 * sincronizada ante correcciones en CxC.
 *
 * Enforcement: Fase 11 (Escriturada) debe estar cerrada (el trigger no detona
 * antes). Acceso: `dilesa.ventas.fase12_detonada`.
 */

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, CheckCircle2, ExternalLink, Info } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Skeleton } from '@/components/ui/skeleton';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { CapturarFaseHeader } from '@/components/dilesa/capturar-fase-header';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';

type VentaCtx = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  fecha_detonacion: string | null;
  monto_detonado: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
};

/** Abono `fuente='institucion'` del estado de cuenta (erp.cxc_pagos). */
type AbonoInstitucion = {
  id: string;
  fecha: string | null;
  monto_total: number;
  forma_pago: string | null;
  referencia: string | null;
  comprobante_adjunto_id: string | null;
  /** Path en Storage del comprobante (erp.adjuntos.url), null = sin comprobante. */
  comprobantePath: string | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

export default function CapturarFase12Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase12_detonada" write>
      <CapturarFase12Body />
    </RequireAccess>
  );
}

function CapturarFase12Body() {
  const params = useParams<{ id: string }>();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const ventaId = params.id;

  const [venta, setVenta] = useState<VentaCtx | null>(null);
  const [fase11Cerrada, setFase11Cerrada] = useState<boolean | null>(null);
  const [yaCerrada, setYaCerrada] = useState<boolean>(false);
  const [abonos, setAbonos] = useState<AbonoInstitucion[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Cargar contexto ──────────────────────────────────────────────
  useEffect(() => {
    if (!ventaId) return;
    let activo = true;

    (async () => {
      setLoading(true);
      setError(null);

      const { data: vRow, error: vErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .select(
          'id, persona_id, unidad_id, fecha_detonacion, monto_detonado, monto_credito_titular, monto_credito_cotitular'
        )
        .eq('id', ventaId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (vErr) {
        setError(getSupabaseErrorMessage(vErr, 'No se pudo cargar la venta.'));
        setLoading(false);
        return;
      }
      if (!vRow) {
        setError('Venta no encontrada.');
        setLoading(false);
        return;
      }
      const v = vRow as unknown as VentaCtx;
      setVenta(v);

      const { data: fRows } = await sb
        .schema('dilesa')
        .from('venta_fases')
        .select('posicion')
        .eq('venta_id', v.id)
        .is('deleted_at', null);
      if (!activo) return;

      const posiciones = (fRows ?? []).map((f) => f.posicion as number);
      setFase11Cerrada(posiciones.includes(11));
      setYaCerrada(posiciones.includes(12));

      // Abonos de institución en Cobranza (mismo amarre origen_id que la
      // cuadratura). La fecha de detonación es la del último de estos abonos.
      const { data: pagosRows } = await sb
        .schema('erp')
        .from('cxc_pagos')
        .select('id, fecha, monto_total, forma_pago, referencia, comprobante_adjunto_id')
        .eq('origen_tipo', 'venta_dilesa')
        .eq('origen_id', v.id)
        .eq('fuente', 'institucion')
        .is('deleted_at', null)
        .order('fecha', { ascending: true });
      if (!activo) return;

      const pagos = (pagosRows ?? []) as unknown as Omit<AbonoInstitucion, 'comprobantePath'>[];
      const adjuntoIds = pagos.map((p) => p.comprobante_adjunto_id).filter(Boolean) as string[];
      let pathPorAdjunto = new Map<string, string>();
      if (adjuntoIds.length > 0) {
        const { data: adjRows } = await sb
          .schema('erp')
          .from('adjuntos')
          .select('id, url')
          .in('id', adjuntoIds);
        if (!activo) return;
        pathPorAdjunto = new Map(
          ((adjRows ?? []) as { id: string; url: string | null }[]).map((a) => [a.id, a.url ?? ''])
        );
      }
      setAbonos(
        pagos.map((p) => ({
          ...p,
          comprobantePath: p.comprobante_adjunto_id
            ? (pathPorAdjunto.get(p.comprobante_adjunto_id) ?? null)
            : null,
        }))
      );

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb]);

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <CapturarFaseHeader faseposicion={12} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <CapturarFaseHeader
        faseposicion={12}
        descripcion="La detonación se registra en Cobranza; esta fase se cierra sola."
      />

      {yaCerrada ? (
        <Banner
          tone="success"
          title="Fase 12 ya está cerrada"
          body="Esta venta ya está detonada. La siguiente fase es Facturada."
        />
      ) : fase11Cerrada === false ? (
        <Banner
          tone="warning"
          title="Falta cerrar Fase 11 (Escriturada)"
          body={
            <>
              Antes de registrar la detonación, la venta debe estar escriturada. Vuelve al detalle y
              captura la Fase 11 primero.
            </>
          }
          extra={
            <Link
              href={`/dilesa/ventas/${venta.id}`}
              className="mt-3 inline-block text-sm font-medium text-[var(--accent)] underline"
            >
              Volver al detalle
            </Link>
          }
        />
      ) : (
        <GuiaCobranza ventaId={venta.id} />
      )}

      <NotaCierreAutomatico />

      {(fase11Cerrada !== false || abonos.length > 0) && (
        <AbonosInstitucionSection
          abonos={abonos}
          creditoEsperado={
            (Number(venta.monto_credito_titular) || 0) +
            (Number(venta.monto_credito_cotitular) || 0)
          }
          fechaDetonacion={venta.fecha_detonacion}
        />
      )}
    </div>
  );
}

function GuiaCobranza({ ventaId }: { ventaId: string }) {
  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <div className="flex items-start gap-3">
        <Banknote className="h-6 w-6 shrink-0 text-[var(--accent)]" />
        <div className="space-y-2 text-sm">
          <p className="font-medium text-[var(--text)]">
            La detonación se registra en Cobranza, no aquí.
          </p>
          <p className="text-[var(--text)]/70">
            Registra el abono de la institución en el estado de cuenta de la venta — con su
            comprobante y el XML del recibo de caja (ambos obligatorios). Al registrarlo, esta fase
            se cierra sola y el comprobante se copia al expediente. Con coacreditados (p. ej.
            Infonavit Unamos), registra un abono por cada depósito, cada uno con su comprobante.
          </p>
        </div>
      </div>
      <Link
        href={`/dilesa/ventas/${ventaId}?abono=1`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--text)] px-4 py-2 text-sm font-medium text-[var(--card)] hover:opacity-90"
      >
        <Banknote className="h-4 w-4" /> Registrar abono en el estado de cuenta
      </Link>
    </div>
  );
}

/**
 * Cómo, cuándo y con qué fecha se cierra la fase 12 — visible siempre
 * (decisión Beto 2026-07-01: sin captura manual; todo por CxC).
 */
function NotaCierreAutomatico() {
  return (
    <div className="rounded-lg border border-sky-400/40 bg-sky-50 p-4 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">¿Cómo se cierra esta fase?</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <strong>Cómo:</strong> registrando el abono de la institución (fuente «Institución»)
              en el estado de cuenta de la venta, con su comprobante de depósito y el XML del recibo
              de caja. No hay captura manual.
            </li>
            <li>
              <strong>Cuándo:</strong> al registrar el primer abono de institución con la venta
              escriturada (Fase 11 cerrada). Depósitos anteriores no la avanzan.
            </li>
            <li>
              <strong>Con qué fecha:</strong> la fecha del <strong>último</strong> abono de
              institución — con cuantos depósitos sean (coacreditados), el último salda y marca la
              fecha. Esa fecha es la base del cálculo y pago de comisiones. Si Cobranza corrige o
              elimina un abono, la fecha se recalcula sola.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function fmtFecha(d: string | null): string {
  if (!d) return '—';
  // Fechas YYYY-MM-DD (date): parsear sin TZ para no correr el día.
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

/**
 * Los abonos de institución registrados en Cobranza — la fuente de verdad de
 * la detonación. La fecha de la fase 12 es la del ÚLTIMO de estos abonos (con
 * cuantos recibos sean, el último salda y marca fecha); el trigger
 * `fn_detonar_venta_desde_cxc` + `trg_resync_detonacion_por_pago` la mantienen
 * sincronizada sola.
 */
function AbonosInstitucionSection({
  abonos,
  creditoEsperado,
  fechaDetonacion,
}: {
  abonos: AbonoInstitucion[];
  creditoEsperado: number;
  fechaDetonacion: string | null;
}) {
  const total = abonos.reduce((s, a) => s + (Number(a.monto_total) || 0), 0);
  const saldado = creditoEsperado > 0 && total >= creditoEsperado;
  const faltante = creditoEsperado > 0 ? Math.max(0, creditoEsperado - total) : 0;

  return (
    <Section title="Abonos de institución en Cobranza">
      {abonos.length === 0 ? (
        <p className="text-sm text-[var(--text)]/60">
          Sin abonos de institución registrados en el estado de cuenta. La fecha de detonación se
          fija sola con el último abono que se registre en Cobranza.
        </p>
      ) : (
        <div className="space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="py-1.5 pr-3 font-medium">Fecha</th>
                <th className="py-1.5 pr-3 text-right font-medium">Monto</th>
                <th className="py-1.5 pr-3 font-medium">Forma de pago</th>
                <th className="py-1.5 pr-3 font-medium">Referencia</th>
                <th className="py-1.5 font-medium">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {abonos.map((a) => (
                <tr key={a.id} className="border-b border-[var(--border)]/60 last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtFecha(a.fecha)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(a.monto_total)}</td>
                  <td className="py-2 pr-3 capitalize">{a.forma_pago ?? '—'}</td>
                  <td className="py-2 pr-3">{a.referencia ?? '—'}</td>
                  <td className="py-2">
                    {a.comprobantePath ? (
                      <a
                        href={getAdjuntoProxyUrl(a.comprobantePath)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--accent)] underline"
                      >
                        Ver <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        Sin comprobante — adjúntalo al abono en Cobranza
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--muted)]/40 px-3 py-2 text-sm">
            <span>
              Detonado <span className="font-medium tabular-nums">{money(total)}</span>
              {creditoEsperado > 0 && (
                <span className="text-[var(--text)]/60">
                  {' '}
                  · crédito esperado {money(creditoEsperado)}
                </span>
              )}
            </span>
            {creditoEsperado > 0 &&
              (saldado ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Crédito saldado
                </span>
              ) : (
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Detonación parcial — faltan {money(faltante)}
                </span>
              ))}
          </div>

          {fechaDetonacion && (
            <Hint>
              Fecha de detonación: {fmtFecha(fechaDetonacion)} — el último abono de institución
              marca la fecha (base del cálculo de comisiones).
            </Hint>
          )}
        </div>
      )}
    </Section>
  );
}

function Section({
  title,
  accion,
  children,
}: {
  title: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          {title}
        </h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[var(--text)]/50">{children}</p>;
}

function Banner({
  tone,
  title,
  body,
  extra,
}: {
  tone: 'success' | 'warning';
  title: string;
  body: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const stylesB =
    tone === 'success'
      ? 'border-emerald-400/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
      : 'border-amber-400/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100';
  return (
    <div className={`rounded-lg border p-4 ${stylesB}`}>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 text-sm">{body}</div>
      {extra}
    </div>
  );
}

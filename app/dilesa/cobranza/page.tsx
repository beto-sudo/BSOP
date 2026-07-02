'use client';

/**
 * Cobranza · Pagos — captura de abonos desde administración (CxC Sprint 3).
 *
 * El equipo de administración busca una venta por nombre del cliente o por
 * número de crédito (titular/cotitular, `dilesa.ventas.credito_*_ref`) y
 * registra el abono sin entrar al detalle de la venta. La búsqueda por
 * crédito es por contención: las transferencias de las instituciones vienen
 * referenciadas con el número recortado (p.ej. "6090129" ⊂ "INFONAVIT
 * 0526090129"). Reusa <AbonoCaptureDrawer> (mismo form + comprobante + FIFO
 * que el detalle de venta).
 *
 * @responsive desktop-only — captura administrativa en escritorio.
 */

import { useState } from 'react';
import { Search } from 'lucide-react';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive/desktop-only-notice';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { AbonoCaptureDrawer } from '@/components/dilesa/abono-capture-drawer';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

/** Sanea el término para los filtros `.or()` de PostgREST (coma/paréntesis rompen el parser). */
function sanitizar(s: string): string {
  return s.replace(/[,()*]/g, ' ').trim();
}

type Resultado = {
  ventaId: string;
  empresaId: string;
  personaId: string;
  cliente: string;
  unidad: string | null;
  /** Número de crédito del titular (dilesa.ventas.credito_titular_ref). */
  credito: string | null;
  saldo: number;
  estado: string;
};

/**
 * Estados de venta donde NO tiene sentido capturar abonos — el cliente
 * ya no está en proceso y el renglón solo se conserva como historial.
 * Las mostramos en el listado (auditoría) pero con badge + botón
 * disabled.
 */
const NO_COBRABLES = new Set(['desasignada', 'expirada']);

const ESTADO_LABEL: Record<string, string> = {
  desasignada: 'Desasignada',
  expirada: 'Expirada',
};

export default function CobranzaPagosPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.cobranza.pagos">
      <PagosBody />
    </RequireAccess>
  );
}

function PagosBody() {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buscado, setBuscado] = useState(false);
  const [abono, setAbono] = useState<Resultado | null>(null);

  const buscar = async () => {
    const termino = sanitizar(q);
    if (termino.length < 2) return;
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();

    // 1a. Personas que matchean el nombre. 1b. Ventas que matchean el número
    // de crédito (titular o cotitular) — las transferencias de las
    // instituciones vienen referenciadas así (p.ej. "6090129" matchea
    // "INFONAVIT 0526090129" por contención).
    const [personasRes, ventasCreditoRes] = await Promise.all([
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .or(
          `nombre.ilike.%${termino}%,apellido_paterno.ilike.%${termino}%,apellido_materno.ilike.%${termino}%`
        )
        .limit(40),
      sb
        .schema('dilesa')
        .from('ventas')
        .select('id, empresa_id, persona_id, unidad_id, estado, credito_titular_ref')
        .or(`credito_titular_ref.ilike.%${termino}%,credito_cotitular_ref.ilike.%${termino}%`)
        .is('deleted_at', null)
        .limit(40),
    ]);
    if (personasRes.error) {
      setError(getSupabaseErrorMessage(personasRes.error, 'No se pudo buscar.'));
      setLoading(false);
      return;
    }
    const personas = personasRes.data;
    const personaIds = (personas ?? []).map((p) => p.id);
    const nombrePorPersona = new Map(
      (personas ?? []).map((p) => [
        p.id,
        [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
          '(sin nombre)',
      ])
    );

    type VentaRow = {
      id: string;
      empresa_id: string;
      persona_id: string;
      unidad_id: string | null;
      estado: string | null;
      credito_titular_ref?: string | null;
    };
    const ventasPorCredito = (ventasCreditoRes.data ?? []) as VentaRow[];

    // 2. Ventas de las personas por nombre + unión con las de crédito (dedupe).
    let ventasPorNombre: VentaRow[] = [];
    if (personaIds.length > 0) {
      const { data } = await sb
        .schema('dilesa')
        .from('ventas')
        .select('id, empresa_id, persona_id, unidad_id, estado, credito_titular_ref')
        .in('persona_id', personaIds)
        .is('deleted_at', null);
      ventasPorNombre = (data ?? []) as VentaRow[];
    }
    const ventasPorId = new Map<string, VentaRow>();
    for (const v of [...ventasPorNombre, ...ventasPorCredito]) ventasPorId.set(v.id, v);
    const ventas = Array.from(ventasPorId.values());
    const ventaIds = ventas.map((v) => v.id);
    if (ventaIds.length === 0) {
      setResultados([]);
      setBuscado(true);
      setLoading(false);
      return;
    }

    // Nombres de los clientes de ventas encontradas por crédito (no vinieron
    // en la búsqueda por nombre).
    const personasFaltantes = Array.from(
      new Set(ventas.map((v) => v.persona_id).filter((id) => !nombrePorPersona.has(id)))
    );
    if (personasFaltantes.length > 0) {
      const { data: extra } = await sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .in('id', personasFaltantes);
      for (const p of extra ?? []) {
        nombrePorPersona.set(
          p.id,
          [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
            '(sin nombre)'
        );
      }
    }

    // 3. Saldo por venta (suma de cxc_cargos abiertos) + 4. unidad.
    const [{ data: cargos }, { data: unidades }] = await Promise.all([
      sb
        .schema('erp')
        .from('cxc_cargos')
        .select('origen_id, saldo')
        .eq('origen_tipo', 'venta_dilesa')
        .in('origen_id', ventaIds)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('unidades')
        .select('id, identificador')
        .in(
          'id',
          ventas.map((v) => v.unidad_id).filter((x): x is string => !!x)
        ),
    ]);
    const saldoPorVenta = new Map<string, number>();
    for (const c of (cargos ?? []) as { origen_id: string; saldo: number }[]) {
      saldoPorVenta.set(c.origen_id, (saldoPorVenta.get(c.origen_id) ?? 0) + Number(c.saldo));
    }
    const unidadPorId = new Map(
      (unidades ?? []).map((u) => [u.id as string, u.identificador as string])
    );

    const res: Resultado[] = ventas
      .map((v) => ({
        ventaId: v.id,
        empresaId: v.empresa_id,
        personaId: v.persona_id,
        cliente: nombrePorPersona.get(v.persona_id) ?? '(sin nombre)',
        unidad: v.unidad_id ? (unidadPorId.get(v.unidad_id) ?? null) : null,
        credito: v.credito_titular_ref ?? null,
        saldo: saldoPorVenta.get(v.id) ?? 0,
        estado: v.estado ?? 'activa',
      }))
      // Cobrables (activas, etc.) primero; desasignadas/expiradas al final
      // para que el operador vea primero las relevantes.
      .sort((a, b) => {
        const aNoCobr = NO_COBRABLES.has(a.estado) ? 1 : 0;
        const bNoCobr = NO_COBRABLES.has(b.estado) ? 1 : 0;
        if (aNoCobr !== bNoCobr) return aNoCobr - bNoCobr;
        return b.saldo - a.saldo;
      });

    setResultados(res);
    setBuscado(true);
    setLoading(false);
  };

  return (
    <>
      <DesktopOnlyNotice module="Cobranza" />
      <div className="hidden px-4 pb-8 sm:block sm:px-6">
        <h1 className="mb-1 text-lg font-semibold text-[var(--text)]">Captura de pagos</h1>
        <p className="mb-4 text-sm text-[var(--text)]/60">
          Busca por nombre del cliente o por número de crédito (como viene referenciada la
          transferencia de la institución) y registra el abono. Se aplica solo a los cargos abiertos
          de esa venta.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void buscar();
          }}
          className="mb-5 flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre del cliente o número de crédito..."
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <button
            type="submit"
            disabled={loading || sanitizar(q).length < 2}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--text)] px-3 py-2 text-sm font-medium text-[var(--card)] hover:opacity-90 disabled:opacity-40"
          >
            <Search className="h-4 w-4" /> Buscar
          </button>
        </form>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        {buscado && !loading && resultados.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin ventas para esa búsqueda.</p>
        ) : null}

        {resultados.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="py-1 pr-2 font-medium">Cliente</th>
                <th className="py-1 pr-2 font-medium">Unidad</th>
                <th className="py-1 pr-2 font-medium">Crédito</th>
                <th className="py-1 pr-2 text-right font-medium">Saldo</th>
                <th className="py-1 pl-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => {
                const noCobrable = NO_COBRABLES.has(r.estado);
                return (
                  <tr
                    key={r.ventaId}
                    className={`border-b border-[var(--border)]/40 ${
                      noCobrable ? 'text-[var(--text)]/40' : ''
                    }`}
                  >
                    <td className="py-1.5 pr-2">
                      <span className="inline-flex items-center gap-2">
                        {r.cliente}
                        {noCobrable ? (
                          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                            {ESTADO_LABEL[r.estado] ?? r.estado}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">{r.unidad ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-xs">{r.credito ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {moneyFmt.format(r.saldo)}
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => setAbono(r)}
                        disabled={noCobrable}
                        title={
                          noCobrable
                            ? `Venta ${ESTADO_LABEL[r.estado] ?? r.estado} — sólo historial, no se permiten abonos`
                            : undefined
                        }
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--text)] hover:bg-[var(--panel)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--card)]"
                      >
                        Registrar abono
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      {abono ? (
        <AbonoCaptureDrawer
          open={!!abono}
          onOpenChange={(o) => !o && setAbono(null)}
          ventaId={abono.ventaId}
          empresaId={abono.empresaId}
          personaId={abono.personaId}
          clienteNombre={abono.cliente}
          onDone={() => void buscar()}
        />
      ) : null}
    </>
  );
}

'use client';

/**
 * VentaDetailDrawer — detalle completo de una venta DILESA.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 4 (UI ventas). Se abre al
 * hacer click en una fila de `VentasModule`. Muestra:
 *   1. Datos del cliente (`erp.personas`, cross-schema).
 *   2. Datos de la venta — ficha completa + KYC/PLD.
 *   3. Pipeline — `<ActivityLog>` alimentado por `dilesa.venta_fases`.
 *   4. Pagos — tabla de `dilesa.venta_pagos` + suma.
 *   5. Expediente digital — adjuntos en `erp.adjuntos` (entidad venta
 *      + venta_pago) con descarga vía el proxy `/api/adjuntos/<path>`.
 *
 * Lectura pura — captura/edición es entregable posterior.
 */

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DetailDrawer, DetailDrawerContent, DetailDrawerSection } from '@/components/detail-page';
import { ActivityLog } from '@/components/activity-log/activity-log';
import type { ActivityEvent } from '@/components/activity-log/types';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { FileText, ExternalLink } from 'lucide-react';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

export type VentaDetalle = {
  id: string;
  persona_id: string;
  estado: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  tipo_credito: string | null;
  cliente: string;
  unidadIdentificador: string | null;
  proyectoNombre: string | null;
};

type VentaFull = {
  valor_comercial: number | null;
  valor_escrituracion: number | null;
  precio_asignacion: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  credito_titular_ref: string | null;
  credito_cotitular_ref: string | null;
  enganche_requerido: number | null;
  descuento_total: number | null;
  comision_vendedor: number | null;
  comision_gerencia: number | null;
  anticipo_comision: number | null;
  monto_avaluo: number | null;
  gastos_escrituracion: number | null;
  numero_escritura: string | null;
  fecha_escritura: string | null;
  vendedor: string | null;
  notario: string | null;
  casa_valuadora: string | null;
  es_pep: boolean | null;
  ocupacion: string | null;
  ine_numero: string | null;
  forma_pago: string | null;
  uso_efectivo: string | null;
  conocimiento_dueno_beneficiario: string | null;
  motivo_desasignacion: string | null;
  notas: string | null;
};

type Persona = {
  email: string | null;
  telefono: string | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  fecha_nacimiento: string | null;
  nacionalidad: string | null;
  tipo_persona: string | null;
  estado_civil: string | null;
  domicilio: string | null;
};

type Fase = { id: string; fase: string; posicion: number | null; fecha: string | null };
type Pago = { id: string; fecha: string | null; monto: number; tipo: string | null };
type Adjunto = {
  id: string;
  entidad_tipo: string;
  entidad_id: string;
  rol: string;
  nombre: string;
  url: string;
  tipo_mime: string | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = { activa: 'info', desasignada: 'neutral' };
const ESTADO_LABEL: Record<string, string> = { activa: 'Activa', desasignada: 'Desasignada' };

const ROL_LABEL: Record<string, string> = {
  factura: 'Factura',
  aprobacion_credito: 'Aprobación de crédito',
  constancia_credito_titular: 'Constancia de crédito (titular)',
  constancia_credito_cotitular: 'Constancia de crédito (co-titular)',
  aviso_pld: 'Aviso PLD',
  avaluo_comercial: 'Avalúo comercial',
  contrato_promesa: 'Contrato promesa de compraventa',
  solicitud_asignacion: 'Solicitud de asignación',
  recibos_caja: 'Recibos de caja',
  expediente_digital: 'Expediente digital',
  ficu: 'FICU',
  aviso_privacidad: 'Aviso de privacidad',
  carta_instruccion_notarial: 'Carta instrucción notarial',
  checklist_entrega: 'Checklist de entrega',
  checklist_pre_entrega: 'Checklist pre-entrega',
  validacion_patronal: 'Validación patronal',
  nota_credito: 'Nota de crédito',
  pagare: 'Pagaré',
  imagen_detonacion: 'Imagen de detonación',
  recibo_caja: 'Recibo de caja',
  comprobante_deposito: 'Comprobante de depósito',
};

const numberFmt = new Intl.NumberFormat('es-MX');
const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function fmtMoney(n: number | null): string | null {
  return n == null ? null : moneyFmt.format(n);
}
function fmtFecha(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PIPELINE_TONES = {
  fase_pipeline: { label: 'Pipeline', tone: 'info' as BadgeTone },
};

export function VentaDetailDrawer({
  venta,
  open,
  onOpenChange,
}: {
  venta: VentaDetalle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [full, setFull] = useState<VentaFull | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [fases, setFases] = useState<Fase[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !venta) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    void Promise.all([
      sb.schema('dilesa').from('ventas').select('*').eq('id', venta.id).single(),
      sb
        .schema('erp')
        .from('personas')
        .select(
          'email, telefono, curp, rfc, nss, fecha_nacimiento, nacionalidad, tipo_persona, estado_civil, domicilio'
        )
        .eq('id', venta.persona_id)
        .single(),
      sb
        .schema('dilesa')
        .from('venta_fases')
        .select('id, fase, posicion, fecha')
        .eq('venta_id', venta.id)
        .is('deleted_at', null)
        .order('posicion', { ascending: true }),
      sb
        .schema('dilesa')
        .from('venta_pagos')
        .select('id, fecha, monto, tipo')
        .eq('venta_id', venta.id)
        .is('deleted_at', null)
        .order('fecha', { ascending: true }),
    ]).then(async ([vRes, pRes, fRes, pagosRes]) => {
      if (!activo) return;
      if (vRes.error || pRes.error || fRes.error || pagosRes.error) {
        setError(
          getSupabaseErrorMessage(
            vRes.error ?? pRes.error ?? fRes.error ?? pagosRes.error,
            'No se pudo cargar el detalle de la venta.'
          )
        );
        setLoadedId(venta.id);
        return;
      }
      const pagoIds = ((pagosRes.data ?? []) as Pago[]).map((p) => p.id);
      const allIds = [venta.id, ...pagoIds];
      const { data: adjRows, error: adjErr } = await sb
        .schema('erp')
        .from('adjuntos')
        .select('id, entidad_tipo, entidad_id, rol, nombre, url, tipo_mime')
        .in('entidad_tipo', ['venta', 'venta_pago'])
        .in('entidad_id', allIds);
      if (!activo) return;
      if (adjErr) {
        setError(getSupabaseErrorMessage(adjErr, 'No se pudieron cargar los adjuntos.'));
        setLoadedId(venta.id);
        return;
      }
      setError(null);
      setFull(vRes.data as unknown as VentaFull);
      setPersona(pRes.data as unknown as Persona);
      setFases((fRes.data ?? []) as Fase[]);
      setPagos((pagosRes.data ?? []) as Pago[]);
      setAdjuntos((adjRows ?? []) as Adjunto[]);
      setLoadedId(venta.id);
    });
    return () => {
      activo = false;
    };
  }, [open, venta]);

  const loading = open && venta != null && loadedId !== venta.id;

  const pipelineEvents = useMemo<ActivityEvent[]>(
    () =>
      fases
        .filter((f) => f.fecha)
        .sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0))
        .map((f) => ({
          id: f.id,
          at: new Date(`${f.fecha}T12:00:00`).toISOString(),
          type: 'fase_pipeline',
          actor: null,
          summary: `${f.posicion ? `${f.posicion}. ` : ''}${f.fase}`,
        })),
    [fases]
  );

  const adjuntosVenta = useMemo(
    () => adjuntos.filter((a) => a.entidad_tipo === 'venta'),
    [adjuntos]
  );
  const adjuntosPorRol = useMemo(() => {
    const m = new Map<string, Adjunto[]>();
    for (const a of adjuntosVenta) {
      const arr = m.get(a.rol) ?? [];
      arr.push(a);
      m.set(a.rol, arr);
    }
    return [...m.entries()].sort((a, b) =>
      (ROL_LABEL[a[0]] ?? a[0]).localeCompare(ROL_LABEL[b[0]] ?? b[0])
    );
  }, [adjuntosVenta]);

  const adjuntosPorPago = useMemo(() => {
    const m = new Map<string, Adjunto[]>();
    for (const a of adjuntos.filter((x) => x.entidad_tipo === 'venta_pago')) {
      const arr = m.get(a.entidad_id) ?? [];
      arr.push(a);
      m.set(a.entidad_id, arr);
    }
    return m;
  }, [adjuntos]);

  const totalPagos = useMemo(() => pagos.reduce((s, p) => s + (p.monto ?? 0), 0), [pagos]);

  if (!venta) return null;

  const fichaVenta: { label: string; value: string }[] = (
    [
      ['Proyecto', venta.proyectoNombre],
      ['Unidad', venta.unidadIdentificador],
      ['Tipo de crédito', venta.tipo_credito],
      ['Vendedor', full?.vendedor ?? null],
      ['Notario', full?.notario ?? null],
      ['Casa valuadora', full?.casa_valuadora ?? null],
      ['Precio de asignación', fmtMoney(full?.precio_asignacion ?? null)],
      ['Valor comercial', fmtMoney(full?.valor_comercial ?? null)],
      ['Valor de escrituración', fmtMoney(full?.valor_escrituracion ?? null)],
      ['Enganche requerido', fmtMoney(full?.enganche_requerido ?? null)],
      ['Descuento total', fmtMoney(full?.descuento_total ?? null)],
      ['Crédito titular', fmtMoney(full?.monto_credito_titular ?? null)],
      ['Crédito co-titular', fmtMoney(full?.monto_credito_cotitular ?? null)],
      ['Ref. crédito titular', full?.credito_titular_ref ?? null],
      ['Ref. crédito co-titular', full?.credito_cotitular_ref ?? null],
      ['Comisión vendedor', fmtMoney(full?.comision_vendedor ?? null)],
      ['Comisión gerencia', fmtMoney(full?.comision_gerencia ?? null)],
      ['Anticipo comisión', fmtMoney(full?.anticipo_comision ?? null)],
      ['Monto avalúo', fmtMoney(full?.monto_avaluo ?? null)],
      ['Gastos escrituración', fmtMoney(full?.gastos_escrituracion ?? null)],
      ['# Escritura', full?.numero_escritura ?? null],
      ['Fecha de escritura', fmtFecha(full?.fecha_escritura ?? null)],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  const fichaPersona: { label: string; value: string }[] = persona
    ? (
        [
          ['CURP', persona.curp],
          ['RFC', persona.rfc],
          ['NSS', persona.nss],
          ['Tel.', persona.telefono],
          ['Email', persona.email],
          ['Fecha de nacimiento', fmtFecha(persona.fecha_nacimiento)],
          ['Nacionalidad', persona.nacionalidad],
          ['Estado civil', persona.estado_civil],
          ['Tipo persona', persona.tipo_persona],
          ['Domicilio', persona.domicilio],
        ] as [string, string | null][]
      )
        .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
        .map(([label, value]) => ({ label, value }))
    : [];

  const kyc: { label: string; value: string }[] = (
    [
      ['PEP', full?.es_pep == null ? null : full.es_pep ? 'Sí' : 'No'],
      ['Ocupación', full?.ocupacion ?? null],
      ['INE', full?.ine_numero ?? null],
      ['Forma de pago', full?.forma_pago ?? null],
      ['Uso de efectivo', full?.uso_efectivo ?? null],
      ['Dueño beneficiario', full?.conocimiento_dueno_beneficiario ?? null],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={venta.cliente}
      description={
        venta.proyectoNombre && venta.unidadIdentificador
          ? `${venta.proyectoNombre} · ${venta.unidadIdentificador}`
          : undefined
      }
      meta={
        <>
          {venta.fase_actual ? (
            <Badge tone="neutral">
              {venta.fase_posicion ? `${venta.fase_posicion}. ` : ''}
              {venta.fase_actual}
            </Badge>
          ) : null}
          <Badge tone={ESTADO_TONE[venta.estado] ?? 'neutral'}>
            {ESTADO_LABEL[venta.estado] ?? venta.estado}
          </Badge>
          {venta.tipo_credito ? <Badge tone="neutral">{venta.tipo_credito}</Badge> : null}
        </>
      }
    >
      <DetailDrawerContent>
        <DetailDrawerSection title="Datos del cliente" divider={false}>
          {loading ? (
            <p className="text-sm text-[var(--text)]/60">Cargando…</p>
          ) : error ? (
            <p className="text-sm text-[var(--text)]/60">{error}</p>
          ) : fichaPersona.length === 0 ? (
            <p className="text-sm text-[var(--text)]/60">Sin datos del cliente.</p>
          ) : (
            <FichaGrid rows={fichaPersona} />
          )}
        </DetailDrawerSection>

        <DetailDrawerSection title="Datos de la venta">
          {fichaVenta.length === 0 ? (
            <p className="text-sm text-[var(--text)]/60">—</p>
          ) : (
            <FichaGrid rows={fichaVenta} />
          )}
          {full?.motivo_desasignacion ? (
            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                Motivo de desasignación
              </div>
              <p className="mt-0.5 text-sm text-[var(--text)]/80">{full.motivo_desasignacion}</p>
            </div>
          ) : null}
          {kyc.length > 0 ? (
            <div className="mt-6">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                KYC / PLD
              </div>
              <FichaGrid rows={kyc} />
            </div>
          ) : null}
        </DetailDrawerSection>

        <DetailDrawerSection
          title="Pipeline"
          description={`${pipelineEvents.length} de 17 fases alcanzadas`}
        >
          <ActivityLog events={pipelineEvents} loading={loading} tones={PIPELINE_TONES} />
        </DetailDrawerSection>

        <DetailDrawerSection
          title="Pagos"
          description={
            pagos.length === 0 ? 'sin pagos' : `${pagos.length} · ${moneyFmt.format(totalPagos)}`
          }
        >
          {loading ? (
            <p className="text-sm text-[var(--text)]/60">Cargando…</p>
          ) : pagos.length === 0 ? (
            <p className="text-sm text-[var(--text)]/60">No hay depósitos registrados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                  <th className="py-1 pr-2 font-medium">Fecha</th>
                  <th className="py-1 pr-2 font-medium">Tipo</th>
                  <th className="py-1 text-right font-medium">Monto</th>
                  <th className="py-1 pl-2 font-medium">Adjuntos</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => {
                  const ads = adjuntosPorPago.get(p.id) ?? [];
                  return (
                    <tr key={p.id} className="border-b border-[var(--border)]/40">
                      <td className="py-1.5 pr-2">{fmtFecha(p.fecha) ?? '—'}</td>
                      <td className="py-1.5 pr-2 text-[var(--text)]/70">{p.tipo ?? '—'}</td>
                      <td className="py-1.5 text-right tabular-nums">{moneyFmt.format(p.monto)}</td>
                      <td className="py-1.5 pl-2">
                        <div className="flex flex-wrap gap-1">
                          {ads.map((a) => (
                            <AdjuntoLink key={a.id} a={a} compact />
                          ))}
                          {ads.length === 0 ? (
                            <span className="text-[var(--text)]/30">—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </DetailDrawerSection>

        <DetailDrawerSection
          title="Expediente digital"
          description={
            adjuntosVenta.length === 0 ? 'sin documentos' : `${adjuntosVenta.length} documentos`
          }
        >
          {loading ? (
            <p className="text-sm text-[var(--text)]/60">Cargando…</p>
          ) : adjuntosPorRol.length === 0 ? (
            <p className="text-sm text-[var(--text)]/60">
              Sin documentos en el expediente para esta venta.
            </p>
          ) : (
            <div className="space-y-3">
              {adjuntosPorRol.map(([rol, ads]) => (
                <div key={rol}>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                    {ROL_LABEL[rol] ?? rol}
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {ads.map((a) => (
                      <li key={a.id}>
                        <AdjuntoLink a={a} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </DetailDrawerSection>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

function FichaGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            {r.label}
          </dt>
          <dd className="mt-0.5 text-sm text-[var(--text)]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AdjuntoLink({ a, compact = false }: { a: Adjunto; compact?: boolean }) {
  const href = getAdjuntoProxyUrl(a.url);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        compact
          ? 'inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text)]/70 hover:text-[var(--text)]'
          : 'inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--text)]/80 hover:text-[var(--text)]'
      }
      title={a.nombre}
    >
      <FileText className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      <span className="max-w-[200px] truncate">{a.nombre}</span>
      <ExternalLink className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
    </a>
  );
}

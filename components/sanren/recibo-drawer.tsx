'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
} from '@/components/detail-page/detail-drawer';
import { FileAttachments } from '@/components/file-attachments';
import { createRecibo } from '@/app/servicios/actions';
import type { ServicioSanren, ReciboVista } from '@/lib/sanren-servicios';

const ROLES = [
  { id: 'recibo', label: 'Recibo (PDF)', icon: '📄' },
  { id: 'comprobante', label: 'Comprobante de pago', icon: '💳' },
];

const inputCls =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm';

function money(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'nuevo' | 'detalle';
  recibo: ReciboVista | null;
  servicios: ServicioSanren[];
  empresaId: string | null;
};

export function ReciboDrawer({ open, onOpenChange, mode, recibo, servicios, empresaId }: Props) {
  if (mode === 'detalle' && recibo) {
    return (
      <ReciboDetalle
        recibo={recibo}
        empresaId={empresaId}
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  }

  return <NuevoReciboForm open={open} onOpenChange={onOpenChange} servicios={servicios} />;
}

function ReciboDetalle({
  recibo,
  empresaId,
  open,
  onOpenChange,
}: {
  recibo: ReciboVista;
  empresaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [extrayendo, setExtrayendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function extraer(auto: boolean) {
    setExtrayendo(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/sanren/recibos/${recibo.id}/extraer`, { method: 'POST' });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        setAviso('Leído con IA ✓');
        router.refresh();
      } else if (!auto) {
        setAviso(json.error ?? 'No se pudo leer el recibo.');
      }
    } catch {
      if (!auto) setAviso('Error al leer el recibo.');
    } finally {
      setExtrayendo(false);
    }
  }

  const ex = recibo.extraccion;
  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`${recibo.servicio_tipo} · ${recibo.periodo.slice(0, 7)}`}
      description={recibo.proveedor ?? undefined}
      size="md"
      actions={
        recibo.recibo_adjunto_path ? (
          <button
            onClick={() => extraer(false)}
            disabled={extrayendo}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--text)]/5 disabled:opacity-40"
          >
            {extrayendo ? 'Leyendo…' : '✨ Leer con IA'}
          </button>
        ) : undefined
      }
    >
      <DetailDrawerContent>
        <DetailDrawerSection title="Datos del recibo">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Dato k="Fecha" v={recibo.fecha_recibo} />
            <Dato k="Vence" v={recibo.fecha_vencimiento ?? '—'} />
            <Dato k="Folio" v={recibo.folio ?? '—'} />
            <Dato k="Tarifa" v={recibo.tarifa ?? '—'} />
            <Dato k="Monto" v={money(recibo.monto)} />
            <Dato k="Pago" v={recibo.pagado ? 'Pagado' : 'Pendiente'} />
            <Dato
              k="Consumo"
              v={
                recibo.consumo_periodo != null
                  ? `${recibo.consumo_periodo} ${recibo.unidad_consumo ?? ''}`
                  : '—'
              }
            />
            <Dato k="Costo/u" v={money(recibo.costo_unitario)} />
            {recibo.tiene_produccion ? (
              <>
                <Dato k="Generación" v={recibo.produccion_periodo?.toString() ?? '—'} />
                <Dato k="Saldo neto" v={recibo.saldo_neto?.toString() ?? '—'} />
                {ex?.energia_acumulada_favor ? (
                  <Dato k="Banco de energía" v={`${ex.energia_acumulada_favor} kWh a favor`} />
                ) : null}
              </>
            ) : null}
          </dl>
          {recibo.notas ? (
            <p className="mt-3 text-sm text-[var(--text)]/70">{recibo.notas}</p>
          ) : null}
        </DetailDrawerSection>

        {ex?.conceptos && ex.conceptos.length > 0 ? (
          <DetailDrawerSection title="Desglose">
            <ul className="space-y-1 text-sm">
              {ex.conceptos.map((c, i) => (
                <li key={i} className="flex justify-between">
                  <span className="text-[var(--text)]/70">{c.concepto}</span>
                  <span>{money(c.importe)}</span>
                </li>
              ))}
            </ul>
          </DetailDrawerSection>
        ) : null}

        <DetailDrawerSection title="Archivos">
          {empresaId ? (
            <FileAttachments
              empresaId={empresaId}
              empresaSlug="sanren"
              entidad="recibos"
              entidadId={recibo.id}
              roles={ROLES}
              defaultUploadRole="recibo"
              onChange={() => extraer(true)}
            />
          ) : (
            <p className="text-sm text-[var(--text)]/55">No se pudo resolver la empresa.</p>
          )}
          {extrayendo ? (
            <p className="mt-2 text-sm text-[var(--text)]/60">Leyendo el recibo con IA…</p>
          ) : null}
          {aviso ? <p className="mt-2 text-sm text-[var(--text)]/70">{aviso}</p> : null}
          <p className="mt-2 text-xs text-[var(--text)]/45">
            Al subir el PDF del recibo, la IA lo lee y completa los datos automáticamente.
          </p>
        </DetailDrawerSection>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text)]/55">{k}</dt>
      <dd className="text-[var(--text)]">{v}</dd>
    </div>
  );
}

function NuevoReciboForm({
  open,
  onOpenChange,
  servicios,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servicios: ServicioSanren[];
}) {
  const router = useRouter();
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? '');
  const [fechaRecibo, setFechaRecibo] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [monto, setMonto] = useState('');
  const [folio, setFolio] = useState('');
  const [lecturaConsumo, setLecturaConsumo] = useState('');
  const [lecturaProduccion, setLecturaProduccion] = useState('');
  const [pagado, setPagado] = useState(false);
  const [fechaPago, setFechaPago] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const servicio = servicios.find((s) => s.id === servicioId) ?? null;
  const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await createRecibo({
      servicioId,
      periodo,
      fechaRecibo,
      monto: numOrNull(monto),
      folio: folio.trim() || null,
      lecturaConsumo: numOrNull(lecturaConsumo),
      lecturaProduccion: servicio?.tiene_produccion ? numOrNull(lecturaProduccion) : null,
      pagado,
      fechaPago: pagado ? fechaPago || null : null,
      notas: notas.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      onOpenChange(false);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo recibo"
      description="Captura un recibo; el PDF y el comprobante se adjuntan abriéndolo en la lista."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || !servicioId || !fechaRecibo}
            className="rounded-lg bg-[var(--text)] px-4 py-1.5 text-sm font-medium text-[var(--bg)] disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar recibo'}
          </button>
        </div>
      }
    >
      <DetailDrawerContent>
        {error ? (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Servicio" full>
            <select
              value={servicioId}
              onChange={(e) => setServicioId(e.target.value)}
              className={inputCls}
            >
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.tipo}
                  {s.proveedor ? ` · ${s.proveedor}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha del recibo">
            <input
              type="date"
              value={fechaRecibo}
              onChange={(e) => setFechaRecibo(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Periodo (mes)">
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Monto (MXN)">
            <input
              type="number"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Folio">
            <input value={folio} onChange={(e) => setFolio(e.target.value)} className={inputCls} />
          </Field>
          <Field
            label={`Lectura de consumo${servicio?.unidad_consumo ? ` (${servicio.unidad_consumo})` : ''}`}
          >
            <input
              type="number"
              step="0.01"
              value={lecturaConsumo}
              onChange={(e) => setLecturaConsumo(e.target.value)}
              className={inputCls}
            />
          </Field>
          {servicio?.tiene_produccion ? (
            <Field label="Lectura de producción (solar)">
              <input
                type="number"
                step="0.01"
                value={lecturaProduccion}
                onChange={(e) => setLecturaProduccion(e.target.value)}
                className={inputCls}
              />
            </Field>
          ) : null}
          <Field label="¿Pagado?">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pagado}
                onChange={(e) => setPagado(e.target.checked)}
              />
              Marcar como pagado
            </label>
          </Field>
          {pagado ? (
            <Field label="Fecha de pago">
              <input
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                className={inputCls}
              />
            </Field>
          ) : null}
          <Field label="Notas" full>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>
        </div>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-xs text-[var(--text)]/55">{label}</label>
      {children}
    </div>
  );
}

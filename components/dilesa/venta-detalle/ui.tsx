'use client';

/**
 * Sub-componentes de presentación del expediente de venta DILESA, compartidos
 * por las páginas de cada tab (Operación / Cuadratura / Documentos / Bitácora /
 * Pipeline / Estado de cuenta) y el Shell del layout.
 *
 * Extraídos sin cambios del antiguo monolito `[id]/page.tsx` (iniciativa
 * `dilesa-ventas-expediente-tabs`).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, ExternalLink, FileText, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePermissions } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { formatearVencimiento, type HoldSnapshot } from '@/lib/dilesa/hold-cola';
import { regresarAFase, desasignarVenta } from '@/app/dilesa/ventas/[id]/actions';
import type { Adjunto } from './types';

export function BackLink() {
  return (
    <Link
      href="/dilesa/ventas"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a ventas
    </Link>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          {title}
        </h2>
        {description ? <span className="text-xs text-[var(--text)]/50">{description}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function FichaGrid({
  rows,
  cols = 2,
}: {
  rows: { label: string; value: string }[];
  cols?: 2 | 3;
}) {
  const gridCls =
    cols === 3
      ? 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2';
  return (
    <dl className={gridCls}>
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

export function ResumenItem({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </div>
      <div
        className={`mt-0.5 text-base font-semibold tabular-nums ${warn ? 'text-amber-600' : 'text-[var(--text)]'}`}
      >
        {value}
      </div>
    </div>
  );
}

export function HoldBanner({ snapshot }: { snapshot: HoldSnapshot }) {
  let tone: 'success' | 'warning' | 'danger' = 'success';
  let title = '';
  let body = '';
  switch (snapshot.estado) {
    case 'lider_ok': {
      tone = 'success';
      title = 'Líder de la fila — hold activo';
      body = snapshot.expira_at
        ? `Vence ${formatearVencimiento(snapshot.expira_at)}. Completá el expediente antes para que Dirección autorice la asignación.`
        : 'Completá el expediente para que Dirección autorice la asignación.';
      if (snapshot.esperando > 0)
        body += ` Hay ${snapshot.esperando} en fila esperando esta unidad.`;
      break;
    }
    case 'lider_warning': {
      tone = 'warning';
      title = '⚠️ Hold expira pronto';
      body = snapshot.expira_at
        ? `${formatearVencimiento(snapshot.expira_at, { mostrarRestante: true })}. Si no completás el expediente, el siguiente en la fila toma el lugar.`
        : 'El hold expira en menos de 4 horas.';
      break;
    }
    case 'lider_expirado': {
      tone = 'danger';
      title = 'Hold expirado';
      body =
        'El plazo de 2 días hábiles pasó. El sistema marcará la venta como expirada y promoverá al siguiente en la fila en la próxima vuelta del cron.';
      break;
    }
    case 'en_cola': {
      tone = 'warning';
      title = `En fila — posición #${snapshot.posicion}`;
      body = snapshot.expira_at
        ? `Esperando que el líder complete o expire ${formatearVencimiento(snapshot.expira_at)}.`
        : 'Esperando que el líder complete o expire su hold.';
      break;
    }
    case 'expirada': {
      tone = 'danger';
      title = 'Hold perdido';
      body =
        'Esta solicitud perdió el hold por no completar expediente en 2 días hábiles. Si el cliente sigue interesado, podés recrear la solicitud y entrar al final de la fila.';
      break;
    }
    case 'no_aplica':
      return null;
  }

  const cls =
    tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100'
      : tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100'
        : 'border-red-500/30 bg-red-500/5 text-red-900 dark:text-red-100';

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-90">{body}</p>
    </div>
  );
}

export function PdfDownloadLink({
  ventaId,
  tipo,
  label,
}: {
  ventaId: string;
  tipo:
    | 'solicitud-asignacion'
    | 'aviso-privacidad'
    | 'ficu'
    | 'promesa-compraventa'
    | 'solicitud-avaluo'
    | 'solicitud-dictamen'
    | 'poliza-garantia'
    | 'pagare-credito-directo'
    | 'checklist-entrega'
    | 'checklist-entrega-cliente';
  label: string;
}) {
  return (
    <a
      href={`/api/dilesa/ventas/${ventaId}/pdf/${tipo}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

/**
 * Botón "Correo de escrituración" — reenvío manual del email que se dispara
 * automáticamente al cerrar F11 (cliente + vendedor + escrituras@). El diálogo
 * ofrece también mandarse una prueba (solo al usuario actual) para revisar el
 * contenido antes de tocar al cliente.
 */
export function EscrituracionEmailButton({
  ventaId,
  lastSentAt,
}: {
  ventaId: string;
  lastSentAt: string | null;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState<'real' | 'test' | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(lastSentAt);

  const fmtTs = (ts: string): string => {
    const d = new Date(ts);
    return isNaN(d.getTime())
      ? ts
      : d.toLocaleString('es-MX', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  };

  async function enviar(test: boolean) {
    setSubmitting(test ? 'test' : 'real');
    try {
      const res = await fetch(`/api/dilesa/ventas/${ventaId}/notify-escrituracion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test ? { test: true } : { resend: true }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sentTo?: string[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.add({
          title: 'No se envió el correo',
          description: json.error ?? `Error HTTP ${res.status}.`,
          type: 'error',
        });
        return;
      }
      toast.add({
        title: test ? 'Prueba enviada a tu correo' : 'Correo de escrituración enviado',
        description: `Destinatarios: ${(json.sentTo ?? []).join(', ')}`,
        type: 'success',
      });
      if (!test) {
        setSentAt(new Date().toISOString());
        setOpen(false);
      }
    } catch (e) {
      toast.add({
        title: 'No se envió el correo',
        description: e instanceof Error ? e.message : String(e),
        type: 'error',
      });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
        title={sentAt ? `Último envío: ${fmtTs(sentAt)}` : 'Sin envíos registrados'}
      >
        <Mail className="h-3.5 w-3.5" />
        Correo de escrituración
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Correo de escrituración</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-[var(--text)]/80">
            <p>
              Envía al <b>cliente</b> los datos de su escrituración (fecha, número y valor de
              escritura, inmueble y notaría), con copia al <b>vendedor</b> y a{' '}
              <b>escrituras@dilesa.mx</b>.
            </p>
            <p className="text-xs text-[var(--text)]/60">
              {sentAt
                ? `Último envío: ${fmtTs(sentAt)}. Volver a enviar manda un correo nuevo a todos los destinatarios.`
                : 'Esta venta no tiene envíos registrados.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting != null}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={() => enviar(true)} disabled={submitting != null}>
              {submitting === 'test' ? 'Enviando…' : 'Enviarme una prueba'}
            </Button>
            <Button onClick={() => enviar(false)} disabled={submitting != null}>
              {submitting === 'real' ? 'Enviando…' : 'Enviar al cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdjuntoLink({ a, compact = false }: { a: Adjunto; compact?: boolean }) {
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
      <span className="max-w-[220px] truncate">{a.nombre}</span>
      <ExternalLink className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
    </a>
  );
}

/**
 * Movimientos administrativos sobre la venta — solo visibles para roles con
 * escritura sobre `dilesa.ventas.autorizar` (Dirección + Nelcy).
 *
 *  - Regresar a fase: dialog con selector de fase destino + motivo.
 *  - Desasignar: dialog con motivo. Manda email al cliente + vendedor.
 *
 * Si la venta ya está desasignada o en fase 17, no se muestran botones.
 */
export function MovimientosAdministrativos({
  ventaId,
  estado,
  fasePosicion,
  personaId,
}: {
  ventaId: string;
  estado: string;
  fasePosicion: number | null;
  personaId: string;
}) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const router = useRouter();
  const [openRegresar, setOpenRegresar] = useState(false);
  const [openDesasignar, setOpenDesasignar] = useState(false);

  const puedeAutorizar =
    permissions.isAdmin || permissions.modulos.get('dilesa.ventas.autorizar')?.write === true;
  if (!puedeAutorizar) return null;

  // Si está desasignada, ofrecemos crear una nueva solicitud para el mismo
  // cliente con otra unidad — caso de uso operativo común.
  if (estado === 'desasignada') {
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/dilesa/ventas/nueva?persona=${personaId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
        >
          + Crear nueva solicitud para este cliente
        </Link>
      </div>
    );
  }
  // 'terminada' conserva "Regresar a fase…" como única acción: deshace un cierre
  // erróneo de la fase 17 (el trigger de DB regresa el estado a 'activa' al bajar
  // la fase). Desasignar una terminada no procede — para tocarla hay que
  // regresarla a pipeline primero.
  if (estado !== 'activa' && estado !== 'terminada') return null;
  const pos = fasePosicion ?? 0;

  function handleDone(msg: string) {
    toast.add({ title: 'Listo', description: msg, type: 'success' });
    router.refresh();
  }
  function handleError(msg: string) {
    toast.add({ title: 'Error', description: msg, type: 'error' });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {pos > 1 ? (
        <Button variant="outline" size="sm" onClick={() => setOpenRegresar(true)}>
          Regresar a fase…
        </Button>
      ) : null}
      {estado === 'activa' ? (
        <Button variant="outline" size="sm" onClick={() => setOpenDesasignar(true)}>
          Desasignar venta…
        </Button>
      ) : null}

      <RegresarFaseDialog
        ventaId={ventaId}
        faseActual={pos}
        open={openRegresar}
        onOpenChange={setOpenRegresar}
        onDone={handleDone}
        onError={handleError}
      />
      <DesasignarDialog
        ventaId={ventaId}
        open={openDesasignar}
        onOpenChange={setOpenDesasignar}
        onDone={handleDone}
        onError={handleError}
      />
    </div>
  );
}

function RegresarFaseDialog({
  ventaId,
  faseActual,
  open,
  onOpenChange,
  onDone,
  onError,
}: {
  ventaId: string;
  faseActual: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [faseDestino, setFaseDestino] = useState<number>(1);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const opciones = Array.from({ length: Math.max(0, faseActual - 1) }, (_, i) => i + 1);

  async function onSubmit() {
    if (motivo.trim().length < 5) {
      onError('El motivo es obligatorio (mínimo 5 caracteres).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await regresarAFase(ventaId, faseDestino, motivo);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      const baseMsg = `Venta regresada a Fase ${faseDestino}.`;
      const emailMsg =
        faseDestino === 1
          ? res.emailSent
            ? ` Email de bienvenida enviado a ${res.emailSentTo?.join(', ') ?? 'cliente'}.`
            : ` ⚠️ El correo no se pudo enviar${res.emailError ? ` (${res.emailError})` : ''}.`
          : '';
      onDone(baseMsg + emailMsg);
      onOpenChange(false);
      setMotivo('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[RegresarFaseDialog] uncaught', e);
      onError(`No se pudo regresar la venta: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setMotivo('');
      setFaseDestino(1);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Regresar venta a fase anterior</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--text)]/60">Fase destino</label>
            <select
              value={faseDestino}
              onChange={(e) => setFaseDestino(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              disabled={submitting}
            >
              {opciones.map((p) => (
                <option key={p} value={p}>
                  Fase {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text)]/60">Motivo (obligatorio)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              disabled={submitting}
              placeholder="Ej. Cliente solicita corregir CURP del expediente digital."
            />
          </div>
          {faseDestino === 1 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Al regresar a Fase 1 se enviará un email de bienvenida nuevo al cliente con plazo
              fresco de 2 días hábiles.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={submitting || opciones.length === 0}>
            {submitting ? 'Regresando…' : 'Regresar venta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DesasignarDialog({
  ventaId,
  open,
  onOpenChange,
  onDone,
  onError,
}: {
  ventaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (motivo.trim().length < 5) {
      onError('El motivo es obligatorio (mínimo 5 caracteres).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await desasignarVenta(ventaId, motivo);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      const emailMsg = res.emailSent
        ? ` Email enviado a ${res.emailSentTo?.join(', ') ?? 'cliente'}.`
        : ` ⚠️ El correo no se pudo enviar${res.emailError ? ` (${res.emailError})` : ''}.`;
      onDone('Venta desasignada.' + emailMsg);
      onOpenChange(false);
      setMotivo('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[DesasignarDialog] uncaught', e);
      onError(`No se pudo desasignar la venta: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) setMotivo('');
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desasignar venta</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-[var(--text)]/70">
            La venta pasará a estado <b>desasignada</b>. La unidad quedará disponible para nuevas
            solicitudes. El cliente y el vendedor recibirán un correo con el motivo.
          </p>
          <div>
            <label className="mb-1 block text-xs text-[var(--text)]/60">Motivo (obligatorio)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              disabled={submitting}
              placeholder="Ej. Cliente decidió cancelar la compra por motivos personales."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Desasignando…' : 'Desasignar venta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

/**
 * SignatureDialog — diálogo de firma electrónica reusable.
 *
 * Renderiza un resumen de cifras + checkbox de afirmación opcional + comentario
 * opcional y dispara `onSign(comment)`. La UI no decide cuándo aplica un
 * documento — solo dispara la firma; el caller redirige si la respuesta marca
 * `aplicado=true`.
 *
 * Inicialmente lo consume `app/rdb/inventario/levantamientos/[id]/page.tsx`,
 * pero se mantiene en `components/ui/` porque juntas y requisiciones lo
 * reutilizarán a futuro.
 */

import { useState } from 'react';
import { CheckCircle2, FileSignature, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export type SignatureDialogResult = {
  aplicado: boolean;
  firmasActuales: number;
  firmasRequeridas: number;
  movimientosGenerados: number;
};

export type SignatureDialogProps = {
  open: boolean;
  onClose: () => void;
  step: number;
  totalSteps: number;
  roleLabel: 'Contador' | 'Revisor' | 'Autorizador';
  summary: {
    totalLineas: number;
    totalDiferencia: number | null;
    totalLineasFuera: number;
  };
  /**
   * Texto adicional que el usuario debe leer antes de firmar.
   * Use null para no mostrarlo. Por convención, paso=1 incluye
   * "He contado físicamente cada producto declarado".
   */
  requireConfirmText: string | null;
  /**
   * Llama el server action de firma. La UI solo dispara, NO decide
   * el resultado: si la respuesta tiene `aplicado=true`, este callback
   * debe propagar para que el caller redirija al reporte.
   *
   * Devuelve `null` cuando hubo error (que se muestra inline).
   */
  onSign: (comment: string) => Promise<SignatureDialogResult | { error: string }>;
};

const LEGAL_TEXT =
  'Al firmar declaras que has revisado el conteo y que la información es ' +
  'correcta. Esta firma queda registrada con timestamp e IP, y no es reversible.';

const FORMATTER_NUM = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const FORMATTER_CURR = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

export function SignatureDialog({
  open,
  onClose,
  step,
  totalSteps,
  roleLabel,
  summary,
  requireConfirmText,
  onSign,
}: SignatureDialogProps) {
  const [comment, setComment] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresConfirm = requireConfirmText != null;
  const canSubmit = !submitting && (!requiresConfirm || confirmChecked);

  function resetState() {
    setComment('');
    setConfirmChecked(false);
    setError(null);
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    resetState();
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await onSign(comment.trim());
    if ('error' in res) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    // Éxito: limpiamos y cerramos. El caller hace redirect/toast.
    resetState();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="size-4" />
            Firmar como {roleLabel}
          </DialogTitle>
          <DialogDescription>
            Paso {step} de {totalSteps}
          </DialogDescription>
        </DialogHeader>

        {/* Resumen compacto: 3 stats. Tabular-nums + neutral. No usamos
            <KpiCard> aquí para no inflar el dialog visualmente. */}
        <div
          data-slot="signature-summary"
          className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-center text-xs"
        >
          <Stat label="Líneas" value={FORMATTER_NUM.format(summary.totalLineas)} />
          <Stat
            label="Δ Total"
            value={
              summary.totalDiferencia == null ? '—' : FORMATTER_CURR.format(summary.totalDiferencia)
            }
            tone={
              (summary.totalDiferencia ?? 0) < 0
                ? 'destructive'
                : (summary.totalDiferencia ?? 0) > 0
                  ? 'success'
                  : 'default'
            }
          />
          <Stat
            label="Fuera de tol."
            value={FORMATTER_NUM.format(summary.totalLineasFuera)}
            tone={summary.totalLineasFuera > 0 ? 'warning' : 'default'}
          />
        </div>

        <p className="text-xs text-muted-foreground">{LEGAL_TEXT}</p>

        {requiresConfirm && (
          <label className="flex items-start gap-2 rounded-md border bg-card p-2 text-xs">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 size-3.5 rounded border-input accent-primary"
              data-testid="signature-confirm-checkbox"
            />
            <span>{requireConfirmText}</span>
          </label>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="signature-comment">
            Comentario (opcional)
          </label>
          <Textarea
            id="signature-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={submitting}
            rows={2}
            placeholder="Notas, observaciones o aclaraciones."
            className="text-sm"
          />
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="signature-confirm-button"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Confirmar firma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const toneClass =
    tone === 'destructive'
      ? 'text-destructive'
      : tone === 'success'
        ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'warning'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-foreground';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

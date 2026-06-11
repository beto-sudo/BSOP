'use client';

/**
 * EstadoCuentaUploadDrawer — captura del estado de cuenta mensual de una
 * cuenta bancaria DILESA (iniciativa `conciliacion-bancaria` v0).
 *
 * Flujo: eliges cuenta + mes → seleccionas el PDF (se sube al bucket
 * `adjuntos` al momento) → "Extraer datos del PDF" llama a Claude vía
 * `/api/dilesa/estados-cuenta/extract` y prellenan los totales de carátula →
 * revisas/ajustas → guardar (server action `guardarEstadoCuenta`, upsert por
 * cuenta+mes).
 *
 * La captura 100% manual también funciona: el PDF y la extracción son
 * opcionales — los campos se pueden teclear directo del estado impreso.
 *
 * Checks en vivo:
 * - Checksum: SI + depósitos − retiros = SF (banner; el action lo re-valida).
 * - Match de cuenta: si la CLABE/cuenta extraída no corresponde a la cuenta
 *   elegida, banner de advertencia (PDF equivocado es el error típico).
 */

import { useEffect, useMemo, useState } from 'react';
import { FileUp, Save, Sparkles } from 'lucide-react';
import { z } from 'zod';

import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Form, FormActions, FormField, FormRow, useZodForm } from '@/components/forms';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { formatCurrency } from '@/lib/format';
import {
  checksumDiff,
  cuentaMatchExtraccion,
  TOLERANCIA,
} from '@/components/dilesa/estados-cuenta-utils';
import type { EstadoCuentaRow } from '@/components/dilesa/estados-cuenta-utils';
import type { CuentaSaldoRow } from '@/components/dilesa/saldos-bancos-utils';
import type { ExtraccionEstadoCuenta } from '@/lib/dilesa/estados-cuenta/extraer';
import { guardarEstadoCuenta } from '@/app/dilesa/saldos-bancos/estados/actions';

const BUCKET = 'adjuntos';

const montoStr = (campo: string) =>
  z
    .string()
    .min(1, `Indica ${campo}`)
    .refine((v) => Number.isFinite(Number(v)), `${campo} debe ser un número válido`);

const montoOpcional = z
  .string()
  .default('')
  .refine((v) => v === '' || Number.isFinite(Number(v)), 'Debe ser un número válido');

const EstadoSchema = z.object({
  cuentaId: z.string().min(1, 'Elige la cuenta'),
  periodo: z.string().min(7, 'Indica el mes del periodo'),
  fechaCorte: z.string().min(1, 'Indica la fecha de corte'),
  saldoInicial: montoStr('el saldo inicial'),
  depositos: montoStr('el total de depósitos'),
  retiros: montoStr('el total de retiros'),
  saldoFinal: montoStr('el saldo final'),
  saldoInversiones: montoOpcional,
  numAbonos: montoOpcional,
  numCargos: montoOpcional,
  comisiones: montoOpcional,
  notas: z.string().default(''),
});

type EstadoValues = z.infer<typeof EstadoSchema>;

/** Último día del mes `YYYY-MM` como `YYYY-MM-DD` (date-only, sin TZ). */
function ultimoDiaDelMes(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number) as [number, number];
  if (!y || !m) return '';
  // Día 0 del mes siguiente = último día de este mes. UTC fijo — date-only.
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yyyyMM}-${String(d).padStart(2, '0')}`;
}

export type EstadoCuentaUploadDrawerProps = {
  cuentas: CuentaSaldoRow[];
  /** Estado existente al reabrir para re-captura; null = alta nueva. */
  estado: EstadoCuentaRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

export function EstadoCuentaUploadDrawer({
  cuentas,
  estado,
  open,
  onOpenChange,
  onDone,
}: EstadoCuentaUploadDrawerProps) {
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoPath, setArchivoPath] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [extrayendo, setExtrayendo] = useState(false);
  const [extraccion, setExtraccion] = useState<ExtraccionEstadoCuenta | null>(null);

  const form = useZodForm({
    schema: EstadoSchema,
    defaultValues: {
      cuentaId: '',
      periodo: '',
      fechaCorte: '',
      saldoInicial: '',
      depositos: '',
      retiros: '',
      saldoFinal: '',
      saldoInversiones: '0',
      numAbonos: '',
      numCargos: '',
      comisiones: '',
      notas: '',
    },
  });

  // Reset al abrir: alta limpia o prellenado con el estado a re-capturar.
  useEffect(() => {
    if (!open) return;
    setArchivo(null);
    setArchivoPath(estado?.archivoPath ?? null);
    setExtraccion(null);
    if (estado) {
      form.reset({
        cuentaId: estado.cuentaId,
        periodo: estado.periodo.slice(0, 7),
        fechaCorte: estado.fechaCorte,
        saldoInicial: String(estado.saldoInicial),
        depositos: String(estado.depositos),
        retiros: String(estado.retiros),
        saldoFinal: String(estado.saldoFinal),
        saldoInversiones: String(estado.saldoInversiones),
        numAbonos: estado.numAbonos != null ? String(estado.numAbonos) : '',
        numCargos: estado.numCargos != null ? String(estado.numCargos) : '',
        comisiones: estado.comisiones != null ? String(estado.comisiones) : '',
        notas: estado.notas ?? '',
      });
    } else {
      form.reset({
        cuentaId: '',
        periodo: '',
        fechaCorte: '',
        saldoInicial: '',
        depositos: '',
        retiros: '',
        saldoFinal: '',
        saldoInversiones: '0',
        numAbonos: '',
        numCargos: '',
        comisiones: '',
        notas: '',
      });
    }
    // form es estable; estado?.id gobierna el prellenado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, estado?.id]);

  const valores = form.watch();

  // Autollenar fecha de corte con el último día del mes elegido (editable —
  // algunos cortes no caen exactamente en fin de mes).
  useEffect(() => {
    if (valores.periodo && !valores.fechaCorte) {
      form.setValue('fechaCorte', ultimoDiaDelMes(valores.periodo));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores.periodo]);

  // ── Checks en vivo ──────────────────────────────────────────────────────────
  const checksum = useMemo(() => {
    const si = Number(valores.saldoInicial);
    const dep = Number(valores.depositos);
    const ret = Number(valores.retiros);
    const sf = Number(valores.saldoFinal);
    if (![si, dep, ret, sf].every(Number.isFinite)) return null;
    if (
      [valores.saldoInicial, valores.depositos, valores.retiros, valores.saldoFinal].some(
        (v) => v === ''
      )
    ) {
      return null;
    }
    return checksumDiff({ saldoInicial: si, depositos: dep, retiros: ret, saldoFinal: sf });
  }, [valores.saldoInicial, valores.depositos, valores.retiros, valores.saldoFinal]);

  const matchCuenta = useMemo(() => {
    if (!extraccion || !valores.cuentaId) return null;
    const cuenta = cuentas.find((c) => c.cuentaId === valores.cuentaId);
    if (!cuenta) return null;
    return cuentaMatchExtraccion(
      {
        clabe: cuenta.ficha.clabe,
        numeroCuenta: cuenta.ficha.numeroCuenta,
        contrato: cuenta.ficha.contrato,
      },
      extraccion
    );
  }, [extraccion, valores.cuentaId, cuentas]);

  // ── Subida del PDF al seleccionar ───────────────────────────────────────────
  const onArchivoChange = async (file: File | null) => {
    setArchivo(file);
    setExtraccion(null);
    if (!file) {
      setArchivoPath(null);
      return;
    }
    const cuentaId = form.getValues('cuentaId');
    if (!cuentaId) {
      toast.add({ title: 'Elige primero la cuenta', type: 'error' });
      setArchivo(null);
      return;
    }
    setSubiendo(true);
    const sb = createSupabaseBrowserClient();
    const path = buildAdjuntoPath({
      empresa: 'dilesa',
      entidad: 'estados_cuenta',
      entidadId: cuentaId,
      filename: file.name,
    });
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
    setSubiendo(false);
    if (error) {
      toast.add({
        title: 'No se pudo subir el PDF',
        description: getSupabaseErrorMessage(error, 'Reintenta.'),
        type: 'error',
      });
      setArchivo(null);
      setArchivoPath(null);
      return;
    }
    setArchivoPath(path);
    toast.add({ title: 'PDF subido', description: file.name, type: 'success' });
  };

  // ── Extracción IA ───────────────────────────────────────────────────────────
  const extraer = async () => {
    if (!archivoPath) return;
    setExtrayendo(true);
    try {
      const res = await fetch('/api/dilesa/estados-cuenta/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: archivoPath }),
      });
      const json = (await res.json()) as {
        extraccion?: ExtraccionEstadoCuenta;
        cuentaSugeridaId?: string | null;
        error?: string;
      };
      if (!res.ok || !json.extraccion) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const ex = json.extraccion;
      setExtraccion(ex);

      // Prellenar — el humano revisa y confirma (D4 del planning doc).
      if (ex.periodo_inicio) form.setValue('periodo', ex.periodo_inicio.slice(0, 7));
      if (ex.fecha_corte) form.setValue('fechaCorte', ex.fecha_corte);
      form.setValue('saldoInicial', String(ex.saldo_inicial));
      form.setValue('depositos', String(ex.depositos));
      form.setValue('retiros', String(ex.retiros));
      form.setValue('saldoFinal', String(ex.saldo_final));
      form.setValue('saldoInversiones', String(ex.saldo_inversiones));
      if (ex.num_abonos > 0) form.setValue('numAbonos', String(Math.round(ex.num_abonos)));
      if (ex.num_cargos > 0) form.setValue('numCargos', String(Math.round(ex.num_cargos)));
      if (ex.comisiones > 0) form.setValue('comisiones', String(ex.comisiones));

      if (json.cuentaSugeridaId && json.cuentaSugeridaId !== form.getValues('cuentaId')) {
        const sugerida = cuentas.find((c) => c.cuentaId === json.cuentaSugeridaId);
        toast.add({
          title: 'Ojo con la cuenta',
          description: `El PDF parece ser de "${sugerida?.nombre ?? 'otra cuenta'}".`,
          type: 'info',
        });
      } else {
        toast.add({ title: 'Carátula extraída', description: 'Revisa y guarda.', type: 'success' });
      }
    } catch (e) {
      toast.add({
        title: 'La extracción falló',
        description: e instanceof Error ? e.message : 'Puedes capturar los totales a mano.',
        type: 'error',
      });
    } finally {
      setExtrayendo(false);
    }
  };

  // ── Guardar ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (values: EstadoValues) => {
    const result = await guardarEstadoCuenta({
      id: estado?.id,
      cuentaId: values.cuentaId,
      periodo: values.periodo,
      fechaCorte: values.fechaCorte,
      saldoInicial: values.saldoInicial,
      depositos: values.depositos,
      retiros: values.retiros,
      saldoFinal: values.saldoFinal,
      saldoInversiones: values.saldoInversiones || '0',
      numAbonos: values.numAbonos || undefined,
      numCargos: values.numCargos || undefined,
      comisiones: values.comisiones || undefined,
      archivoPath: archivoPath ?? undefined,
      extraccion: extraccion ?? undefined,
      notas: values.notas || undefined,
    });

    if (!result.ok) {
      toast.add({ title: 'No se pudo guardar', description: result.error, type: 'error' });
      return;
    }
    toast.add({ title: 'Estado de cuenta guardado', type: 'success' });
    onOpenChange(false);
    onDone();
  };

  const moneda = cuentas.find((c) => c.cuentaId === valores.cuentaId)?.moneda ?? 'MXN';

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={estado ? `Re-capturar · ${estado.cuentaNombre}` : 'Subir estado de cuenta'}
      description="Totales de carátula del mes — el PDF queda archivado en el expediente de la cuenta"
    >
      <DetailDrawerContent>
        <Form form={form} onSubmit={handleSubmit} className="space-y-5">
          <FormRow cols={2}>
            <FormField name="cuentaId" label="Cuenta bancaria" required>
              {(field) => (
                <select
                  {...field}
                  id={field.id}
                  disabled={estado != null}
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 text-sm text-[var(--text)] disabled:opacity-60"
                >
                  <option value="">Elige la cuenta…</option>
                  {cuentas.map((c) => (
                    <option key={c.cuentaId} value={c.cuentaId}>
                      {c.nombre} · {c.moneda}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField name="periodo" label="Mes del periodo" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="month"
                  disabled={estado != null}
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          {/* ── PDF + extracción ── */}
          <div className="space-y-2 rounded-xl border border-dashed border-[var(--border)] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--accent)]">
                <FileUp className="h-4 w-4" />
                {archivo ? archivo.name : archivoPath ? 'Reemplazar PDF' : 'Seleccionar PDF…'}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => void onArchivoChange(e.target.files?.[0] ?? null)}
                />
              </label>
              {subiendo ? <span className="text-xs text-[var(--text)]/50">Subiendo…</span> : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!archivoPath || subiendo || extrayendo}
                onClick={() => void extraer()}
                className="ml-auto gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {extrayendo ? 'Extrayendo… (~1 min)' : 'Extraer datos del PDF'}
              </Button>
            </div>
            <p className="text-xs text-[var(--text)]/50">
              La IA lee la carátula y prellena los totales; tú revisas y confirmas. También puedes
              capturar a mano sin PDF.
            </p>
            {archivoPath && !archivo && estado?.archivoPath === archivoPath ? (
              <p className="text-xs text-[var(--text)]/60">PDF ya archivado para este mes.</p>
            ) : null}
          </div>

          {/* ── Banners de checks ── */}
          {matchCuenta === false ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
              La CLABE/cuenta del PDF no corresponde a la cuenta elegida. Verifica que el archivo
              sea el correcto.
            </div>
          ) : null}
          {checksum != null && Math.abs(checksum) > TOLERANCIA ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
              No cuadra: saldo inicial + depósitos − retiros difiere del saldo final por{' '}
              {formatCurrency(checksum, { currency: moneda })}. Revisa contra el PDF.
            </div>
          ) : null}

          <FormRow cols={2}>
            <FormField name="fechaCorte" label="Fecha de corte" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="date"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
            <FormField name="comisiones" label="Comisiones del periodo">
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <FormRow cols={2}>
            <FormField name="saldoInicial" label={`Saldo inicial (${moneda})`} required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
            <FormField name="saldoFinal" label={`Saldo final al corte (${moneda})`} required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <FormRow cols={2}>
            <FormField name="depositos" label="Depósitos / abonos (+)" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
            <FormField name="retiros" label="Retiros / cargos (−)" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <FormRow cols={3}>
            <FormField
              name="saldoInversiones"
              label="Inversiones al corte"
              description="Reporto/cartera (Monex)"
            >
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
            <FormField name="numAbonos" label="# Abonos">
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  placeholder="—"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
            <FormField name="numCargos" label="# Cargos">
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  placeholder="—"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <FormField name="notas" label="Notas">
            {(field) => (
              <Textarea
                {...field}
                id={field.id}
                rows={2}
                placeholder="Opcional — observaciones del mes, aclaraciones pendientes, etc."
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>

          <FormActions
            cancelLabel="Cancelar"
            submitLabel={estado ? 'Guardar cambios' : 'Guardar estado de cuenta'}
            submittingLabel="Guardando..."
            submitIcon={<Save className="h-4 w-4" />}
            onCancel={() => onOpenChange(false)}
            stretch
          />
        </Form>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

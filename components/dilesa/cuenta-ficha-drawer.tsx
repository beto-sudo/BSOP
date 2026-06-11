'use client';

/**
 * CuentaFichaDrawer — ficha completa de una cuenta bancaria (iniciativa
 * `conciliacion-bancaria` Fase A): banco, producto, número de cuenta, CLABE
 * (copiable), número de cliente, contrato, sucursal, teléfono, contacto,
 * titular y notas. Los datos vienen de `erp.cuentas_bancarias` (capturados
 * desde los estados de cuenta).
 */

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { DetailDrawer, DetailDrawerContent, DetailDrawerSection } from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type { CuentaSaldoRow } from '@/components/dilesa/saldos-bancos-utils';

function FichaRow({
  label,
  value,
  copiable = false,
}: {
  label: string;
  value: string | null;
  copiable?: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copiar = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.add({ title: `${label} copiado`, type: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.add({ title: 'No se pudo copiar', type: 'error' });
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-sm text-[var(--text)]/60">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={`truncate text-sm font-medium text-[var(--text)] ${copiable ? 'tabular-nums' : ''}`}
        >
          {value ?? '—'}
        </span>
        {copiable && value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void copiar()}
            aria-label={`Copiar ${label}`}
            className="h-7 w-7 shrink-0 p-0"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
      </span>
    </div>
  );
}

export type CuentaFichaDrawerProps = {
  cuenta: CuentaSaldoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CuentaFichaDrawer({ cuenta, open, onOpenChange }: CuentaFichaDrawerProps) {
  const f = cuenta?.ficha;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={cuenta ? `Ficha · ${cuenta.nombre}` : 'Ficha de cuenta'}
      description={cuenta ? (cuenta.banco ?? undefined) : undefined}
    >
      <DetailDrawerContent>
        {cuenta && f ? (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Badge tone={cuenta.moneda === 'USD' ? 'info' : 'neutral'}>{cuenta.moneda}</Badge>
              {f.tipo ? <Badge tone="neutral">{f.tipo}</Badge> : null}
              {f.producto ? <Badge tone="info">{f.producto}</Badge> : null}
            </div>

            <DetailDrawerSection title="Identificadores">
              <div className="divide-y divide-[var(--border)]">
                <FichaRow label="Número de cuenta" value={f.numeroCuenta} copiable />
                <FichaRow label="CLABE" value={f.clabe} copiable />
                <FichaRow label="Número de cliente" value={f.numeroCliente} copiable />
                <FichaRow label="Contrato" value={f.contrato} copiable />
              </div>
            </DetailDrawerSection>

            <DetailDrawerSection title="Banco y contacto">
              <div className="divide-y divide-[var(--border)]">
                <FichaRow label="Titular" value={f.titular} />
                <FichaRow label="Sucursal" value={f.sucursal} />
                <FichaRow label="Teléfono" value={f.telefono} />
                <FichaRow label="Contacto" value={f.contacto} />
              </div>
            </DetailDrawerSection>

            {f.notas ? (
              <DetailDrawerSection title="Notas">
                <p className="whitespace-pre-wrap text-sm text-[var(--text)]/80">{f.notas}</p>
              </DetailDrawerSection>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--text)]/50">Sin datos de ficha.</p>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

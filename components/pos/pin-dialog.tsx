'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NumPad } from '@/components/ui/num-pad';

/**
 * Diálogo de PIN de operador (ADR-056): identifica a la persona real en una
 * tablet compartida antes de cada acción sensible. El PIN viaja a la RPC y
 * se valida contra el hash en `rdb.pos_operadores` — nunca se guarda local.
 */
export function PinDialog({
  open,
  title,
  subtitle,
  onSubmit,
  onClose,
  busy,
  error,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onSubmit: (pin: string) => void;
  onClose: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* key={open}: remonta el cuerpo en cada apertura — el PIN nunca
            persiste entre acciones (equivalente al reset, sin setState en efecto). */}
        <PinBody
          key={String(open)}
          subtitle={subtitle}
          onSubmit={onSubmit}
          busy={busy}
          error={error}
        />
      </DialogContent>
    </Dialog>
  );
}

function PinBody({
  subtitle,
  onSubmit,
  busy,
  error,
}: {
  subtitle?: string;
  onSubmit: (pin: string) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [pin, setPin] = useState('');
  return (
    <>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div
        className="mx-auto text-center text-3xl tracking-[0.5em] font-mono h-10"
        aria-label="PIN"
      >
        {pin ? '•'.repeat(pin.length) : <span className="text-muted-foreground/40">····</span>}
      </div>
      <NumPad
        value={pin}
        onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
        onSubmit={() => pin.length >= 4 && onSubmit(pin)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        className="w-full h-12 text-base"
        disabled={pin.length < 4 || busy}
        onClick={() => onSubmit(pin)}
      >
        {busy ? 'Validando…' : 'Confirmar'}
      </Button>
    </>
  );
}

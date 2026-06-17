'use client';

/**
 * DestinosCatalogoDialog — administración del catálogo de destinos del
 * portafolio (`dilesa.portafolio_destinos`). Iniciativa
 * `dilesa-portafolio-destinos` · Sprint 2.
 *
 * Lista los destinos (incluye inactivos), permite editar label/flags/orden,
 * activar/desactivar y agregar nuevos — sin migración. Las escrituras pasan por
 * las server actions (gated a admin/Dirección); el slug se deriva del label al
 * crear y es inmutable. El caller monta el dialog solo a admin/Dirección.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { crearDestino, actualizarDestino } from '@/app/dilesa/portafolio/actions';

type DestinoRow = {
  id: string;
  slug: string;
  label: string;
  cuenta_renta: boolean;
  cuenta_venta: boolean;
  orden: number;
  activo: boolean;
};

export function DestinosCatalogoDialog({
  empresaId,
  open,
  onOpenChange,
}: {
  empresaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [destinos, setDestinos] = useState<DestinoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDestinos = useCallback(
    () =>
      createSupabaseBrowserClient()
        .schema('dilesa')
        .from('portafolio_destinos')
        .select('id, slug, label, cuenta_renta, cuenta_venta, orden, activo')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('orden'),
    [empresaId]
  );

  // Refresh manual (desde los handlers de guardar/crear) — setState síncrono
  // está bien fuera de un effect.
  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchDestinos();
    if (e) {
      setError(getSupabaseErrorMessage(e, 'No se pudieron cargar los destinos.'));
      setDestinos([]);
    } else {
      setDestinos((data ?? []) as DestinoRow[]);
    }
    setLoading(false);
  }, [fetchDestinos]);

  // Carga al abrir: los setState van tras el await (no síncronos dentro del effect).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchDestinos().then(({ data, error: e }) => {
      if (!alive) return;
      if (e) {
        setError(getSupabaseErrorMessage(e, 'No se pudieron cargar los destinos.'));
        setDestinos([]);
      } else {
        setDestinos((data ?? []) as DestinoRow[]);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, fetchDestinos]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Destinos del portafolio</DialogTitle>
          <DialogDescription>
            Cómo se usa un activo fuera del programa de venta de vivienda. Agrega o ajusta destinos
            sin tocar el código.
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="grid gap-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-1 text-xs text-[var(--text)]/50">
            <span>Destino</span>
            <span className="w-12 text-center">Renta</span>
            <span className="w-12 text-center">Venta</span>
            <span className="w-14 text-center">Orden</span>
            <span className="w-20 text-center">Acción</span>
          </div>
          {loading && destinos.length === 0 ? (
            <p className="px-1 py-2 text-sm text-[var(--text)]/60">Cargando…</p>
          ) : (
            destinos.map((d) => (
              <DestinoFila key={d.id} destino={d} onSaved={() => void cargar()} />
            ))
          )}
        </div>

        <AgregarDestino onCreated={() => void cargar()} />
      </DialogContent>
    </Dialog>
  );
}

function DestinoFila({ destino, onSaved }: { destino: DestinoRow; onSaved: () => void }) {
  const [label, setLabel] = useState(destino.label);
  const [cuentaRenta, setCuentaRenta] = useState(destino.cuenta_renta);
  const [cuentaVenta, setCuentaVenta] = useState(destino.cuenta_venta);
  const [orden, setOrden] = useState(String(destino.orden));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    label !== destino.label ||
    cuentaRenta !== destino.cuenta_renta ||
    cuentaVenta !== destino.cuenta_venta ||
    orden !== String(destino.orden);

  const guardar = async (patch: Parameters<typeof actualizarDestino>[1]) => {
    setBusy(true);
    setErr(null);
    const r = await actualizarDestino(destino.id, patch);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    onSaved();
  };

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          className={destino.activo ? '' : 'opacity-50'}
        />
        <code className="shrink-0 text-[10px] text-[var(--text)]/40">{destino.slug}</code>
      </div>
      <input
        type="checkbox"
        checked={cuentaRenta}
        onChange={(e) => setCuentaRenta(e.currentTarget.checked)}
        className="mx-auto h-4 w-4 accent-[var(--accent)]"
        aria-label="Cuenta como renta"
      />
      <input
        type="checkbox"
        checked={cuentaVenta}
        onChange={(e) => setCuentaVenta(e.currentTarget.checked)}
        className="mx-auto h-4 w-4 accent-[var(--accent)]"
        aria-label="Cuenta como venta"
      />
      <Input
        type="number"
        value={orden}
        onChange={(e) => setOrden(e.currentTarget.value)}
        className="w-14 text-center"
      />
      <div className="flex w-20 items-center justify-end gap-1">
        {dirty ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void guardar({
                label,
                cuentaRenta,
                cuentaVenta,
                orden: Number(orden),
              })
            }
          >
            Guardar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void guardar({ activo: !destino.activo })}
          >
            {destino.activo ? 'Desactivar' : 'Activar'}
          </Button>
        )}
      </div>
      {err ? <p className="col-span-5 text-xs text-[var(--danger)]">{err}</p> : null}
      {!destino.activo ? (
        <span className="col-span-5 -mt-1">
          <Badge tone="neutral">Inactivo</Badge>
        </span>
      ) : null}
    </div>
  );
}

function AgregarDestino({ onCreated }: { onCreated: () => void }) {
  const [label, setLabel] = useState('');
  const [cuentaRenta, setCuentaRenta] = useState(false);
  const [cuentaVenta, setCuentaVenta] = useState(false);
  const [orden, setOrden] = useState('100');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const agregar = async () => {
    setBusy(true);
    setErr(null);
    const r = await crearDestino({
      label,
      cuentaRenta,
      cuentaVenta,
      orden: Number(orden),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setLabel('');
    setCuentaRenta(false);
    setCuentaVenta(false);
    setOrden('100');
    onCreated();
  };

  return (
    <div className="mt-2 border-t border-[var(--border)] pt-3">
      <p className="mb-2 text-xs font-medium text-[var(--text)]/70">Agregar destino</p>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          placeholder="Ej. Renta de temporada"
        />
        <input
          type="checkbox"
          checked={cuentaRenta}
          onChange={(e) => setCuentaRenta(e.currentTarget.checked)}
          className="mx-auto h-4 w-4 accent-[var(--accent)]"
          aria-label="Cuenta como renta"
        />
        <input
          type="checkbox"
          checked={cuentaVenta}
          onChange={(e) => setCuentaVenta(e.currentTarget.checked)}
          className="mx-auto h-4 w-4 accent-[var(--accent)]"
          aria-label="Cuenta como venta"
        />
        <Input
          type="number"
          value={orden}
          onChange={(e) => setOrden(e.currentTarget.value)}
          className="w-14 text-center"
        />
        <Button size="sm" disabled={busy || !label.trim()} onClick={() => void agregar()}>
          Agregar
        </Button>
      </div>
      {err ? <p className="mt-1 text-xs text-[var(--danger)]">{err}</p> : null}
    </div>
  );
}

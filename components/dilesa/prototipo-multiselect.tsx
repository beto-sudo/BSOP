'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern consistente con el resto del sprint dilesa-1.
 */

/**
 * Lista editable de prototipos de referencia para un anteproyecto.
 *
 * Muestra los prototipos ya ligados al anteproyecto vía
 * `dilesa.anteproyectos_prototipos_referencia` como cards pequeñas y
 * permite agregar/quitar por el cliente directo (sin endpoint API —
 * la RLS de la tabla M:N ya gobierna).
 *
 * Cada cambio dispara `onChange()` para que el contenedor refresque el
 * panel financiero (la vista `v_anteproyectos_analisis` recalcula al
 * vuelo a partir de esta tabla).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { DILESA_EMPRESA_ID, formatCurrency } from '@/lib/dilesa-constants';

type Prototipo = {
  id: string;
  nombre: string;
  codigo: string | null;
  valor_comercial: number | null;
  costo_total_unitario: number | null;
};

type Referencia = {
  id: string;
  prototipo_id: string;
  prototipo: Prototipo | null;
};

export function PrototipoMultiselect({
  anteproyectoId,
  onChange,
}: {
  anteproyectoId: string;
  onChange?: () => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [catalogo, setCatalogo] = useState<Prototipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const refsIds = useMemo(() => new Set(referencias.map((r) => r.prototipo_id)), [referencias]);

  const load = useCallback(async () => {
    const [refRes, protoRes] = await Promise.all([
      supabase
        .schema('dilesa')
        .from('anteproyectos_prototipos_referencia')
        .select(
          'id, prototipo_id, prototipo:prototipo_id(id, nombre, codigo, valor_comercial, costo_total_unitario)'
        )
        .eq('anteproyecto_id', anteproyectoId),
      supabase
        .schema('dilesa')
        .from('prototipos')
        .select('id, nombre, codigo, valor_comercial, costo_total_unitario')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('nombre', { ascending: true }),
    ]);
    setReferencias(((refRes.data ?? []) as unknown as Referencia[]) ?? []);
    setCatalogo((protoRes.data ?? []) as Prototipo[]);
  }, [supabase, anteproyectoId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const init = async () => {
      await load();
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const addReferencia = async (prototipoId: string) => {
    setBusy(prototipoId);
    const { error } = await supabase
      .schema('dilesa')
      .from('anteproyectos_prototipos_referencia')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        anteproyecto_id: anteproyectoId,
        prototipo_id: prototipoId,
      });
    setBusy(null);
    setOpen(false);
    if (error) {
      // UK violation → ya estaba; igual recargamos para sincronizar.
      if (!error.message.includes('duplicate') && !error.message.includes('23505')) {
        alert(`Error al agregar prototipo: ${error.message}`);
      }
    }
    await load();
    onChange?.();
  };

  const removeReferencia = async (id: string) => {
    setBusy(id);
    const { error } = await supabase
      .schema('dilesa')
      .from('anteproyectos_prototipos_referencia')
      .delete()
      .eq('id', id);
    setBusy(null);
    if (error) {
      alert(`Error al quitar prototipo: ${error.message}`);
      return;
    }
    await load();
    onChange?.();
  };

  const disponibles = useMemo(
    () => catalogo.filter((p) => !refsIds.has(p.id)),
    [catalogo, refsIds]
  );

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Prototipos de referencia
        </h2>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={(props) => (
              <Button
                {...props}
                size="sm"
                variant="outline"
                type="button"
                disabled={disponibles.length === 0}
              >
                <Plus className="size-3.5" />
                Agregar
              </Button>
            )}
          />
          <PopoverContent align="end" className="w-80 p-0">
            <Command>
              <CommandInput placeholder="Buscar prototipo…" />
              <CommandList>
                <CommandEmpty>Sin prototipos disponibles</CommandEmpty>
                <CommandGroup>
                  {disponibles.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      keywords={[p.nombre, p.codigo ?? '']}
                      onSelect={() => void addReferencia(p.id)}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{p.nombre}</span>
                        <span className="truncate text-xs text-[var(--text)]/55">
                          {p.codigo ? `${p.codigo} · ` : ''}
                          {formatCurrency(p.valor_comercial, { compact: true })}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-3 space-y-2">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : referencias.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--text)]/55">
            Sin prototipos ligados. Agrega al menos uno para calcular utilidad y margen proyectado.
          </p>
        ) : (
          referencias.map((ref) => {
            const p = ref.prototipo;
            return (
              <div
                key={ref.id}
                className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--text)]">
                    {p?.nombre ?? '(prototipo eliminado)'}
                  </div>
                  {p?.codigo ? (
                    <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--text)]/45">
                      {p.codigo}
                    </div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--text)]/60">
                    <span>
                      Valor: {formatCurrency(p?.valor_comercial ?? null, { compact: true })}
                    </span>
                    <span>
                      Costo: {formatCurrency(p?.costo_total_unitario ?? null, { compact: true })}
                    </span>
                  </div>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  type="button"
                  aria-label={`Quitar ${p?.nombre ?? 'prototipo'}`}
                  onClick={() => void removeReferencia(ref.id)}
                  disabled={busy === ref.id}
                >
                  {busy === ref.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5 text-red-400" />
                  )}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

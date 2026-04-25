'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Same data-sync pattern used elsewhere in /rdb/inventario (see page.tsx). The
 * loadMeta() function flips loading flags around an awaited fetch — refactoring
 * to avoid the rule changes render semantics without measurable benefit.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { TolerancePanel, type ToleranciaConfig } from '@/components/inventario/tolerance-panel';
import { crearLevantamiento, iniciarCaptura, type CrearLevantamientoInput } from '../actions';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

type Almacen = { id: string; nombre: string };

export default function NuevoLevantamientoPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.inventario" write>
      <NuevoLevantamientoForm />
    </RequireAccess>
  );
}

function todayISO(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function NuevoLevantamientoForm() {
  const router = useRouter();
  const toast = useToast();

  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [tolerancia, setTolerancia] = useState<ToleranciaConfig | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [almacenId, setAlmacenId] = useState<string>('');
  const [fechaProgramada, setFechaProgramada] = useState<string>(todayISO);
  const [notas, setNotas] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [overridePctStr, setOverridePctStr] = useState<string>('');
  const [overrideMontoStr, setOverrideMontoStr] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);
    const supabase = createSupabaseBrowserClient();

    const [almacenesRes, toleranciaRes] = await Promise.all([
      supabase
        .schema('erp')
        .from('almacenes')
        .select('id, nombre')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('activo', true)
        .order('nombre'),
      supabase.schema('erp').rpc('fn_get_empresa_tolerancia', { p_empresa_id: RDB_EMPRESA_ID }),
    ]);

    if (almacenesRes.error) {
      setLoadError(almacenesRes.error.message);
      setLoadingMeta(false);
      return;
    }
    if (toleranciaRes.error) {
      setLoadError(toleranciaRes.error.message);
      setLoadingMeta(false);
      return;
    }

    const list = almacenesRes.data ?? [];
    setAlmacenes(list);
    if (list.length === 1) setAlmacenId(list[0].id);

    const tol = toleranciaRes.data?.[0];
    if (tol) {
      setTolerancia({
        tolerancia_pct: Number(tol.tolerancia_pct),
        tolerancia_monto: Number(tol.tolerancia_monto),
        firmas_requeridas: Number(tol.firmas_requeridas),
      });
    }
    setLoadingMeta(false);
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const buildInput = (): CrearLevantamientoInput | string => {
    if (!almacenId) return 'Selecciona un almacén.';
    if (!fechaProgramada) return 'La fecha programada es requerida.';

    const overridePct = overridePctStr.trim() === '' ? null : Number(overridePctStr);
    const overrideMonto = overrideMontoStr.trim() === '' ? null : Number(overrideMontoStr);

    if (overridePct != null && (Number.isNaN(overridePct) || overridePct < 0)) {
      return 'Override de % de tolerancia inválido.';
    }
    if (overrideMonto != null && (Number.isNaN(overrideMonto) || overrideMonto < 0)) {
      return 'Override de $ de tolerancia inválido.';
    }

    return {
      almacen_id: almacenId,
      fecha_programada: fechaProgramada,
      notas: notas.trim() || undefined,
      tolerancia_pct_override: overridePct,
      tolerancia_monto_override: overrideMonto,
    };
  };

  const handleSubmit = async (intent: 'borrador' | 'capturar') => {
    const built = buildInput();
    if (typeof built === 'string') {
      toast.add({ title: built, type: 'error' });
      return;
    }

    setSubmitting(true);
    const result = await crearLevantamiento(built);
    if (!result.ok) {
      setSubmitting(false);
      toast.add({
        title: 'No se pudo crear el levantamiento',
        description: result.error,
        type: 'error',
      });
      return;
    }

    if (intent === 'borrador') {
      toast.add({
        title: 'Borrador creado',
        description: result.data.folio ? `Folio ${result.data.folio}` : undefined,
        type: 'success',
      });
      router.push('/rdb/inventario/levantamientos');
      return;
    }

    const startRes = await iniciarCaptura(result.data.id);
    setSubmitting(false);
    if (!startRes.ok) {
      toast.add({
        title: 'Levantamiento creado, pero no se pudo iniciar la captura',
        description: startRes.error,
        type: 'error',
      });
      router.push('/rdb/inventario/levantamientos');
      return;
    }

    toast.add({
      title: 'Captura iniciada',
      description: `${startRes.data.lineasSembradas} producto${
        startRes.data.lineasSembradas === 1 ? '' : 's'
      } sembrado${startRes.data.lineasSembradas === 1 ? '' : 's'}.`,
      type: 'success',
    });
    router.push('/rdb/inventario/levantamientos');
  };

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <Link
        href="/rdb/inventario/levantamientos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver a levantamientos
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo levantamiento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El folio se asigna automáticamente. El contador queda registrado al iniciar la captura.
        </p>
      </header>

      {loadError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {loadingMeta ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit('borrador');
          }}
          className="space-y-5"
        >
          <Field
            label="Almacén"
            htmlFor="almacen"
            help={
              almacenes.length === 1 ? 'Pre-llenado: la empresa tiene un solo almacén.' : undefined
            }
          >
            {almacenes.length === 1 ? (
              <Input id="almacen" value={almacenes[0].nombre} readOnly className="bg-muted/40" />
            ) : (
              <Combobox
                id="almacen"
                value={almacenId || null}
                onChange={setAlmacenId}
                options={almacenes.map((a) => ({ value: a.id, label: a.nombre }))}
                placeholder="Selecciona almacén…"
              />
            )}
          </Field>

          <Field label="Fecha programada" htmlFor="fecha">
            <Input
              id="fecha"
              type="date"
              value={fechaProgramada}
              onChange={(e) => setFechaProgramada(e.target.value)}
            />
          </Field>

          <Field label="Notas (opcional)" htmlFor="notas">
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Contexto, motivo, observaciones…"
              rows={3}
            />
          </Field>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              Opciones avanzadas
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 rounded-lg border bg-muted/20 p-4">
                {tolerancia && (
                  <TolerancePanel
                    config={tolerancia}
                    overridePct={overridePctStr.trim() === '' ? null : Number(overridePctStr)}
                    overrideMonto={overrideMontoStr.trim() === '' ? null : Number(overrideMontoStr)}
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Override % tolerancia"
                    htmlFor="override-pct"
                    help="Vacío = usar default empresa."
                  >
                    <Input
                      id="override-pct"
                      type="number"
                      min={0}
                      step="0.01"
                      value={overridePctStr}
                      onChange={(e) => setOverridePctStr(e.target.value)}
                      placeholder={tolerancia?.tolerancia_pct.toFixed(2)}
                    />
                  </Field>
                  <Field
                    label="Override $ tolerancia"
                    htmlFor="override-monto"
                    help="Vacío = usar default empresa."
                  >
                    <Input
                      id="override-monto"
                      type="number"
                      min={0}
                      step="0.01"
                      value={overrideMontoStr}
                      onChange={(e) => setOverrideMontoStr(e.target.value)}
                      placeholder={tolerancia?.tolerancia_monto.toFixed(2)}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => router.push('/rdb/inventario/levantamientos')}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="outline" disabled={submitting || !almacenId}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Guardar borrador
            </Button>
            <Button
              type="button"
              disabled={submitting || !almacenId}
              onClick={() => handleSubmit('capturar')}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Iniciar captura ahora
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

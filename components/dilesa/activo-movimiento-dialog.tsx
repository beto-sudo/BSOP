'use client';

/**
 * ActivoMovimientoDialog — wizard de subdivisión / fusión / relotificación
 * de predios (iniciativa `dilesa-portafolio-predios` · S5, ADR-055).
 *
 * Se abre desde el expediente del activo (que siempre es un ORIGEN). Para
 * fusión/relotificación permite sumar otros predios vivos como orígenes.
 * Los resultantes se capturan como filas (nombre, tipo, superficie, clave
 * catastral opcional — si viene, nace su cuenta predial). Ejecuta la RPC
 * atómica vía server action y navega al primer resultante.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ejecutarMovimientoActivos } from '@/app/dilesa/portafolio/actions';
import { hoyISOMatamoros } from '@/lib/fecha-mx';
import { Plus, Scissors, Trash2 } from 'lucide-react';

const selectCls =
  'h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)]';

const TIPO_MOVIMIENTO = [
  { value: 'subdivision', label: 'Subdivisión (1 → varios)' },
  { value: 'fusion', label: 'Fusión (varios → 1)' },
  { value: 'relotificacion', label: 'Relotificación (N → M)' },
] as const;

const TIPOS_RESULTANTE = [
  'terreno',
  'lote',
  'casa',
  'local',
  'plaza',
  'edificio',
  'nave',
  'departamento',
  'infraestructura',
] as const;

type ResultanteRow = { nombre: string; tipo: string; area_m2: string; clave_catastral: string };

type ActivoOpcion = { id: string; nombre: string; area_m2: number | null };

const FILA_VACIA: ResultanteRow = { nombre: '', tipo: 'terreno', area_m2: '', clave_catastral: '' };

export function ActivoMovimientoDialog({
  activo,
  empresaId,
  open,
  onOpenChange,
}: {
  activo: { id: string; nombre: string; area_m2: number | null };
  empresaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<'subdivision' | 'fusion' | 'relotificacion'>('subdivision');
  const [origenesExtra, setOrigenesExtra] = useState<string[]>([]);
  const [resultantes, setResultantes] = useState<ResultanteRow[]>([
    { ...FILA_VACIA },
    { ...FILA_VACIA },
  ]);
  const [fecha, setFecha] = useState('');
  const [notas, setNotas] = useState('');
  const [opciones, setOpciones] = useState<ActivoOpcion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Candidatos a origen extra (fusión/relotificación): predios vivos ≠ actual.
  useEffect(() => {
    if (!open || tipo === 'subdivision') return;
    let vivo = true;
    createSupabaseBrowserClient()
      .schema('dilesa')
      .from('activos')
      .select('id, nombre, area_m2')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .not('estado', 'in', '(desincorporado,descartado)')
      .in('tipo', ['terreno', 'lote'])
      .neq('id', activo.id)
      .order('nombre')
      .then(({ data }) => {
        if (vivo) setOpciones((data ?? []) as ActivoOpcion[]);
      });
    return () => {
      vivo = false;
    };
  }, [open, tipo, empresaId, activo.id]);

  function handleOpenChange(v: boolean) {
    if (v) {
      setTipo('subdivision');
      setOrigenesExtra([]);
      setResultantes([{ ...FILA_VACIA }, { ...FILA_VACIA }]);
      setFecha(hoyISOMatamoros());
      setNotas('');
      setError(null);
    }
    onOpenChange(v);
  }

  const supOrigen = useMemo(() => {
    const extra = origenesExtra
      .map((id) => opciones.find((o) => o.id === id)?.area_m2 ?? 0)
      .reduce((a, b) => a + (b ?? 0), 0);
    return (activo.area_m2 ?? 0) + extra;
  }, [activo.area_m2, origenesExtra, opciones]);

  const supResultante = useMemo(
    () => resultantes.reduce((acc, r) => acc + (Number(r.area_m2) || 0), 0),
    [resultantes]
  );

  const diferencia = supOrigen - supResultante;

  function setFila(i: number, patch: Partial<ResultanteRow>) {
    setResultantes((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    const filas = resultantes.filter((r) => r.nombre.trim() !== '');
    if (filas.length === 0) {
      setError('Captura al menos un predio resultante.');
      return;
    }
    if (tipo === 'subdivision' && filas.length < 2) {
      setError('Una subdivisión parte el predio en 2 o más.');
      return;
    }
    if (tipo === 'fusion' && (origenesExtra.length === 0 || filas.length !== 1)) {
      setError('Una fusión une 2 o más predios en exactamente 1.');
      return;
    }
    setSaving(true);
    setError(null);
    const r = await ejecutarMovimientoActivos({
      tipo,
      origenIds: [activo.id, ...origenesExtra],
      resultantes: filas.map((f) => ({
        nombre: f.nombre.trim(),
        tipo: f.tipo,
        area_m2: f.area_m2 || undefined,
        clave_catastral: f.clave_catastral.trim() || undefined,
      })),
      fecha,
      notas: notas || undefined,
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onOpenChange(false);
    if (r.resultantes[0]) {
      router.push(`/dilesa/portafolio/activo/${r.resultantes[0]}`);
    } else {
      router.push('/dilesa/portafolio');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            Subdividir / fusionar predio
          </DialogTitle>
          <DialogDescription>
            {activo.nombre}
            {activo.area_m2 != null ? ` · ${activo.area_m2.toLocaleString('es-MX')} m²` : ''} — el
            predio origen se desincorpora y su cuenta predial pasa a baja; los resultantes nacen
            ligados a él (ADR-055).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Tipo de movimiento</FieldLabel>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as typeof tipo)}
                className={selectCls}
              >
                {TIPO_MOVIMIENTO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Fecha</FieldLabel>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          {tipo !== 'subdivision' ? (
            <div>
              <FieldLabel>Otros predios origen (además de este)</FieldLabel>
              <div className="space-y-1.5">
                {origenesExtra.map((id, i) => (
                  <div key={id} className="flex items-center gap-2">
                    <select
                      value={id}
                      onChange={(e) =>
                        setOrigenesExtra((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      className={selectCls}
                    >
                      {opciones
                        .filter((o) => o.id === id || !origenesExtra.includes(o.id))
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre}
                            {o.area_m2 != null ? ` (${o.area_m2.toLocaleString('es-MX')} m²)` : ''}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setOrigenesExtra((xs) => xs.filter((_, j) => j !== i))}
                      className="text-[var(--text)]/50 hover:text-[var(--danger)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {opciones.filter((o) => !origenesExtra.includes(o.id)).length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const libre = opciones.find((o) => !origenesExtra.includes(o.id));
                      if (libre) setOrigenesExtra((xs) => [...xs, libre.id]);
                    }}
                    className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar predio origen
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div>
            <FieldLabel>Predios resultantes</FieldLabel>
            <div className="space-y-2">
              {resultantes.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_110px_110px_130px_28px] items-center gap-2"
                >
                  <Input
                    value={r.nombre}
                    onChange={(e) => setFila(i, { nombre: e.target.value })}
                    placeholder={`Nombre del resultante ${i + 1}`}
                  />
                  <select
                    value={r.tipo}
                    onChange={(e) => setFila(i, { tipo: e.target.value })}
                    className={selectCls}
                  >
                    {TIPOS_RESULTANTE.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={r.area_m2}
                    onChange={(e) => setFila(i, { area_m2: e.target.value })}
                    placeholder="m²"
                  />
                  <Input
                    value={r.clave_catastral}
                    onChange={(e) => setFila(i, { clave_catastral: e.target.value })}
                    placeholder="Clave catastral"
                  />
                  <button
                    type="button"
                    onClick={() => setResultantes((rows) => rows.filter((_, j) => j !== i))}
                    disabled={resultantes.length <= 1}
                    className="text-[var(--text)]/50 hover:text-[var(--danger)] disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setResultantes((rows) => [...rows, { ...FILA_VACIA }])}
                className="flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar resultante
              </button>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text)]/50">
              La clave catastral es opcional — si la capturas, nace la cuenta predial del
              resultante; si no, se liga cuando catastro la emita.
            </p>
          </div>

          <div className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
            <span className="text-[var(--text)]/60">Superficie: </span>
            <span className="tabular-nums">
              {supOrigen.toLocaleString('es-MX')} m² origen →{' '}
              {supResultante.toLocaleString('es-MX')} m² resultante
            </span>
            {Math.abs(diferencia) > 0.01 ? (
              <span className={diferencia > 0 ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}>
                {' '}
                ({diferencia > 0 ? '−' : '+'}
                {Math.abs(diferencia).toLocaleString('es-MX')} m²
                {diferencia > 0 ? ' cedidos/afectación' : ' de más — revisa'})
              </span>
            ) : null}
          </div>

          <div>
            <FieldLabel>Notas / trámite que lo ampara</FieldLabel>
            <Input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="p.ej. Relotificación área verde — convenio predial Piedras Negras"
            />
          </div>

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !fecha}>
            {saving ? 'Ejecutando…' : 'Ejecutar movimiento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

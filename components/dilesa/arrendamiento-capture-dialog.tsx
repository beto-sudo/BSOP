'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import {
  crearArrendamiento,
  type ArrendamientoLineaInput,
} from '@/app/dilesa/arrendamiento/actions';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

/**
 * Alta de contrato de arrendamiento (Sprint 1e). Cabecera + líneas dinámicas
 * (1 contrato : N espacios). Envía a la RPC atómica vía la server action; las
 * invariantes (cuenta_renta, anti-doble-booking) las valida la RPC.
 */

type Persona = { id: string; nombre: string };
type ActivoRentable = { id: string; nombre: string; tipo: string };

type LineaForm = {
  activo_id: string;
  tipo_operacion_fiscal: string;
  renta_subtotal: string;
  regimen_iva: string;
  vigencia_inicio: string;
  vigencia_fin: string;
};

const NUEVA_LINEA: LineaForm = {
  activo_id: '',
  tipo_operacion_fiscal: 'arrendamiento_inmueble',
  renta_subtotal: '',
  regimen_iva: 'tasa_8',
  vigencia_inicio: '',
  vigencia_fin: '',
};

const selectCls =
  'w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

export function ArrendamientoCaptureDialog({
  empresaId,
  open,
  onOpenChange,
  onCreated,
}: {
  empresaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activos, setActivos] = useState<ActivoRentable[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cabecera
  const [arrendatario, setArrendatario] = useState('');
  const [tipoPlazo, setTipoPlazo] = useState('plazo');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [diaCorte, setDiaCorte] = useState('1');
  const [depositoMeses, setDepositoMeses] = useState('1');
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...NUEVA_LINEA }]);

  const cargarCatalogos = useCallback(async () => {
    const sb = createSupabaseBrowserClient();
    const [{ data: per }, { data: dest }] = await Promise.all([
      sb.schema('erp').from('personas').select('id, nombre').order('nombre'),
      sb.schema('dilesa').from('portafolio_destinos').select('id').eq('cuenta_renta', true),
    ]);
    const destinoIds = (dest ?? []).map((d) => (d as { id: string }).id);
    let act: ActivoRentable[] = [];
    if (destinoIds.length) {
      const { data: activosData } = await sb
        .schema('dilesa')
        .from('activos')
        .select('id, nombre, tipo')
        .eq('empresa_id', empresaId)
        .in('destino_id', destinoIds)
        .is('deleted_at', null)
        .order('nombre');
      act = (activosData ?? []) as ActivoRentable[];
    }
    return {
      personas: (per ?? []) as Persona[],
      activos: act,
    };
  }, [empresaId]);

  useEffect(() => {
    if (!open) return;
    let activo = true;
    void cargarCatalogos().then((res) => {
      if (!activo) return;
      setPersonas(res.personas);
      setActivos(res.activos);
    });
    return () => {
      activo = false;
    };
  }, [open, cargarCatalogos]);

  function actualizarLinea(i: number, patch: Partial<LineaForm>) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function guardar() {
    setSaving(true);
    setError(null);
    const master = {
      arrendatario_persona_id: arrendatario,
      tipo_plazo: tipoPlazo,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      dia_corte: diaCorte ? Number(diaCorte) : null,
      deposito_meses: depositoMeses ? Number(depositoMeses) : 1,
      estado: 'borrador',
    };
    const lineasInput: ArrendamientoLineaInput[] = lineas.map((l) => ({
      activo_id: l.activo_id,
      tipo_operacion_fiscal: l.tipo_operacion_fiscal,
      renta_subtotal: Number(l.renta_subtotal || 0),
      regimen_iva: l.regimen_iva,
      iva_tasa_pct: l.regimen_iva === 'tasa_16' ? 16 : l.regimen_iva === 'exento' ? 0 : 8,
      vigencia_inicio: l.vigencia_inicio || fechaInicio || null,
      vigencia_fin: l.vigencia_fin || fechaFin || null,
      estado: 'borrador',
    }));
    const res = await crearArrendamiento(master, lineasInput);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Reset + cerrar + refrescar la lista.
    setArrendatario('');
    setFechaInicio('');
    setFechaFin('');
    setLineas([{ ...NUEVA_LINEA }]);
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo contrato de arrendamiento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cabecera */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FieldLabel htmlFor="arr-arrendatario" required>
                Arrendatario
              </FieldLabel>
              <select
                id="arr-arrendatario"
                className={selectCls}
                value={arrendatario}
                onChange={(e) => setArrendatario(e.target.value)}
              >
                <option value="">Selecciona…</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="arr-plazo">Tipo</FieldLabel>
              <select
                id="arr-plazo"
                className={selectCls}
                value={tipoPlazo}
                onChange={(e) => setTipoPlazo(e.target.value)}
              >
                <option value="plazo">Contrato a plazo</option>
                <option value="campana">Campaña corta</option>
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="arr-corte">Día de corte</FieldLabel>
              <Input
                id="arr-corte"
                type="number"
                min={1}
                max={28}
                value={diaCorte}
                onChange={(e) => setDiaCorte(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="arr-inicio">Inicio</FieldLabel>
              <Input
                id="arr-inicio"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="arr-fin">Fin (vacío = indefinido)</FieldLabel>
              <Input
                id="arr-fin"
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="arr-deposito">Depósito (meses)</FieldLabel>
              <Input
                id="arr-deposito"
                type="number"
                min={0}
                step="0.5"
                value={depositoMeses}
                onChange={(e) => setDepositoMeses(e.target.value)}
              />
            </div>
          </div>

          {/* Líneas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FieldLabel>Espacios rentados</FieldLabel>
              <button
                type="button"
                onClick={() => setLineas((p) => [...p, { ...NUEVA_LINEA }])}
                className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
              >
                <Plus className="size-3.5" /> Agregar espacio
              </button>
            </div>
            {lineas.map((l, i) => (
              <div key={i} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Espacio {i + 1}</span>
                  {lineas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLineas((p) => p.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-rose-600"
                      aria-label="Quitar espacio"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <FieldLabel required>Activo</FieldLabel>
                    <select
                      className={selectCls}
                      value={l.activo_id}
                      onChange={(e) => actualizarLinea(i, { activo_id: e.target.value })}
                    >
                      <option value="">Selecciona un activo rentable…</option>
                      {activos.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre} ({a.tipo})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel required>Renta mensual (subtotal)</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.renta_subtotal}
                      onChange={(e) => actualizarLinea(i, { renta_subtotal: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel>Régimen IVA</FieldLabel>
                    <select
                      className={selectCls}
                      value={l.regimen_iva}
                      onChange={(e) => actualizarLinea(i, { regimen_iva: e.target.value })}
                    >
                      <option value="tasa_8">IVA 8% (frontera)</option>
                      <option value="tasa_16">IVA 16%</option>
                      <option value="exento">Exento (habitacional)</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Operación fiscal</FieldLabel>
                    <select
                      className={selectCls}
                      value={l.tipo_operacion_fiscal}
                      onChange={(e) =>
                        actualizarLinea(i, { tipo_operacion_fiscal: e.target.value })
                      }
                    >
                      <option value="arrendamiento_inmueble">Arrendamiento de inmueble</option>
                      <option value="espacio_publicitario">Espacio publicitario</option>
                      <option value="servicio_publicidad">Servicio de publicidad</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={saving || !arrendatario}>
            {saving ? 'Guardando…' : 'Crear contrato'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

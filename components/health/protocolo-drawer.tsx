'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
} from '@/components/detail-page/detail-drawer';
import { cn } from '@/lib/utils';
import {
  crearCompuesto,
  registrarToma,
  type CrearCompuestoInput,
  type RegistrarTomaInput,
} from '@/app/health/actions';
import type { ProtocoloClase, ProtocoloCompuestoConTomas } from '@/lib/protocolo';

const SELECT_CLASS =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const CLASE_OPCIONES: { value: ProtocoloClase; label: string }[] = [
  { value: 'peptido', label: 'Péptido' },
  { value: 'suplemento', label: 'Suplemento' },
  { value: 'oral', label: 'Oral' },
  { value: 'otro', label: 'Otro' },
];

const VIA_OPCIONES = ['subcutanea', 'intramuscular', 'oral', 'topica', 'nasal'];

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Escala 0–5 con botones; clic en el valor activo lo limpia (vuelve a null). */
function EscalaInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              'h-8 flex-1 rounded-lg border text-sm transition-colors',
              value === n
                ? 'border-emerald-400 bg-emerald-50 font-semibold text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-200'
                : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--card)]/60 dark:text-white/50'
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

type Efectos = {
  apetito: number | null;
  nausea: number | null;
  energia: number | null;
  gi: number | null;
  nota: string;
};

const EFECTOS_VACIOS: Efectos = { apetito: null, nausea: null, energia: null, gi: null, nota: '' };

export function ProtocoloDrawer({
  open,
  onOpenChange,
  compuestos,
  compuestoInicialId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compuestos: ProtocoloCompuestoConTomas[];
  compuestoInicialId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<'toma' | 'nuevo'>('toma');

  // Form: registrar toma
  const [compuestoId, setCompuestoId] = useState('');
  const [fecha, setFecha] = useState('');
  const [dosis, setDosis] = useState('');
  const [unidad, setUnidad] = useState('');
  const [sitio, setSitio] = useState('');
  const [nota, setNota] = useState('');
  const [efectos, setEfectos] = useState<Efectos>(EFECTOS_VACIOS);

  // Form: nuevo compuesto
  const [nNombre, setNNombre] = useState('');
  const [nClase, setNClase] = useState<ProtocoloClase>('peptido');
  const [nVia, setNVia] = useState('subcutanea');
  const [nUnidad, setNUnidad] = useState('mg');
  const [nDosis, setNDosis] = useState('');
  const [nFrecuencia, setNFrecuencia] = useState('');
  const [nProcedencia, setNProcedencia] = useState('');
  const [nFechaInicio, setNFechaInicio] = useState('');
  const [nNotas, setNNotas] = useState('');

  const activos = compuestos.filter((c) => c.estado === 'activo');

  // Al abrir, resetea el form y preselecciona el compuesto que disparó el drawer.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setModo('toma');
    const inicial = compuestoInicialId ?? activos[0]?.id ?? '';
    setCompuestoId(inicial);
    setFecha(toLocalInput(new Date()));
    setSitio('');
    setNota('');
    setEfectos(EFECTOS_VACIOS);
    const c = compuestos.find((x) => x.id === inicial);
    setDosis(c?.dosis_objetivo != null ? String(c.dosis_objetivo) : '');
    setUnidad(c?.unidad_dosis ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, compuestoInicialId]);

  // Al cambiar el compuesto en el select, hereda su dosis objetivo y unidad.
  function onCompuestoChange(id: string) {
    setCompuestoId(id);
    const c = compuestos.find((x) => x.id === id);
    setDosis(c?.dosis_objetivo != null ? String(c.dosis_objetivo) : '');
    setUnidad(c?.unidad_dosis ?? '');
  }

  function guardarToma() {
    setError(null);
    const payload: RegistrarTomaInput = {
      compuestoId,
      fecha: fecha ? new Date(fecha).toISOString() : null,
      dosis: Number(dosis),
      unidad: unidad || null,
      sitio: sitio || null,
      nota: nota || null,
      efectos: {
        apetito: efectos.apetito,
        nausea: efectos.nausea,
        energia: efectos.energia,
        gi: efectos.gi,
        nota: efectos.nota || null,
      },
    };
    startTransition(async () => {
      const res = await registrarToma(payload);
      if (res.ok) {
        onOpenChange(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function guardarCompuesto() {
    setError(null);
    const payload: CrearCompuestoInput = {
      nombre: nNombre,
      clase: nClase,
      via: nVia || null,
      unidadDosis: nUnidad || null,
      dosisObjetivo: nDosis ? Number(nDosis) : null,
      frecuencia: nFrecuencia || null,
      procedencia: nProcedencia || null,
      fechaInicio: nFechaInicio || null,
      notas: nNotas || null,
    };
    startTransition(async () => {
      const res = await crearCompuesto(payload);
      if (res.ok) {
        setNNombre('');
        setNDosis('');
        setNFrecuencia('');
        setNProcedencia('');
        setNFechaInicio('');
        setNNotas('');
        setModo('toma');
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const tomaTitulo = modo === 'toma' ? 'Registrar inyección / toma' : 'Agregar compuesto';

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={tomaTitulo}
      description="Protocolo — péptidos y suplementos"
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setError(null);
              setModo((m) => (m === 'toma' ? 'nuevo' : 'toma'));
            }}
            disabled={pending}
          >
            {modo === 'toma' ? '+ Nuevo compuesto' : '← Volver a registrar'}
          </Button>
          <Button
            size="sm"
            onClick={modo === 'toma' ? guardarToma : guardarCompuesto}
            disabled={pending || (modo === 'toma' ? !compuestoId : !nNombre.trim())}
          >
            {pending ? 'Guardando…' : modo === 'toma' ? 'Registrar' : 'Crear compuesto'}
          </Button>
        </div>
      }
    >
      <DetailDrawerContent>
        {error ? (
          <div className="mb-4 rounded-lg border border-rose-300/40 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-300/25 dark:bg-rose-300/10 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {modo === 'toma' ? (
          <>
            <DetailDrawerSection title="Aplicación" divider={false}>
              <div className="space-y-3">
                <div>
                  <FieldLabel htmlFor="pc-compuesto" required>
                    Compuesto
                  </FieldLabel>
                  <select
                    id="pc-compuesto"
                    className={SELECT_CLASS}
                    value={compuestoId}
                    onChange={(e) => onCompuestoChange(e.target.value)}
                  >
                    {activos.length === 0 ? <option value="">Sin compuestos activos</option> : null}
                    {activos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="pc-fecha">Fecha y hora</FieldLabel>
                    <Input
                      id="pc-fecha"
                      type="datetime-local"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="pc-dosis" required>
                      Dosis
                    </FieldLabel>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id="pc-dosis"
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={dosis}
                        onChange={(e) => setDosis(e.target.value)}
                      />
                      <span className="shrink-0 text-sm text-[var(--muted-foreground)] dark:text-white/50">
                        {unidad}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="pc-sitio">Sitio (rotación)</FieldLabel>
                  <Input
                    id="pc-sitio"
                    value={sitio}
                    onChange={(e) => setSitio(e.target.value)}
                    placeholder="abdomen izq, muslo der…"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="pc-nota">Nota</FieldLabel>
                  <Input id="pc-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
                </div>
              </div>
            </DetailDrawerSection>

            <DetailDrawerSection
              title="¿Cómo te cayó?"
              description="Opcional — 0 a 5. Apetito/energía: 0 bajo, 5 alto. Náusea/GI: 0 nada, 5 severo."
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <EscalaInput
                    label="Apetito"
                    value={efectos.apetito}
                    onChange={(v) => setEfectos((e) => ({ ...e, apetito: v }))}
                  />
                  <EscalaInput
                    label="Náusea"
                    value={efectos.nausea}
                    onChange={(v) => setEfectos((e) => ({ ...e, nausea: v }))}
                  />
                  <EscalaInput
                    label="Energía"
                    value={efectos.energia}
                    onChange={(v) => setEfectos((e) => ({ ...e, energia: v }))}
                  />
                  <EscalaInput
                    label="Molestia GI"
                    value={efectos.gi}
                    onChange={(v) => setEfectos((e) => ({ ...e, gi: v }))}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="pc-efnota">Nota de cómo te cayó</FieldLabel>
                  <Input
                    id="pc-efnota"
                    value={efectos.nota}
                    onChange={(e) => setEfectos((ef) => ({ ...ef, nota: e.target.value }))}
                  />
                </div>
              </div>
            </DetailDrawerSection>
          </>
        ) : (
          <DetailDrawerSection title="Nuevo compuesto" divider={false}>
            <div className="space-y-3">
              <div>
                <FieldLabel htmlFor="nc-nombre" required>
                  Nombre
                </FieldLabel>
                <Input
                  id="nc-nombre"
                  value={nNombre}
                  onChange={(e) => setNNombre(e.target.value)}
                  placeholder="Retatrutide, BPC-157, Vitamina D3…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="nc-clase" required>
                    Clase
                  </FieldLabel>
                  <select
                    id="nc-clase"
                    className={SELECT_CLASS}
                    value={nClase}
                    onChange={(e) => setNClase(e.target.value as ProtocoloClase)}
                  >
                    {CLASE_OPCIONES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="nc-via">Vía</FieldLabel>
                  <select
                    id="nc-via"
                    className={SELECT_CLASS}
                    value={nVia}
                    onChange={(e) => setNVia(e.target.value)}
                  >
                    {VIA_OPCIONES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="nc-dosis">Dosis objetivo</FieldLabel>
                  <Input
                    id="nc-dosis"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={nDosis}
                    onChange={(e) => setNDosis(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="nc-unidad">Unidad</FieldLabel>
                  <Input
                    id="nc-unidad"
                    value={nUnidad}
                    onChange={(e) => setNUnidad(e.target.value)}
                    placeholder="mg, mcg, UI, ml…"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="nc-frec">Frecuencia</FieldLabel>
                  <Input
                    id="nc-frec"
                    value={nFrecuencia}
                    onChange={(e) => setNFrecuencia(e.target.value)}
                    placeholder="semanal, diaria…"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="nc-inicio">Inicio</FieldLabel>
                  <Input
                    id="nc-inicio"
                    type="date"
                    value={nFechaInicio}
                    onChange={(e) => setNFechaInicio(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="nc-proc">Procedencia</FieldLabel>
                <Input
                  id="nc-proc"
                  value={nProcedencia}
                  onChange={(e) => setNProcedencia(e.target.value)}
                  placeholder="farmacia de compounding, research-grade, marca…"
                />
              </div>
              <div>
                <FieldLabel htmlFor="nc-notas">Notas</FieldLabel>
                <Input id="nc-notas" value={nNotas} onChange={(e) => setNNotas(e.target.value)} />
              </div>
            </div>
          </DetailDrawerSection>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

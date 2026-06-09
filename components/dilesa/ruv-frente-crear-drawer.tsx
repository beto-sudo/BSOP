'use client';

/**
 * RuvFrenteCrearDrawer — alta de un frente (oferta) RUV.
 * Iniciativa `dilesa-ruv` · Sprint 4.
 *
 * Flujo (definición de Beto): nombre + selección de los lotes que van en el
 * frente → con eso se arma. Los lotes se eligen de los DISPONIBLES del proyecto
 * (sin frente asignado). Al crear, la server action liga los lotes e inicializa
 * el checklist de 27 documentos en 'pendiente'. La documentación se carga
 * después, en el detalle del frente. Folios INFONAVIT (ID Oferta/Orden) y
 * fechas son opcionales al alta.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileStack } from 'lucide-react';
import { z } from 'zod';

import { DetailDrawer, DetailDrawerContent, DetailDrawerSection } from '@/components/detail-page';
import { Form, FormActions, FormField, FormRow, useZodForm } from '@/components/forms';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { crearFrente } from '@/app/dilesa/ruv/actions';

const FrenteSchema = z.object({
  nombre: z.string().min(1, 'Indica el nombre del frente'),
  idOferta: z.string().default(''),
  idOrden: z.string().default(''),
  fechaInicio: z.string().default(''),
  fechaFin: z.string().default(''),
});

type FrenteValues = z.infer<typeof FrenteSchema>;

type ProyectoOpt = { id: string; nombre: string; lotesDisponibles: number };
type LoteOpt = {
  id: string;
  identificador: string;
  manzana: string | null;
  numeroLote: string | null;
};

export type RuvFrenteCrearDrawerProps = {
  empresaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Llamado tras crear con éxito — la tabla re-fetchea. */
  onDone: () => void;
};

export function RuvFrenteCrearDrawer({
  empresaId,
  open,
  onOpenChange,
  onDone,
}: RuvFrenteCrearDrawerProps) {
  const toast = useToast();
  const form = useZodForm({
    schema: FrenteSchema,
    defaultValues: { nombre: '', idOferta: '', idOrden: '', fechaInicio: '', fechaFin: '' },
  });

  const [proyectos, setProyectos] = useState<ProyectoOpt[]>([]);
  const [proyectoSel, setProyectoSel] = useState('');
  const [lotes, setLotes] = useState<LoteOpt[]>([]);
  const [lotesLoading, setLotesLoading] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [filtroLote, setFiltroLote] = useState('');

  // Cargar proyectos al abrir + resetear estado.
  useEffect(() => {
    if (!open) return;
    form.reset({ nombre: '', idOferta: '', idOrden: '', fechaInicio: '', fechaFin: '' });
    setProyectoSel('');
    setLotes([]);
    setSeleccion(new Set());
    setFiltroLote('');
    let activo = true;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      // Solo proyectos con construcción no terminada y con lotes aún por
      // registrar en un frente (vista dilesa.v_ruv_proyectos_disponibles).
      const { data, error } = await sb
        .schema('dilesa')
        .from('v_ruv_proyectos_disponibles')
        .select('id, nombre, lotes_disponibles')
        .eq('empresa_id', empresaId)
        .order('nombre');
      if (!activo) return;
      if (error) {
        toast.add({
          title: 'No se pudieron cargar los proyectos',
          description: getSupabaseErrorMessage(error, 'Reintenta.'),
          type: 'error',
        });
        return;
      }
      setProyectos(
        (data ?? []).map((p) => ({
          id: p.id as string,
          nombre: p.nombre as string,
          lotesDisponibles: Number(p.lotes_disponibles ?? 0),
        }))
      );
    })();
    return () => {
      activo = false;
    };
    // form/toast estables; solo gobierna `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId]);

  // Cargar lotes disponibles del proyecto seleccionado.
  const cargarLotes = useCallback(
    async (proyectoId: string) => {
      setLotesLoading(true);
      setSeleccion(new Set());
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .schema('dilesa')
        .from('unidades')
        .select('id, identificador, manzana, numero_lote')
        .eq('empresa_id', empresaId)
        .eq('proyecto_id', proyectoId)
        .is('frente_id', null)
        .is('deleted_at', null)
        .order('manzana')
        .order('numero_lote');
      if (error) {
        toast.add({
          title: 'No se pudieron cargar los lotes',
          description: getSupabaseErrorMessage(error, 'Reintenta.'),
          type: 'error',
        });
        setLotes([]);
      } else {
        setLotes(
          (data ?? []).map((u) => ({
            id: u.id as string,
            identificador: (u.identificador as string | null) ?? (u.id as string),
            manzana: (u.manzana as string | null) ?? null,
            numeroLote: (u.numero_lote as string | null) ?? null,
          }))
        );
      }
      setLotesLoading(false);
    },
    [empresaId, toast]
  );

  useEffect(() => {
    if (proyectoSel) void cargarLotes(proyectoSel);
    else setLotes([]);
  }, [proyectoSel, cargarLotes]);

  const lotesFiltrados = useMemo(() => {
    const q = filtroLote.trim().toLowerCase();
    if (!q) return lotes;
    return lotes.filter((l) => l.identificador.toLowerCase().includes(q));
  }, [lotes, filtroLote]);

  const toggleLote = (id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTodosVisibles = () => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      const todosSel = lotesFiltrados.every((l) => next.has(l.id));
      for (const l of lotesFiltrados) {
        if (todosSel) next.delete(l.id);
        else next.add(l.id);
      }
      return next;
    });
  };

  const handleSubmit = async (values: FrenteValues) => {
    if (seleccion.size === 0) {
      toast.add({ title: 'Selecciona al menos un lote', type: 'error' });
      return;
    }
    const result = await crearFrente({
      nombre: values.nombre,
      proyectoId: proyectoSel || null,
      loteIds: [...seleccion],
      idOferta: values.idOferta || null,
      idOrden: values.idOrden || null,
      fechaInicio: values.fechaInicio || null,
      fechaFin: values.fechaFin || null,
    });
    if (!result.ok) {
      toast.add({ title: 'No se pudo crear el frente', description: result.error, type: 'error' });
      return;
    }
    toast.add({
      title: 'Frente creado',
      description: `${seleccion.size} lotes ligados`,
      type: 'success',
    });
    onOpenChange(false);
    onDone();
  };

  const todosVisiblesSel =
    lotesFiltrados.length > 0 && lotesFiltrados.every((l) => seleccion.has(l.id));

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Nuevo frente RUV"
      description="Dale nombre y elige los lotes que lo integran"
    >
      <DetailDrawerContent>
        <Form form={form} onSubmit={handleSubmit} className="space-y-5">
          <FormField name="nombre" label="Nombre del frente" required>
            {(field) => (
              <Input
                {...field}
                id={field.id}
                placeholder="Ej. LOMAS DE LOS ENCINOS 36"
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>

          <div className="space-y-1.5">
            <label htmlFor="ruv-proyecto" className="text-sm font-medium text-[var(--text)]">
              Proyecto / Fraccionamiento
            </label>
            <select
              id="ruv-proyecto"
              value={proyectoSel}
              onChange={(e) => setProyectoSel(e.target.value)}
              className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-2 text-sm text-[var(--text)]"
            >
              <option value="">Elige un proyecto con lotes disponibles…</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.lotesDisponibles} {p.lotesDisponibles === 1 ? 'lote' : 'lotes'})
                </option>
              ))}
            </select>
          </div>

          <FormRow cols={2}>
            <FormField name="idOferta" label="ID Oferta (opcional)">
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  inputMode="numeric"
                  placeholder="INFONAVIT"
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
            <FormField name="idOrden" label="ID Orden (opcional)">
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  inputMode="numeric"
                  placeholder="INFONAVIT"
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <DetailDrawerSection
            title="Lotes del frente"
            description={
              proyectoSel
                ? `${seleccion.size} seleccionados · ${lotes.length} disponibles en el proyecto`
                : 'Elige un proyecto arriba para listar sus lotes disponibles'
            }
          >
            {!proyectoSel ? null : lotesLoading ? (
              <p className="text-sm text-[var(--text)]/50">Cargando lotes…</p>
            ) : lotes.length === 0 ? (
              <p className="text-sm text-[var(--text)]/50">
                No hay lotes disponibles (sin frente) en este proyecto.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={filtroLote}
                    onChange={(e) => setFiltroLote(e.target.value)}
                    placeholder="Filtrar por identificador (ej. M20)"
                    className="h-8 flex-1 rounded-lg border-[var(--border)] bg-[var(--panel)] text-sm"
                  />
                  <button
                    type="button"
                    onClick={toggleTodosVisibles}
                    className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text)]/70 hover:text-[var(--text)]"
                  >
                    {todosVisiblesSel ? 'Quitar visibles' : 'Seleccionar visibles'}
                  </button>
                </div>
                <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
                  {lotesFiltrados.map((l) => (
                    <li key={l.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-[var(--card)]/60">
                        <input
                          type="checkbox"
                          checked={seleccion.has(l.id)}
                          onChange={() => toggleLote(l.id)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm text-[var(--text)]">{l.identificador}</span>
                        {l.manzana || l.numeroLote ? (
                          <span className="text-xs text-[var(--text)]/45">
                            Mz {l.manzana ?? '—'} · Lt {l.numeroLote ?? '—'}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DetailDrawerSection>

          <FormActions
            cancelLabel="Cancelar"
            submitLabel="Crear frente"
            submittingLabel="Creando…"
            submitIcon={<FileStack className="h-4 w-4" />}
            submitDisabled={seleccion.size === 0}
            onCancel={() => onOpenChange(false)}
            stretch
          />
        </Form>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

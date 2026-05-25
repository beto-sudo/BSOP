'use client';

/**
 * Captura: Arrancar construcción nueva (DILESA).
 *
 * Iniciativa dilesa-construccion · Sprint 4. Crea una nueva fila en
 * `dilesa.construccion` (avance_pct=0, estado='arrancada'). A partir de
 * aquí el supervisor irá registrando tareas terminadas; al cruzar 20%
 * el trigger `tg_construccion_avance` setea `unidades.estado='en_construccion'`
 * + asigna `producto_id`, dejando la unidad disponible para venta (ADR-032 D4).
 *
 * El código de obra se genera al estilo Coda
 * (`<unidad>-<sufijo-prototipo>-<abreviacion-contratista>`) pero se permite
 * override manual en el form para casos donde el operador prefiera otro
 * naming. UNIQUE absoluto en `dilesa.construccion.unidad_id` — el form
 * filtra antes y captura el error 23505 si hay carrera.
 *
 * Acceso: sub-slug `dilesa.construccion.arrancar` (ADR-030). Backfill defensivo
 * cloned permisos del padre, así que cualquier rol con write sobre el módulo
 * de construcción ya tiene este permiso.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

type UnidadElegible = {
  id: string;
  identificador: string;
  area_m2: number | null;
  estado: string;
  proyecto_id: string;
  proyecto_nombre: string;
};

type Producto = {
  id: string;
  nombre: string;
  proyecto_id: string;
};

type Contratista = {
  id: string;
  nombre: string;
  abreviacion: string | null;
};

type Persona = {
  id: string;
  nombre: string;
};

type ContratoOpcion = {
  id: string;
  codigo: string;
  contratista_id: string;
  fecha_contrato: string;
};

/**
 * @module Construcción · Arrancar obra (DILESA)
 * @responsive desktop-only
 */
export default function ArrancarConstruccionPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.arrancar" write>
      <ArrancarConstruccionForm />
    </RequireAccess>
  );
}

function ArrancarConstruccionForm() {
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);

  // Catálogos
  const [unidades, setUnidades] = useState<UnidadElegible[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [contratos, setContratos] = useState<ContratoOpcion[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state — proyecto → unidad cascada
  const [proyectoId, setProyectoId] = useState<string>('');
  const [unidadId, setUnidadId] = useState<string>('');
  const [productoId, setProductoId] = useState<string>('');
  const [contratistaId, setContratistaId] = useState<string>('');
  const [contratoId, setContratoId] = useState<string>('');
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [fechaArranque, setFechaArranque] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fechaCompromiso, setFechaCompromiso] = useState<string>('');
  const [codigoOverride, setCodigoOverride] = useState<string>('');
  const [notas, setNotas] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);

  // ── Cargar catálogos ─────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);

    const [
      unidadesRes,
      proyectosRes,
      productosRes,
      contratistasRes,
      datosRes,
      personasRes,
      contratosRes,
      construccionRes,
    ] = await Promise.all([
      // Unidades elegibles para arrancar obra: estado 'planeada' o 'lote_urbanizado'.
      sb
        .schema('dilesa')
        .from('unidades')
        .select('id, identificador, area_m2, estado, proyecto_id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .in('estado', ['planeada', 'lote_urbanizado']),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('productos')
        .select('id, nombre, proyecto_id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('tipo', 'contratista')
        .eq('activo', true),
      sb
        .schema('dilesa')
        .from('contratistas_datos')
        .select('persona_id, abreviacion')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('activo', true),
      sb
        .schema('dilesa')
        .from('contratos_construccion')
        .select('id, codigo, contratista_id, fecha_contrato')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('fecha_contrato', { ascending: false }),
      // Para excluir unidades que ya tienen una construccion (UNIQUE absoluto
      // en construccion.unidad_id — sin importar deleted_at).
      sb
        .schema('dilesa')
        .from('construccion')
        .select('unidad_id')
        .eq('empresa_id', DILESA_EMPRESA_ID),
    ]);

    const firstErr =
      unidadesRes.error ??
      proyectosRes.error ??
      productosRes.error ??
      contratistasRes.error ??
      datosRes.error ??
      personasRes.error ??
      contratosRes.error ??
      construccionRes.error;
    if (firstErr) {
      setLoadError(getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los catálogos.'));
      setLoadingMeta(false);
      return;
    }

    const proyMap = new Map<string, string>();
    for (const p of proyectosRes.data ?? []) proyMap.set(p.id as string, p.nombre as string);

    const unidadesYaConObra = new Set(
      (construccionRes.data ?? []).map((c) => c.unidad_id as string)
    );

    const unidadesElegibles: UnidadElegible[] = (unidadesRes.data ?? [])
      .filter((u) => !unidadesYaConObra.has(u.id as string))
      .map((u) => ({
        id: u.id as string,
        identificador: u.identificador as string,
        area_m2: u.area_m2 as number | null,
        estado: u.estado as string,
        proyecto_id: u.proyecto_id as string,
        proyecto_nombre: proyMap.get(u.proyecto_id as string) ?? '—',
      }))
      .sort((a, b) =>
        `${a.proyecto_nombre}|${a.identificador}`.localeCompare(
          `${b.proyecto_nombre}|${b.identificador}`
        )
      );

    const productosOrdenados = (productosRes.data ?? [])
      .map((p) => ({
        id: p.id as string,
        nombre: p.nombre as string,
        proyecto_id: p.proyecto_id as string,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const abrevMap = new Map<string, string | null>();
    for (const d of datosRes.data ?? []) {
      abrevMap.set(d.persona_id as string, (d.abreviacion as string | null) ?? null);
    }
    const contratistasOrdenados: Contratista[] = (contratistasRes.data ?? [])
      .map((p) => {
        const nombre =
          [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
          '(sin nombre)';
        return {
          id: p.id as string,
          nombre,
          abreviacion: abrevMap.get(p.id as string) ?? null,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const personasOrdenadas: Persona[] = (personasRes.data ?? [])
      .map((p) => ({
        id: p.id as string,
        nombre:
          [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
          '(sin nombre)',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    setUnidades(unidadesElegibles);
    setProductos(productosOrdenados);
    setContratistas(contratistasOrdenados);
    setPersonas(personasOrdenadas);
    setContratos(
      (contratosRes.data ?? []).map((c) => ({
        id: c.id as string,
        codigo: c.codigo as string,
        contratista_id: c.contratista_id as string,
        fecha_contrato: c.fecha_contrato as string,
      }))
    );
    setLoadingMeta(false);
  }, [sb]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  // ── Derivados ────────────────────────────────────────────────────────────
  const proyectosConUnidades = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; count: number }>();
    for (const u of unidades) {
      const prev = m.get(u.proyecto_id);
      if (prev) prev.count++;
      else m.set(u.proyecto_id, { id: u.proyecto_id, nombre: u.proyecto_nombre, count: 1 });
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [unidades]);

  const unidadesDelProyecto = useMemo(
    () => (proyectoId ? unidades.filter((u) => u.proyecto_id === proyectoId) : []),
    [unidades, proyectoId]
  );

  const productosDelProyecto = useMemo(
    () => (proyectoId ? productos.filter((p) => p.proyecto_id === proyectoId) : productos),
    [productos, proyectoId]
  );

  const contratosDelContratista = useMemo(
    () =>
      contratistaId
        ? contratos.filter((c) => c.contratista_id === contratistaId)
        : ([] as ContratoOpcion[]),
    [contratos, contratistaId]
  );

  const unidadSel = unidades.find((u) => u.id === unidadId) ?? null;
  const productoSel = productos.find((p) => p.id === productoId) ?? null;
  const contratistaSel = contratistas.find((c) => c.id === contratistaId) ?? null;

  // Código auto-generado tipo Coda: <unidad>-<sufijo prototipo>-<abrev contratista>
  // El sufijo del prototipo es la última parte después de '-' (ej. "LIBERTO-MAYA" → "MAYA").
  const codigoSugerido = useMemo(() => {
    if (!unidadSel) return '';
    const parts: string[] = [unidadSel.identificador];
    if (productoSel) {
      const proto = productoSel.nombre.split('-').pop();
      if (proto) parts.push(proto);
    }
    if (contratistaSel?.abreviacion) parts.push(contratistaSel.abreviacion);
    return parts.join('-');
  }, [unidadSel, productoSel, contratistaSel]);

  const codigoFinal = codigoOverride.trim() || codigoSugerido;

  const canSubmit = useMemo(
    () => !!unidadId && !!productoId && !!contratistaId && !!fechaArranque && !!codigoFinal,
    [unidadId, productoId, contratistaId, fechaArranque, codigoFinal]
  );

  // ── Submit ──────────────────────────────────────────────────────────────
  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const { data: cIns, error: cErr } = await sb
        .schema('dilesa')
        .from('construccion')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          codigo: codigoFinal,
          unidad_id: unidadId,
          producto_id: productoId,
          contratista_id: contratistaId,
          supervisor_persona_id: supervisorId || null,
          fecha_arranque: fechaArranque,
          fecha_compromiso_terminar: fechaCompromiso || null,
          avance_pct: 0,
          estado: 'arrancada',
          notas: notas.trim() || null,
        })
        .select('id')
        .single();
      if (cErr || !cIns) {
        const msg =
          cErr?.code === '23505'
            ? 'Esta unidad ya tiene una construcción registrada. Refresca la página o elige otra unidad.'
            : getSupabaseErrorMessage(cErr, 'No se pudo crear la construcción.');
        throw new Error(msg);
      }

      const construccionId = cIns.id as string;

      // Si se eligió contrato, asociar el lote (N:M). Best-effort —
      // si falla, la construccion ya está creada y el contrato se puede
      // asignar después desde el módulo de contratos.
      if (contratoId) {
        const { error: lErr } = await sb.schema('dilesa').from('contrato_lotes').insert({
          empresa_id: DILESA_EMPRESA_ID,
          contrato_id: contratoId,
          construccion_id: construccionId,
        });
        if (lErr) {
          console.warn('Construcción creada pero contrato no se ligó:', lErr.message);
          toast.add({
            title: 'Obra creada — contrato no se pudo ligar',
            description: lErr.message,
            type: 'warning',
          });
        }
      }

      toast.add({
        title: 'Construcción arrancada',
        description: `${codigoFinal} está en estado "arrancada". Empieza a registrar tareas terminadas para que avance suba.`,
        type: 'success',
      });
      router.push(`/dilesa/construccion/${construccionId}`);
    } catch (e) {
      toast.add({
        title: 'Error al arrancar construcción',
        description: (e as Error).message,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMeta) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <BackLink />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Arrancar construcción</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crea la fila base de la obra. El avance se calculará automáticamente al registrar tareas
          terminadas; al cruzar 20% la unidad pasa a disponible para venta.
        </p>
      </header>

      <Section title="Unidad y prototipo">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Proyecto *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={proyectoId}
              onChange={(e) => {
                setProyectoId(e.target.value);
                setUnidadId('');
                setProductoId('');
              }}
            >
              <option value="">— selecciona —</option>
              {proyectosConUnidades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.count} elegibles
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unidad (sin obra vigente) *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={unidadId}
              onChange={(e) => setUnidadId(e.target.value)}
              disabled={!proyectoId}
            >
              <option value="">
                {proyectoId ? '— selecciona —' : '— primero elige un proyecto —'}
              </option>
              {unidadesDelProyecto.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.identificador}
                  {u.area_m2 ? ` · ${u.area_m2}m²` : ''}
                  {u.estado === 'lote_urbanizado' ? ' · urbanizado' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prototipo *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              disabled={!proyectoId}
            >
              <option value="">
                {proyectoId ? '— selecciona —' : '— primero elige un proyecto —'}
              </option>
              {productosDelProyecto.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <Hint>El avance se calcula sobre las tareas de la plantilla de este prototipo.</Hint>
          </Field>
        </div>
      </Section>

      <Section title="Contratista y supervisor">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contratista *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={contratistaId}
              onChange={(e) => {
                setContratistaId(e.target.value);
                setContratoId('');
              }}
            >
              <option value="">— selecciona —</option>
              {contratistas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.abreviacion ? `${c.abreviacion} · ` : ''}
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contrato de construcción (opcional)">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={contratoId}
              onChange={(e) => setContratoId(e.target.value)}
              disabled={!contratistaId || contratosDelContratista.length === 0}
            >
              <option value="">
                {!contratistaId
                  ? '— primero elige contratista —'
                  : contratosDelContratista.length === 0
                    ? '— este contratista no tiene contratos —'
                    : '— ninguno (asignar después) —'}
              </option>
              {contratosDelContratista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {fmtFecha(c.fecha_contrato)}
                </option>
              ))}
            </select>
            <Hint>Puedes ligar el contrato ahora o crearlo después desde el detalle.</Hint>
          </Field>
          <Field label="Supervisor (opcional)">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
            >
              <option value="">— ninguno —</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Fechas y notas">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fecha de arranque *">
            <Input
              type="date"
              value={fechaArranque}
              onChange={(e) => setFechaArranque(e.target.value)}
              required
            />
          </Field>
          <Field label="Compromiso de terminar">
            <Input
              type="date"
              value={fechaCompromiso}
              onChange={(e) => setFechaCompromiso(e.target.value)}
              min={fechaArranque || undefined}
            />
            <Hint>Opcional. Sirve para el indicador de retraso en la lista.</Hint>
          </Field>
          <Field label="Código de obra">
            <Input
              placeholder={codigoSugerido || 'M13-L1-LDS-RMA-MAYA'}
              value={codigoOverride}
              onChange={(e) => setCodigoOverride(e.target.value)}
            />
            <Hint>
              {codigoOverride.trim()
                ? `Override manual. Sugerido era: ${codigoSugerido || '(falta unidad/prototipo)'}`
                : codigoSugerido
                  ? `Auto-sugerido: ${codigoSugerido}`
                  : 'Selecciona unidad + prototipo + contratista para auto-generar.'}
            </Hint>
          </Field>
          <Field label="Notas">
            <textarea
              className="min-h-[80px] w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3">
        <Link href="/dilesa/construccion">
          <Button variant="outline" disabled={submitting}>
            Cancelar
          </Button>
        </Link>
        <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Arrancar construcción
        </Button>
      </div>
    </div>
  );
}

function fmtFecha(s: string): string {
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function BackLink() {
  return (
    <Link
      href="/dilesa/construccion"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Volver a construcción
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-muted-foreground">{children}</p>;
}

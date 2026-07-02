'use client';

/**
 * Captura: Crear contrato + arrancar N lotes (DILESA).
 *
 * Iniciativa dilesa-construccion · Sprint 4 (refactor post-Coda-review).
 * En Coda — y según el screenshot que Beto compartió — la operación
 * cotidiana es "el contratista llega con el proyecto, fija precio MO/m²
 * y arrancamos N lotes de golpe". Esa es UNA acción de negocio, no tres.
 *
 * Esta página colapsa lo que en el Sprint 4 inicial eran 2 forms
 * separados (Crear contrato + Arrancar construcción standalone) en un
 * solo flujo combinado:
 *
 *   1. Cabecera del contrato: contratista + proyecto (filtra lotes) +
 *      precio MO/m² + fecha + fianzas + código (auto-sugerido tipo Coda).
 *   2. Lotes a arrancar: multi-row (mínimo 1) — cada row es un lote
 *      sin obra vigente + un prototipo + fecha de arranque. Mix de
 *      prototipos permitido (igual que Coda — RMA+RMC+RMD juntos OK).
 *   3. Submit: 1 INSERT contrato + N INSERT construcciones + N INSERT
 *      contrato_lotes + N UPDATE unidades.estado='planeada'. Sin
 *      transacción explícita (Supabase REST no la expone limpia); va
 *      best-effort secuencial. Si la cabecera falla, abortamos. Si una
 *      construcción de N falla, reportamos cuántas se crearon —
 *      idempotencia depende de UNIQUE(construccion.unidad_id) y del
 *      operador refrescando.
 *
 * El costo MO por tarea NO se captura aquí ni en el form de tareas
 * — se deriva por SQL en la vista `dilesa.v_construccion_tareas_terminadas_con_mo`
 * (valor_contrato_mo × plantilla.porcentaje_costo). ADR-032 D3.
 *
 * Deep-link: `?contratista=<id>` pre-selecciona el contratista.
 * Acceso: sub-slug `dilesa.construccion.contratos` (ADR-030). Después
 * del submit redirige al detalle del contratista, donde aparece el
 * contrato y los lotes recién arrancados.
 *
 * Suspense wrap: usamos useSearchParams (deep link), así que el body
 * va dentro de RequireAccess — durante prerender estático, RequireAccess
 * está en loading state y los hooks dinámicos no corren (regla SS6 ADR-030).
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Save, X } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

type Contratista = {
  id: string;
  nombre: string;
  abreviacion: string | null;
};

type Proyecto = { id: string; nombre: string };

type UnidadElegible = {
  id: string;
  identificador: string;
  proyecto_id: string;
  estado: string;
  area_m2: number | null;
};

type Producto = {
  id: string;
  nombre: string;
  proyecto_id: string;
  /** m² de construcción del prototipo (atributos JSONB → m2_construccion). */
  m2_construccion: number | null;
};

/** Estado de una fila del multi-row de lotes. */
type LoteRow = {
  /** rowKey local; sirve para keys en React y para identificar la fila
   *  al borrar/editar. UUID-like simple. */
  key: string;
  unidadId: string;
  productoId: string;
  fechaArranque: string;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

function makeRowKey(): string {
  return `r${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @module Construcción · Crear contrato + arrancar lotes (DILESA)
 * @responsive desktop-only
 */
export default function NuevoContratoPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.contratos" write>
      <NuevoContratoForm />
    </RequireAccess>
  );
}

function NuevoContratoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);

  // ── Catálogos ──────────────────────────────────────────────────────────
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [unidades, setUnidades] = useState<UnidadElegible[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [seqByContratista, setSeqByContratista] = useState<Map<string, number>>(new Map());
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Form: cabecera ─────────────────────────────────────────────────────
  const [contratistaId, setContratistaId] = useState<string>('');
  const [proyectoId, setProyectoId] = useState<string>('');
  const [precioMoM2, setPrecioMoM2] = useState<string>('');
  const [fechaContrato, setFechaContrato] = useState<string>(hoyISOMatamoros());
  const [fianzasUrl, setFianzasUrl] = useState<string>('');
  const [codigoOverride, setCodigoOverride] = useState<string>('');
  const [notas, setNotas] = useState<string>('');

  // ── Form: lotes (multi-row) ────────────────────────────────────────────
  const [lotes, setLotes] = useState<LoteRow[]>([
    {
      key: makeRowKey(),
      unidadId: '',
      productoId: '',
      fechaArranque: hoyISOMatamoros(),
    },
  ]);

  const [submitting, setSubmitting] = useState(false);

  // ── Carga de catálogos ─────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);

    const [
      contratistasRes,
      datosRes,
      proyectosRes,
      unidadesRes,
      productosRes,
      construccionRes,
      contratosCountRes,
    ] = await Promise.all([
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
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      // Unidades elegibles: estado 'planeada' o 'lote_urbanizado'.
      sb
        .schema('dilesa')
        .from('unidades')
        .select('id, identificador, proyecto_id, estado, area_m2')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .in('estado', ['planeada', 'lote_urbanizado']),
      sb
        .schema('dilesa')
        .from('productos')
        .select('id, nombre, proyecto_id, atributos')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      // Para excluir unidades que ya tienen una construccion (UNIQUE absoluto
      // en construccion.unidad_id — sin importar deleted_at).
      sb
        .schema('dilesa')
        .from('construccion')
        .select('unidad_id')
        .eq('empresa_id', DILESA_EMPRESA_ID),
      // Conteo previo de contratos por contratista — para el seq sugerido.
      sb
        .schema('dilesa')
        .from('contratos_construccion')
        .select('contratista_id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
    ]);

    const firstErr =
      contratistasRes.error ??
      datosRes.error ??
      proyectosRes.error ??
      unidadesRes.error ??
      productosRes.error ??
      construccionRes.error ??
      contratosCountRes.error;
    if (firstErr) {
      setLoadError(getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los catálogos.'));
      setLoadingMeta(false);
      return;
    }

    const abrevMap = new Map<string, string | null>();
    for (const d of datosRes.data ?? []) {
      abrevMap.set(d.persona_id as string, (d.abreviacion as string | null) ?? null);
    }
    const contratistasOrd: Contratista[] = (contratistasRes.data ?? [])
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
    setContratistas(contratistasOrd);

    setProyectos(
      ((proyectosRes.data ?? []) as Array<{ id: string; nombre: string }>).sort((a, b) =>
        a.nombre.localeCompare(b.nombre)
      )
    );

    const unidadesYaConObra = new Set(
      (construccionRes.data ?? []).map((c) => c.unidad_id as string)
    );

    const unidadesElegibles: UnidadElegible[] = (unidadesRes.data ?? [])
      .filter((u) => !unidadesYaConObra.has(u.id as string))
      .map((u) => ({
        id: u.id as string,
        identificador: u.identificador as string,
        proyecto_id: u.proyecto_id as string,
        estado: u.estado as string,
        area_m2: u.area_m2 as number | null,
      }))
      .sort((a, b) => a.identificador.localeCompare(b.identificador));
    setUnidades(unidadesElegibles);

    setProductos(
      (productosRes.data ?? [])
        .map((p) => {
          const attrs =
            (p.atributos as { m2_construccion?: number | string | null } | null | undefined) ?? {};
          const m2Raw = attrs.m2_construccion;
          const m2 =
            m2Raw == null || m2Raw === ''
              ? null
              : typeof m2Raw === 'number'
                ? m2Raw
                : Number(m2Raw) || null;
          return {
            id: p.id as string,
            nombre: p.nombre as string,
            proyecto_id: p.proyecto_id as string,
            m2_construccion: m2,
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    );

    const seq = new Map<string, number>();
    for (const c of contratosCountRes.data ?? []) {
      const cid = c.contratista_id as string;
      seq.set(cid, (seq.get(cid) ?? 0) + 1);
    }
    setSeqByContratista(seq);

    setLoadingMeta(false);
  }, [sb]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  // Pre-selección desde ?contratista=
  useEffect(() => {
    const cid = searchParams.get('contratista');
    if (cid && contratistas.length > 0 && !contratistaId) {
      const exists = contratistas.find((c) => c.id === cid);
      if (exists) setContratistaId(cid);
    }
  }, [searchParams, contratistas, contratistaId]);

  // ── Derivados ──────────────────────────────────────────────────────────
  const contratistaSel = contratistas.find((c) => c.id === contratistaId) ?? null;
  const proyectoSel = proyectos.find((p) => p.id === proyectoId) ?? null;

  const proyectosConUnidades = useMemo(() => {
    const ids = new Set(unidades.map((u) => u.proyecto_id));
    return proyectos.filter((p) => ids.has(p.id));
  }, [unidades, proyectos]);

  /** Unidades elegibles filtradas por proyecto seleccionado y excluyendo
   *  las que ya están en otra fila del multi-row (evita duplicados en el
   *  mismo submit). */
  const unidadesElegiblesParaRow = useCallback(
    (rowKey: string) => {
      if (!proyectoId) return [];
      const usadas = new Set(
        lotes.filter((l) => l.key !== rowKey && l.unidadId).map((l) => l.unidadId)
      );
      return unidades.filter((u) => u.proyecto_id === proyectoId && !usadas.has(u.id));
    },
    [unidades, proyectoId, lotes]
  );

  const productosDelProyecto = useMemo(
    () => (proyectoId ? productos.filter((p) => p.proyecto_id === proyectoId) : []),
    [productos, proyectoId]
  );

  const precioMoNum = Number(precioMoM2) || 0;

  /** Detalle por fila: m² del prototipo + valor MO del lote = precio × m².
   *  `error` se popula cuando hay un problema bloqueante de la fila (ej. el
   *  prototipo elegido no tiene `m2_construccion` capturado). Sin esto, el
   *  submit producía silent-skip y el toast quedaba con "ningún lote pudo
   *  arrancarse" sin descripción — debug brutal. */
  const lotesConDetalle = useMemo(() => {
    return lotes.map((l) => {
      const unidad = unidades.find((u) => u.id === l.unidadId) ?? null;
      const producto = productos.find((p) => p.id === l.productoId) ?? null;
      const m2 = producto?.m2_construccion ?? null;
      const valorMo = m2 != null && precioMoNum > 0 ? precioMoNum * m2 : null;
      let error: string | null = null;
      if (producto && m2 == null) {
        error = `${producto.nombre} no tiene m² capturado — abre el prototipo y captúralo antes de arrancar.`;
      }
      return { row: l, unidad, producto, m2, valorMo, error };
    });
  }, [lotes, unidades, productos, precioMoNum]);

  const subtotalM2 = useMemo(
    () => lotesConDetalle.reduce((s, l) => s + (l.m2 ?? 0), 0),
    [lotesConDetalle]
  );
  const subtotalValor = useMemo(
    () => lotesConDetalle.reduce((s, l) => s + (l.valorMo ?? 0), 0),
    [lotesConDetalle]
  );

  const codigoSugerido = useMemo(() => {
    if (!contratistaSel) return '';
    const year = (fechaContrato || hoyISOMatamoros()).slice(0, 4);
    const abrev = contratistaSel.abreviacion ?? 'CONTR';
    const seq = (seqByContratista.get(contratistaId) ?? 0) + 1;
    return `${year}/${seq}-DIE-${abrev}-CONTRATO#${seq}`;
  }, [contratistaSel, contratistaId, fechaContrato, seqByContratista]);

  const codigoFinal = codigoOverride.trim() || codigoSugerido;

  /** Una fila es válida cuando tiene todos los campos requeridos Y no tiene
   *  errores derivados (ej. m² del prototipo). */
  const lotesValidos = useMemo(
    () =>
      lotesConDetalle.filter(
        (d) => d.row.unidadId && d.row.productoId && d.row.fechaArranque && d.error === null
      ),
    [lotesConDetalle]
  );

  const canSubmit = useMemo(
    () =>
      !!contratistaId &&
      !!proyectoId &&
      !!fechaContrato &&
      !!codigoFinal &&
      precioMoNum > 0 &&
      lotesValidos.length > 0 &&
      // Todas las filas tienen que ser válidas o se vacían (no permitimos
      // mix de filas medio llenas).
      lotesValidos.length === lotes.length,
    [
      contratistaId,
      proyectoId,
      fechaContrato,
      codigoFinal,
      precioMoNum,
      lotesValidos.length,
      lotes.length,
    ]
  );

  // ── Handlers multi-row ─────────────────────────────────────────────────
  function addLote() {
    setLotes((prev) => [
      ...prev,
      {
        key: makeRowKey(),
        unidadId: '',
        productoId: '',
        fechaArranque: fechaContrato || hoyISOMatamoros(),
      },
    ]);
  }

  function removeLote(key: string) {
    setLotes((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function updateLote(key: string, patch: Partial<Omit<LoteRow, 'key'>>) {
    setLotes((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // Reset lotes cuando cambia el proyecto (las unidades/prototipos ya no
  // aplican). Cabecera (contratista, precio) se preservan.
  useEffect(() => {
    setLotes((prev) => prev.map((l) => ({ ...l, unidadId: '', productoId: '' })));
  }, [proyectoId]);

  // ── Submit ─────────────────────────────────────────────────────────────
  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      // 1) Cabecera del contrato
      const valorTotal = subtotalValor;
      const { data: cIns, error: cErr } = await sb
        .schema('dilesa')
        .from('contratos_construccion')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          codigo: codigoFinal,
          fecha_contrato: fechaContrato,
          contratista_id: contratistaId,
          proyecto_id: proyectoId,
          valor_total: valorTotal,
          fianzas_url: fianzasUrl.trim() || null,
          notas: notas.trim() || null,
        })
        .select('id')
        .single();
      if (cErr || !cIns) {
        throw new Error(getSupabaseErrorMessage(cErr, 'No se pudo crear el contrato.'));
      }
      const contratoId = cIns.id as string;

      // 2) Por cada lote: INSERT construccion + INSERT contrato_lote
      //                  + UPDATE unidad.estado (si era lote_urbanizado → planeada)
      const exitos: Array<{
        construccionId: string;
        codigo: string;
        identificador: string;
      }> = [];
      const fallas: Array<{ identificador: string; mensaje: string }> = [];

      for (const detalle of lotesConDetalle) {
        const { row, unidad, producto, m2, valorMo, error } = detalle;
        // Defensa: canSubmit ya bloquea filas con error/missing, pero por si
        // alguna se cuela (race condition al editar mientras submit), la
        // marcamos como falla en lugar de silent skip.
        if (!unidad || !producto || m2 == null || valorMo == null) {
          if (unidad) {
            fallas.push({
              identificador: unidad.identificador,
              mensaje: error ?? 'Faltan datos del prototipo (m² o precio).',
            });
          }
          continue;
        }

        // Código de obra estilo Coda: <identificador>-<sufijo prototipo>-<abrev contratista>
        const protoSufijo = producto.nombre.split('-').pop() ?? producto.nombre;
        const abrev = contratistaSel?.abreviacion ?? null;
        const codigoObra = [unidad.identificador, protoSufijo, abrev].filter(Boolean).join('-');

        const { data: oIns, error: oErr } = await sb
          .schema('dilesa')
          .from('construccion')
          .insert({
            empresa_id: DILESA_EMPRESA_ID,
            codigo: codigoObra,
            unidad_id: unidad.id,
            producto_id: producto.id,
            contratista_id: contratistaId,
            fecha_arranque: row.fechaArranque,
            avance_pct: 0,
            estado: 'arrancada',
            m2_construccion: m2,
            precio_mo_x_m2: precioMoNum,
            valor_contrato_mo: valorMo,
          })
          .select('id')
          .single();
        if (oErr || !oIns) {
          const mensaje =
            oErr?.code === '23505'
              ? 'Ya tiene una construcción registrada (race condition).'
              : getSupabaseErrorMessage(oErr, 'No se pudo crear la construcción.');
          fallas.push({ identificador: unidad.identificador, mensaje });
          continue;
        }
        const construccionId = oIns.id as string;

        // Ligar al contrato (N:M). Si falla, la construcción ya existe;
        // marcamos warning pero no bloqueamos.
        const { error: lErr } = await sb.schema('dilesa').from('contrato_lotes').insert({
          empresa_id: DILESA_EMPRESA_ID,
          contrato_id: contratoId,
          construccion_id: construccionId,
          monto_lote: valorMo,
        });
        if (lErr) {
          fallas.push({
            identificador: unidad.identificador,
            mensaje: `Obra creada, contrato no ligado: ${lErr.message}`,
          });
          continue;
        }

        // Si la unidad estaba como lote_urbanizado, pasarla a 'planeada'
        // (la transición fina a 'en_construccion' la maneja el trigger
        // tg_construccion_avance cuando cruce 20%). No-op si ya era
        // 'planeada' — el UPDATE devolverá 0 rows afectados.
        if (unidad.estado === 'lote_urbanizado') {
          await sb
            .schema('dilesa')
            .from('unidades')
            .update({ estado: 'planeada' })
            .eq('id', unidad.id);
        }

        exitos.push({
          construccionId,
          codigo: codigoObra,
          identificador: unidad.identificador,
        });
      }

      // Toast con el resumen
      if (exitos.length === 0) {
        toast.add({
          title: 'Contrato creado, pero ningún lote pudo arrancarse',
          description: fallas.map((f) => `${f.identificador}: ${f.mensaje}`).join(' · '),
          type: 'error',
        });
      } else if (fallas.length > 0) {
        toast.add({
          title: `Contrato + ${exitos.length} lote(s) — algunos con problemas`,
          description: `${codigoFinal}. Lotes con error: ${fallas
            .map((f) => f.identificador)
            .join(', ')}`,
          type: 'warning',
        });
      } else {
        toast.add({
          title: 'Contrato creado y lotes arrancados',
          description: `${codigoFinal} · ${exitos.length} lote(s) · ${money(valorTotal)}`,
          type: 'success',
        });
      }

      router.push(`/dilesa/construccion/contratistas/${contratistaId}`);
    } catch (e) {
      toast.add({
        title: 'Error al crear contrato',
        description: (e as Error).message,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMeta) {
    return (
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      </div>
    );
  }

  const proyectoCount = proyectosConUnidades.length;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <BackLink />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo contrato + arrancar lotes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Un contratista llega con su precio MO/m² para construir N lotes de un proyecto. Esto crea
          el contrato y arranca cada obra en una sola operación. El costo MO por tarea se deriva
          después (no se captura).
        </p>
      </header>

      <Section title="Cabecera del contrato">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contratista *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={contratistaId}
              onChange={(e) => setContratistaId(e.target.value)}
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
          <Field label="Proyecto *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value)}
            >
              <option value="">
                {proyectoCount === 0 ? '— sin proyectos con lotes elegibles —' : '— selecciona —'}
              </option>
              {proyectosConUnidades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <Hint>Filtra las unidades disponibles del multi-row de abajo.</Hint>
          </Field>
          <Field label="Precio MO × m² *">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={precioMoM2}
              onChange={(e) => setPrecioMoM2(e.target.value)}
              placeholder="3500"
            />
            <Hint>
              {precioMoNum > 0
                ? `${money(precioMoNum)} por m² de construcción del prototipo.`
                : 'Se multiplica por los m² del prototipo de cada lote.'}
            </Hint>
          </Field>
          <Field label="Fecha del contrato *">
            <Input
              type="date"
              value={fechaContrato}
              onChange={(e) => setFechaContrato(e.target.value)}
              required
            />
          </Field>
          <Field label="Fianzas (URL opcional)">
            <Input
              type="url"
              placeholder="https://..."
              value={fianzasUrl}
              onChange={(e) => setFianzasUrl(e.target.value)}
            />
          </Field>
          <Field label="Código del contrato">
            <Input
              placeholder={codigoSugerido || '2026/1-DIE-RMA-CONTRATO#1'}
              value={codigoOverride}
              onChange={(e) => setCodigoOverride(e.target.value)}
            />
            <Hint>
              {codigoOverride.trim()
                ? `Override. Sugerido: ${codigoSugerido || '(falta contratista)'}`
                : codigoSugerido
                  ? `Auto-sugerido: ${codigoSugerido}`
                  : 'Selecciona contratista para auto-generar.'}
            </Hint>
          </Field>
          <Field label="Notas">
            <textarea
              className="min-h-[60px] w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Lotes a arrancar"
        description={
          !proyectoId
            ? 'Selecciona un proyecto en la cabecera para poder elegir lotes.'
            : `${lotesValidos.length} de ${lotes.length} fila(s) válidas · ${subtotalM2.toFixed(2)} m² · ${money(subtotalValor)}`
        }
      >
        {!proyectoId ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="space-y-2">
            <div className="hidden grid-cols-12 gap-2 px-2 text-[10px] uppercase tracking-wide text-muted-foreground sm:grid">
              <div className="col-span-4">Lote</div>
              <div className="col-span-3">Prototipo</div>
              <div className="col-span-2">Arranque</div>
              <div className="col-span-2 text-right">m² · valor MO</div>
              <div className="col-span-1" />
            </div>
            {lotesConDetalle.map((detalle, idx) => {
              const { row, m2, valorMo, error } = detalle;
              const elegibles = unidadesElegiblesParaRow(row.key);
              return (
                <div
                  key={row.key}
                  className={`grid grid-cols-1 items-start gap-2 rounded-md border bg-[var(--card)] p-2 sm:grid-cols-12 ${
                    error ? 'border-destructive/60' : 'border-[var(--border)]/60'
                  }`}
                >
                  <div className="sm:col-span-4">
                    <select
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                      value={row.unidadId}
                      onChange={(e) => updateLote(row.key, { unidadId: e.target.value })}
                    >
                      <option value="">— lote —</option>
                      {elegibles.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.identificador}
                          {u.area_m2 ? ` · ${u.area_m2}m²` : ''}
                          {u.estado === 'lote_urbanizado' ? ' · urbanizado' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <select
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                      value={row.productoId}
                      onChange={(e) => updateLote(row.key, { productoId: e.target.value })}
                    >
                      <option value="">— prototipo —</option>
                      {productosDelProyecto.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                          {p.m2_construccion ? ` · ${p.m2_construccion}m²` : ' · ⚠ falta m²'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="date"
                      value={row.fechaArranque}
                      onChange={(e) => updateLote(row.key, { fechaArranque: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="text-right text-xs tabular-nums text-muted-foreground sm:col-span-2 sm:pt-2">
                    {m2 != null ? `${m2.toFixed(2)} m²` : '—'}
                    {valorMo != null ? (
                      <>
                        <br />
                        {money(valorMo)}
                      </>
                    ) : null}
                  </div>
                  <div className="sm:col-span-1 sm:pt-1.5">
                    <button
                      type="button"
                      onClick={() => removeLote(row.key)}
                      disabled={lotes.length <= 1}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--border)]/40 disabled:opacity-30"
                      title={lotes.length <= 1 ? 'Mínimo 1 lote' : 'Quitar fila'}
                      aria-label={`Quitar lote ${idx + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {error ? (
                    <div className="text-xs text-destructive sm:col-span-12">{error}</div>
                  ) : null}
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={addLote}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Agregar lote
              </button>
              {lotesValidos.length > 0 ? (
                <div className="text-right text-xs tabular-nums text-muted-foreground">
                  <div>
                    Subtotal m²: <span className="font-medium">{subtotalM2.toFixed(2)}</span>
                  </div>
                  <div>
                    Subtotal MO: <span className="font-medium">{money(subtotalValor)}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {proyectoSel
            ? `Crea 1 contrato para ${proyectoSel.nombre} + ${lotesValidos.length} construcciones en estado "arrancada".`
            : 'Una sola operación: contrato + N construcciones + N contrato_lotes.'}
        </p>
        <div className="flex items-center gap-3">
          <Link
            href={
              contratistaId
                ? `/dilesa/construccion/contratistas/${contratistaId}`
                : '/dilesa/construccion/contratistas'
            }
          >
            <Button variant="outline" disabled={submitting}>
              Cancelar
            </Button>
          </Link>
          <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Generar contrato{' '}
            {lotesValidos.length > 0 ? `+ arrancar ${lotesValidos.length} lote(s)` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
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

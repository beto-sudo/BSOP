'use client';

/**
 * Captura Fase 1: Solicitud de Asignación.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 7a. Primer eslabón del
 * pipeline de ventas DILESA. Crea persona (si nueva) + venta + primera
 * fila de venta_fases marcada como capturada hoy.
 *
 * Acceso: roles con sub-slug `dilesa.ventas.fase01_solicitud` (Vendedor,
 * Dirección, Maribel). Vendedores ven solo sus propias ventas en la lista
 * — RLS filtra por `dilesa.ventas.vendedor_usuario_id`.
 *
 * Cálculo del precio: vía RPC `dilesa.fn_calcular_precio_venta`.
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

type UnidadDisponible = {
  id: string;
  identificador: string;
  area_m2: number | null;
  es_esquina: boolean | null;
  tiene_frente_verde: boolean | null;
  proyecto_id: string;
  producto_id: string | null;
  proyecto_nombre: string;
  prototipo_nombre: string | null;
};

type TipoCredito = {
  id: string;
  nombre: string;
  costo_venta_adicional_pct: number;
  apoyo_infonavit_monto: number;
};

type Promocion = {
  id: string;
  nombre: string;
  productos_aplicables: string[];
};

type PersonaExistente = {
  id: string;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  curp: string | null;
};

type CalculoPrecio = {
  valor_comercial: number;
  metros_excedentes: number;
  valor_excedente_terreno: number;
  valor_frente_verde: number;
  valor_esquina: number;
  pct_esquina_aplicado: number;
  valor_venta_futuro: number;
  costo_credito_adicional: number;
  precio_venta_total: number;
  apoyo_infonavit: number;
  monto_credito_titular: number;
  monto_credito_cotitular: number;
  pago_directo: number;
  enganche_1pct: number;
  isai_2pct: number;
  gastos_notariales_6pct: number;
  error?: string;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function money(n: number | null | undefined): string {
  if (n == null) return '—';
  return moneyFmt.format(Number(n));
}

/**
 * @module Captura Fase 1 — Solicitud de Asignación (DILESA)
 * @responsive desktop-only
 */
export default function NuevaSolicitudPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fase01_solicitud" write>
      <NuevaSolicitudForm />
    </RequireAccess>
  );
}

function NuevaSolicitudForm() {
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);

  // Catálogos
  const [unidades, setUnidades] = useState<UnidadDisponible[]>([]);
  const [tiposCredito, setTiposCredito] = useState<TipoCredito[]>([]);
  const [promociones, setPromociones] = useState<Promocion[]>([]);
  const [personasExistentes, setPersonasExistentes] = useState<PersonaExistente[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state. Proyecto → unidad en cascada: vendedor primero filtra por
  // proyecto y luego ve solo las unidades disponibles de ese proyecto.
  const [proyectoId, setProyectoId] = useState<string>('');
  const [unidadId, setUnidadId] = useState<string>('');
  const [tipoCreditoId, setTipoCreditoId] = useState<string>('');
  const [promocionId, setPromocionId] = useState<string>('');
  const [montoCreditoTitular, setMontoCreditoTitular] = useState<string>('');
  const [montoCreditoCotitular, setMontoCreditoCotitular] = useState<string>('');
  // La fecha + hora de la solicitud la setea el servidor al guardar (now()).
  // Importante para orden FIFO en Fase 2 cuando hay inventario limitado.

  // Cliente: modo (existente o nuevo)
  const [clienteModo, setClienteModo] = useState<'existente' | 'nuevo'>('nuevo');
  const [personaIdSeleccionada, setPersonaIdSeleccionada] = useState<string>('');
  const [busquedaPersona, setBusquedaPersona] = useState('');

  // Nuevo cliente (campos básicos — KYC completo va en Fase 2)
  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [curp, setCurp] = useState('');
  const [rfc, setRfc] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');

  // Cálculo
  const [calculo, setCalculo] = useState<CalculoPrecio | null>(null);
  const [calculando, setCalculando] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // ── Load catálogos ──────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);

    // Unidades disponibles = activas en proyecto, sin venta vigente ligada.
    const [uRes, prjRes, prodRes, tcRes, prRes, persRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('unidades')
        .select(
          'id, identificador, area_m2, es_esquina, tiene_frente_verde, proyecto_id, producto_id, estado'
        )
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .in('estado', ['disponible', 'planeada']),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('productos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('tipos_credito')
        .select('id, nombre, costo_venta_adicional_pct, apoyo_infonavit_monto')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('activo', true)
        .is('deleted_at', null)
        .order('nombre'),
      sb
        .schema('dilesa')
        .from('promociones')
        .select('id, nombre, productos_aplicables')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('activa', true)
        .is('deleted_at', null),
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno, curp')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('tipo', 'cliente')
        .is('deleted_at', null),
    ]);

    const firstErr =
      uRes.error ?? prjRes.error ?? prodRes.error ?? tcRes.error ?? prRes.error ?? persRes.error;
    if (firstErr) {
      setLoadError(getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los catálogos.'));
      setLoadingMeta(false);
      return;
    }

    const prjMap = new Map((prjRes.data ?? []).map((p) => [p.id as string, p.nombre as string]));
    const prodMap = new Map((prodRes.data ?? []).map((p) => [p.id as string, p.nombre as string]));

    const us: UnidadDisponible[] = (uRes.data ?? []).map((u) => ({
      id: u.id as string,
      identificador: u.identificador as string,
      area_m2: u.area_m2 as number | null,
      es_esquina: u.es_esquina as boolean | null,
      tiene_frente_verde: u.tiene_frente_verde as boolean | null,
      proyecto_id: u.proyecto_id as string,
      producto_id: u.producto_id as string | null,
      proyecto_nombre: prjMap.get(u.proyecto_id as string) ?? '—',
      prototipo_nombre: u.producto_id ? (prodMap.get(u.producto_id as string) ?? null) : null,
    }));
    us.sort((a, b) =>
      `${a.proyecto_nombre}|${a.identificador}`.localeCompare(
        `${b.proyecto_nombre}|${b.identificador}`
      )
    );

    setUnidades(us);
    setTiposCredito((tcRes.data ?? []) as TipoCredito[]);
    setPromociones((prRes.data ?? []) as Promocion[]);
    setPersonasExistentes((persRes.data ?? []) as PersonaExistente[]);
    setLoadingMeta(false);
  }, [sb]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  // ── Recalcular precio cuando cambian inputs ─────────────────────────────────
  useEffect(() => {
    if (!unidadId) {
      setCalculo(null);
      return;
    }
    let active = true;
    setCalculando(true);
    (async () => {
      const { data, error } = await sb.schema('dilesa').rpc('fn_calcular_precio_venta', {
        p_unidad_id: unidadId,
        p_tipo_credito_id: tipoCreditoId || undefined,
        p_monto_credito_titular: Number(montoCreditoTitular) || 0,
        p_monto_credito_cotitular: Number(montoCreditoCotitular) || 0,
      });
      if (!active) return;
      if (error) {
        setCalculo({ error: error.message } as unknown as CalculoPrecio);
      } else {
        setCalculo(data as CalculoPrecio);
      }
      setCalculando(false);
    })();
    return () => {
      active = false;
    };
  }, [sb, unidadId, tipoCreditoId, montoCreditoTitular, montoCreditoCotitular]);

  // ── Proyectos con unidades disponibles + unidades del proyecto elegido ────
  const proyectosConUnidades = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; disponibles: number }>();
    for (const u of unidades) {
      const prev = m.get(u.proyecto_id);
      if (prev) prev.disponibles++;
      else m.set(u.proyecto_id, { id: u.proyecto_id, nombre: u.proyecto_nombre, disponibles: 1 });
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [unidades]);

  const unidadesDelProyecto = useMemo(
    () =>
      proyectoId
        ? unidades
            .filter((u) => u.proyecto_id === proyectoId)
            .sort((a, b) => a.identificador.localeCompare(b.identificador))
        : [],
    [unidades, proyectoId]
  );

  // ── Filtrar promociones aplicables a la unidad ──────────────────────────────
  const promocionesAplicables = useMemo(() => {
    const unidad = unidades.find((u) => u.id === unidadId);
    if (!unidad?.producto_id) return promociones;
    return promociones.filter(
      (p) => !p.productos_aplicables.length || p.productos_aplicables.includes(unidad.producto_id!)
    );
  }, [promociones, unidadId, unidades]);

  // ── Personas filtradas por búsqueda ─────────────────────────────────────────
  const personasFiltradas = useMemo(() => {
    const q = busquedaPersona.trim().toLowerCase();
    if (!q) return personasExistentes.slice(0, 50);
    return personasExistentes
      .filter((p) => {
        const full = [p.nombre, p.apellido_paterno, p.apellido_materno]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return full.includes(q) || (p.curp ?? '').toLowerCase().includes(q);
      })
      .slice(0, 50);
  }, [busquedaPersona, personasExistentes]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const canSubmit = useMemo(() => {
    if (!unidadId || !tipoCreditoId) return false;
    if (clienteModo === 'existente') return !!personaIdSeleccionada;
    return !!nombre.trim() && !!apellidoPaterno.trim();
  }, [unidadId, tipoCreditoId, clienteModo, personaIdSeleccionada, nombre, apellidoPaterno]);

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      // 1) Resolver persona_id (existente o crear nueva)
      let personaId = personaIdSeleccionada;
      if (clienteModo === 'nuevo') {
        const { data: ins, error: pErr } = await sb
          .schema('erp')
          .from('personas')
          .insert({
            empresa_id: DILESA_EMPRESA_ID,
            tipo: 'cliente',
            nombre: nombre.trim(),
            apellido_paterno: apellidoPaterno.trim(),
            apellido_materno: apellidoMaterno.trim() || null,
            curp: curp.trim().toUpperCase() || null,
            rfc: rfc.trim().toUpperCase() || null,
            telefono: telefono.trim() || null,
            email: email.trim() || null,
          })
          .select('id')
          .single();
        if (pErr || !ins)
          throw new Error(getSupabaseErrorMessage(pErr, 'No se pudo crear la persona.'));
        personaId = ins.id as string;
      }

      // 2) Usuario actual (para vendedor_usuario_id)
      const {
        data: { user },
      } = await sb.auth.getUser();

      // 3) Crear venta
      const unidad = unidades.find((u) => u.id === unidadId);
      const tipoCredito = tiposCredito.find((t) => t.id === tipoCreditoId);
      const { data: vIns, error: vErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          persona_id: personaId,
          unidad_id: unidadId,
          vendedor_usuario_id: user?.id ?? null,
          estado: 'activa',
          fase_actual: 'Solicitud de Asignación',
          fase_posicion: 1,
          tipo_credito: tipoCredito?.nombre ?? null,
          valor_comercial: calculo?.valor_comercial ?? null,
          precio_asignacion: calculo?.precio_venta_total ?? null,
          monto_credito_titular: Number(montoCreditoTitular) || null,
          monto_credito_cotitular: Number(montoCreditoCotitular) || null,
          enganche_requerido: calculo?.enganche_1pct ?? null,
          gastos_escrituracion: calculo?.gastos_notariales_6pct ?? null,
          notas: promocionId
            ? `Promoción aplicada: ${promociones.find((p) => p.id === promocionId)?.nombre ?? promocionId}`
            : null,
        })
        .select('id')
        .single();
      if (vErr || !vIns)
        throw new Error(getSupabaseErrorMessage(vErr, 'No se pudo crear la venta.'));

      const ventaId = vIns.id as string;

      // 4) Primera fila de venta_fases (Solicitud de Asignación, fecha hoy)
      const { error: fErr } = await sb
        .schema('dilesa')
        .from('venta_fases')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          venta_id: ventaId,
          fase: 'Solicitud de Asignación',
          posicion: 1,
          // fecha (date) = hoy; created_at (timestamptz) = now() vía default.
          // Para FIFO en Fase 2 se ordena por created_at, que conserva la hora.
          fecha: new Date().toISOString().slice(0, 10),
          registrado_por: user?.id ?? null,
        });
      if (fErr) {
        // No bloqueamos — la venta ya está creada
        console.warn('No se pudo registrar venta_fase inicial:', fErr.message);
      }

      // 5) Marcar unidad como asignada
      const { error: uErr } = await sb
        .schema('dilesa')
        .from('unidades')
        .update({ estado: 'asignada' })
        .eq('id', unidadId);
      if (uErr) console.warn('No se pudo actualizar estado de la unidad:', uErr.message);

      toast.add({
        title: 'Solicitud creada',
        description: `Venta ${unidad?.identificador} para ${clienteModo === 'nuevo' ? nombre + ' ' + apellidoPaterno : 'cliente existente'} ya está en Fase 1.`,
        type: 'success',
      });
      router.push(`/dilesa/ventas/${ventaId}`);
    } catch (e) {
      toast.add({
        title: 'Error al crear solicitud',
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

  const unidadSel = unidades.find((u) => u.id === unidadId);

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <BackLink />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva Solicitud de Asignación</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fase 1 del pipeline DILESA. Captura cliente, unidad y crédito para arrancar la operación.
        </p>
      </header>

      {/* ── Cliente ── */}
      <Section title="Cliente">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setClienteModo('existente')}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              clienteModo === 'existente'
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--border)] text-muted-foreground'
            }`}
          >
            Cliente existente
          </button>
          <button
            type="button"
            onClick={() => setClienteModo('nuevo')}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              clienteModo === 'nuevo'
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--border)] text-muted-foreground'
            }`}
          >
            Cliente nuevo
          </button>
        </div>

        {clienteModo === 'existente' ? (
          <div className="mt-4 space-y-3">
            <Input
              placeholder="Buscar por nombre o CURP…"
              value={busquedaPersona}
              onChange={(e) => setBusquedaPersona(e.target.value)}
            />
            <div className="max-h-64 overflow-auto rounded-md border border-[var(--border)]">
              {personasFiltradas.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  Sin coincidencias.{' '}
                  <button
                    type="button"
                    onClick={() => setClienteModo('nuevo')}
                    className="underline"
                  >
                    Crear nuevo cliente
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {personasFiltradas.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setPersonaIdSeleccionada(p.id)}
                        className={`flex w-full items-baseline justify-between px-3 py-2 text-left text-sm hover:bg-[var(--bg)]/50 ${
                          personaIdSeleccionada === p.id ? 'bg-[var(--accent)]/10' : ''
                        }`}
                      >
                        <span>
                          {[p.nombre, p.apellido_paterno, p.apellido_materno]
                            .filter(Boolean)
                            .join(' ') || '(sin nombre)'}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.curp ?? '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre(s) *">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </Field>
            <div />
            <Field label="Apellido paterno *">
              <Input
                value={apellidoPaterno}
                onChange={(e) => setApellidoPaterno(e.target.value)}
                required
              />
            </Field>
            <Field label="Apellido materno">
              <Input value={apellidoMaterno} onChange={(e) => setApellidoMaterno(e.target.value)} />
            </Field>
            <Field label="CURP">
              <Input
                value={curp}
                onChange={(e) => setCurp(e.target.value.toUpperCase())}
                maxLength={18}
              />
            </Field>
            <Field label="RFC">
              <Input
                value={rfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
                maxLength={13}
              />
            </Field>
            <Field label="Teléfono">
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <p className="col-span-full text-xs text-muted-foreground">
              KYC completo (PEP, ocupación, domicilio, etc.) se captura en Fase 2 (Asignada).
            </p>
          </div>
        )}
      </Section>

      {/* ── Operación ── */}
      <Section title="Operación">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Proyecto *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={proyectoId}
              onChange={(e) => {
                setProyectoId(e.target.value);
                setUnidadId(''); // reset unidad al cambiar proyecto
              }}
            >
              <option value="">— selecciona —</option>
              {proyectosConUnidades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.disponibles} disponibles
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unidad disponible *">
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
                  {u.prototipo_nombre ? `-${u.prototipo_nombre.split('-').pop()}` : ''}
                  {u.area_m2 ? ` · ${u.area_m2}m²` : ''}
                  {u.es_esquina ? ' · esquina' : ''}
                  {u.tiene_frente_verde ? ' · frente verde' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de crédito *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={tipoCreditoId}
              onChange={(e) => setTipoCreditoId(e.target.value)}
            >
              <option value="">— selecciona —</option>
              {tiposCredito.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                  {t.costo_venta_adicional_pct > 0
                    ? ` (+${(t.costo_venta_adicional_pct * 100).toFixed(1)}%)`
                    : ''}
                  {t.apoyo_infonavit_monto > 0 ? ` · apoyo ${money(t.apoyo_infonavit_monto)}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Promoción (si aplica)">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={promocionId}
              onChange={(e) => setPromocionId(e.target.value)}
            >
              <option value="">— ninguna —</option>
              {promocionesAplicables.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monto crédito titular">
            <Input
              type="number"
              value={montoCreditoTitular}
              onChange={(e) => setMontoCreditoTitular(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Monto crédito co-titular">
            <Input
              type="number"
              value={montoCreditoCotitular}
              onChange={(e) => setMontoCreditoCotitular(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
      </Section>

      {/* ── Preview cálculo ── */}
      {unidadSel && calculo && !calculo.error ? (
        <Section title="Cálculo de precio">
          {calculando ? (
            <p className="text-sm text-muted-foreground">
              <Loader2 className="inline size-3 animate-spin" /> Recalculando…
            </p>
          ) : null}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Valor comercial" value={money(calculo.valor_comercial)} />
            <Row
              label={`Excedente terreno (${calculo.metros_excedentes.toFixed(1)} m²)`}
              value={money(calculo.valor_excedente_terreno)}
            />
            <Row label="Frente verde (+2%)" value={money(calculo.valor_frente_verde)} />
            <Row
              label={`Esquina (+${(calculo.pct_esquina_aplicado * 100).toFixed(1)}%)`}
              value={money(calculo.valor_esquina)}
            />
            <Row label="Venta futuro" value={money(calculo.valor_venta_futuro)} />
            <Row label="Costo crédito adicional" value={money(calculo.costo_credito_adicional)} />
            <Row label="Precio de venta" value={money(calculo.precio_venta_total)} highlight />
            <Row label="Apoyo Infonavit" value={`− ${money(calculo.apoyo_infonavit)}`} />
            <Row label="Pago directo cliente" value={money(calculo.pago_directo)} highlight />
            <Row label="Enganche 1%" value={money(calculo.enganche_1pct)} />
            <Row label="ISAI 2%" value={money(calculo.isai_2pct)} />
            <Row label="Gastos notariales 6%" value={money(calculo.gastos_notariales_6pct)} />
          </dl>
        </Section>
      ) : calculo?.error ? (
        <Section title="Cálculo de precio">
          <p className="text-sm text-destructive">{calculo.error}</p>
        </Section>
      ) : null}

      {/* ── Submit ── */}
      <div className="flex items-center justify-end gap-3">
        <Link href="/dilesa/ventas">
          <Button variant="outline" disabled={submitting}>
            Cancelar
          </Button>
        </Link>
        <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Crear solicitud
        </Button>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dilesa/ventas"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Volver a ventas
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

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between border-b border-[var(--border)]/40 py-1 ${highlight ? 'font-semibold' : ''}`}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

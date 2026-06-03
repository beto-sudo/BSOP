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
import { useRouter, useSearchParams } from 'next/navigation';
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
import {
  TIPO_PERSONA_OPTIONS,
  NACIONALIDAD_OPTIONS,
  FORMA_PAGO_OPTIONS,
  USO_EFECTIVO_OPTIONS,
  ESTADO_CIVIL_OPTIONS,
  OCUPACION_OPTIONS,
  CONOCIMIENTO_DUENO_BENEFICIARIO_OPTIONS,
} from '@/lib/dilesa/ficu/catalogos';
import { evaluarRiesgo } from '@/lib/dilesa/ficu/riesgo';
import { calcularExpiraAt } from '@/lib/dilesa/hold-cola';
import { buildAdjuntoPath } from '@/lib/storage/path';

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
  productos_adicionales: number;
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
  const searchParams = useSearchParams();
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
  // Productos adicionales (paridad Coda): monto $ de extras del paquete que no
  // están en `dilesa.productos` (closets, upgrades, mejoras puntuales). Se
  // suma al precio total en `fn_calcular_precio_venta`. 0 si no hay.
  const [productosAdicionales, setProductosAdicionales] = useState<string>('');
  // La fecha + hora de la solicitud la setea el servidor al guardar (now()).
  // Importante para orden FIFO en Fase 2 cuando hay inventario limitado.

  // Cliente: modo (existente o nuevo)
  const [clienteModo, setClienteModo] = useState<'existente' | 'nuevo'>('nuevo');
  const [personaIdSeleccionada, setPersonaIdSeleccionada] = useState<string>('');
  const [busquedaPersona, setBusquedaPersona] = useState('');

  // Cliente nuevo — KYC completo (Sprint 7c-2: todo en Fase 1, no se difiere).
  // El form de Coda captura estos 14 campos extra que alimentan los 3 PDFs
  // (Solicitud, Aviso Privacidad, FICU) + el EBR automático. Ver
  // docs/planning/dilesa-portafolio-activos.md "Sprint 7c-2".
  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [curp, setCurp] = useState('');
  const [rfc, setRfc] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  // Datos personales / identificación
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [nss, setNss] = useState('');
  const [numeroCredencialIne, setNumeroCredencialIne] = useState('');
  // Domicilio estructurado
  const [domCalle, setDomCalle] = useState('');
  const [domNumExt, setDomNumExt] = useState('');
  const [domNumInt, setDomNumInt] = useState('');
  const [domColonia, setDomColonia] = useState('');
  const [domCp, setDomCp] = useState('');
  const [domCiudad, setDomCiudad] = useState('');
  const [domEstado, setDomEstado] = useState('');
  // KYC / FICU
  const [tipoPersona, setTipoPersona] = useState<'fisica' | 'moral'>('fisica');
  const [nacionalidad, setNacionalidad] = useState<string>('Mexicana');
  const [estadoCivil, setEstadoCivil] = useState<string>('');
  const [ocupacion, setOcupacion] = useState<string>('');
  const [esPep, setEsPep] = useState(false);
  const [formaPagoKyc, setFormaPagoKyc] = useState<string>('');
  const [usoEfectivoKyc, setUsoEfectivoKyc] = useState<string>('');
  const [conocimientoDuenoBeneficiario, setConocimientoDuenoBeneficiario] = useState<string>('No');
  // Expediente digital (1 PDF aglutinado con IFE + Acta Nac + RFC + CURP +
  // Sol Crédito + Acta Matrimonio — mismo patrón que Coda).
  const [expedienteFile, setExpedienteFile] = useState<File | null>(null);

  // Cálculo
  const [calculo, setCalculo] = useState<CalculoPrecio | null>(null);
  const [calculando, setCalculando] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // ── Load catálogos ──────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);

    // Unidades disponibles para asignar = obra arrancada con avance >= 20%
    // (`en_construccion`, set automático por trigger `tg_construccion_avance`)
    // o ya terminada físicamente (`terminada`). Las `planeada`/`lote_urbanizado`
    // NO aparecen aquí — son lotes sin obra arrancada y no son vendibles aún
    // bajo la regla operativa DILESA (regla 20%).
    const [uRes, prjRes, prodRes, tcRes, prRes, persRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('unidades')
        .select(
          'id, identificador, area_m2, es_esquina, tiene_frente_verde, proyecto_id, producto_id, estado'
        )
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .in('estado', ['en_construccion', 'terminada']),
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
        .is('deleted_at', null)
        .order('apellido_paterno', { ascending: true, nullsFirst: false })
        .order('nombre', { ascending: true })
        .range(0, 4999),
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

  // Pre-selección desde `?unidad=<id>` (deep link desde /dilesa/ventas/inventario).
  // Espera a que las unidades estén cargadas para resolver el proyecto.
  useEffect(() => {
    const preselectId = searchParams.get('unidad');
    if (!preselectId || unidades.length === 0 || unidadId) return;
    const u = unidades.find((x) => x.id === preselectId);
    if (u) {
      setProyectoId(u.proyecto_id);
      setUnidadId(u.id);
    }
  }, [searchParams, unidades, unidadId]);

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
        p_productos_adicionales: Number(productosAdicionales) || 0,
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
  }, [
    sb,
    unidadId,
    tipoCreditoId,
    montoCreditoTitular,
    montoCreditoCotitular,
    productosAdicionales,
  ]);

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
  // Sin búsqueda mostramos el catálogo completo (sort por apellido en la query).
  // Con búsqueda filtramos client-side por nombre completo o CURP — sin cap, los
  // matches reales son siempre pocos. El render de la lista vive en un
  // `max-h-64 overflow-auto` que ya pagina visualmente con scroll.
  const personasFiltradas = useMemo(() => {
    const q = busquedaPersona.trim().toLowerCase();
    if (!q) return personasExistentes;
    return personasExistentes.filter((p) => {
      const full = [p.nombre, p.apellido_paterno, p.apellido_materno]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return full.includes(q) || (p.curp ?? '').toLowerCase().includes(q);
    });
  }, [busquedaPersona, personasExistentes]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  // Paridad Coda: el form de Solicitud captura el expediente completo de Fase 1.
  // No es captura parcial — el operador NO debe poder guardar borrador sin todos
  // los campos obligatorios. Los `required` HTML quedan como hint visual + ARIA
  // pero la validación real vive aquí porque el submit es un `<Button onClick>`,
  // no un `<form onSubmit>` (no se ejecuta validación nativa del browser).
  const canSubmit = useMemo(() => {
    if (!unidadId || !tipoCreditoId) return false;
    if (montoCreditoTitular.trim() === '' || montoCreditoCotitular.trim() === '') return false;
    if (productosAdicionales.trim() === '') return false;
    if (clienteModo === 'existente') return !!personaIdSeleccionada;
    // Cliente nuevo: 21 campos obligatorios + expediente PDF.
    const obligatoriosTexto = [
      nombre,
      apellidoPaterno,
      apellidoMaterno,
      curp,
      rfc,
      telefono,
      email,
      fechaNacimiento,
      nss,
      numeroCredencialIne,
      domCalle,
      domNumExt,
      domColonia,
      domCp,
      domCiudad,
      domEstado,
      estadoCivil,
      ocupacion,
      formaPagoKyc,
      usoEfectivoKyc,
      conocimientoDuenoBeneficiario,
    ];
    if (obligatoriosTexto.some((v) => !v.trim())) return false;
    if (!expedienteFile) return false;
    return true;
  }, [
    unidadId,
    tipoCreditoId,
    montoCreditoTitular,
    montoCreditoCotitular,
    productosAdicionales,
    clienteModo,
    personaIdSeleccionada,
    nombre,
    apellidoPaterno,
    apellidoMaterno,
    curp,
    rfc,
    telefono,
    email,
    fechaNacimiento,
    nss,
    numeroCredencialIne,
    domCalle,
    domNumExt,
    domColonia,
    domCp,
    domCiudad,
    domEstado,
    estadoCivil,
    ocupacion,
    formaPagoKyc,
    usoEfectivoKyc,
    conocimientoDuenoBeneficiario,
    expedienteFile,
  ]);

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
            // Sprint 7c-2 — 14 campos KYC para FICU + EBR automático.
            fecha_nacimiento: fechaNacimiento || null,
            nss: nss.trim() || null,
            numero_credencial_ine: numeroCredencialIne.trim() || null,
            domicilio_calle: domCalle.trim() || null,
            domicilio_numero_exterior: domNumExt.trim() || null,
            domicilio_numero_interior: domNumInt.trim() || null,
            domicilio_colonia: domColonia.trim() || null,
            domicilio_codigo_postal: domCp.trim() || null,
            domicilio_ciudad: domCiudad.trim() || null,
            domicilio_estado: domEstado.trim() || null,
            tipo_persona: tipoPersona,
            nacionalidad: nacionalidad || null,
            estado_civil: estadoCivil || null,
            ocupacion: ocupacion || null,
            es_pep: esPep,
            forma_pago_kyc: formaPagoKyc || null,
            uso_efectivo_kyc: usoEfectivoKyc || null,
            conocimiento_dueno_beneficiario: conocimientoDuenoBeneficiario || 'No',
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
          // Hold de inventario: 2 días hábiles MX desde ahora. La columna
          // `expira_at` la consume el cron de expiración + los banners UI.
          // Ver `lib/dilesa/hold-cola.ts` + iniciativa Fase 2.
          expira_at: calcularExpiraAt(new Date()).toISOString(),
          tipo_credito: tipoCredito?.nombre ?? null,
          valor_comercial: calculo?.valor_comercial ?? null,
          precio_asignacion: calculo?.precio_venta_total ?? null,
          monto_credito_titular: Number(montoCreditoTitular) || null,
          monto_credito_cotitular: Number(montoCreditoCotitular) || null,
          productos_adicionales: Number(productosAdicionales) || 0,
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

      // 5) Upload del expediente digital (PDF aglutinado con IFE + Acta
      //    Nac + RFC + CURP + Sol Crédito + Acta Matrimonio — patrón Coda).
      //    Sprint 7c-2. Mismo layout que el script de migración histórico:
      //    `dilesa/ventas/<id>/<role>__<filename>`. Falla no bloquea — la
      //    venta ya está creada y el operador puede re-subir desde el detalle.
      if (expedienteFile) {
        try {
          const path = buildAdjuntoPath({
            empresa: 'dilesa',
            entidad: 'ventas',
            entidadId: ventaId,
            filename: expedienteFile.name,
          });
          const { error: upErr } = await sb.storage.from('adjuntos').upload(path, expedienteFile, {
            contentType: expedienteFile.type || 'application/pdf',
            upsert: false,
          });
          if (upErr) {
            console.warn('No se pudo subir expediente:', upErr.message);
          } else {
            const { error: adjErr } = await sb
              .schema('erp')
              .from('adjuntos')
              .insert({
                empresa_id: DILESA_EMPRESA_ID,
                entidad_tipo: 'ventas',
                entidad_id: ventaId,
                rol: 'expediente_digital',
                nombre: expedienteFile.name,
                url: path,
                tamano_bytes: expedienteFile.size,
                tipo_mime: expedienteFile.type || 'application/pdf',
                uploaded_by: user?.id ?? null,
              });
            if (adjErr) console.warn('No se pudo registrar adjunto:', adjErr.message);
          }
        } catch (e) {
          console.warn('Excepción subiendo expediente:', (e as Error).message);
        }
      }

      // 6) Marcar unidad como asignada
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

      // Email "Bienvenido a DILESA" inmediato — fire-and-forget. El cron
      // hourly sigue activo como safety net si esto falla (idempotente por
      // `notif_hold_creado_at`).
      void fetch(`/api/dilesa/ventas/${ventaId}/notify-hold-creado`, { method: 'POST' }).catch(
        (e) => console.warn('[hold-creado-email] fire-and-forget failed:', e)
      );

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
              placeholder="Buscar por nombre, apellido o CURP…"
              value={busquedaPersona}
              onChange={(e) => setBusquedaPersona(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {busquedaPersona.trim()
                ? `${personasFiltradas.length} coincidencia${personasFiltradas.length === 1 ? '' : 's'} de ${personasExistentes.length}`
                : `${personasExistentes.length} clientes en total — escribe para filtrar`}
            </p>
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
          <ClienteNuevoForm
            // Personales
            nombre={nombre}
            setNombre={setNombre}
            apellidoPaterno={apellidoPaterno}
            setApellidoPaterno={setApellidoPaterno}
            apellidoMaterno={apellidoMaterno}
            setApellidoMaterno={setApellidoMaterno}
            fechaNacimiento={fechaNacimiento}
            setFechaNacimiento={setFechaNacimiento}
            curp={curp}
            setCurp={setCurp}
            rfc={rfc}
            setRfc={setRfc}
            nss={nss}
            setNss={setNss}
            numeroCredencialIne={numeroCredencialIne}
            setNumeroCredencialIne={setNumeroCredencialIne}
            telefono={telefono}
            setTelefono={setTelefono}
            email={email}
            setEmail={setEmail}
            // Domicilio
            domCalle={domCalle}
            setDomCalle={setDomCalle}
            domNumExt={domNumExt}
            setDomNumExt={setDomNumExt}
            domNumInt={domNumInt}
            setDomNumInt={setDomNumInt}
            domColonia={domColonia}
            setDomColonia={setDomColonia}
            domCp={domCp}
            setDomCp={setDomCp}
            domCiudad={domCiudad}
            setDomCiudad={setDomCiudad}
            domEstado={domEstado}
            setDomEstado={setDomEstado}
            // KYC
            tipoPersona={tipoPersona}
            setTipoPersona={setTipoPersona}
            nacionalidad={nacionalidad}
            setNacionalidad={setNacionalidad}
            estadoCivil={estadoCivil}
            setEstadoCivil={setEstadoCivil}
            ocupacion={ocupacion}
            setOcupacion={setOcupacion}
            esPep={esPep}
            setEsPep={setEsPep}
            formaPagoKyc={formaPagoKyc}
            setFormaPagoKyc={setFormaPagoKyc}
            usoEfectivoKyc={usoEfectivoKyc}
            setUsoEfectivoKyc={setUsoEfectivoKyc}
            conocimientoDuenoBeneficiario={conocimientoDuenoBeneficiario}
            setConocimientoDuenoBeneficiario={setConocimientoDuenoBeneficiario}
          />
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
          <Field label="Monto crédito titular *">
            <Input
              type="number"
              value={montoCreditoTitular}
              onChange={(e) => setMontoCreditoTitular(e.target.value)}
              placeholder="0"
              required
            />
          </Field>
          <Field label="Monto crédito co-titular *">
            <Input
              type="number"
              value={montoCreditoCotitular}
              onChange={(e) => setMontoCreditoCotitular(e.target.value)}
              placeholder="0 si no hay co-titular"
              required
            />
          </Field>
          <Field label="Productos adicionales *">
            <Input
              type="number"
              value={productosAdicionales}
              onChange={(e) => setProductosAdicionales(e.target.value)}
              placeholder="0 si no hay productos adicionales"
              required
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
            <Row label="Productos adicionales" value={money(calculo.productos_adicionales ?? 0)} />
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

      {/* ── EBR preview (solo cliente nuevo, ayuda al vendedor a ver el
           score que tendrá el FICU antes de cerrar) ── */}
      {clienteModo === 'nuevo' ? (
        <EbrPreview
          tipoPersona={tipoPersona}
          nacionalidad={nacionalidad}
          esPep={esPep}
          formaPago={formaPagoKyc}
          usoEfectivo={usoEfectivoKyc}
        />
      ) : null}

      {/* ── Expediente digital — 1 PDF aglutinado patrón Coda ── */}
      {clienteModo === 'nuevo' ? (
        <Section title="Expediente digital del cliente *">
          <p className="mb-3 text-xs text-muted-foreground">
            Sube un PDF con: IFE/INE, Acta de Nacimiento, RFC, CURP, Solicitud de Crédito y, si
            aplica, Acta de Matrimonio. Se guarda en el bucket privado y queda asociado a la venta
            para el flujo de Fase 2 (Asignada).
          </p>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setExpedienteFile(e.target.files?.[0] ?? null)}
            required
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--card)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-[var(--accent)]/5"
          />
          {expedienteFile ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Seleccionado: <span className="font-mono">{expedienteFile.name}</span> ·{' '}
              {(expedienteFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          ) : null}
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

// ── Sub-componentes Sprint 7c-2 ──────────────────────────────────────────

/**
 * Form expandido del cliente nuevo. 4 sub-secciones:
 *   1. Datos personales (nombre + identificadores)
 *   2. Domicilio estructurado (7 campos)
 *   3. Contacto
 *   4. KYC / FICU (8 campos para EBR + reportes LFPIORPI)
 */
type ClienteNuevoFormProps = {
  // Personales
  nombre: string;
  setNombre: (v: string) => void;
  apellidoPaterno: string;
  setApellidoPaterno: (v: string) => void;
  apellidoMaterno: string;
  setApellidoMaterno: (v: string) => void;
  fechaNacimiento: string;
  setFechaNacimiento: (v: string) => void;
  curp: string;
  setCurp: (v: string) => void;
  rfc: string;
  setRfc: (v: string) => void;
  nss: string;
  setNss: (v: string) => void;
  numeroCredencialIne: string;
  setNumeroCredencialIne: (v: string) => void;
  telefono: string;
  setTelefono: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  // Domicilio
  domCalle: string;
  setDomCalle: (v: string) => void;
  domNumExt: string;
  setDomNumExt: (v: string) => void;
  domNumInt: string;
  setDomNumInt: (v: string) => void;
  domColonia: string;
  setDomColonia: (v: string) => void;
  domCp: string;
  setDomCp: (v: string) => void;
  domCiudad: string;
  setDomCiudad: (v: string) => void;
  domEstado: string;
  setDomEstado: (v: string) => void;
  // KYC
  tipoPersona: 'fisica' | 'moral';
  setTipoPersona: (v: 'fisica' | 'moral') => void;
  nacionalidad: string;
  setNacionalidad: (v: string) => void;
  estadoCivil: string;
  setEstadoCivil: (v: string) => void;
  ocupacion: string;
  setOcupacion: (v: string) => void;
  esPep: boolean;
  setEsPep: (v: boolean) => void;
  formaPagoKyc: string;
  setFormaPagoKyc: (v: string) => void;
  usoEfectivoKyc: string;
  setUsoEfectivoKyc: (v: string) => void;
  conocimientoDuenoBeneficiario: string;
  setConocimientoDuenoBeneficiario: (v: string) => void;
};

function ClienteNuevoForm(props: ClienteNuevoFormProps) {
  return (
    <div className="mt-4 space-y-6">
      {/* — Datos personales — */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Nombre(s) *">
          <Input value={props.nombre} onChange={(e) => props.setNombre(e.target.value)} required />
        </Field>
        <Field label="Apellido paterno *">
          <Input
            value={props.apellidoPaterno}
            onChange={(e) => props.setApellidoPaterno(e.target.value)}
            required
          />
        </Field>
        <Field label="Apellido materno *">
          <Input
            value={props.apellidoMaterno}
            onChange={(e) => props.setApellidoMaterno(e.target.value)}
            required
          />
        </Field>
        <Field label="Fecha de nacimiento *">
          <Input
            type="date"
            value={props.fechaNacimiento}
            onChange={(e) => props.setFechaNacimiento(e.target.value)}
          />
        </Field>
        <Field label="CURP *">
          <Input
            value={props.curp}
            onChange={(e) => props.setCurp(e.target.value.toUpperCase())}
            maxLength={18}
          />
        </Field>
        <Field label="RFC *">
          <Input
            value={props.rfc}
            onChange={(e) => props.setRfc(e.target.value.toUpperCase())}
            maxLength={13}
          />
        </Field>
        <Field label="NSS (Seguro Social) *">
          <Input
            value={props.nss}
            onChange={(e) => props.setNss(e.target.value)}
            maxLength={11}
            required
          />
        </Field>
        <Field label="Número Credencial INE *">
          <Input
            value={props.numeroCredencialIne}
            onChange={(e) => props.setNumeroCredencialIne(e.target.value.toUpperCase())}
          />
        </Field>
        <div />
        <Field label="Teléfono *">
          <Input value={props.telefono} onChange={(e) => props.setTelefono(e.target.value)} />
        </Field>
        <Field label="Email *">
          <Input
            type="email"
            value={props.email}
            onChange={(e) => props.setEmail(e.target.value)}
          />
        </Field>
      </div>

      {/* — Domicilio — */}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Domicilio
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="Calle *">
              <Input value={props.domCalle} onChange={(e) => props.setDomCalle(e.target.value)} />
            </Field>
          </div>
          <Field label="Núm. exterior *">
            <Input value={props.domNumExt} onChange={(e) => props.setDomNumExt(e.target.value)} />
          </Field>
          <Field label="Núm. interior">
            <Input value={props.domNumInt} onChange={(e) => props.setDomNumInt(e.target.value)} />
          </Field>
          <Field label="Colonia *">
            <Input value={props.domColonia} onChange={(e) => props.setDomColonia(e.target.value)} />
          </Field>
          <Field label="Código postal *">
            <Input
              value={props.domCp}
              onChange={(e) => props.setDomCp(e.target.value)}
              maxLength={5}
            />
          </Field>
          <Field label="Ciudad *">
            <Input value={props.domCiudad} onChange={(e) => props.setDomCiudad(e.target.value)} />
          </Field>
          <Field label="Estado *">
            <Input value={props.domEstado} onChange={(e) => props.setDomEstado(e.target.value)} />
          </Field>
        </div>
      </div>

      {/* — KYC / FICU — */}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          KYC / FICU (alimenta el cálculo automático del EBR)
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Personalidad *">
            <select
              value={props.tipoPersona}
              onChange={(e) => props.setTipoPersona(e.target.value as 'fisica' | 'moral')}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            >
              {TIPO_PERSONA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nacionalidad *">
            <select
              value={props.nacionalidad}
              onChange={(e) => props.setNacionalidad(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            >
              {NACIONALIDAD_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado civil *">
            <select
              value={props.estadoCivil}
              onChange={(e) => props.setEstadoCivil(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            >
              <option value="">— selecciona —</option>
              {ESTADO_CIVIL_OPTIONS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ocupación *">
            <select
              value={props.ocupacion}
              onChange={(e) => props.setOcupacion(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            >
              <option value="">— selecciona —</option>
              {OCUPACION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Persona Políticamente Expuesta (PEP) *">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={props.esPep}
                onChange={(e) => props.setEsPep(e.target.checked)}
                className="size-4"
              />
              <span className="text-muted-foreground">
                Marcar si el cliente declara ser PEP o familiar directo
              </span>
            </label>
          </Field>
          <Field label="Conoce al dueño beneficiario *">
            <select
              value={props.conocimientoDuenoBeneficiario}
              onChange={(e) => props.setConocimientoDuenoBeneficiario(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              required
            >
              {CONOCIMIENTO_DUENO_BENEFICIARIO_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Forma de pago *">
            <select
              value={props.formaPagoKyc}
              onChange={(e) => props.setFormaPagoKyc(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            >
              <option value="">— selecciona —</option>
              {FORMA_PAGO_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Uso de efectivo *">
            <select
              value={props.usoEfectivoKyc}
              onChange={(e) => props.setUsoEfectivoKyc(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            >
              <option value="">— selecciona —</option>
              {USO_EFECTIVO_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

/**
 * Preview del EBR (Evaluación Basada en Riesgo) calculado live conforme
 * el vendedor llena el form. Da feedback inmediato si el cliente quedará
 * en Bajo / Medio / Alto para que el vendedor sepa si requiere docs
 * extra (LFPIORPI Art. 18).
 */
function EbrPreview({
  tipoPersona,
  nacionalidad,
  esPep,
  formaPago,
  usoEfectivo,
}: {
  tipoPersona: string;
  nacionalidad: string;
  esPep: boolean;
  formaPago: string;
  usoEfectivo: string;
}) {
  // No mostrar si aún no hay info mínima — evita banner desinformado.
  if (!formaPago || !usoEfectivo) return null;
  const r = evaluarRiesgo({
    tipoPersona,
    nacionalidad,
    esPep,
    formaPago,
    usoEfectivo,
  });
  const tone =
    r.clasificacion === 'Bajo'
      ? 'border-green-500/40 bg-green-500/10 text-green-700'
      : r.clasificacion === 'Medio'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
        : 'border-red-500/40 bg-red-500/10 text-red-700';
  return (
    <Section title="Vista previa del EBR (Enfoque Basado en Riesgo)">
      <div className={`rounded-md border p-3 ${tone}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">
            Clasificación: <strong>{r.clasificacion}</strong>
          </span>
          <span className="font-mono text-sm tabular-nums">{r.scoreTotal.toFixed(2)}%</span>
        </div>
        <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-5">
          {r.criterios.map((c) => (
            <li key={c.nombre} className="flex flex-col">
              <span className="text-muted-foreground">{c.nombre}</span>
              <span>
                <strong>{c.nivel}</strong>{' '}
                <span className="text-muted-foreground">({c.porcentaje}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Cálculo automático per LFPIORPI Art. 18. Cambia en vivo según las selecciones del KYC.
      </p>
    </Section>
  );
}

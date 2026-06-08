/**
 * Page pública para que el notario suba la Carta de Instrucción Notarial
 * desde el magic link del email de Fase 7. **Sin login.**
 *
 * Análogo a `app/dilesa/valuador/avaluo/[token]/page.tsx`.
 */

import Image from 'next/image';
import { verifyDictamenToken, type VerifyResult } from '@/lib/dilesa/dictamen-token';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DictamenUploadForm } from './form';

export const dynamic = 'force-dynamic';

interface ContextoVenta {
  ventaId: string;
  empresaId: string;
  estado: string;
  faseSeven: boolean;
  faseEight: boolean;
  proyectoNombre: string;
  unidadIdentificador: string;
  identificacionInventario: string;
  manzana: string | null;
  lote: string | null;
  prototipo: string | null;
  domicilioOficial: string | null;
  areaM2: number | null;
  m2Construccion: number | null;
  clienteNombre: string;
  notarioNombre: string;
  vendedorNombre: string | null;
  vendedorEmail: string | null;
  tipoCredito: string | null;
  precioVenta: number | null;
  fechaDictaminada: string | null;
}

export default async function NotarioDictamenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verify = await verifyDictamenToken(token);
  if (!verify.ok) {
    return <ErrorPage variant={verify} />;
  }

  const ctx = await loadContexto(verify.payload.ventaId, verify.payload.notarioId);
  if (!ctx) {
    return (
      <ErrorPage
        variant={{ ok: false, error: 'bad_signature' }}
        customMessage="No se encontró la venta o el notario. El enlace ya no aplica."
      />
    );
  }

  if (ctx.estado !== 'activa') {
    return (
      <Shell>
        <Card>
          <Heading>Esta venta ya no está activa</Heading>
          <p className="mt-3 text-sm text-[#4F4C4D]">
            La venta de <b>{ctx.clienteNombre}</b> por la unidad{' '}
            <b>{ctx.identificacionInventario}</b> está en estado <b>{ctx.estado}</b>.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!ctx.faseSeven) {
    return (
      <Shell>
        <Card>
          <Heading>La solicitud de dictaminación aún no está cerrada</Heading>
          <p className="mt-3 text-sm text-[#4F4C4D]">
            DILESA todavía no ha confirmado la solicitud de dictamen para esta operación. Espera un
            nuevo correo de confirmación antes de subir la Carta de Instrucción.
          </p>
        </Card>
      </Shell>
    );
  }

  if (ctx.faseEight) {
    return (
      <Shell>
        <Card>
          <Heading>Carta de Instrucción recibida</Heading>
          <p className="mt-3 text-sm text-[#4F4C4D]">
            DILESA ya tiene capturado el dictamen de esta operación:
          </p>
          <div className="mt-4 rounded-md border border-[#7D812E]/30 bg-[#FAF7EE] p-4 text-sm">
            <Row label="Unidad" value={ctx.identificacionInventario} />
            <Row label="Cliente" value={ctx.clienteNombre} />
            <Row label="Fecha del dictamen" value={ctx.fechaDictaminada ?? '—'} />
          </div>
          <p className="mt-4 text-xs text-[#4F4C4D]">
            Si necesitas corregir algo, contacta directamente a Gerencia de Ventas DILESA — el
            enlace no permite re-subir.
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-4">
        <Heading>Subir Carta de Instrucción Notarial</Heading>
        <p className="mt-2 text-sm text-[#4F4C4D]">
          Hola <b>{ctx.notarioNombre}</b>, te dejamos los datos del inmueble, del cliente y de la
          operación. Adjunta el PDF de la Carta de Instrucción y la fecha del dictamen.
        </p>
      </div>

      <Card>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#7D812E]">
          Datos del inmueble
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label="Fraccionamiento" value={ctx.proyectoNombre} />
          <Row label="Manzana" value={ctx.manzana ?? '—'} />
          <Row label="Lote" value={ctx.lote ?? '—'} />
          <Row label="Prototipo" value={ctx.prototipo ?? '—'} />
          <Row label="Identificación" value={ctx.identificacionInventario} />
          <Row label="Dirección" value={ctx.domicilioOficial ?? '—'} />
          <Row
            label="Área terreno"
            value={ctx.areaM2 != null ? `${ctx.areaM2.toFixed(2)} m²` : '—'}
          />
          <Row
            label="Área construida"
            value={ctx.m2Construccion != null ? `${ctx.m2Construccion.toFixed(2)} m²` : '—'}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#7D812E]">
          Datos de la operación
        </h2>
        <div className="mt-2 grid grid-cols-1 gap-y-2 text-sm">
          <Row label="Cliente" value={ctx.clienteNombre} />
          <Row label="Tipo de crédito" value={ctx.tipoCredito ?? '—'} />
          <Row label="Precio de venta" value={formatCurrency(ctx.precioVenta)} />
          {ctx.vendedorNombre ? <Row label="Gerente de ventas" value={ctx.vendedorNombre} /> : null}
          {ctx.vendedorEmail ? <Row label="Correo del gerente" value={ctx.vendedorEmail} /> : null}
        </div>
      </Card>

      <DictamenUploadForm token={token} />
    </Shell>
  );
}

async function loadContexto(ventaId: string, notarioId: string): Promise<ContextoVenta | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data: v } = await admin
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, persona_id, unidad_id, estado, notario_id, vendedor, vendedor_usuario_id, tipo_credito, precio_asignacion, fecha_dictaminada'
    )
    .eq('id', ventaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!v || v.notario_id !== notarioId) return null;

  const [
    { data: persona },
    { data: notario },
    { data: unidad },
    { data: usuario },
    { data: fases },
  ] = await Promise.all([
    admin
      .schema('erp')
      .from('personas')
      .select('nombre, apellido_paterno, apellido_materno')
      .eq('id', v.persona_id)
      .maybeSingle(),
    admin
      .schema('erp')
      .from('personas')
      .select('nombre, apellido_paterno, apellido_materno')
      .eq('id', notarioId)
      .maybeSingle(),
    v.unidad_id
      ? admin
          .schema('dilesa')
          .from('unidades')
          .select(
            'identificador, proyecto_id, producto_id, manzana, numero_lote, calle, numero_oficial, area_m2, m2_construccion'
          )
          .eq('id', v.unidad_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    v.vendedor_usuario_id
      ? admin
          .schema('core')
          .from('usuarios')
          .select('first_name, last_name, email')
          .eq('id', v.vendedor_usuario_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .schema('dilesa')
      .from('venta_fases')
      .select('posicion')
      .eq('venta_id', ventaId)
      .is('deleted_at', null),
  ]);

  let proyectoNombre = '';
  let prototipoSufijo: string | null = null;
  if (unidad?.proyecto_id) {
    const { data: p } = await admin
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', unidad.proyecto_id)
      .maybeSingle();
    proyectoNombre = (p?.nombre as string | undefined) ?? '';
  }
  if (unidad?.producto_id) {
    const { data: pr } = await admin
      .schema('dilesa')
      .from('productos')
      .select('nombre')
      .eq('id', unidad.producto_id)
      .maybeSingle();
    prototipoSufijo = (pr?.nombre as string | undefined)?.split('-').pop() ?? null;
  }

  const clienteNombre =
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ') || '(sin nombre)';
  const notarioNombre =
    [notario?.nombre, notario?.apellido_paterno, notario?.apellido_materno]
      .filter(Boolean)
      .join(' ')
      .trim() || '(sin nombre)';
  const vendedorNombre =
    [usuario?.first_name, usuario?.last_name].filter(Boolean).join(' ').trim() ||
    (v.vendedor as string | null) ||
    null;
  const identificadorBase = (unidad?.identificador as string | undefined) ?? '(sin unidad)';
  const identificacionInventario = prototipoSufijo
    ? `${identificadorBase}-${prototipoSufijo}`
    : identificadorBase;
  const domicilioOficial =
    [unidad?.calle, unidad?.numero_oficial].filter(Boolean).join(' #').toUpperCase() || null;

  const posiciones = new Set<number>((fases ?? []).map((f) => f.posicion as number));

  return {
    ventaId: v.id as string,
    empresaId: v.empresa_id as string,
    estado: v.estado as string,
    faseSeven: posiciones.has(7),
    faseEight: posiciones.has(8),
    proyectoNombre,
    unidadIdentificador: identificadorBase,
    identificacionInventario,
    manzana: (unidad?.manzana as string | null) ?? null,
    lote: (unidad?.numero_lote as string | null) ?? null,
    prototipo: prototipoSufijo,
    domicilioOficial,
    areaM2: unidad?.area_m2 != null ? Number(unidad.area_m2) : null,
    m2Construccion: unidad?.m2_construccion != null ? Number(unidad.m2_construccion) : null,
    clienteNombre,
    notarioNombre,
    vendedorNombre,
    vendedorEmail: (usuario?.email as string | null) ?? null,
    tipoCredito: v.tipo_credito as string | null,
    precioVenta: v.precio_asignacion != null ? Number(v.precio_asignacion) : null,
    fechaDictaminada: v.fecha_dictaminada as string | null,
  };
}

// ── Presentacionales (mismo patrón que /dilesa/valuador/avaluo/[token]) ──

function ErrorPage({ variant, customMessage }: { variant: VerifyResult; customMessage?: string }) {
  const msg =
    customMessage ??
    (variant.ok
      ? '—'
      : variant.error === 'expired'
        ? 'El enlace caducó. Solicita uno nuevo a Gerencia de Ventas DILESA.'
        : 'El enlace no es válido. Verifica que estés usando la URL completa del correo.');
  return (
    <Shell>
      <Card>
        <Heading>Enlace no válido</Heading>
        <p className="mt-3 text-sm text-[#4F4C4D]">{msg}</p>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAF7EE] py-10 text-[#1F1F1F]">
      <div className="mx-auto w-full max-w-2xl px-4">
        <header className="mb-6 flex items-center gap-4">
          <Image
            src="/brand/dilesa/header-email.png"
            alt="DILESA"
            width={320}
            height={64}
            priority
            style={{ height: 'auto', width: '100%', maxWidth: 320 }}
          />
        </header>
        {children}
        <footer className="mt-8 text-center text-xs text-[#4F4C4D]">
          DILESA · Desarrollo Inmobiliario Los Encinos · dilesa.mx · (878) 791-1818
        </footer>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-[#7D812E]/20 bg-white p-5 shadow-sm">
      {children}
    </section>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="text-lg font-semibold tracking-tight text-[#1F1F1F]">{children}</h1>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#7D812E]/10 py-1.5 last:border-b-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[#4F4C4D]">
        {label}
      </span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

function formatCurrency(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Page pública para que el valuador suba el dictamen del avalúo desde
 * el magic link del email de Fase 4. **Sin login.**
 *
 * Estados visibles:
 *  - Token inválido / expirado → mensaje de error claro
 *  - Venta ya desasignada / expirada → mensaje "ya no aplica"
 *  - Fase 5 YA cerrada → resumen read-only del avalúo capturado
 *  - Todo OK → datos del inmueble/cliente + form de captura
 *
 * Server component: hace toda la verificación con admin client antes
 * de renderizar. El form es un sub-componente client porque maneja
 * file upload + submit.
 *
 * Iniciativa `dilesa-portafolio-activos` Sprint 7d — magic link.
 */

import Image from 'next/image';
import { verifyAvaluoToken, type VerifyResult } from '@/lib/dilesa/avaluo-token';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { AvaluoUploadForm } from './form';

export const dynamic = 'force-dynamic';

interface ContextoVenta {
  ventaId: string;
  empresaId: string;
  estado: string;
  faseFive: boolean;
  faseFour: boolean;
  proyectoNombre: string;
  unidadIdentificador: string;
  identificacionInventario: string;
  manzana: string | null;
  lote: string | null;
  prototipo: string | null;
  domicilioOficial: string | null;
  areaM2: number | null;
  m2Construccion: number | null;
  esquina: boolean;
  tieneFrenteVerde: boolean;
  clienteNombre: string;
  valuadorNombre: string;
  vendedorNombre: string | null;
  vendedorEmail: string | null;
  /** Si Fase 5 está cerrada, traemos el monto + fecha capturados. */
  montoAvaluo: number | null;
  fechaAvaluoCerrado: string | null;
}

export default async function ValuadorAvaluoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verify = await verifyAvaluoToken(token);
  if (!verify.ok) {
    return <ErrorPage variant={verify} />;
  }

  const ctx = await loadContexto(verify.payload.ventaId, verify.payload.valuadorId);
  if (!ctx) {
    return (
      <ErrorPage
        variant={{ ok: false, error: 'bad_signature' }}
        customMessage="No se encontró la venta o el valuador. Es posible que el enlace ya no aplique."
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
          <p className="mt-2 text-sm text-[#4F4C4D]">
            Si crees que es un error, contacta a Gerencia de Ventas DILESA.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!ctx.faseFour) {
    return (
      <Shell>
        <Card>
          <Heading>La solicitud de avalúo aún no está cerrada</Heading>
          <p className="mt-3 text-sm text-[#4F4C4D]">
            DILESA todavía no ha confirmado la solicitud de avalúo para esta unidad. Espera un nuevo
            correo de confirmación antes de subir el dictamen.
          </p>
        </Card>
      </Shell>
    );
  }

  if (ctx.faseFive) {
    return (
      <Shell>
        <Card>
          <Heading>Avalúo recibido</Heading>
          <p className="mt-3 text-sm text-[#4F4C4D]">
            DILESA ya tiene capturado el avalúo de esta unidad:
          </p>
          <div className="mt-4 rounded-md border border-[#7D812E]/30 bg-[#FAF7EE] p-4 text-sm">
            <Row label="Unidad" value={ctx.identificacionInventario} />
            <Row label="Cliente" value={ctx.clienteNombre} />
            <Row label="Monto del avalúo" value={formatCurrency(ctx.montoAvaluo)} />
            <Row label="Fecha del avalúo" value={ctx.fechaAvaluoCerrado ?? '—'} />
          </div>
          <p className="mt-4 text-xs text-[#4F4C4D]">
            Si necesitas corregir algún dato del avalúo, contacta directamente a Gerencia de Ventas
            — el enlace no permite re-subir.
          </p>
        </Card>
      </Shell>
    );
  }

  // ── Todo OK: form de captura ───────────────────────────────────────────
  return (
    <Shell>
      <div className="mb-4">
        <Heading>Subir avalúo comercial</Heading>
        <p className="mt-2 text-sm text-[#4F4C4D]">
          Hola <b>{ctx.valuadorNombre}</b>, te dejamos los datos del inmueble y del cliente. Adjunta
          el PDF del dictamen y captura el monto al terminar.
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
          <Row label="Características" value={caracteristicas(ctx)} />
        </div>
      </Card>

      <Card>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#7D812E]">
          Datos del comprador
        </h2>
        <div className="mt-2 grid grid-cols-1 gap-y-2 text-sm">
          <Row label="Nombre" value={ctx.clienteNombre} />
          {ctx.vendedorNombre ? <Row label="Gerente de ventas" value={ctx.vendedorNombre} /> : null}
          {ctx.vendedorEmail ? <Row label="Correo del gerente" value={ctx.vendedorEmail} /> : null}
        </div>
      </Card>

      <AvaluoUploadForm token={token} />
    </Shell>
  );
}

// ── Loader del contexto ───────────────────────────────────────────────────

async function loadContexto(ventaId: string, valuadorId: string): Promise<ContextoVenta | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data: v } = await admin
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, persona_id, unidad_id, estado, valuador_id, monto_avaluo, fecha_avaluo_cerrado, vendedor, vendedor_usuario_id'
    )
    .eq('id', ventaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!v || v.valuador_id !== valuadorId) return null;

  const [
    { data: persona },
    { data: valuador },
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
      .eq('id', valuadorId)
      .maybeSingle(),
    v.unidad_id
      ? admin
          .schema('dilesa')
          .from('unidades')
          .select(
            'identificador, proyecto_id, producto_id, manzana, numero_lote, calle, numero_oficial, area_m2, m2_construccion, es_esquina, tiene_frente_verde'
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
  const valuadorNombre =
    [valuador?.nombre, valuador?.apellido_paterno, valuador?.apellido_materno]
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
    faseFive: posiciones.has(5),
    faseFour: posiciones.has(4),
    proyectoNombre,
    unidadIdentificador: identificadorBase,
    identificacionInventario,
    manzana: (unidad?.manzana as string | null) ?? null,
    lote: (unidad?.numero_lote as string | null) ?? null,
    prototipo: prototipoSufijo,
    domicilioOficial,
    areaM2: unidad?.area_m2 != null ? Number(unidad.area_m2) : null,
    m2Construccion: unidad?.m2_construccion != null ? Number(unidad.m2_construccion) : null,
    esquina: !!unidad?.es_esquina,
    tieneFrenteVerde: !!unidad?.tiene_frente_verde,
    clienteNombre,
    valuadorNombre,
    vendedorNombre,
    vendedorEmail: (usuario?.email as string | null) ?? null,
    montoAvaluo: v.monto_avaluo != null ? Number(v.monto_avaluo) : null,
    fechaAvaluoCerrado: v.fecha_avaluo_cerrado as string | null,
  };
}

// ── Helpers presentacionales ──────────────────────────────────────────────

function ErrorPage({ variant, customMessage }: { variant: VerifyResult; customMessage?: string }) {
  const msg =
    customMessage ??
    (variant.ok
      ? '—'
      : variant.error === 'expired'
        ? 'El enlace caducó. Solicita uno nuevo a Gerencia de Ventas de DILESA.'
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

function caracteristicas(ctx: ContextoVenta): string {
  const partes: string[] = [];
  if (ctx.esquina) partes.push('Esquina');
  if (ctx.tieneFrenteVerde) partes.push('Frente verde');
  return partes.length === 0 ? '—' : partes.join(' · ');
}

function formatCurrency(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n);
}

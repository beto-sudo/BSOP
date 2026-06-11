/**
 * Page pública para que el cliente responda la Encuesta de Conformidad
 * posventa (Fase 16) desde el magic link del email. **Sin login.**
 *
 * Análogo a `app/dilesa/notario/dictamen/[token]/page.tsx`. Mobile-first:
 * el cliente la abre desde su celular.
 *
 * Iniciativa `dilesa-ventas-expediente` · S5 final.
 */

import Image from 'next/image';
import { verifyEncuestaToken } from '@/lib/dilesa/encuesta-token';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { EncuestaForm } from './form';

export const dynamic = 'force-dynamic';

interface Contexto {
  ventaId: string;
  clienteNombre: string;
  proyectoNombre: string | null;
  yaRespondida: boolean;
}

export default async function EncuestaClientePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verify = await verifyEncuestaToken(token);
  if (!verify.ok) {
    const msg =
      verify.error === 'expired'
        ? 'Esta liga ya expiró. Si quieres compartirnos tu opinión, contáctanos y con gusto la registramos.'
        : 'Esta liga no es válida. Verifica que la copiaste completa desde el correo.';
    return (
      <Shell>
        <Card>
          <Heading>No pudimos abrir tu encuesta</Heading>
          <p className="mt-3 text-sm text-[#4F4C4D]">{msg}</p>
        </Card>
      </Shell>
    );
  }

  const ctx = await loadContexto(verify.payload.ventaId);
  if (!ctx) {
    return (
      <Shell>
        <Card>
          <Heading>No encontramos tu operación</Heading>
          <p className="mt-3 text-sm text-[#4F4C4D]">
            La liga ya no aplica. Si necesitas algo, contáctanos — estamos para servirte.
          </p>
        </Card>
      </Shell>
    );
  }

  if (ctx.yaRespondida) {
    return (
      <Shell>
        <Card>
          <Heading>¡Gracias, ya tenemos tus respuestas!</Heading>
          <p className="mt-3 text-sm text-[#4F4C4D]">
            <b>{ctx.clienteNombre}</b>, tu encuesta ya fue registrada. Agradecemos mucho tu tiempo —
            tus comentarios nos ayudan a mejorar.
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <Heading>Cuéntanos cómo recibiste tu casa</Heading>
        <p className="mt-2 text-sm text-[#4F4C4D]">
          <b>{ctx.clienteNombre}</b>, gracias por confiar en DILESA
          {ctx.proyectoNombre ? (
            <>
              {' '}
              para tu hogar en <b>{ctx.proyectoNombre}</b>
            </>
          ) : null}
          . Son solo 4 preguntas — menos de un minuto.
        </p>
      </Card>
      <EncuestaForm token={token} />
    </Shell>
  );
}

async function loadContexto(ventaId: string): Promise<Contexto | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data: venta } = await admin
    .schema('dilesa')
    .from('ventas')
    .select('id, persona_id, unidad_id')
    .eq('id', ventaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!venta) return null;

  const [{ data: persona }, { data: encuesta }, { data: unidad }] = await Promise.all([
    admin
      .schema('erp')
      .from('personas')
      .select('nombre, apellido_paterno')
      .eq('id', venta.persona_id)
      .maybeSingle(),
    admin
      .schema('dilesa')
      .from('venta_encuestas')
      .select('estado, respondida_at')
      .eq('venta_id', ventaId)
      .maybeSingle(),
    venta.unidad_id
      ? admin
          .schema('dilesa')
          .from('unidades')
          .select('proyecto_id')
          .eq('id', venta.unidad_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let proyectoNombre: string | null = null;
  if (unidad?.proyecto_id) {
    const { data: proyecto } = await admin
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', unidad.proyecto_id)
      .maybeSingle();
    proyectoNombre = (proyecto?.nombre as string | null) ?? null;
  }

  return {
    ventaId,
    clienteNombre:
      [persona?.nombre, persona?.apellido_paterno].filter(Boolean).join(' ') || 'Cliente',
    proyectoNombre,
    yaRespondida: encuesta?.respondida_at != null,
  };
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
  return <h1 className="text-lg font-semibold text-[#1F1F1F]">{children}</h1>;
}

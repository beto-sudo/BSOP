'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getEffectiveUser } from '@/lib/auth/effective-user';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

// Captura de recibos de servicios (iniciativa sanren-servicios, Sprint 4).
// SANREN es data personal de Beto: las tablas sanren.* tienen RLS deny-all, así
// que la escritura va con service_role (getSupabaseAdminClient), igual que la
// lectura. Admin-only en v1 (como health.protocolo_*); se generaliza a acceso
// por empresa cuando haya multi-usuario. Respeta el read-only de "viendo como".

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

export type NuevoReciboInput = {
  servicioId: string;
  periodo: string; // YYYY-MM
  fechaRecibo: string; // YYYY-MM-DD
  monto: number | null;
  folio: string | null;
  lecturaConsumo: number | null;
  lecturaProduccion: number | null;
  pagado: boolean;
  fechaPago: string | null;
  notas: string | null;
};

async function requireSanrenAdmin() {
  await assertNotInPreview();
  const supabase = await createSupabaseServerClient();
  const eu = await getEffectiveUser(supabase);
  if (!eu) throw new Error('No autenticado.');
  if (!eu.isAdmin) throw new Error('Sin acceso a Servicios.');
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error('Servicio no configurado.');
  return admin;
}

export async function createRecibo(input: NuevoReciboInput): Promise<ActionResult> {
  try {
    const admin = await requireSanrenAdmin();
    if (!input.servicioId) return { ok: false, error: 'Selecciona un servicio.' };
    if (!input.fechaRecibo) return { ok: false, error: 'La fecha del recibo es obligatoria.' };
    const periodo = input.periodo ? `${input.periodo}-01` : `${input.fechaRecibo.slice(0, 7)}-01`;

    const sr = admin.schema('sanren' as never) as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };

    const { data, error } = await sr
      .from('recibos')
      .insert({
        servicio_id: input.servicioId,
        periodo,
        fecha_recibo: input.fechaRecibo,
        monto: input.monto,
        moneda: 'MXN',
        folio: input.folio,
        lectura_consumo: input.lecturaConsumo,
        lectura_produccion: input.lecturaProduccion,
        pagado: input.pagado,
        fecha_pago: input.fechaPago,
        notas: input.notas,
      })
      .select('id')
      .single();

    if (error || !data) {
      return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo crear el recibo.') };
    }
    revalidatePath('/servicios');
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error inesperado.' };
  }
}

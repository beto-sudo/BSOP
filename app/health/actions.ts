'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getEffectiveUser } from '@/lib/auth/effective-user';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import type { ProtocoloClase } from '@/lib/protocolo';

// Captura de la bitácora de protocolo (iniciativa salud-protocolo, Sprint 3).
//
// Seguridad: el protocolo es data clínica personal de Beto (admin). La captura
// es admin-only (v1) — se generaliza a acceso-por-empresa cuando haya
// multi-usuario. Las tablas health.protocolo_* tienen RLS deny-all, así que la
// escritura va con service_role (getSupabaseAdminClient), igual que la lectura.
// Toda mutación respeta el read-only de "viendo como" (assertNotInPreview, ADR-027).

export type ActionResult = { ok: true } | { ok: false; error: string };

const CLASES: ProtocoloClase[] = ['peptido', 'suplemento', 'oral', 'otro'];
const VIAS = ['subcutanea', 'intramuscular', 'oral', 'topica', 'nasal'];

async function requireProtocoloAdmin() {
  await assertNotInPreview();
  const supabase = await createSupabaseServerClient();
  const eu = await getEffectiveUser(supabase);
  if (!eu) throw new Error('No autenticado.');
  if (!eu.isAdmin) throw new Error('Sin acceso al protocolo.');
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error('Servicio no configurado.');
  return admin;
}

function clampEscala(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n < 0 || n > 5 ? null : n;
}

export type RegistrarTomaInput = {
  compuestoId: string;
  fecha?: string | null; // ISO; default: ahora
  dosis: number;
  unidad?: string | null;
  sitio?: string | null;
  nota?: string | null;
  efectos?: {
    apetito?: number | null;
    nausea?: number | null;
    energia?: number | null;
    gi?: number | null;
    nota?: string | null;
  } | null;
};

export async function registrarToma(input: RegistrarTomaInput): Promise<ActionResult> {
  try {
    const admin = await requireProtocoloAdmin();

    if (!input.compuestoId) return { ok: false, error: 'Falta el compuesto.' };
    if (!Number.isFinite(input.dosis) || input.dosis <= 0) {
      return { ok: false, error: 'La dosis debe ser un número mayor a 0.' };
    }
    const fecha = input.fecha || new Date().toISOString();

    const { data: toma, error } = await admin
      .schema('health')
      .from('protocolo_tomas')
      .insert({
        compuesto_id: input.compuestoId,
        fecha,
        dosis: input.dosis,
        unidad: input.unidad?.trim() || null,
        sitio: input.sitio?.trim() || null,
        nota: input.nota?.trim() || null,
      })
      .select('id')
      .single();

    if (error || !toma) {
      return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo registrar la toma.') };
    }

    const ef = input.efectos;
    const efNota = ef?.nota?.trim() || null;
    const apetito = clampEscala(ef?.apetito);
    const nausea = clampEscala(ef?.nausea);
    const energia = clampEscala(ef?.energia);
    const gi = clampEscala(ef?.gi);
    const hayEfecto =
      apetito != null || nausea != null || energia != null || gi != null || !!efNota;

    if (hayEfecto) {
      const { error: efErr } = await admin
        .schema('health')
        .from('protocolo_efectos')
        .insert({ fecha, toma_id: toma.id, apetito, nausea, energia, gi, nota: efNota });
      if (efErr) {
        return {
          ok: false,
          error: getSupabaseErrorMessage(
            efErr,
            'La toma quedó registrada, pero falló guardar cómo te cayó.'
          ),
        };
      }
    }

    revalidatePath('/health');
    revalidatePath('/peptides');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido.' };
  }
}

export type CrearCompuestoInput = {
  nombre: string;
  clase: ProtocoloClase;
  via?: string | null;
  unidadDosis?: string | null;
  dosisObjetivo?: number | null;
  frecuencia?: string | null;
  procedencia?: string | null;
  fechaInicio?: string | null; // date (YYYY-MM-DD)
  notas?: string | null;
};

export async function crearCompuesto(input: CrearCompuestoInput): Promise<ActionResult> {
  try {
    const admin = await requireProtocoloAdmin();

    const nombre = input.nombre?.trim();
    if (!nombre) return { ok: false, error: 'El nombre es obligatorio.' };
    if (!CLASES.includes(input.clase)) return { ok: false, error: 'Clase inválida.' };
    if (input.via && !VIAS.includes(input.via)) return { ok: false, error: 'Vía inválida.' };
    if (
      input.dosisObjetivo != null &&
      (!Number.isFinite(input.dosisObjetivo) || input.dosisObjetivo < 0)
    ) {
      return { ok: false, error: 'La dosis objetivo debe ser un número ≥ 0.' };
    }

    const { error } = await admin
      .schema('health')
      .from('protocolo_compuestos')
      .insert({
        nombre,
        clase: input.clase,
        via: input.via || null,
        unidad_dosis: input.unidadDosis?.trim() || null,
        dosis_objetivo: input.dosisObjetivo ?? null,
        frecuencia: input.frecuencia?.trim() || null,
        procedencia: input.procedencia?.trim() || null,
        fecha_inicio: input.fechaInicio || null,
        notas: input.notas?.trim() || null,
        estado: 'activo',
      });

    if (error) {
      return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo crear el compuesto.') };
    }

    revalidatePath('/health');
    revalidatePath('/peptides');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido.' };
  }
}

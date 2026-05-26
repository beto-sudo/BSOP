'use server';

/**
 * Server actions de Proyectos DILESA.
 *
 * Iniciativa `dilesa-proyectos-paridad-coda` Sprint A.
 *
 * `updateProyectoFields(proyectoId, patch)` actualiza los 4 campos
 * raw que se agregaron en la migración 20260527000100 para paridad
 * con la tabla canónica de Coda: `plano_oficial_url`, `image_url`,
 * `acreditacion_escritura`, `objetivo_trimestral`. RLS valida acceso
 * a la empresa.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

type ProyectoFieldsPatch = {
  plano_oficial_url?: string | null;
  image_url?: string | null;
  acreditacion_escritura?: string | null;
  objetivo_trimestral?: number | null;
};

type Result = { ok: true } | { ok: false; error: string };

export async function updateProyectoFields(
  proyectoId: string,
  patch: ProyectoFieldsPatch
): Promise<Result> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };

  // Whitelist explícita — no permitir update de columnas no esperadas.
  const allowed: ProyectoFieldsPatch = {};
  if ('plano_oficial_url' in patch) allowed.plano_oficial_url = patch.plano_oficial_url;
  if ('image_url' in patch) allowed.image_url = patch.image_url;
  if ('acreditacion_escritura' in patch)
    allowed.acreditacion_escritura = patch.acreditacion_escritura;
  if ('objetivo_trimestral' in patch) {
    const n = patch.objetivo_trimestral;
    if (n != null && (!Number.isInteger(n) || n < 0)) {
      return { ok: false, error: 'objetivo_trimestral debe ser entero ≥ 0' };
    }
    allowed.objetivo_trimestral = n;
  }
  if (Object.keys(allowed).length === 0) {
    return { ok: false, error: 'sin campos a actualizar' };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { error } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .update(allowed)
    .eq('id', proyectoId);

  if (error) {
    return { ok: false, error: error.message || 'No se pudo actualizar el proyecto.' };
  }

  revalidatePath('/dilesa/proyectos');
  return { ok: true };
}

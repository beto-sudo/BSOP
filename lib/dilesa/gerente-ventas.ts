/**
 * Resuelve el Gerente de Ventas de una empresa para usarlo como contacto
 * en las solicitudes a terceros (avalúo, dictamen).
 *
 * El Gerente de Ventas es un EMPLEADO (`erp.empleados` → `erp.personas`
 * con puesto "Gerente de Ventas" en `erp.empleados_puestos`), NO un
 * usuario de `core.usuarios`. Por eso no se puede resolver desde
 * `dilesa.ventas.vendedor_usuario_id` (ese es el asesor que capturó la
 * venta, que puede ser cualquiera del equipo de ventas).
 *
 * Decisión Beto (2026-06-08): el valuador/notario coordina SIEMPRE con
 * el Gerente de Ventas (Edgar en DILESA), no con el asesor individual
 * que metió la solicitud. Por eso los emails/PDFs de avalúo y dictamen
 * muestran al gerente como "Gerencia de Ventas — contacto para
 * coordinar".
 *
 * Si la empresa no tiene un gerente de ventas activo, retorna null y el
 * caller decide el fallback (típicamente omitir la fila de contacto).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface GerenteVentas {
  nombre: string;
  email: string | null;
  telefono: string | null;
}

/**
 * Busca el empleado activo con puesto "Gerente de Ventas" en la empresa.
 * Match case-insensitive por nombre del puesto para tolerar variantes
 * ("Gerente de Ventas" / "Gerencia de Ventas"). Si hay varios, toma el
 * primero (orden estable por nombre de la persona).
 *
 * Usa el admin client porque corre en endpoints server-side que componen
 * emails/PDFs — solo lectura, sin exponer nada al cliente.
 */
export async function loadGerenteVentas(
  admin: SupabaseClient,
  empresaId: string
): Promise<GerenteVentas | null> {
  // 1. Puesto(s) de gerencia de ventas en la empresa.
  /* eslint-disable @typescript-eslint/no-explicit-any -- supabase-js solo tipa public por default */
  const { data: puestos } = await (admin.schema('erp') as any)
    .from('puestos')
    .select('id, nombre')
    .eq('empresa_id', empresaId)
    .or('nombre.ilike.%gerente de ventas%,nombre.ilike.%gerencia de ventas%');
  const puestoIds = ((puestos ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (puestoIds.length === 0) return null;

  // 2. Empleados activos con ese puesto.
  const { data: ep } = await (admin.schema('erp') as any)
    .from('empleados_puestos')
    .select('empleado_id')
    .in('puesto_id', puestoIds);
  const empleadoIds = ((ep ?? []) as Array<{ empleado_id: string }>).map((r) => r.empleado_id);
  if (empleadoIds.length === 0) return null;

  const { data: empleados } = await (admin.schema('erp') as any)
    .from('empleados')
    .select('id, persona_id, activo')
    .in('id', empleadoIds)
    .eq('activo', true);
  const personaIds = ((empleados ?? []) as Array<{ persona_id: string }>).map((e) => e.persona_id);
  if (personaIds.length === 0) return null;

  // 3. Datos de la persona.
  const { data: personas } = await (admin.schema('erp') as any)
    .from('personas')
    .select('nombre, apellido_paterno, apellido_materno, email, telefono')
    .in('id', personaIds)
    .eq('empresa_id', empresaId)
    .order('nombre', { ascending: true });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const persona = (personas ?? [])[0] as
    | {
        nombre: string | null;
        apellido_paterno: string | null;
        apellido_materno: string | null;
        email: string | null;
        telefono: string | null;
      }
    | undefined;
  if (!persona) return null;

  const nombre =
    [persona.nombre, persona.apellido_paterno, persona.apellido_materno]
      .filter(Boolean)
      .join(' ')
      .trim() || '(Gerente de Ventas)';

  return {
    nombre,
    email: persona.email ?? null,
    telefono: persona.telefono ?? null,
  };
}

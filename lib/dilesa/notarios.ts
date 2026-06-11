/**
 * Catálogo de notarías — fuente única: `erp.proveedores` con
 * `categoria='notaria'` (la persona ligada vía `persona_id` lleva el
 * contacto: nombre, email, teléfono).
 *
 * Centralización 2026-06-11 (pedido de Beto): antes ventas usaba un
 * catálogo paralelo (`erp.personas` con `tipo='notario'`) mientras los
 * documentos legales (`erp.documentos.notario_proveedor_id`) ya usaban
 * proveedores — doble catálogo desincronizado. Ahora TODO el repo lee
 * notarías de aquí; `dilesa.ventas.notario_id` es FK a `erp.proveedores`
 * (migración 20260611...) y la edición de contacto se hace en el módulo
 * Proveedores.
 *
 * Funciona con cualquier SupabaseClient (browser con RLS o admin) — dos
 * queries planas en vez de embed para no depender de relaciones
 * generadas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type Notaria = {
  /** id de `erp.proveedores` — lo que guarda `dilesa.ventas.notario_id`. */
  proveedorId: string;
  personaId: string;
  /** Nombre completo de la persona ligada. */
  nombre: string;
  email: string | null;
  telefono: string | null;
  /** Número de notaría (`erp.proveedores.codigo`), si está capturado. */
  numeroNotaria: string | null;
  activo: boolean;
};

type ProveedorRow = {
  id: string;
  persona_id: string;
  codigo: string | null;
  activo: boolean;
};

type PersonaRow = {
  id: string;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
  telefono: string | null;
};

function buildNotaria(pr: ProveedorRow, pe: PersonaRow | undefined): Notaria {
  const nombre =
    [pe?.nombre, pe?.apellido_paterno, pe?.apellido_materno].filter(Boolean).join(' ').trim() ||
    '(notaría sin nombre)';
  return {
    proveedorId: pr.id,
    personaId: pr.persona_id,
    nombre,
    email: pe?.email?.trim() || null,
    telefono: pe?.telefono?.trim() || null,
    numeroNotaria: pr.codigo?.trim() || null,
    activo: pr.activo,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any --
 * el helper acepta clientes tipados y no tipados (admin); mismo patrón
 * que lib/dilesa/email-branding.ts. */

/** Notarías activas de una empresa, para selectores (orden alfabético). */
export async function listNotarias(client: SupabaseClient, empresaId: string): Promise<Notaria[]> {
  const { data: provs, error } = await (client.schema('erp') as any)
    .from('proveedores')
    .select('id, persona_id, codigo, activo')
    .eq('empresa_id', empresaId)
    .eq('categoria', 'notaria')
    .eq('activo', true)
    .is('deleted_at', null);
  if (error || !provs || provs.length === 0) return [];

  const personaIds = (provs as ProveedorRow[]).map((p) => p.persona_id);
  const { data: personas } = await (client.schema('erp') as any)
    .from('personas')
    .select('id, nombre, apellido_paterno, apellido_materno, email, telefono')
    .in('id', personaIds);
  const porId = new Map<string, PersonaRow>(
    ((personas ?? []) as PersonaRow[]).map((p) => [p.id, p])
  );

  return (provs as ProveedorRow[])
    .map((pr) => buildNotaria(pr, porId.get(pr.persona_id)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Una notaría por id de proveedor (`dilesa.ventas.notario_id`). Sin
 * filtrar `activo` — las lecturas históricas (correos, PDFs, fichas)
 * deben resolver aunque la notaría se haya desactivado después.
 */
export async function getNotaria(
  client: SupabaseClient,
  proveedorId: string
): Promise<Notaria | null> {
  const { data: pr, error } = await (client.schema('erp') as any)
    .from('proveedores')
    .select('id, persona_id, codigo, activo')
    .eq('id', proveedorId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !pr) return null;

  const { data: pe } = await (client.schema('erp') as any)
    .from('personas')
    .select('id, nombre, apellido_paterno, apellido_materno, email, telefono')
    .eq('id', (pr as ProveedorRow).persona_id)
    .maybeSingle();

  return buildNotaria(pr as ProveedorRow, (pe as PersonaRow | null) ?? undefined);
}

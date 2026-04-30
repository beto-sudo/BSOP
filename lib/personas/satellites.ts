/**
 * Helpers para tablas satélite de `erp.personas`:
 *   - personas_contactos
 *   - personas_cuentas_bancarias
 *   - personas_direcciones
 *
 * Ver ADR-028 (`docs/adr/028_personas_satellites.md`) para contexto y reglas
 * PS1-PS6. Iniciativa: `rdb-proveedores-data-completion` (Sprint 2).
 */

import type { Database } from '@/types/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PersonaContacto = Database['erp']['Tables']['personas_contactos']['Row'];
export type PersonaContactoInsert = Database['erp']['Tables']['personas_contactos']['Insert'];

export type PersonaCuentaBancaria = Database['erp']['Tables']['personas_cuentas_bancarias']['Row'];
export type PersonaCuentaBancariaInsert =
  Database['erp']['Tables']['personas_cuentas_bancarias']['Insert'];

export type PersonaDireccion = Database['erp']['Tables']['personas_direcciones']['Row'];
export type PersonaDireccionInsert = Database['erp']['Tables']['personas_direcciones']['Insert'];

export const TIPO_DIRECCION = ['operativo', 'entrega', 'cobro', 'oficina', 'otro'] as const;
export type TipoDireccion = (typeof TIPO_DIRECCION)[number];

export const TIPO_DIRECCION_LABEL: Record<TipoDireccion, string> = {
  operativo: 'Operativo',
  entrega: 'Entrega',
  cobro: 'Cobro',
  oficina: 'Oficina',
  otro: 'Otro',
};

export const TIPO_CUENTA_BANCARIA = ['cheques', 'debito', 'credito', 'inversion', 'otro'] as const;
export type TipoCuentaBancaria = (typeof TIPO_CUENTA_BANCARIA)[number];

export const TIPO_CUENTA_BANCARIA_LABEL: Record<TipoCuentaBancaria, string> = {
  cheques: 'Cheques',
  debito: 'Débito',
  credito: 'Crédito',
  inversion: 'Inversión',
  otro: 'Otro',
};

// ─── Validators ───────────────────────────────────────────────────────────────

/** CLABE mexicana = 18 dígitos exactos. NULL/vacío válido (campo opcional). */
export function isValidClabe(clabe: string | null | undefined): boolean {
  if (clabe == null) return true;
  const trimmed = clabe.trim();
  if (trimmed === '') return true;
  return /^[0-9]{18}$/.test(trimmed);
}

/**
 * Una cuenta bancaria debe tener al menos uno de `numero_cuenta` o `clabe`.
 * Esto refleja el constraint `chk_pers_ctas_identificador_present` en DB.
 */
export function hasCuentaIdentificador(
  numeroCuenta: string | null | undefined,
  clabe: string | null | undefined
): boolean {
  const nc = numeroCuenta?.trim() ?? '';
  const cl = clabe?.trim() ?? '';
  return nc.length > 0 || cl.length > 0;
}

/**
 * Una cuenta bancaria debe tener un banco identificado (FK al catálogo o nombre libre).
 * Refleja el constraint `chk_pers_ctas_banco_present` en DB.
 */
export function hasBancoIdentificado(
  bancoId: string | null | undefined,
  bancoNombre: string | null | undefined
): boolean {
  if (bancoId != null && bancoId.length > 0) return true;
  return (bancoNombre?.trim().length ?? 0) > 0;
}

/**
 * Validación completa de una cuenta bancaria antes de insertar/actualizar.
 * Devuelve error legible o `null` si todo OK.
 */
export function validateCuentaBancaria(input: {
  banco_id: string | null;
  banco_nombre: string | null;
  numero_cuenta: string | null;
  clabe: string | null;
}): string | null {
  if (!hasBancoIdentificado(input.banco_id, input.banco_nombre)) {
    return 'Falta banco: selecciónalo del catálogo o escribe un nombre.';
  }
  if (!hasCuentaIdentificador(input.numero_cuenta, input.clabe)) {
    return 'Falta identificador: ingresa al menos número de cuenta o CLABE.';
  }
  if (!isValidClabe(input.clabe)) {
    return 'CLABE inválida: deben ser exactamente 18 dígitos.';
  }
  return null;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Formato compacto para mostrar una cuenta bancaria en una lista:
 *   "BANORTE · ****6710 · CLABE 058 010 ********** 36"
 * Si no hay banco_id, usa banco_nombre. Cuenta y CLABE se muestran enmascaradas.
 */
export function formatCuentaCompact(
  cuenta: Pick<PersonaCuentaBancaria, 'numero_cuenta' | 'clabe'> & {
    banco_label: string | null;
  }
): string {
  const parts: string[] = [];
  if (cuenta.banco_label) parts.push(cuenta.banco_label);
  if (cuenta.numero_cuenta) {
    const last4 = cuenta.numero_cuenta.slice(-4);
    parts.push(`****${last4}`);
  }
  if (cuenta.clabe) {
    parts.push(`CLABE …${cuenta.clabe.slice(-4)}`);
  }
  return parts.join(' · ') || '—';
}

/**
 * Compone el domicilio en una sola línea legible.
 *   "Calle 123 ext 45 int A · Col. Centro · CP 26000 · Piedras Negras, Coahuila"
 */
export function formatDireccionLine(
  d: Pick<
    PersonaDireccion,
    'calle' | 'num_ext' | 'num_int' | 'colonia' | 'cp' | 'municipio' | 'estado' | 'pais'
  >
): string {
  const calle = [d.calle, d.num_ext && `#${d.num_ext}`, d.num_int && `int ${d.num_int}`]
    .filter(Boolean)
    .join(' ');
  const colCp = [d.colonia && `Col. ${d.colonia}`, d.cp && `CP ${d.cp}`]
    .filter(Boolean)
    .join(' · ');
  const lugar = [d.municipio, d.estado].filter(Boolean).join(', ');
  return [calle, colCp, lugar].filter(Boolean).join(' · ') || '—';
}

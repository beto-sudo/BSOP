/**
 * overrides.ts — traduce una definición del catálogo a "overrides" que un
 * handler de email aplica sobre sus defaults hardcoded.
 *
 * Fase 2 de `notificaciones-catalogo` (S5). Los handlers viejos (avaluo,
 * dictamen, hold, encuesta) hacían el fetch a Resend con from/subject
 * hardcoded. Para reconectarlos al catálogo SIN duplicar el boilerplate en
 * cada route, el route:
 *   1. lee la definición con `getDefinitionBySlug`,
 *   2. la pasa por `overridesFromDefinition`,
 *   3. si `killed` → loguea skipped y no manda,
 *   4. si no → pasa `overrides` al `send*Email(ctx, overrides)` de la lib.
 *
 * FAIL-OPEN: si no hay definición (catálogo caído o slug sin sembrar),
 * `overrides` sale vacío y la lib usa sus defaults de siempre.
 */

import type { NotificationDefinition } from './registry';
import { renderSubject, splitRecipientsExtra } from './registry';

/** Overrides que un handler aplica sobre sus defaults. Todo opcional. */
export interface NotificationOverrides {
  /** "Nombre <email>" ya compuesto. */
  from?: string;
  replyTo?: string | null;
  /** Recipientes fijos del catálogo (se SUMAN a los dinámicos del handler). */
  extraTo?: string[];
  extraCc?: string[];
  extraBcc?: string[];
  /** Subject ya renderizado (reemplaza el que computa la lib). */
  subject?: string;
}

export interface ResolvedOverrides {
  /** Kill switch: la definición existe y está `activo=false`. */
  killed: boolean;
  /** ID de la definición usada (para el log). NULL si no hay. */
  definitionId: string | null;
  overrides: NotificationOverrides;
}

/**
 * Convierte una `NotificationDefinition` (o null) en overrides + el subject
 * renderizado con `subjectVars`. Si `def` es null → overrides vacío (la lib
 * usa sus defaults). No tira nunca.
 */
export function overridesFromDefinition(
  def: NotificationDefinition | null,
  subjectVars: Record<string, string | number> = {}
): ResolvedOverrides {
  if (!def) {
    return { killed: false, definitionId: null, overrides: {} };
  }
  const extras = splitRecipientsExtra(def.recipients_extra);
  return {
    killed: !def.activo,
    definitionId: def.id,
    overrides: {
      from: def.from_name ? `${def.from_name} <${def.from_email}>` : def.from_email,
      replyTo: def.reply_to,
      extraTo: extras.to,
      extraCc: extras.cc,
      extraBcc: extras.bcc,
      subject: renderSubject(def.subject_template, subjectVars),
    },
  };
}

/** Dedup case-insensitive preservando orden y el casing del primero. */
export function dedupEmails(emails: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const v = e?.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

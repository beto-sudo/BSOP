import { describe, it, expect } from 'vitest';
import { overridesFromDefinition, dedupEmails } from './overrides';
import type { NotificationDefinition } from './registry';

function def(overrides: Partial<NotificationDefinition> = {}): NotificationDefinition {
  return {
    id: 'def1',
    slug: 'dilesa_avaluo_solicitud',
    empresa_id: null,
    nombre: 'Avalúo',
    descripcion: null,
    trigger_type: 'manual',
    trigger_config: {},
    from_email: 'noreply@bsop.io',
    from_name: 'DILESA',
    reply_to: 'ventas@dilesa.mx',
    recipients_extra: [
      { email: 'bcc@dilesa.mx', type: 'bcc' },
      { email: 'audit@dilesa.mx', type: 'always' },
    ],
    subject_template: 'Solicitud de avalúo — {proyecto}',
    activo: true,
    created_at: '',
    updated_at: '',
    updated_by: null,
    ...overrides,
  };
}

describe('overridesFromDefinition', () => {
  it('def null → overrides vacío, sin kill', () => {
    const r = overridesFromDefinition(null, { proyecto: 'X' });
    expect(r.killed).toBe(false);
    expect(r.definitionId).toBeNull();
    expect(r.overrides).toEqual({});
  });

  it('def activa → compone from, subject renderizado, recipientes por tipo', () => {
    const r = overridesFromDefinition(def(), { proyecto: 'Los Encinos' });
    expect(r.killed).toBe(false);
    expect(r.definitionId).toBe('def1');
    expect(r.overrides.from).toBe('DILESA <noreply@bsop.io>');
    expect(r.overrides.replyTo).toBe('ventas@dilesa.mx');
    expect(r.overrides.subject).toBe('Solicitud de avalúo — Los Encinos');
    expect(r.overrides.extraTo).toEqual(['audit@dilesa.mx']);
    expect(r.overrides.extraBcc).toEqual(['bcc@dilesa.mx']);
  });

  it('from sin from_name → solo el email', () => {
    const r = overridesFromDefinition(def({ from_name: null }), {});
    expect(r.overrides.from).toBe('noreply@bsop.io');
  });

  it('activo=false → killed', () => {
    const r = overridesFromDefinition(def({ activo: false }), {});
    expect(r.killed).toBe(true);
    expect(r.definitionId).toBe('def1');
  });
});

describe('dedupEmails', () => {
  it('quita duplicados case-insensitive y vacíos', () => {
    expect(dedupEmails(['A@x.com', 'a@x.com', null, ' ', 'b@x.com'])).toEqual([
      'A@x.com',
      'b@x.com',
    ]);
  });
});

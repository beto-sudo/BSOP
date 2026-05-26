/**
 * Tests de los helpers puros de `lib/notifications/registry.ts`.
 * Iniciativa notificaciones-catalogo · Sprint 1.
 *
 * `getDefinitionBySlug` toca DB y se prueba con integration; aquí solo los
 * helpers puros (`renderSubject`, `splitRecipientsExtra`).
 */

import { describe, expect, it } from 'vitest';
import { renderSubject, splitRecipientsExtra, type RecipientExtra } from './registry';

describe('renderSubject', () => {
  it('reemplaza vars presentes', () => {
    expect(renderSubject('Hola {firstName}', { firstName: 'Beto' })).toBe('Hola Beto');
  });

  it('soporta vars numéricas', () => {
    expect(renderSubject('Total: {n} items', { n: 42 })).toBe('Total: 42 items');
  });

  it('deja literales las vars no presentes en el map', () => {
    // Mejor ver `{firstName}` en el subject que silenciosamente quitarlas —
    // así el bug se nota.
    expect(renderSubject('Hola {firstName}, tienes {pending} tareas', { pending: 3 })).toBe(
      'Hola {firstName}, tienes 3 tareas'
    );
  });

  it('múltiples ocurrencias de la misma var', () => {
    expect(renderSubject('{x} y {x} es {x}', { x: 'A' })).toBe('A y A es A');
  });

  it('sin placeholders devuelve template tal cual', () => {
    expect(renderSubject('Subject fijo', { irrelevant: 'x' })).toBe('Subject fijo');
  });

  it('placeholders con guiones bajos también funcionan', () => {
    expect(renderSubject('Hi {first_name}', { first_name: 'Beto' })).toBe('Hi Beto');
  });
});

describe('splitRecipientsExtra', () => {
  it('separa los 3 tipos', () => {
    const extras: RecipientExtra[] = [
      { email: 'cc1@x.com', type: 'cc' },
      { email: 'bcc1@x.com', type: 'bcc' },
      { email: 'always1@x.com', type: 'always' },
      { email: 'cc2@x.com', type: 'cc' },
    ];
    const out = splitRecipientsExtra(extras);
    expect(out.to).toEqual(['always1@x.com']);
    expect(out.cc).toEqual(['cc1@x.com', 'cc2@x.com']);
    expect(out.bcc).toEqual(['bcc1@x.com']);
  });

  it('array vacío devuelve 3 arrays vacíos', () => {
    expect(splitRecipientsExtra([])).toEqual({ to: [], cc: [], bcc: [] });
  });

  it('solo bcc', () => {
    const out = splitRecipientsExtra([{ email: 'soporte@x.com', type: 'bcc' }]);
    expect(out.to).toEqual([]);
    expect(out.cc).toEqual([]);
    expect(out.bcc).toEqual(['soporte@x.com']);
  });
});

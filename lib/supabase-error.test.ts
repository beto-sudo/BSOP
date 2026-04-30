import { describe, expect, it } from 'vitest';
import { getSupabaseErrorMessage, toSupabaseError } from './supabase-error';

describe('getSupabaseErrorMessage', () => {
  it('returns Error.message when err is an Error', () => {
    expect(getSupabaseErrorMessage(new Error('boom'), 'fb')).toBe('boom');
  });

  it('returns string err verbatim', () => {
    expect(getSupabaseErrorMessage('algo malo', 'fb')).toBe('algo malo');
  });

  it('extracts message from PostgrestError-shaped object', () => {
    const pgErr = {
      message: 'null value in column "producto_id" violates not-null constraint',
      details: null,
      hint: null,
      code: '23502',
    };
    expect(getSupabaseErrorMessage(pgErr, 'fb')).toContain('producto_id');
  });

  it('joins message + hint + details when present', () => {
    const pgErr = {
      message: 'falla X',
      hint: 'haz Y',
      details: 'detalle Z',
      code: '22023',
    };
    expect(getSupabaseErrorMessage(pgErr, 'fb')).toBe('falla X — haz Y — detalle Z');
  });

  it('returns fallback for unknown shapes', () => {
    expect(getSupabaseErrorMessage(null, 'fb')).toBe('fb');
    expect(getSupabaseErrorMessage(undefined, 'fb')).toBe('fb');
    expect(getSupabaseErrorMessage(42, 'fb')).toBe('fb');
    expect(getSupabaseErrorMessage({}, 'fb')).toBe('fb');
  });

  it('ignores non-string fields safely', () => {
    expect(getSupabaseErrorMessage({ message: 123, hint: null }, 'fb')).toBe('fb');
  });
});

describe('toSupabaseError', () => {
  it('returns the same Error when input is already an Error', () => {
    const e = new Error('x');
    expect(toSupabaseError(e, 'fb')).toBe(e);
  });

  it('wraps PostgrestError into a real Error with composed message', () => {
    const pgErr = { message: 'falla X', hint: 'haz Y', details: '', code: '22023' };
    const wrapped = toSupabaseError(pgErr, 'fb');
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toBe('falla X — haz Y');
  });

  it('uses fallback when nothing extractable', () => {
    expect(toSupabaseError({}, 'fb').message).toBe('fb');
  });
});

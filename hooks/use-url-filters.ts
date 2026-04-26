'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type FilterPrimitive = string | number | boolean | string[] | null;
export type FilterShape = Record<string, FilterPrimitive>;

const camelToSnake = (s: string): string => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

function encode(value: FilterPrimitive): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (Array.isArray(value)) return value.length === 0 ? null : value.join(',');
  if (value === '') return null;
  return String(value);
}

function decode<V extends FilterPrimitive>(raw: string, defaultValue: V): V {
  if (typeof defaultValue === 'boolean') return (raw === '1') as V;
  if (typeof defaultValue === 'number') {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : defaultValue) as V;
  }
  if (Array.isArray(defaultValue)) return raw.split(',').filter(Boolean) as V;
  return raw as V;
}

function isEqual(a: FilterPrimitive, b: FilterPrimitive): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return false;
}

/**
 * URL-synced filter state for module pages. See ADR-007.
 *
 * Convention:
 * - Keys: camelCase in TS, snake_case in URL (`dateFrom` → `?date_from=`).
 * - Booleans: `1` / `0`.
 * - Arrays: comma-separated (`?categoria=alimentos,bebidas`).
 * - Defaults are NOT serialized — URL stays clean when no filter is active.
 * - Unrelated query params (e.g. `?tab=…` from routed tabs) are preserved.
 *
 * IMPORTANT: `defaults` must be a stable reference (declared outside the
 * component, memoized, or constructed once). The hook does not deep-compare it.
 */
export function useUrlFilters<T extends FilterShape>(defaults: T) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => {
    const result = { ...defaults } as T;
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const urlKey = camelToSnake(String(key));
      const raw = searchParams.get(urlKey);
      if (raw !== null) {
        result[key] = decode(raw, defaults[key]) as T[typeof key];
      }
    }
    return result;
  }, [searchParams, defaults]);

  const writeUrl = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of Object.keys(defaults) as Array<keyof T>) {
        const urlKey = camelToSnake(String(key));
        params.delete(urlKey);
        if (!isEqual(next[key], defaults[key])) {
          const encoded = encode(next[key]);
          if (encoded !== null) params.set(urlKey, encoded);
        }
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, defaults]
  );

  const setFilter = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      writeUrl({ ...filters, [key]: value });
    },
    [filters, writeUrl]
  );

  const setFilters = useCallback(
    (updater: Partial<T> | ((prev: T) => Partial<T>)) => {
      const patch = typeof updater === 'function' ? updater(filters) : updater;
      writeUrl({ ...filters, ...patch });
    },
    [filters, writeUrl]
  );

  const clearAll = useCallback(() => {
    writeUrl(defaults);
  }, [writeUrl, defaults]);

  const activeCount = useMemo(() => {
    let n = 0;
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      if (!isEqual(filters[key], defaults[key])) n++;
    }
    return n;
  }, [filters, defaults]);

  return { filters, setFilter, setFilters, clearAll, activeCount };
}

'use client';

import { useState, useCallback } from 'react';

type SortDir = 'asc' | 'desc';

// The optional type parameter _T is accepted for call-site annotation (e.g.
// useSortableTable<MyType>('key', 'asc')) but is not used at runtime.
// sortData infers its own <T> independently so the explicit annotation is
// never required — it just silences TS at the call site.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useSortableTable<_T = unknown>(defaultKey: string, defaultDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  // Bug previo: se llamaba `setSortDir` DENTRO del updater de `setSortKey`.
  // En strict mode / React 19 los updaters se ejecutan dos veces, así que el
  // toggle de dirección se cancelaba a sí mismo y los sorts no respondían al
  // segundo clic. La forma correcta es leer `sortKey` como dependencia del
  // callback y llamar los dos setters de forma paralela/independiente.
  const onSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey]
  );

  const sortData = useCallback(
    <T extends Record<string, unknown>>(data: T[]): T[] => {
      return [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];

        // nulls last regardless of direction
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;

        let cmp = 0;
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv;
        } else {
          const sa = String(av).toLowerCase();
          const sb = String(bv).toLowerCase();
          cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
        }

        return sortDir === 'asc' ? cmp : -cmp;
      });
    },
    [sortKey, sortDir]
  );

  return { sortKey, sortDir, onSort, sortData };
}

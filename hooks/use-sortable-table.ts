'use client';

import { useState, useCallback } from 'react';

type SortDir = 'asc' | 'desc';

export function useSortableTable(defaultKey: string, defaultDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const onSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

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
    [sortKey, sortDir],
  );

  return { sortKey, sortDir, onSort, sortData };
}

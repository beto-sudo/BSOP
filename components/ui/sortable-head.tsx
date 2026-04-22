'use client';

import { TableHead } from '@/components/ui/table';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface SortableHeadProps {
  sortKey: string;
  label: string;
  currentSort: string;
  currentDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  className?: string;
}

export function SortableHead({
  sortKey,
  label,
  currentSort,
  currentDir,
  onSort,
  className = '',
}: SortableHeadProps) {
  const active = currentSort === sortKey;
  return (
    <TableHead
      className={`cursor-pointer select-none font-medium transition-colors hover:text-[var(--text)]/80 ${
        active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
      } ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active &&
          (currentDir === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          ))}
      </span>
    </TableHead>
  );
}

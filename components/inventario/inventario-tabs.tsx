import Link from 'next/link';
import { cn } from '@/lib/utils';

export type InventarioTabKey = 'overview' | 'levantamientos' | 'analisis';

const TABS: { key: InventarioTabKey; label: string; href: string }[] = [
  { key: 'overview', label: 'Stock & Movimientos', href: '/rdb/inventario' },
  {
    key: 'levantamientos',
    label: 'Levantamientos',
    href: '/rdb/inventario/levantamientos',
  },
  { key: 'analisis', label: 'Análisis', href: '/rdb/inventario/analisis' },
];

export interface InventarioTabsProps {
  activeKey: InventarioTabKey;
  className?: string;
}

export function InventarioTabs({ activeKey, className }: InventarioTabsProps) {
  return (
    <nav
      aria-label="Secciones de inventario"
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-1 text-sm',
        className
      )}
    >
      {TABS.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center rounded-md px-3 font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

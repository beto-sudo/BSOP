import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * @deprecated ADR-004 R1 (un solo nivel de tabs). El módulo Inventario ya no usa
 * este componente — sus tabs internos (Stock | Movimientos) se renderizan vía
 * `<ModuleTabs>` (components/module-page). `Levantamientos` sigue importándolo
 * temporalmente; se eliminará junto con la migración de Levantamientos a la
 * anatomía de `<ModulePage>` (Fase 2 + actualización de sidebar).
 */
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

/** @deprecated Ver ADR-004 R1. Será eliminado en Fase 2. */
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

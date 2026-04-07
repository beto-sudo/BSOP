'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart,
  Scissors,
  Package,
  Boxes,
  ClipboardList,
  FileText,
  Truck,
  Menu,
} from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

export const RDB_NAV = [
  { label: 'Ventas', href: '/rdb/ventas', icon: ShoppingCart },
  { label: 'Cortes de Caja', href: '/rdb/cortes', icon: Scissors },
  { label: 'Productos', href: '/rdb/productos', icon: Package },
  { label: 'Inventario', href: '/rdb/inventario', icon: Boxes },
  { label: 'Requisiciones', href: '/rdb/requisiciones', icon: ClipboardList },
  { label: 'Órdenes de Compra', href: '/rdb/ordenes-compra', icon: FileText },
  { label: 'Proveedores', href: '/rdb/proveedores', icon: Truck },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-2 py-4">
      {RDB_NAV.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={[
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
              active
                ? 'bg-[#6c63ff]/15 text-[#6c63ff] font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarLogo() {
  return (
    <div className="flex h-16 items-center border-b px-4">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo-bs.png" alt="BSOP" width={32} height={32} className="h-8 w-8 object-contain" />
        <div>
          <div className="text-sm font-semibold leading-none">BSOP</div>
          <div className="text-xs text-muted-foreground">RDB Operations</div>
        </div>
      </Link>
    </div>
  );
}

/** Desktop sidebar — visible on md+ screens */
export function RdbSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-card md:flex">
      <SidebarLogo />
      <NavLinks />
      <Separator />
      <div className="px-4 py-3 text-[10px] text-muted-foreground">RDB · Restaurante Del Bosque</div>
    </aside>
  );
}

/** Mobile hamburger button + Sheet drawer */
export function RdbMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted md:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-56 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navegación RDB</SheetTitle>
          </SheetHeader>
          <SidebarLogo />
          <NavLinks onNavigate={() => setOpen(false)} />
          <Separator />
          <div className="px-4 py-3 text-[10px] text-muted-foreground">RDB · Restaurante Del Bosque</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

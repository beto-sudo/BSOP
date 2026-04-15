'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CheckSquare,
  Users,
  Building2,
  FolderOpen,
  Briefcase,
  Network,
  Menu,
} from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

export const DILESA_NAV = [
  { label: 'Tareas', href: '/dilesa/admin/tasks', icon: CheckSquare, section: 'Administración' },
  { label: 'Juntas', href: '/dilesa/admin/juntas', icon: Users, section: 'Administración' },
  { label: 'Documentos', href: '/dilesa/admin/documentos', icon: FolderOpen, section: 'Administración' },
  { label: 'Empleados', href: '/dilesa/rh/empleados', icon: Users, section: 'Recursos Humanos' },
  { label: 'Departamentos', href: '/dilesa/rh/departamentos', icon: Network, section: 'Recursos Humanos' },
  { label: 'Puestos', href: '/dilesa/rh/puestos', icon: Briefcase, section: 'Recursos Humanos' },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  
  const sections = Array.from(new Set(DILESA_NAV.map(nav => nav.section)));

  return (
    <nav className="flex flex-col gap-4 px-2 py-4">
      {sections.map(section => (
        <div key={section} className="flex flex-col gap-1">
          <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {section}
          </div>
          {DILESA_NAV.filter(nav => nav.section === section).map(({ label, href, icon: Icon }) => {
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
        </div>
      ))}
    </nav>
  );
}

function SidebarLogo() {
  return (
    <div className="flex h-16 items-center border-b px-4">
      <Link href="/dilesa" className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#6c63ff]/10 text-[#6c63ff]">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight leading-none text-foreground">DILESA</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Operaciones</div>
        </div>
      </Link>
    </div>
  );
}

/** Desktop sidebar — visible on md+ screens */
export function DilesaSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-card md:flex">
      <SidebarLogo />
      <div className="flex-1 overflow-y-auto">
        <NavLinks />
      </div>
      <Separator />
      <div className="px-4 py-3 text-[10px] text-muted-foreground">DILESA · Desarrollo Inmobiliario</div>
    </aside>
  );
}

/** Mobile hamburger button + Sheet drawer */
export function DilesaMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted md:hidden text-muted-foreground hover:text-foreground"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-56 p-0 border-r border-[var(--border)] bg-[var(--card)]">
          <SheetHeader className="sr-only">
            <SheetTitle>Navegación DILESA</SheetTitle>
          </SheetHeader>
          <SidebarLogo />
          <div className="flex-1 overflow-y-auto">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <Separator />
          <div className="px-4 py-3 text-[10px] text-muted-foreground">DILESA · Desarrollo Inmobiliario</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

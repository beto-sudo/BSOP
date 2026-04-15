'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Building2 } from 'lucide-react';
import { DilesaMobileNav, DILESA_NAV } from './dilesa-sidebar';

function useBreadcrumb() {
  const pathname = usePathname();
  const match = DILESA_NAV.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  return match?.label ?? 'Inicio';
}

export function DilesaHeader() {
  const section = useBreadcrumb();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)]/90 px-4 backdrop-blur-md">
      {/* Mobile hamburger */}
      <DilesaMobileNav />

      {/* Logo — shown on mobile only (desktop logo is in sidebar) */}
      <Link href="/dilesa" className="flex items-center justify-center h-8 w-8 rounded-md bg-[#6c63ff]/10 text-[#6c63ff] md:hidden">
        <Building2 className="h-5 w-5" />
      </Link>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">DILESA</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{section}</span>
      </div>
    </header>
  );
}

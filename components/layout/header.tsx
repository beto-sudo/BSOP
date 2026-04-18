'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { RdbMobileNav, RDB_NAV } from './sidebar';

function useBreadcrumb() {
  const pathname = usePathname();
  const match = RDB_NAV.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  return match?.label ?? 'RDB';
}

export function RdbHeader() {
  const section = useBreadcrumb();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur-md">
      {/* Mobile hamburger */}
      <RdbMobileNav />

      {/* Logo — shown on mobile only (desktop logo is in sidebar) */}
      <Link href="/" className="flex items-center gap-2 md:hidden">
        <Image
          src="/logo-bs.png"
          alt="BSOP"
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
        />
      </Link>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">RDB</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>{section}</span>
      </div>
    </header>
  );
}

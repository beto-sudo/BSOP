// app/_components/Sidebar.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ShoppingCart, Boxes, FileText, Settings } from "lucide-react";

type Company = { id: string; name: string; slug: string };
type NavItem = { label: string; href: string; icon?: React.ReactNode };
type Section = { key: string; label: string; items: NavItem[] };

type Branding = {
  brandName?: string;
  primary?: string;
  secondary?: string;
  logoUrl?: string;
};

const SECTIONS: Section[] = [
  {
    key: "operacion",
    label: "OPERACIÓN",
    items: [
      { label: "Órdenes de Compra", href: "/purchases/po", icon: <ShoppingCart className="h-4 w-4" /> },

'use client';

import { Shell } from '@/components/ui/shell';
import { Surface } from '@/components/ui/surface';
import { ArrowRight, Boxes, Settings, ShieldCheck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useEffect, useState } from 'react';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function HomePage() {
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.user_metadata?.first_name) {
        setUserName(data.user.user_metadata.first_name);
      } else if (data?.user?.email) {
        setUserName(data.user.email.split('@')[0]);
      }
    });
  }, []);

  return (
    <Shell>
      <section className="grid gap-6">
        <Surface className="p-8 sm:p-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/12 px-3 py-1 text-xs font-medium text-[var(--accent-soft)]">
            <ShieldCheck className="h-4 w-4" />
            BSOP 2.0
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {getGreeting()}{userName ? `, ${userName}` : ''}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62 sm:text-base">
            Bienvenido al panel central de operaciones. Desde aquí puedes monitorear y gestionar los módulos activos de tus empresas.
          </p>
        </Surface>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* DILESA Card */}
        <Surface className="flex flex-col p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
            <img src="/logos/dilesa.jpg" alt="DILESA" className="h-7 w-7 rounded-md object-contain" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">DILESA</h2>
          <p className="mt-2 text-sm text-white/60 flex-1">
            Administración, recursos humanos y documentos de DILESA.
          </p>
          <div className="mt-6">
            <Link href="/dilesa" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-400 transition hover:bg-blue-500/20">
              Ir a DILESA
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Surface>

        {/* Rincón del Bosque Card */}
        <Surface className="flex flex-col p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
            <img src="/logos/rdb.jpg" alt="RDB" className="h-7 w-7 rounded-md object-contain" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">Rincón del Bosque</h2>
          <p className="mt-2 text-sm text-white/60 flex-1">
            Gestión operativa, control de caja, inventarios, requisiciones y órdenes de compra.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Link href="/rdb/cortes" className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10">
              <span className="flex items-center gap-2"><Wallet className="h-3.5 w-3.5 text-white/50" /> Cortes</span>
            </Link>
            <Link href="/rdb/requisiciones" className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10">
              <span className="flex items-center gap-2"><Boxes className="h-3.5 w-3.5 text-white/50" /> Compras</span>
            </Link>
          </div>
        </Surface>

        {/* Configuración Card */}
        <Surface className="flex flex-col p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]/10">
            <Settings className="h-6 w-6 text-[var(--accent-soft)]" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">Configuración</h2>
          <p className="mt-2 text-sm text-white/60 flex-1">
            Administración de permisos, usuarios, roles y excepciones del sistema (RBAC).
          </p>
          <div className="mt-6">
            <Link href="/settings/acceso" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)]/10 px-4 py-2.5 text-sm font-medium text-[var(--accent-soft)] transition hover:bg-[var(--accent)]/20">
              Gestionar accesos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Surface>
      </section>
    </Shell>
  );
}

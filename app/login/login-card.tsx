'use client';

import Image from 'next/image';
import { Globe } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export function LoginCard({ unauthorized }: { unauthorized: boolean }) {
  const handleSignIn = async () => {
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)]/90 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-10">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-3xl border border-white/10 bg-white px-5 py-4 shadow-sm">
            <Image src="/logo-bsop.jpg" alt="BSOP" width={180} height={60} className="h-auto w-auto" priority />
          </div>

          <div className="mt-8 inline-flex items-center rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-soft)]">
            Private access
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">Welcome back</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/60">
            Sign in with your Google account to enter BSOP and access your private operating dashboard.
          </p>

          {unauthorized ? (
            <div className="mt-6 w-full rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              This Google account is not authorized for BSOP.
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleSignIn}
            className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[#111522] px-5 py-4 text-sm font-medium text-white transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/12 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          >
            <Globe className="h-5 w-5" />
            Sign in with Google
          </button>

          <p className="mt-4 text-xs text-white/40">Only approved accounts can access this workspace.</p>
        </div>
      </div>
    </main>
  );
}

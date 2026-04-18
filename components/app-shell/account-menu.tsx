'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useLocale } from '@/lib/i18n';
import type { AuthUser } from './nav-config';
import { getInitials } from './nav-config';

/**
 * Avatar + dropdown in the top-right of the header. Signs the user out via
 * the Supabase browser client and bounces to /login.
 *
 * `menuOpen` state is local; the parent only needs to pass the user object.
 * Menu auto-closes on route change to match pre-refactor behavior.
 */
export function AccountMenu({ user }: { user: AuthUser | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const displayName = user?.name ?? 'Adalberto Santos de los Santos';
  const displayEmail = user?.email ?? 'beto@anorte.com';
  const initials = getInitials(displayName, displayEmail);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } finally {
      setSigningOut(false);
      setMenuOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full bg-[var(--card)] pl-1 pr-2 py-1 text-left transition dark:hover:bg-white/10 hover:bg-[var(--border)]"
        aria-expanded={menuOpen}
        aria-label={t('header.open_account')}
      >
        {user?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={displayName}
            width={32}
            height={32}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/20 text-xs font-semibold dark:text-white text-[var(--text)]">
            {initials}
          </div>
        )}
        <div className="hidden min-w-0 sm:block">
          <div className="max-w-56 truncate text-xs dark:text-white/90 text-[var(--text)]/90">
            {displayName}
          </div>
          <div className="max-w-56 truncate text-[10px] dark:text-white/45 text-[var(--text)]/55">
            {displayEmail}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 dark:text-white/45 text-[var(--text)]/45" />
      </button>

      {menuOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 min-w-56 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl">
          <div className="border-b border-[var(--border)] px-3 py-2">
            <div className="truncate text-xs font-medium dark:text-white text-[var(--text)]">
              {displayName}
            </div>
            <div className="mt-1 text-xs dark:text-white/45 text-[var(--text)]/55">
              {displayEmail}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm dark:text-white/78 text-[var(--text)]/78 transition dark:hover:bg-white/5 hover:bg-[var(--border)] dark:hover:text-white hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? t('header.signing_out') : t('header.sign_out')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

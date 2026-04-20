'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { AuthUser } from './nav-config';

/**
 * Bundles the client-side state the AppShell needs:
 *   - sidebar collapsed state (persisted in localStorage)
 *   - mobile overlay open state
 *   - now() ticking clock
 *   - auth user (synced with Supabase session)
 *
 * Kept as one hook because most of these are consumed together by the shell
 * composition and extracting them individually would just scatter imports.
 */
export function useShellState() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  // Sidebar collapsed preference — hydrate from localStorage (or responsive default) on mount.
  // Initial state is `null` / `false` for the SSR pass; we populate from the browser on mount to
  // avoid hydration mismatches. Synchronous setState in this effect is intentional.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setNow(new Date());
    const stored = window.localStorage.getItem('bsop-sidebar-collapsed');
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    if (stored !== null) {
      setCollapsed(stored === 'true');
    } else if (mobile) {
      setCollapsed(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Auth user sync + subscribe to session changes.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const pickUser = (authUser: {
      email?: string | null;
      user_metadata: { full_name?: string; name?: string; avatar_url?: string | null };
    }): AuthUser => ({
      name:
        authUser.user_metadata.full_name ??
        authUser.user_metadata.name ??
        authUser.email ??
        'Beto Santos',
      email: authUser.email ?? '',
      avatarUrl: authUser.user_metadata.avatar_url ?? null,
    });

    const syncUser = async () => {
      try {
        const {
          data: { user: authUser },
          error,
        } = await supabase.auth.getUser();
        if (error || !authUser) {
          // Stale / missing refresh token → treat as signed out. onAuthStateChange
          // will fire a SIGNED_OUT event shortly after and we'll settle to null.
          setUser(null);
          return;
        }
        setUser(pickUser(authUser));
      } catch {
        // Network blip or unexpected auth failure — fail silent, banner-less.
        setUser(null);
      }
    };

    void syncUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user;
      if (!authUser) {
        setUser(null);
        return;
      }
      setUser(pickUser(authUser));
    });

    return () => subscription.unsubscribe();
  }, []);

  // Ticking clock (1s).
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Persist sidebar collapsed preference whenever it changes.
  useEffect(() => {
    window.localStorage.setItem('bsop-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  return {
    collapsed,
    setCollapsed,
    mobileOpen,
    setMobileOpen,
    now,
    user,
    setUser,
  };
}

'use client';

import { ThemeProvider } from 'next-themes';
import { LocaleProvider } from '@/lib/i18n';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fetchUserPermissions, type UserPermissions } from '@/lib/permissions';

// ── Permissions Context ────────────────────────────────────────────────────

type PermissionsContextValue = {
  permissions: UserPermissions;
  refreshPermissions: () => void;
};

const DEFAULT_PERMISSIONS: UserPermissions = {
  isAdmin: false,
  loading: true,
  email: null,
  empresas: new Map(),
  modulos: new Map(),
};

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: DEFAULT_PERMISSIONS,
  refreshPermissions: () => {},
});

export function usePermissions() {
  return useContext(PermissionsContext);
}

function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const load = useCallback(async () => {
    try {
      const perms = await fetchUserPermissions(supabase);
      setPermissions(perms);
    } catch {
      setPermissions({ ...DEFAULT_PERMISSIONS, loading: false });
    }
  }, [supabase]);

  const refreshPermissions = useCallback(() => {
    setPermissions((prev) => ({ ...prev, loading: true }));
    void load();
  }, [load]);

  useEffect(() => {
    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void load();
      } else {
        setPermissions({ ...DEFAULT_PERMISSIONS, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, load]);

  const value = useMemo(
    () => ({ permissions, refreshPermissions }),
    [permissions, refreshPermissions],
  );

  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

// ── Root Providers ─────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <LocaleProvider>
        <PermissionsProvider>{children}</PermissionsProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

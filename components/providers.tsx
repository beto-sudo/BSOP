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
import {
  fetchUserPermissions,
  fetchPermissionsForUserId,
  type UserPermissions,
} from '@/lib/permissions';

// ── Permissions Context ────────────────────────────────────────────────────

type ImpersonateTarget = {
  userId: string;
  label: string; // e.g. "Michelle (michelle@anorte.com)"
};

type PermissionsContextValue = {
  permissions: UserPermissions;
  refreshPermissions: () => void;
  impersonating: ImpersonateTarget | null;
  startImpersonate: (userId: string, label: string) => void;
  stopImpersonate: () => void;
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
  impersonating: null,
  startImpersonate: () => {},
  stopImpersonate: () => {},
});

export function usePermissions() {
  return useContext(PermissionsContext);
}

function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [realPermissions, setRealPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [impersonating, setImpersonating] = useState<ImpersonateTarget | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const loadReal = useCallback(async () => {
    try {
      const perms = await fetchUserPermissions(supabase);
      setRealPermissions(perms);
      // Only update visible permissions if not impersonating
      setPermissions((prev) => {
        // If we're impersonating, don't overwrite with real perms
        return prev;
      });
      return perms;
    } catch {
      const fallback = { ...DEFAULT_PERMISSIONS, loading: false };
      setRealPermissions(fallback);
      return fallback;
    }
  }, [supabase]);

  // Load initial permissions
  useEffect(() => {
    void (async () => {
      const perms = await loadReal();
      // Only set visible permissions if not impersonating
      if (!impersonating) {
        setPermissions(perms);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth state changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void (async () => {
          const perms = await loadReal();
          if (!impersonating) {
            setPermissions(perms);
          }
        })();
      } else {
        const fallback = { ...DEFAULT_PERMISSIONS, loading: false };
        setRealPermissions(fallback);
        setPermissions(fallback);
        setImpersonating(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadReal, impersonating]);

  const refreshPermissions = useCallback(() => {
    if (impersonating) {
      setPermissions((prev) => ({ ...prev, loading: true }));
      void (async () => {
        try {
          const perms = await fetchPermissionsForUserId(supabase, impersonating.userId);
          setPermissions(perms);
        } catch {
          setPermissions({ ...DEFAULT_PERMISSIONS, loading: false });
        }
      })();
    } else {
      setPermissions((prev) => ({ ...prev, loading: true }));
      void (async () => {
        const perms = await loadReal();
        setPermissions(perms);
      })();
    }
  }, [supabase, loadReal, impersonating]);

  const startImpersonate = useCallback(
    (userId: string, label: string) => {
      // Only admins can impersonate
      if (!realPermissions.isAdmin) return;
      setImpersonating({ userId, label });
      setPermissions((prev) => ({ ...prev, loading: true }));
      void (async () => {
        try {
          const perms = await fetchPermissionsForUserId(supabase, userId);
          setPermissions(perms);
        } catch {
          setPermissions({ ...DEFAULT_PERMISSIONS, loading: false });
        }
      })();
    },
    [supabase, realPermissions.isAdmin],
  );

  const stopImpersonate = useCallback(() => {
    setImpersonating(null);
    setPermissions(realPermissions);
  }, [realPermissions]);

  const value = useMemo(
    () => ({ permissions, refreshPermissions, impersonating, startImpersonate, stopImpersonate }),
    [permissions, refreshPermissions, impersonating, startImpersonate, stopImpersonate],
  );

  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

// ── Root Providers ─────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <LocaleProvider>
        <PermissionsProvider>{children}</PermissionsProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

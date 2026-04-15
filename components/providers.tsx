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
  type UserPermissions,
  type AccessLevel,
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
      // Update visible permissions only if not impersonating
      if (!impersonating) {
        setPermissions(perms);
      }
      return perms;
    } catch {
      // On transient errors, keep previous permissions instead of resetting
      // This prevents flashing "Acceso restringido" on network hiccups
      return realPermissions;
    }
  }, [supabase, impersonating, realPermissions]);

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

  const fetchImpersonatePerms = useCallback(async (userId: string): Promise<UserPermissions> => {
    const res = await fetch(`/api/impersonate?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return { ...DEFAULT_PERMISSIONS, loading: false };
    const data = await res.json();
    return {
      isAdmin: data.isAdmin,
      loading: false,
      email: data.email,
      empresas: new Map(Object.entries(data.empresas ?? {}) as [string, AccessLevel][]),
      modulos: new Map(Object.entries(data.modulos ?? {}) as [string, AccessLevel][]),
    };
  }, []);

  const refreshPermissions = useCallback(() => {
    if (impersonating) {
      setPermissions((prev) => ({ ...prev, loading: true }));
      void (async () => {
        try {
          const perms = await fetchImpersonatePerms(impersonating.userId);
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
  }, [loadReal, impersonating, fetchImpersonatePerms]);

  const startImpersonate = useCallback(
    (userId: string, label: string) => {
      // Only admins can impersonate
      if (!realPermissions.isAdmin) return;
      setImpersonating({ userId, label });
      setPermissions((prev) => ({ ...prev, loading: true }));
      void (async () => {
        try {
          const perms = await fetchImpersonatePerms(userId);
          setPermissions(perms);
        } catch {
          setPermissions({ ...DEFAULT_PERMISSIONS, loading: false });
        }
      })();
    },
    [realPermissions.isAdmin, fetchImpersonatePerms],
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

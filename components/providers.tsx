'use client';

import { ThemeProvider } from 'next-themes';
import { LocaleProvider } from '@/lib/i18n';
import { ToastProvider } from '@/components/ui/toast';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fetchUserPermissions, type UserPermissions, type AccessLevel } from '@/lib/permissions';
import { fetchSidebarHidden } from '@/lib/sidebar-visibility';

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
  /**
   * Top-level sidebar nav slugs hidden globally by an admin (denylist from
   * `core.sidebar_oculto`). Global, NOT per-user: it applies to admin too.
   * The sidebar filters these out; the admin visibility panel toggles them.
   */
  sidebarHidden: Set<string>;
  refreshSidebarHidden: () => void;
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
  sidebarHidden: new Set(),
  refreshSidebarHidden: () => {},
});

export function usePermissions() {
  return useContext(PermissionsContext);
}

/**
 * Convenience hook for the set of admin-hidden top-level sidebar slugs.
 * See `PermissionsContextValue.sidebarHidden`.
 */
export function useSidebarHidden(): Set<string> {
  return useContext(PermissionsContext).sidebarHidden;
}

/**
 * Returns `true` while an admin is in a "Viendo como" preview session.
 *
 * Components rendering forms, edit buttons, or other write CTAs should
 * disable themselves when this is `true` — the server will reject the
 * underlying mutation anyway (see proxy.ts and `assertNotInPreview()`),
 * but a disabled button avoids confusing 403 toasts mid-flow.
 */
export function useReadOnlyMode(): boolean {
  const { impersonating } = usePermissions();
  return impersonating !== null;
}

export type EffectiveUserData = {
  id: string;
  email: string;
  firstName: string | null;
  isAdmin: boolean;
  isPreviewing: boolean;
  /**
   * IDs de empresas donde el user tiene rol "Dirección". Usado para
   * gates operativos por empresa (ej. autorizar promoción a desarrollo
   * en DILESA, Sprint 4A). Default `[]` para back-compat con cache de
   * `/api/me` previa al cambio.
   */
  direccionEmpresaIds: string[];
};

/**
 * Returns the effective user for personal-data widgets (`/inicio` greeting,
 * "mis tareas", "mis juntas", etc).
 *
 * When an admin is previewing another user, returns the impersonated user.
 * Otherwise returns the real caller.
 *
 * Refetches whenever the impersonate state changes so widgets re-render with
 * the right identity.
 */
export function useEffectiveUser(): { data: EffectiveUserData | null; loading: boolean } {
  const { impersonating } = usePermissions();
  const [data, setData] = useState<EffectiveUserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // setLoading(true) is intentional here — we want to flip to loading
    // whenever `impersonating` changes so widgets can show a skeleton until
    // /api/me returns. eslint-disable for the initial flip; subsequent
    // setStates live in async callbacks (already lint-clean).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) {
          // Back-compat: cache previa al Sprint 4A no traía
          // `direccionEmpresaIds`. Lo defaulteamos a [].
          setData(json ? { ...json, direccionEmpresaIds: json.direccionEmpresaIds ?? [] } : null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [impersonating]);

  return { data, loading };
}

function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [realPermissions, setRealPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [impersonating, setImpersonating] = useState<ImpersonateTarget | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState<Set<string>>(new Set());
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const impersonatingRef = useRef(impersonating);
  impersonatingRef.current = impersonating;
  const realPermissionsRef = useRef(realPermissions);
  realPermissionsRef.current = realPermissions;

  const loadReal = useCallback(async () => {
    try {
      const perms = await fetchUserPermissions(supabase);
      setRealPermissions(perms);
      // Update visible permissions only if not impersonating
      if (!impersonatingRef.current) {
        setPermissions(perms);
      }
      return perms;
    } catch {
      // On transient errors, keep previous permissions instead of resetting
      return realPermissionsRef.current;
    }
  }, [supabase]);

  const loadSidebarHidden = useCallback(async () => {
    try {
      setSidebarHidden(await fetchSidebarHidden(supabase));
    } catch {
      // Fail open: keep whatever we had (or the empty default) so a transient
      // error never hides the whole menu.
    }
  }, [supabase]);

  const clearImpersonateCookie = useCallback(async () => {
    try {
      await fetch('/api/impersonate/stop', { method: 'POST' });
    } catch {
      // Silently ignore — the cookie is httpOnly so we can't fall back to JS.
      // Proxy still respects whatever the server sees; user can refresh.
    }
  }, []);

  // Load initial permissions
  useEffect(() => {
    void (async () => {
      const perms = await loadReal();
      // Only set visible permissions if not impersonating
      if (!impersonating) {
        setPermissions(perms);
      }
    })();
    void loadSidebarHidden();
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
        void loadSidebarHidden();
      } else {
        const fallback = { ...DEFAULT_PERMISSIONS, loading: false };
        setRealPermissions(fallback);
        setPermissions(fallback);
        setImpersonating(null);
        setSidebarHidden(new Set());
        void clearImpersonateCookie();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadReal, impersonating, clearImpersonateCookie, loadSidebarHidden]);

  const fetchImpersonatePerms = useCallback(async (userId: string): Promise<UserPermissions> => {
    const res = await fetch(`/api/impersonate?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
    });
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
    [realPermissions.isAdmin, fetchImpersonatePerms]
  );

  const stopImpersonate = useCallback(() => {
    setImpersonating(null);
    setPermissions(realPermissions);
    void clearImpersonateCookie();
  }, [realPermissions, clearImpersonateCookie]);

  const value = useMemo(
    () => ({
      permissions,
      refreshPermissions,
      impersonating,
      startImpersonate,
      stopImpersonate,
      sidebarHidden,
      refreshSidebarHidden: loadSidebarHidden,
    }),
    [
      permissions,
      refreshPermissions,
      impersonating,
      startImpersonate,
      stopImpersonate,
      sidebarHidden,
      loadSidebarHidden,
    ]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

// ── Root Providers ─────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <LocaleProvider>
        <ToastProvider>
          <PermissionsProvider>{children}</PermissionsProvider>
        </ToastProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

'use client';

/* eslint-disable react-hooks/refs --
 * Cleanup PR (#30): pre-existing pattern reads a ref during render to cache
 * the access decision across re-renders. Migrating off refs-during-render
 * requires a render-flow refactor — out of scope for lint cleanup.
 */

import { usePermissions } from '@/components/providers';
import { canAccessEmpresa, canAccessModulo } from '@/lib/permissions';
import { useRef, type ReactNode } from 'react';

import { AccessDenied } from '@/components/access-denied';

interface RequireAccessProps {
  children: ReactNode;
  /** Empresa slug to check (e.g. 'rdb', 'dilesa', 'familia') */
  empresa?: string;
  /** Module slug to check (e.g. 'rdb.ventas') — requires read access by default */
  modulo?: string;
  /** Require write access instead of read */
  write?: boolean;
  /** Require admin role */
  adminOnly?: boolean;
}

/**
 * Builds the `required` context line for the canonical `<AccessDenied>` surface.
 * Renders nothing when no specific permission was requested (admin-only with no
 * empresa/modulo).
 */
function describeRequired({
  empresa,
  modulo,
  write,
  adminOnly,
}: Pick<RequireAccessProps, 'empresa' | 'modulo' | 'write' | 'adminOnly'>): ReactNode {
  if (adminOnly && !empresa && !modulo) {
    return <span>admin</span>;
  }
  const parts: string[] = [];
  if (empresa) parts.push(empresa);
  if (modulo) parts.push(modulo);
  parts.push(write ? 'escritura' : 'lectura');
  if (parts.length === 1) return null;
  return <span>{parts.join(' · ')}</span>;
}

function AccessLoading() {
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <div className="flex items-center gap-3 text-[var(--text)]/60">
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        Verificando acceso…
      </div>
    </div>
  );
}

export function RequireAccess({
  children,
  empresa,
  modulo,
  write = false,
  adminOnly = false,
}: RequireAccessProps) {
  const { permissions } = usePermissions();
  const hadAccessRef = useRef(false);

  // Still loading
  if (permissions.loading) {
    // If user previously had access, keep showing children to avoid flash
    return hadAccessRef.current ? <>{children}</> : <AccessLoading />;
  }

  // Admin bypass
  if (permissions.isAdmin) {
    hadAccessRef.current = true;
    return <>{children}</>;
  }

  const required = describeRequired({ empresa, modulo, write, adminOnly });

  // Admin-only check
  if (adminOnly) return <AccessDenied required={required} />;

  // Empresa-level check
  if (empresa && !canAccessEmpresa(permissions, empresa)) {
    // If user previously had access, give a grace period (transient auth refresh)
    if (hadAccessRef.current) return <>{children}</>;
    return <AccessDenied required={required} />;
  }

  // Module-level check
  if (modulo && !canAccessModulo(permissions, modulo, write ? 'write' : 'read')) {
    if (hadAccessRef.current) return <>{children}</>;
    return <AccessDenied required={required} />;
  }

  hadAccessRef.current = true;
  return <>{children}</>;
}

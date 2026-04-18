import type { ReactNode } from 'react';

/**
 * Max-width content container used by top-level pages.
 * Renamed from `Shell` to avoid cognitive clash with the app layout's `AppShell`.
 */
export function ContentShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl">{children}</div>;
}

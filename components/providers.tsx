'use client';

import { ThemeProvider } from 'next-themes';
import { LocaleProvider } from '@/lib/i18n';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <LocaleProvider>{children}</LocaleProvider>
    </ThemeProvider>
  );
}

import './globals.css';
import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'BSOP',
  description: 'Beto Santos Operations Platform',
  icons: {
    icon: '/logo-bsop.jpg',
    shortcut: '/logo-bsop.jpg',
    apple: '/logo-bsop.jpg',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

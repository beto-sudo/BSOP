import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'BSOP', description: 'Beto Santos Operations Platform' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

import { Home, IdCard, type LucideIcon, Settings as SettingsIcon } from 'lucide-react';
import type { NavIconKey } from './nav-config';

const LUCIDE_BY_KEY: Record<'home' | 'id-card' | 'settings', LucideIcon> = {
  home: Home,
  'id-card': IdCard,
  settings: SettingsIcon,
};

const LOGO_BY_KEY: Record<
  'dilesa-logo' | 'rdb-logo' | 'sanren-logo',
  { src: string; alt: string }
> = {
  'dilesa-logo': { src: '/brand/dilesa/isotipo.png', alt: 'DILESA' },
  'rdb-logo': { src: '/brand/rdb/isotipo.png', alt: 'RDB' },
  'sanren-logo': { src: '/brand/sanren/isotipo.png', alt: 'SANREN' },
};

/**
 * Renders the icon for a nav entry — either a brand isotipo (empresa logos) or
 * a Lucide glyph (Inicio, Personas Físicas, Configuración).
 *
 * Shared by the sidebar tree and the empresa switcher so both stay pixel-aligned.
 */
export function NavIcon({ icon, className }: { icon: NavIconKey; className?: string }) {
  const cls = className ?? 'h-5 w-5';
  if (icon in LOGO_BY_KEY) {
    const { src, alt } = LOGO_BY_KEY[icon as keyof typeof LOGO_BY_KEY];
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={`${cls} object-contain rounded-sm`} />;
  }
  const Icon = LUCIDE_BY_KEY[icon as keyof typeof LUCIDE_BY_KEY];
  return <Icon className={`${cls} shrink-0`} aria-hidden="true" />;
}

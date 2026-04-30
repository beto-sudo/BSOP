import { redirect } from 'next/navigation';

/**
 * @module Settings (redirect)
 * @responsive desktop-only
 */
export default function SettingsRedirectPage() {
  redirect('/settings/acceso');
}

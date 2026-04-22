/**
 * Helpers de saludo + fecha localizada para el shell y el dashboard.
 * Se mantienen en un solo lugar para que ninguna vista diverja si el reloj
 * cambia de franja a las 11:59/18:59 mientras se está renderizando.
 */

export function getGreeting(date: Date, t: (key: string) => string): string {
  const hour = date.getHours();
  if (hour < 12) return t('greeting.morning');
  if (hour < 19) return t('greeting.afternoon');
  return t('greeting.evening');
}

export function formatLongDate(date: Date, locale: 'es' | 'en'): string {
  return date.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

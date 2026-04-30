import { PlaceholderSection } from '@/components/ui/placeholder-section';
import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';

/**
 * @module Personas Físicas
 * @responsive desktop-only
 */
export default function PersonasFisicasPage() {
  return (
    <RequireAccess empresa="personas_fisicas">
      <DesktopOnlyNotice module="Personas Físicas" />
      <div className="hidden sm:block">
        <PlaceholderSection
          icon="🪪"
          title="Personas Físicas — Coming soon"
          description="Control de contribuyentes personas físicas: declaraciones, recibos, ISR, facturas. Acceso acotado al contador."
        />
      </div>
    </RequireAccess>
  );
}

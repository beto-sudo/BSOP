import { PlaceholderSection } from '@/components/ui/placeholder-section';
import { RequireAccess } from '@/components/require-access';

export default function PersonasFisicasPage() {
  return (
    <RequireAccess empresa="personas_fisicas">
      <PlaceholderSection
        icon="🪪"
        title="Personas Físicas — Coming soon"
        description="Control de contribuyentes personas físicas: declaraciones, recibos, ISR, facturas. Acceso acotado al contador."
      />
    </RequireAccess>
  );
}

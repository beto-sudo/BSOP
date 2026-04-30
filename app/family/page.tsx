import { PlaceholderSection } from '@/components/ui/placeholder-section';
import { RequireAccess } from '@/components/require-access';

/**
 * @module Family
 * @responsive responsive
 */
export default function FamilyPage() {
  return (
    <RequireAccess empresa="familia">
      <PlaceholderSection
        icon="👨‍👩‍👧"
        title="SANREN — Coming soon"
        description="Hub patrimonial familiar: casa, seguros, recibos, gastos, hijos y esposa en un solo lugar."
      />
    </RequireAccess>
  );
}

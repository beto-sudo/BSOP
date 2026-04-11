import { PlaceholderSection } from '@/components/ui';
import { RequireAccess } from '@/components/require-access';

export default function FamilyPage() {
  return (
    <RequireAccess empresa="familia">
      <PlaceholderSection
        icon="👨‍👩‍👧"
        title="Family / SR Group — Coming soon"
        description="This area will group family priorities, SR Group visibility, and shared planning workflows into one calm, high-level view."
      />
    </RequireAccess>
  );
}

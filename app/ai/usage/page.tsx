import { SectionHeading, Shell } from '@/components/ui';
import { UsageDetailClient } from './message-log-client';

export default function AIUsagePage() {
  return (
    <Shell>
      <SectionHeading
        eyebrow="Usage"
        title="Detailed Usage & Message Log"
        copy="Deep operational view of OpenClaw traffic, costs, cache behavior, and the latest assistant messages parsed from Supabase-backed telemetry."
      />
      <UsageDetailClient />
    </Shell>
  );
}

import { RequireAccess } from '@/components/require-access';
import { HealthRangeSelector } from '@/components/health/health-range-selector';
import { ContentShell } from '@/components/ui/content-shell';
import { HealthDashboardView } from '@/components/health/health-dashboard-view';
import { getHealthDashboardData, type HealthRangePreset } from '@/lib/health';

function resolveRangeParams(searchParams?: Record<string, string | string[] | undefined>) {
  const rawRange = typeof searchParams?.range === 'string' ? searchParams.range : undefined;
  const from = typeof searchParams?.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams?.to === 'string' ? searchParams.to : undefined;

  if (from && to) {
    return { preset: 'custom' as const, from, to };
  }

  const allowedPresets: HealthRangePreset[] = ['today', '7d', '30d', '90d'];
  if (rawRange && allowedPresets.includes(rawRange as HealthRangePreset)) {
    return { preset: rawRange as HealthRangePreset };
  }

  return { preset: '7d' as const };
}

export default async function HealthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedRange = resolveRangeParams(resolvedSearchParams);
  const data = await getHealthDashboardData(requestedRange);

  return (
    <RequireAccess empresa="familia">
      <ContentShell>
        <div className="mb-6">
          <HealthRangeSelector
            initialPreset={data.range.preset}
            initialFrom={data.range.requestedFrom}
            initialTo={data.range.requestedTo}
          />
        </div>

        <HealthDashboardView {...data} />
      </ContentShell>
    </RequireAccess>
  );
}

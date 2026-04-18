import { RequireAccess } from '@/components/require-access';
import { notFound } from 'next/navigation';
import { getTripBySlug } from '@/data/site';
import { SectionHeading } from '@/components/ui/section-heading';
import { ContentShell } from '@/components/ui/content-shell';
import { TripDetailView } from '@/components/trip-detail-view';

export default async function TripDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = getTripBySlug(slug);

  if (!trip) return notFound();

  return (
    <RequireAccess empresa="familia">
      <ContentShell>
        <SectionHeading eyebrow="Detalle de viaje" title={trip.name} copy={trip.summary} />
        <TripDetailView trip={trip} />
      </ContentShell>
    </RequireAccess>
  );
}

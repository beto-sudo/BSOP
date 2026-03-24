import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getTripBySlug } from '@/data/site';
import { TripShareView } from '@/components/trip-share-view';

export const dynamic = 'force-dynamic';

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default async function ShareTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getServerSupabaseClient();

  if (!supabase) return notFound();

  const { data, error } = await supabase
    .from('trip_share_tokens')
    .select('trip_slug')
    .eq('token', token)
    .maybeSingle();

  if (error || !data?.trip_slug) return notFound();

  const trip = getTripBySlug(data.trip_slug);
  if (!trip) return notFound();

  return <TripShareView trip={trip} />;
}

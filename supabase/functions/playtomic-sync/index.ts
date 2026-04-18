import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const PLAYTOMIC_CLIENT_ID = Deno.env.get('PLAYTOMIC_CLIENT_ID')!;
const PLAYTOMIC_CLIENT_SECRET = Deno.env.get('PLAYTOMIC_CLIENT_SECRET')!;
const TENANT_ID = '8a9d9070-ec3e-4ac8-88af-4706ecbe5d8a';
const API_BASE = 'https://thirdparty.playtomic.io/api/v1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchPlaytomicToken() {
  console.log('Fetching Playtomic OAuth token...');
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAYTOMIC_CLIENT_ID,
      secret: PLAYTOMIC_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Playtomic Auth Error: ${res.statusText}`);
  const data = await res.json();
  return data.token || data.access_token;
}

function parsePrice(priceStr?: string) {
  if (!priceStr) return { amount: null, currency: null };
  const match = priceStr.match(/\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Z]{3})?\s*/);
  if (!match) return { amount: null, currency: null };
  return { amount: parseFloat(match[1]), currency: match[2] || null };
}

serve(async (req) => {
  const syncLogId = crypto.randomUUID();
  const startTime = new Date();

  // We look back 48 hours and forward 14 days to catch updates and new bookings
  const startUtc = new Date(startTime.getTime() - 48 * 60 * 60 * 1000);
  const endUtc = new Date(startTime.getTime() + 14 * 24 * 60 * 60 * 1000);

  try {
    console.log(`Starting sync. Log ID: ${syncLogId}`);

    // 1. Initial Log Entry
    await supabase.schema('playtomic').from('sync_log').insert({
      id: syncLogId,
      sync_type: 'bookings_incremental',
      started_at: startTime.toISOString(),
      status: 'running',
      date_range_start: startUtc.toISOString(),
      date_range_end: endUtc.toISOString(),
    });

    const token = await fetchPlaytomicToken();

    // 2. Fetch Bookings
    let page = 0;
    const size = 200;
    let hasMore = true;
    const allBookings: any[] = [];

    while (hasMore) {
      console.log(`Fetching page ${page}...`);
      const params = new URLSearchParams({
        tenant_id: TENANT_ID,
        start_booking_date: startUtc.toISOString().split('.')[0],
        end_booking_date: endUtc.toISOString().split('.')[0],
        size: size.toString(),
        page: page.toString(),
      });

      const res = await fetch(`${API_BASE}/bookings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Playtomic API Error on page ${page}: ${res.statusText}`);

      const payload = await res.json();
      let pageItems = [];
      if (Array.isArray(payload)) pageItems = payload;
      else if (payload && Array.isArray(payload.content)) pageItems = payload.content;
      else if (payload && Array.isArray(payload.items)) pageItems = payload.items;
      else if (payload && Array.isArray(payload.bookings)) pageItems = payload.bookings;
      else throw new Error('Unexpected payload structure');

      allBookings.push(...pageItems);

      if (pageItems.length < size) {
        hasMore = false;
      } else {
        page++;
      }
    }

    console.log(`Fetched ${allBookings.length} total bookings.`);

    // 3. Process Data
    const bookingsData = [];
    const resourcesMap = new Map();
    const playersMap = new Map();
    const participantsData = [];

    for (const raw of allBookings) {
      const { amount, currency } = parsePrice(raw.price);
      const bStart = raw.booking_start_date; // These come in UTC with Z or without, let's assume they are ISO UTC
      const bEnd = raw.booking_end_date;

      const durationMin = raw.duration != null ? Math.floor(raw.duration / 60000) : null;
      const ownerId = raw.participant_info?.owner_id ? String(raw.participant_info.owner_id) : null;
      let coachIds = raw.coach_ids || (raw.coach_id ? [raw.coach_id] : null);
      if (coachIds) coachIds = coachIds.map(String);

      bookingsData.push({
        booking_id: raw.booking_id,
        object_id: raw.object_id,
        resource_id: raw.resource_id,
        resource_name: raw.resource_name,
        sport_id: raw.sport_id,
        booking_start: bStart,
        booking_end: bEnd,
        duration_min: durationMin,
        origin: raw.origin,
        price_amount: amount,
        price_currency: currency,
        booking_type: raw.booking_type,
        payment_status: raw.payment_status,
        status: raw.status,
        is_canceled: !!raw.is_canceled,
        owner_id: ownerId,
        coach_ids: coachIds,
        course_id: raw.course_id,
        course_name: raw.course_name,
        activity_id: raw.activity_id,
        activity_name: raw.activity_name,
        raw_json: raw,
        synced_at: new Date().toISOString(),
      });

      if (raw.resource_id) {
        resourcesMap.set(raw.resource_id, {
          resource_id: raw.resource_id,
          resource_name: raw.resource_name,
          sport_id: raw.sport_id,
          active: true,
          // We could track first_seen/last_seen but for incremental it's fine just to upsert names
        });
      }

      const parts = raw.participant_info?.participants || [];
      const participantCount = Math.max(parts.length, 1);
      const estShare = !raw.is_canceled && amount ? amount / participantCount : 0;

      for (const p of parts) {
        if (!p.participant_id) continue;
        const pid = String(p.participant_id);

        const existing = playersMap.get(pid) || {
          playtomic_id: pid,
          name: p.name,
          email: p.email,
          player_type: p.participant_type,
          accepts_commercial: p.accepts_commercial_communications,
          total_spend_increment: 0,
          total_bookings_increment: 0,
        };

        if (!raw.is_canceled) {
          existing.total_spend_increment += estShare;
        }
        existing.total_bookings_increment += 1;
        playersMap.set(pid, existing);

        participantsData.push({
          booking_id: raw.booking_id,
          player_id: pid,
          is_owner: pid === ownerId,
          family_member_id: p.family_member_id ? String(p.family_member_id) : null,
        });
      }
    }

    // 4. Upsert to Supabase
    console.log('Upserting resources...');
    if (resourcesMap.size > 0) {
      await supabase
        .schema('playtomic')
        .from('resources')
        .upsert(Array.from(resourcesMap.values()), { onConflict: 'resource_id' });
    }

    console.log('Upserting players...');
    if (playersMap.size > 0) {
      // For players we only upsert the basic info (name, email). Total spend is better calculated in the view.
      // Or we can just upsert name/email/type.
      const playersArr = Array.from(playersMap.values()).map((p) => ({
        playtomic_id: p.playtomic_id,
        name: p.name,
        email: p.email,
        player_type: p.player_type,
        accepts_commercial: p.accepts_commercial,
        updated_at: new Date().toISOString(),
      }));
      await supabase
        .schema('playtomic')
        .from('players')
        .upsert(playersArr, { onConflict: 'playtomic_id' });
    }

    console.log('Upserting bookings...');
    // Split bookings into chunks of 100 to avoid request size limits
    const chunkSize = 100;
    for (let i = 0; i < bookingsData.length; i += chunkSize) {
      const chunk = bookingsData.slice(i, i + chunkSize);
      const { error } = await supabase
        .schema('playtomic')
        .from('bookings')
        .upsert(chunk, { onConflict: 'booking_id' });
      if (error) throw new Error(`Bookings Upsert Error: ${error.message}`);
    }

    console.log('Upserting booking participants...');
    for (let i = 0; i < participantsData.length; i += chunkSize) {
      const chunk = participantsData.slice(i, i + chunkSize);
      const { error } = await supabase
        .schema('playtomic')
        .from('booking_participants')
        .upsert(chunk, { onConflict: 'booking_id, player_id' });
      if (error) throw new Error(`Participants Upsert Error: ${error.message}`);
    }

    // 5. Finalize Log
    await supabase
      .schema('playtomic')
      .from('sync_log')
      .update({
        finished_at: new Date().toISOString(),
        status: 'success',
        bookings_fetched: allBookings.length,
        bookings_upserted: bookingsData.length,
        players_upserted: playersMap.size,
      })
      .eq('id', syncLogId);

    console.log('Sync completed successfully.');
    return new Response(JSON.stringify({ success: true, fetched: allBookings.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Sync failed:', error);
    await supabase
      .schema('playtomic')
      .from('sync_log')
      .update({
        finished_at: new Date().toISOString(),
        status: 'error',
        error_message: error.message,
      })
      .eq('id', syncLogId);

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

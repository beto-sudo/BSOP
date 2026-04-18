'use client';

import { useState } from 'react';
import { Copy, Printer, Share2 } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';

function buttonClassName(variant: 'primary' | 'secondary' = 'secondary') {
  return variant === 'primary'
    ? 'inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-amber-200'
    : 'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:border-amber-300/40 hover:text-amber-200';
}

function hexToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function TripActions({
  tripSlug,
  showShare = false,
}: {
  tripSlug: string;
  showShare?: boolean;
}) {
  const supabase = getSupabaseClient();
  const [shareUrl, setShareUrl] = useState('');
  const [copyState, setCopyState] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleShare() {
    if (!supabase || typeof window === 'undefined') return;

    setLoading(true);

    const existing = await supabase
      .from('trip_share_tokens')
      .select('token')
      .eq('trip_slug', tripSlug)
      .maybeSingle();
    const token = existing.data?.token ?? hexToken();

    if (!existing.data?.token) {
      await supabase.from('trip_share_tokens').upsert({ trip_slug: tripSlug, token });
    }

    const url = `${window.location.origin}/compartir/${token}`;
    setShareUrl(url);
    await navigator.clipboard.writeText(url);
    setCopyState('Link copiado');
    setLoading(false);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="trip-actions flex flex-wrap gap-3 print:hidden">
      {showShare ? (
        <button
          type="button"
          onClick={handleShare}
          disabled={loading || !supabase}
          className={buttonClassName()}
        >
          <Share2 className="h-4 w-4" />
          Compartir
        </button>
      ) : null}
      <button
        type="button"
        onClick={handlePrint}
        className={buttonClassName(showShare ? 'secondary' : 'primary')}
      >
        <Printer className="h-4 w-4" />
        Exportar PDF
      </button>
      {shareUrl ? (
        <div className="w-full rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          <div className="break-all">{shareUrl}</div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="mt-2 inline-flex items-center gap-2 text-xs text-emerald-100/90"
          >
            <Copy className="h-3.5 w-3.5" />
            {copyState || 'Copiar link'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  current_path TEXT NOT NULL DEFAULT '/',
  current_module TEXT NOT NULL DEFAULT 'Overview',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'offline')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read presence
CREATE POLICY "presence_select_all" ON public.user_presence
  FOR SELECT TO authenticated USING (true);

-- Users can only upsert their own presence
CREATE POLICY "presence_upsert_own" ON public.user_presence
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "presence_update_own" ON public.user_presence
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;

-- Index for quick "who is online" queries
CREATE INDEX idx_presence_status_last_seen ON public.user_presence(status, last_seen_at DESC);

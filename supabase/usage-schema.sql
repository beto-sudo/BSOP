-- Run this manually in the Supabase SQL Editor for the BSOP project.
-- URL: https://ybklderteyhuugzfmxbi.supabase.co

-- Usage summary (single row, updated by sync)
create table if not exists usage_summary (
  id int primary key default 1 check (id = 1),
  session_count int default 0,
  total_cost numeric(12,6) default 0,
  total_tokens bigint default 0,
  avg_cost_per_session numeric(12,6) default 0,
  cost_today numeric(12,6) default 0,
  cost_this_week numeric(12,6) default 0,
  cost_this_month numeric(12,6) default 0,
  messages int default 0,
  user_messages int default 0,
  assistant_messages int default 0,
  tool_calls int default 0,
  tool_results int default 0,
  cache_hit_rate numeric(6,4) default 0,
  input_tokens bigint default 0,
  output_tokens bigint default 0,
  cache_read_tokens bigint default 0,
  cache_write_tokens bigint default 0,
  synced_at timestamptz default now()
);

-- Daily aggregates
create table if not exists usage_daily (
  date date primary key,
  cost numeric(12,6) default 0,
  tokens bigint default 0,
  sessions int default 0,
  messages int default 0,
  user_messages int default 0,
  assistant_messages int default 0,
  tool_calls int default 0,
  formatted_cost text default '$0.00'
);

-- Cost by model (aggregated)
create table if not exists usage_by_model (
  model text primary key,
  label text,
  provider text,
  cost numeric(12,6) default 0,
  messages int default 0,
  tokens bigint default 0,
  formatted_cost text default '$0.00'
);

-- Cost by provider (aggregated)
create table if not exists usage_by_provider (
  provider text primary key,
  cost numeric(12,6) default 0,
  messages int default 0,
  tokens bigint default 0,
  formatted_cost text default '$0.00'
);

-- Message log (individual assistant messages, recent only)
create table if not exists usage_messages (
  id bigserial primary key,
  timestamp timestamptz,
  model text,
  model_label text,
  provider text,
  input_tokens int default 0,
  output_tokens int default 0,
  cache_read_tokens int default 0,
  cache_creation_tokens int default 0,
  total_tokens int default 0,
  cost numeric(12,6) default 0,
  formatted_cost text,
  duration_ms int default 0,
  status text default 'ok',
  session_id text,
  skill_name text,
  description text
);

-- Model breakdown by day (for the stacked chart)
create table if not exists usage_daily_models (
  id bigserial primary key,
  date date,
  model text,
  label text,
  cost numeric(12,6) default 0,
  messages int default 0,
  tokens bigint default 0,
  unique(date, model)
);

create index if not exists usage_messages_timestamp_idx on usage_messages(timestamp desc);
create index if not exists usage_daily_models_date_idx on usage_daily_models(date desc);

-- Enable RLS but allow anon read
alter table usage_summary enable row level security;
alter table usage_daily enable row level security;
alter table usage_by_model enable row level security;
alter table usage_by_provider enable row level security;
alter table usage_messages enable row level security;
alter table usage_daily_models enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usage_summary' and policyname = 'Allow public read'
  ) then
    create policy "Allow public read" on usage_summary for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usage_daily' and policyname = 'Allow public read'
  ) then
    create policy "Allow public read" on usage_daily for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usage_by_model' and policyname = 'Allow public read'
  ) then
    create policy "Allow public read" on usage_by_model for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usage_by_provider' and policyname = 'Allow public read'
  ) then
    create policy "Allow public read" on usage_by_provider for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usage_messages' and policyname = 'Allow public read'
  ) then
    create policy "Allow public read" on usage_messages for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usage_daily_models' and policyname = 'Allow public read'
  ) then
    create policy "Allow public read" on usage_daily_models for select using (true);
  end if;
end $$;

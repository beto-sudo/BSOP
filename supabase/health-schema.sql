-- Run this in the Supabase SQL Editor for the BSOP project.
-- URL: https://ybklderteyhuugzfmxbi.supabase.co

create table if not exists health_metrics (
  id bigserial primary key,
  metric_name text not null,
  date timestamptz not null,
  value real not null,
  unit text,
  source text,
  ingested_at timestamptz default now()
);

create unique index if not exists idx_health_metrics_upsert on health_metrics (metric_name, date, source);
create index if not exists idx_health_metrics_name_date on health_metrics (metric_name, date desc);

create table if not exists health_workouts (
  id bigserial primary key,
  name text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  duration_minutes real,
  distance_km real,
  energy_kcal real,
  heart_rate_avg real,
  heart_rate_max real,
  source text,
  raw_json jsonb,
  ingested_at timestamptz default now()
);

create unique index if not exists idx_health_workouts_upsert on health_workouts (name, start_time, source);
create index if not exists idx_health_workouts_start_time on health_workouts (start_time desc);

create table if not exists health_ecg (
  id bigserial primary key,
  date timestamptz not null,
  classification text,
  heart_rate real,
  raw_json jsonb,
  ingested_at timestamptz default now()
);

create index if not exists idx_health_ecg_date on health_ecg (date desc);

create table if not exists health_medications (
  id bigserial primary key,
  date timestamptz not null,
  name text,
  dose text,
  raw_json jsonb,
  ingested_at timestamptz default now()
);

create index if not exists idx_health_medications_date on health_medications (date desc);

create table if not exists health_ingest_log (
  id bigserial primary key,
  received_at timestamptz default now(),
  payload_size_bytes integer,
  metrics_count integer default 0,
  workouts_count integer default 0,
  source_ip text,
  status text default 'ok'
);

alter table health_metrics enable row level security;
alter table health_workouts enable row level security;
alter table health_ecg enable row level security;
alter table health_medications enable row level security;
alter table health_ingest_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'health_metrics' and policyname = 'Allow authenticated read'
  ) then
    create policy "Allow authenticated read" on health_metrics for select to authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'health_workouts' and policyname = 'Allow authenticated read'
  ) then
    create policy "Allow authenticated read" on health_workouts for select to authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'health_ecg' and policyname = 'Allow authenticated read'
  ) then
    create policy "Allow authenticated read" on health_ecg for select to authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'health_medications' and policyname = 'Allow authenticated read'
  ) then
    create policy "Allow authenticated read" on health_medications for select to authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'health_ingest_log' and policyname = 'Allow authenticated read'
  ) then
    create policy "Allow authenticated read" on health_ingest_log for select to authenticated using (true);
  end if;
end $$;

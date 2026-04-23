-- HOME HEALTH CALL TRACKING SCHEMA (SUPABASE-READY)
-- Run after your core hh leads/session tables exist.

create extension if not exists pgcrypto;

create table if not exists public.hh_calls (
  call_id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  agent_id uuid,
  plate_session_id uuid,
  lead_name text,
  state text,
  score_total integer default 0,
  score_band text,
  qualified boolean default false,
  disqualification_reason text,
  recommended_option_key text,
  actual_option_key text,
  outcome text,
  notes text,
  call_started_at timestamptz,
  call_ended_at timestamptz,
  disposition_logged_at timestamptz,
  call_duration_minutes numeric(10,2),
  time_to_first_engagement_seconds integer,
  time_to_qualification_minutes numeric(10,2),
  time_to_disposition_minutes numeric(10,2),
  dropoff_plate integer,
  adl_count integer default 0,
  adls_selected jsonb default '[]'::jsonb,
  resistance_flag boolean default false,
  first_negative_signal_time_minutes numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hh_call_plate_progress (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.hh_calls(call_id) on delete cascade,
  plate_number integer not null,
  plate_key text not null,
  plate_label text,
  was_completed boolean not null default false,
  reached_at timestamptz,
  completed_at timestamptz,
  time_on_plate_seconds integer,
  created_at timestamptz not null default now()
);

create table if not exists public.hh_call_quality_metrics (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.hh_calls(call_id) on delete cascade,
  hit_opening_checkpoint boolean default false,
  hit_medicare_checkpoint boolean default false,
  hit_zip_checkpoint boolean default false,
  hit_problem_awareness_checkpoint boolean default false,
  hit_qualification_checkpoint boolean default false,
  hit_drug_capture_checkpoint boolean default false,
  hit_option_presentation_checkpoint boolean default false,
  hit_close_attempt_checkpoint boolean default false,
  qualifying_checkpoint_count integer default 0,
  total_expected_checkpoint_count integer default 8,
  script_adherence_percent numeric(5,2),
  created_at timestamptz not null default now()
);

create table if not exists public.hh_dispositions (
  disposition_id uuid primary key default gen_random_uuid(),
  call_id uuid references public.hh_calls(call_id) on delete set null,
  lead_id uuid,
  agent_id uuid,
  lead_name text,
  score_total integer default 0,
  score_band text,
  qualified boolean default false,
  disqualification_reason text,
  outcome text,
  stalled_reason text,
  did_zenyra_help boolean,
  followed_script text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_hh_calls_lead_id on public.hh_calls(lead_id);
create index if not exists idx_hh_calls_agent_id on public.hh_calls(agent_id);
create index if not exists idx_hh_calls_outcome on public.hh_calls(outcome);
create index if not exists idx_hh_calls_score_total on public.hh_calls(score_total);
create index if not exists idx_hh_call_plate_progress_call_id on public.hh_call_plate_progress(call_id);
create index if not exists idx_hh_call_quality_metrics_call_id on public.hh_call_quality_metrics(call_id);
create index if not exists idx_hh_dispositions_call_id on public.hh_dispositions(call_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_hh_calls_updated_at on public.hh_calls;
create trigger trg_hh_calls_updated_at
before update on public.hh_calls
for each row
execute function public.set_updated_at();

-- Example RLS starter policy set (adjust to your auth model)
alter table public.hh_calls enable row level security;
alter table public.hh_call_plate_progress enable row level security;
alter table public.hh_call_quality_metrics enable row level security;
alter table public.hh_dispositions enable row level security;

-- Replace with your actual auth rules later.
drop policy if exists hh_calls_open_dev_select on public.hh_calls;
create policy hh_calls_open_dev_select on public.hh_calls for select using (true);

drop policy if exists hh_calls_open_dev_insert on public.hh_calls;
create policy hh_calls_open_dev_insert on public.hh_calls for insert with check (true);

drop policy if exists hh_calls_open_dev_update on public.hh_calls;
create policy hh_calls_open_dev_update on public.hh_calls for update using (true);

drop policy if exists hh_call_plate_progress_open_dev_all on public.hh_call_plate_progress;
create policy hh_call_plate_progress_open_dev_all on public.hh_call_plate_progress for all using (true) with check (true);

drop policy if exists hh_call_quality_metrics_open_dev_all on public.hh_call_quality_metrics;
create policy hh_call_quality_metrics_open_dev_all on public.hh_call_quality_metrics for all using (true) with check (true);

drop policy if exists hh_dispositions_open_dev_all on public.hh_dispositions;
create policy hh_dispositions_open_dev_all on public.hh_dispositions for all using (true) with check (true);

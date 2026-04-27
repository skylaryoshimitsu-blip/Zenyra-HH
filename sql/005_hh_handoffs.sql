-- ─── hh_handoffs ─────────────────────────────────────────────────────────────
-- Created by Zenyra-main when an agent hands a lead off to the HH app.
-- The HH app (hh.zenyra.app) reads this row on load, hydrates the lead/MAPD
-- context, and writes back status='completed' + hh_disposition_id on disposition.
--
-- This migration is a REFERENCE SCHEMA for the shared Supabase project.
-- Zenyra-main is responsible for the INSERT; Zenyra-HH reads and updates.

create table if not exists public.hh_handoffs (
  id                      uuid primary key default gen_random_uuid(),

  -- Parent references (owned by Zenyra-main)
  parent_lead_id          uuid references public.leads(id) on delete set null,
  parent_plate_session_id uuid,   -- references main plate session if applicable
  agent_id                uuid,   -- agent who initiated the handoff

  -- Routing
  source_app   text not null default 'zenyra_main',
  target_app   text not null default 'zenyra_hh',
  start_plate  int  not null default 6,   -- HH_HEALTH_QUALIFICATION_PLATE

  -- Lifecycle
  status       text not null default 'open'  -- 'open' | 'completed' | 'cancelled'
    check (status in ('open', 'completed', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,

  -- HH-side back-reference
  hh_disposition_id uuid,   -- references hh_dispositions(id) after completion

  -- Full MAPD/lead context serialised by Zenyra-main
  -- Expected keys: name, phone, email, dob, medicare_number, medicaid_number,
  --   zip, county, state, city, gender, has_medicare_card, has_part_a, has_part_b,
  --   has_medicaid, election_period, sep_date, selected_benefit,
  --   carrier_name, org_name, plan_name, plan_type, monthly_premium, moop,
  --   part_b_giveback_status, pcp_copay, specialist_copay, er_copay,
  --   urgent_care_copay, inpatient_copay, ambulance_copay, drug_deductible,
  --   health_deductible, added_doctors, added_drugs, notes, source
  payload jsonb not null default '{}'
);

-- Keep updated_at current
create or replace function public.hh_handoffs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_hh_handoffs_updated_at on public.hh_handoffs;
create trigger trg_hh_handoffs_updated_at
  before update on public.hh_handoffs
  for each row execute procedure public.hh_handoffs_set_updated_at();

-- Indexes for the query patterns used by hh.zenyra.app
create index if not exists idx_hh_handoffs_parent_lead on public.hh_handoffs (parent_lead_id);
create index if not exists idx_hh_handoffs_status      on public.hh_handoffs (status);
create index if not exists idx_hh_handoffs_agent       on public.hh_handoffs (agent_id);

-- ─── hh_follow_ups (optional — created on callback_requested disposition) ────
-- Non-critical: HH app uses .catch(() => {}) if this table is missing.
create table if not exists public.hh_follow_ups (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid references public.leads(id) on delete cascade,
  agent_id   uuid,
  source_app text not null default 'zenyra_hh',
  outcome    text,
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists idx_hh_follow_ups_lead  on public.hh_follow_ups (lead_id);
create index if not exists idx_hh_follow_ups_agent on public.hh_follow_ups (agent_id);

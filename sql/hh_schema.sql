create extension if not exists pgcrypto;

create table if not exists hh_leads (
  lead_id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  zipcode text,
  state text,
  status text default 'new',
  score int default 0,
  score_band text,
  qualified boolean,
  disqualification_reason text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists hh_plate_sessions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references hh_leads(lead_id) on delete cascade,
  current_plate int default 1,
  willingness_to_advance boolean,
  zip_code text,
  county text,
  shopper_state text,
  has_part_a boolean default false,
  has_part_b boolean default false,
  has_medicaid boolean default false,
  knows_plan_type text,
  specialist_copay_awareness text,
  carrier_name text,
  hospital_cost_concern text,
  financial_impact_statement text,
  prefers_home_care boolean,
  home_care_burden_confirmed text,
  open_to_protection_options boolean,
  currently_in_nursing_home boolean default false,
  currently_receiving_home_health boolean default false,
  memory_condition_last_12_months boolean default false,
  qualified boolean,
  adls_json jsonb default '{}'::jsonb,
  medications_json jsonb default '[]'::jsonb,
  entered_option_c_premium numeric,
  entered_option_b_premium numeric,
  entered_option_a_premium numeric,
  selected_option_key text,
  score_total int,
  score_band text,
  disqualification_reason text,
  notes text,
  updated_at timestamptz default now()
);

create table if not exists hh_dispositions (
  disposition_id uuid primary key default gen_random_uuid(),
  lead_id uuid references hh_leads(lead_id) on delete cascade,
  lead_name text,
  outcome text not null,
  followed_script text,
  zenyra_helped boolean,
  score int default 0,
  score_band text,
  qualified boolean,
  disqualification_reason text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists hh_plan_options (
  option_key text primary key,
  option_label text not null,
  home_care_benefit numeric not null,
  annual_drug_reimbursement_cap numeric not null,
  display_order int not null
);

create table if not exists hh_drug_reference (
  drug_id uuid primary key default gen_random_uuid(),
  drug_name text not null unique,
  drug_type text not null check (drug_type in ('brand','generic')),
  is_active boolean default true,
  created_at timestamptz default now()
);

insert into hh_plan_options (option_key, option_label, home_care_benefit, annual_drug_reimbursement_cap, display_order)
values
('c', 'Option C', 150000, 900, 1),
('b', 'Option B', 100000, 600, 2),
('a', 'Option A', 50000, 300, 3)
on conflict (option_key) do nothing;

insert into hh_drug_reference (drug_name, drug_type)
values
('Eliquis', 'brand'),
('Xarelto', 'brand'),
('Jardiance', 'brand'),
('Ozempic', 'brand'),
('Trelegy Ellipta', 'brand'),
('Lisinopril', 'generic'),
('Atorvastatin', 'generic'),
('Metformin', 'generic'),
('Gabapentin', 'generic'),
('Amlodipine', 'generic'),
('Losartan', 'generic'),
('Levothyroxine', 'generic')
on conflict (drug_name) do nothing;

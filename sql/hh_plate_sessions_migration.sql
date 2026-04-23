-- ─────────────────────────────────────────────────────────────────────────────
-- Zenyra HH — hh_plate_sessions migration
-- Adds new columns required by v3.0 plate structure.
-- Run in Supabase SQL editor. All columns are nullable — safe to apply to
-- existing rows; they will default to NULL until populated by agents.
-- ─────────────────────────────────────────────────────────────────────────────

-- PLATE 2: Discovery (new plate — all fields new)
ALTER TABLE hh_plate_sessions
  ADD COLUMN IF NOT EXISTS health_conditions                        text,
  ADD COLUMN IF NOT EXISTS last_hospitalization                     text,       -- 'within_1yr' | '1_3yrs' | '3_5yrs' | '5plus' | 'never'
  ADD COLUMN IF NOT EXISTS ambulance_past_5_yrs                    boolean,
  ADD COLUMN IF NOT EXISTS currently_receiving_home_help_discovery  boolean,    -- distinct from currently_receiving_home_health (Plate 7)
  ADD COLUMN IF NOT EXISTS care_preference                          text,       -- 'home' | 'facility' | 'unsure'
  ADD COLUMN IF NOT EXISTS discovery_notes                         text;

-- PLATE 5: Plan Review (new plate — all fields new)
ALTER TABLE hh_plate_sessions
  ADD COLUMN IF NOT EXISTS ambulance_copay              text,
  ADD COLUMN IF NOT EXISTS home_health_cost             text,
  ADD COLUMN IF NOT EXISTS inpatient_days_1x_copay      text,
  ADD COLUMN IF NOT EXISTS inpatient_days_xplus_copay   text,
  ADD COLUMN IF NOT EXISTS plan_review_notes            text;

-- PLATE 6: Value Framing — new field (open_to_protection_options replaces
-- the old implicit signal; financial_impact_statement + home_care_cost_tolerance
-- already existed in most schemas but listed here for completeness)
ALTER TABLE hh_plate_sessions
  ADD COLUMN IF NOT EXISTS open_to_protection_options   boolean,
  ADD COLUMN IF NOT EXISTS financial_impact_statement   text,
  ADD COLUMN IF NOT EXISTS home_care_cost_tolerance     text;

-- Live score snapshot columns (written on every Save & Next)
ALTER TABLE hh_plate_sessions
  ADD COLUMN IF NOT EXISTS score_total  integer,
  ADD COLUMN IF NOT EXISTS score_band   text;

-- Columns that may already exist from previous schema — listed for reference.
-- Use ADD COLUMN IF NOT EXISTS so re-running this is safe.
-- has_part_a, has_part_b, has_medicaid
-- currently_in_nursing_home, currently_receiving_home_health, memory_condition_last_12_months
-- qualified
-- adl_bathing, adl_dressing, adl_toileting, adl_transferring, adl_continence, adl_feeding, adl_count
-- entered_option_c_premium, entered_option_b_premium, entered_option_a_premium
-- selected_option_key
-- notes, willing_to_advance
-- call_started_at, call_ended_at, disposition_logged_at
-- call_duration_minutes, time_to_disposition_minutes
-- disqualification_reason

-- ─── Columns REMOVED from plate flow (no longer written — safe to keep in DB) ─
-- zipcode, county, state          → collected on leads page
-- plan_type                       → Current Coverage plate removed
-- specialist_copay_awareness      → removed (off-product question)
-- carrier_name                    → Current Coverage plate removed
-- hospitalization_cost_awareness  → removed (replaced by Plan Review)
-- prefers_home_care               → moved to Discovery (care_preference)

-- ─── Index recommendations ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hh_plate_sessions_lead_id  ON hh_plate_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_hh_plate_sessions_score    ON hh_plate_sessions(score_total);

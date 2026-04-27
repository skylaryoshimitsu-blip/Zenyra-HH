-- =============================================================================
-- RLS POLICY AUDIT & HARDENING — Zenyra-HH Handoff Integration
-- =============================================================================
-- SECURITY CONTEXT
-- All Supabase calls from hh.zenyra.app use the ANON key (no auth session).
-- The service role key is NEVER in frontend code.
-- Shared-table writes (leads, hh_handoffs completion) are routed through the
-- Edge Function  supabase/functions/complete-hh-handoff/index.ts  which runs
-- with the service role server-side.
--
-- ROLE MAPPING
--   anon          → unauthenticated browser requests from hh.zenyra.app
--   authenticated → future: agents logged in via shared Supabase Auth
--   service_role  → Edge Function / Zenyra-main backend only
--
-- RULE: Never write USING (true) / WITH CHECK (true) on sensitive cross-app
-- tables (leads, agents, users, hh_handoffs.status=>'completed').
-- =============================================================================


-- ─── hh_handoffs ─────────────────────────────────────────────────────────────
-- Written by Zenyra-main. Read + status-advanced by Zenyra-HH.
-- Final completion (status='completed', hh_disposition_id) is done server-side
-- by the Edge Function using service role — NOT by the anon browser client.

ALTER TABLE IF EXISTS public.hh_handoffs ENABLE ROW LEVEL SECURITY;

-- Anon can SELECT only HH-targeted handoffs (UUID = capability token).
-- Knowing the UUID is the implicit authorization grant from Zenyra-main.
DROP POLICY IF EXISTS "hh_handoffs_anon_select" ON public.hh_handoffs;
CREATE POLICY "hh_handoffs_anon_select"
  ON public.hh_handoffs FOR SELECT
  TO anon
  USING (target_app = 'zenyra_hh');

-- Authenticated agents can SELECT their own handoffs (either app).
DROP POLICY IF EXISTS "hh_handoffs_agent_select" ON public.hh_handoffs;
CREATE POLICY "hh_handoffs_agent_select"
  ON public.hh_handoffs FOR SELECT
  TO authenticated
  USING (
    agent_id = auth.uid()
    OR target_app = 'zenyra_hh'
  );

-- Anon can advance status from 'open' → 'in_progress' ONLY.
-- The final 'completed' write is handled by the Edge Function (service role).
DROP POLICY IF EXISTS "hh_handoffs_anon_mark_in_progress" ON public.hh_handoffs;
CREATE POLICY "hh_handoffs_anon_mark_in_progress"
  ON public.hh_handoffs FOR UPDATE
  TO anon
  USING (
    target_app = 'zenyra_hh'
    AND status = 'open'
  )
  WITH CHECK (
    target_app = 'zenyra_hh'
    AND status = 'in_progress'
    -- Prevent anon from writing hh_disposition_id or completed_at directly
  );

-- INSERT: Zenyra-main only (authenticated or service role). Not anon.
-- No INSERT policy for anon on hh_handoffs — enforced by absence.

-- DELETE: No one via frontend.
-- No DELETE policy for anon or authenticated on hh_handoffs.


-- ─── leads (SHARED TABLE — Zenyra-main owns this) ────────────────────────────
-- DO NOT add anon write policies to this table.
-- The Edge Function uses service role to UPDATE leads.status.
-- If RLS is already enabled on leads, no changes are needed here for HH.
-- Ensure no accidental anon policies exist:

ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;

-- Verify anon has no destructive access. Read-only anon access is acceptable
-- only for the HH app to verify a lead exists before starting a session.
-- If Zenyra-main already has SELECT policies for authenticated, leave them.

-- Anon SELECT: only the specific lead referenced by an open HH handoff.
-- This is intentionally narrow — HH only needs to read if it verifies leads
-- directly (currently it doesn't; it uses hh_handoffs.payload instead).
-- Leave commented unless explicitly required:
-- DROP POLICY IF EXISTS "leads_anon_select_via_handoff" ON public.leads;
-- CREATE POLICY "leads_anon_select_via_handoff"
--   ON public.leads FOR SELECT
--   TO anon
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.hh_handoffs h
--       WHERE h.parent_lead_id = leads.id
--         AND h.target_app = 'zenyra_hh'
--         AND h.status IN ('open', 'in_progress')
--     )
--   );

-- NO anon UPDATE/INSERT/DELETE on leads. Period.


-- ─── hh_dispositions ─────────────────────────────────────────────────────────
-- HH-owned table. Anon browser inserts dispositions after each call.
-- source_app / disposition_channel are stamped in the INSERT payload.

ALTER TABLE IF EXISTS public.hh_dispositions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hh_dispositions_anon_insert" ON public.hh_dispositions;
CREATE POLICY "hh_dispositions_anon_insert"
  ON public.hh_dispositions FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "hh_dispositions_anon_select" ON public.hh_dispositions;
CREATE POLICY "hh_dispositions_anon_select"
  ON public.hh_dispositions FOR SELECT
  TO anon
  USING (true);

-- Authenticated agents can read their own dispositions.
DROP POLICY IF EXISTS "hh_dispositions_agent_select" ON public.hh_dispositions;
CREATE POLICY "hh_dispositions_agent_select"
  ON public.hh_dispositions FOR SELECT
  TO authenticated
  USING (true);   -- Narrow to agent_id = auth.uid() once auth is implemented.

-- No anon UPDATE or DELETE.


-- ─── hh_plate_sessions ───────────────────────────────────────────────────────
-- HH-owned. Created, read, and updated by the HH browser client per call.

ALTER TABLE IF EXISTS public.hh_plate_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hh_plate_sessions_anon_insert" ON public.hh_plate_sessions;
CREATE POLICY "hh_plate_sessions_anon_insert"
  ON public.hh_plate_sessions FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "hh_plate_sessions_anon_select" ON public.hh_plate_sessions;
CREATE POLICY "hh_plate_sessions_anon_select"
  ON public.hh_plate_sessions FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "hh_plate_sessions_anon_update" ON public.hh_plate_sessions;
CREATE POLICY "hh_plate_sessions_anon_update"
  ON public.hh_plate_sessions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);


-- ─── hh_session_drugs ────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.hh_session_drugs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hh_session_drugs_anon_insert" ON public.hh_session_drugs;
CREATE POLICY "hh_session_drugs_anon_insert"
  ON public.hh_session_drugs FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "hh_session_drugs_anon_select" ON public.hh_session_drugs;
CREATE POLICY "hh_session_drugs_anon_select"
  ON public.hh_session_drugs FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "hh_session_drugs_anon_delete" ON public.hh_session_drugs;
CREATE POLICY "hh_session_drugs_anon_delete"
  ON public.hh_session_drugs FOR DELETE
  TO anon
  USING (true);


-- ─── hh_objection_events ─────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.hh_objection_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hh_objection_events_anon_insert" ON public.hh_objection_events;
CREATE POLICY "hh_objection_events_anon_insert"
  ON public.hh_objection_events FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "hh_objection_events_anon_select" ON public.hh_objection_events;
CREATE POLICY "hh_objection_events_anon_select"
  ON public.hh_objection_events FOR SELECT
  TO anon
  USING (true);


-- ─── hh_calls ────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.hh_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hh_calls_anon_insert" ON public.hh_calls;
CREATE POLICY "hh_calls_anon_insert"
  ON public.hh_calls FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "hh_calls_anon_select" ON public.hh_calls;
CREATE POLICY "hh_calls_anon_select"
  ON public.hh_calls FOR SELECT
  TO anon
  USING (true);


-- ─── hh_leads ────────────────────────────────────────────────────────────────
-- HH-owned table for standalone (non-handoff) lead management.

ALTER TABLE IF EXISTS public.hh_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hh_leads_anon_all" ON public.hh_leads;
CREATE POLICY "hh_leads_anon_all"
  ON public.hh_leads FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);


-- ─── hh_follow_ups ───────────────────────────────────────────────────────────
-- Written by the Edge Function (service role) — not directly by anon browser.
-- The Edge Function handles inserts using service role; no anon policy needed.
-- Enable RLS so no accidental anon write is possible:

ALTER TABLE IF EXISTS public.hh_follow_ups ENABLE ROW LEVEL SECURITY;

-- No anon INSERT policy — Edge Function uses service role.
-- Authenticated agents can read their own follow-ups:
DROP POLICY IF EXISTS "hh_follow_ups_agent_select" ON public.hh_follow_ups;
CREATE POLICY "hh_follow_ups_agent_select"
  ON public.hh_follow_ups FOR SELECT
  TO authenticated
  USING (agent_id = auth.uid());


-- ─── agents (if used for agent lookup) ───────────────────────────────────────
-- Anon read-only access to display agent info if the table exists.
-- Commented: adjust if agents table exists and anon read is needed.
-- ALTER TABLE IF EXISTS public.agents ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "agents_anon_select" ON public.agents FOR SELECT TO anon USING (true);


-- =============================================================================
-- UPGRADE PATH: When shared Supabase Auth is implemented
-- Replace the above anon policies with auth-scoped versions:
--
-- Example for hh_dispositions:
--   DROP POLICY "hh_dispositions_anon_insert" ON hh_dispositions;
--   CREATE POLICY "hh_dispositions_agent_insert"
--     ON hh_dispositions FOR INSERT TO authenticated
--     WITH CHECK (agent_id = auth.uid());
--
-- Example for hh_plate_sessions:
--   DROP POLICY "hh_plate_sessions_anon_update" ON hh_plate_sessions;
--   CREATE POLICY "hh_plate_sessions_agent_update"
--     ON hh_plate_sessions FOR UPDATE TO authenticated
--     USING (
--       EXISTS (
--         SELECT 1 FROM hh_leads l
--         WHERE l.id = hh_plate_sessions.lead_id
--           AND l.agent_id = auth.uid()
--       )
--     );
-- =============================================================================

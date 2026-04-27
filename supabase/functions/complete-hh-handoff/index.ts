/**
 * complete-hh-handoff — Supabase Edge Function
 *
 * Runs SERVER-SIDE with the service role key.
 * Handles all cross-app Supabase writes that the anon browser client
 * cannot perform safely under RLS:
 *   1. UPDATE leads.status      (shared Zenyra-main table)
 *   2. UPDATE hh_handoffs       (status=completed, completed_at, hh_disposition_id)
 *   3. INSERT hh_follow_ups     (optional, for callback_requested outcomes)
 *
 * The browser (hh.zenyra.app) still inserts hh_dispositions directly
 * using the anon key, then calls this function with the resulting ID.
 *
 * Authorization model:
 *   - Caller provides handoff_id (UUID) — knowing the UUID is the
 *     capability token issued by Zenyra-main when it created the row.
 *   - The function validates status='open' and target_app='zenyra_hh'
 *     before performing any writes.
 *   - No service role key is ever sent to the browser.
 *
 * Deploy:
 *   supabase functions deploy complete-hh-handoff --no-verify-jwt
 *
 * Restrict CORS in production:
 *   Change ALLOWED_ORIGIN to 'https://hh.zenyra.app'
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── CORS — restrict to hh.zenyra.app in production ──────────────────────────
const ALLOWED_ORIGIN = Deno.env.get('HH_ALLOWED_ORIGIN') || 'https://hh.zenyra.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Accepted outcome values (mirrors hh_dispositions status enum) ────────────
const VALID_OUTCOMES = new Set([
  'sold', 'application_started',
  'callback_requested', 'needs_information', 'reviewing_with_family',
  'not_interested', 'premium_too_high', 'not_eligible', 'do_not_contact',
  'no_answer', 'voicemail_left', 'wrong_number',
])

// ─── Response helpers ─────────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: {
    handoff_id?: string
    hh_disposition_id?: string
    outcome?: string
    notes?: string
  }

  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { handoff_id, hh_disposition_id, outcome, notes } = body

  // ── Input validation ────────────────────────────────────────────────────────
  if (!handoff_id || typeof handoff_id !== 'string') {
    return json({ error: 'Missing required field: handoff_id' }, 400)
  }
  if (!hh_disposition_id || typeof hh_disposition_id !== 'string') {
    return json({ error: 'Missing required field: hh_disposition_id' }, 400)
  }
  if (!outcome || !VALID_OUTCOMES.has(outcome)) {
    return json({ error: `Invalid outcome. Must be one of: ${[...VALID_OUTCOMES].join(', ')}` }, 400)
  }

  // ── Service role client (NEVER exposed to browser) ──────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // ── Fetch and validate the handoff ──────────────────────────────────────────
  const { data: handoff, error: fetchErr } = await supabase
    .from('hh_handoffs')
    .select('id, parent_lead_id, agent_id, status, target_app')
    .eq('id', handoff_id)
    .single()

  if (fetchErr || !handoff) {
    return json({
      error: fetchErr?.code === 'PGRST116'
        ? `Handoff not found: ${handoff_id}`
        : `Handoff fetch failed: ${fetchErr?.message}`,
    }, 404)
  }

  if (handoff.target_app !== 'zenyra_hh') {
    return json({ error: `Handoff targets "${handoff.target_app}", not zenyra_hh` }, 403)
  }

  if (handoff.status === 'completed') {
    return json({ error: 'Handoff already completed', already_completed: true }, 409)
  }

  if (handoff.status === 'cancelled') {
    return json({ error: 'Handoff was cancelled' }, 409)
  }

  // ── Perform writes ──────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const writeErrors: string[] = []

  // 1. UPDATE shared leads.status
  if (handoff.parent_lead_id) {
    const { error: leadsErr } = await supabase
      .from('leads')
      .update({ status: outcome, updated_at: now })
      .eq('id', handoff.parent_lead_id)

    if (leadsErr) {
      writeErrors.push(`leads.update: ${leadsErr.message}`)
    }
  }

  // 2. Mark hh_handoffs completed with back-reference to HH disposition
  const { error: handoffErr } = await supabase
    .from('hh_handoffs')
    .update({
      status: 'completed',
      completed_at: now,
      hh_disposition_id,
    })
    .eq('id', handoff_id)

  if (handoffErr) {
    writeErrors.push(`hh_handoffs.update: ${handoffErr.message}`)
  }

  // 3. Optional follow-up for callback outcomes
  if (outcome === 'callback_requested' && handoff.parent_lead_id) {
    const { error: fuErr } = await supabase
      .from('hh_follow_ups')
      .insert({
        lead_id: handoff.parent_lead_id,
        agent_id: handoff.agent_id,
        source_app: 'zenyra_hh',
        outcome,
        notes: typeof notes === 'string' ? notes : '',
        created_at: now,
      })

    if (fuErr && !fuErr.message.includes('does not exist')) {
      // Only warn if table exists but insert failed; ignore if table isn't created yet
      writeErrors.push(`hh_follow_ups.insert: ${fuErr.message}`)
    }
  }

  // ── Return result ───────────────────────────────────────────────────────────
  if (writeErrors.length > 0) {
    return json({
      success: false,
      errors: writeErrors,
      note: 'hh_disposition was already saved. These are secondary sync failures.',
    }, 207)
  }

  return json({ success: true })
})

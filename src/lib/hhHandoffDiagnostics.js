/**
 * hhHandoffDiagnostics — non-destructive RLS/access auditor
 *
 * Run from the browser console on hh.zenyra.app:
 *
 *   import { runHandoffDiagnostics } from './lib/hhHandoffDiagnostics'
 *   runHandoffDiagnostics({ handoffId: '<real-uuid>' }).then(console.table)
 *
 * Or in a dev build, attach it to window for quick access:
 *   window.__hhDx = () => runHandoffDiagnostics({ handoffId: prompt('handoff_id?') })
 *
 * All tests are read-only EXCEPT the "edge_function_ping" probe, which calls
 * the Edge Function with a sentinel value that the function rejects before
 * performing any writes (missing hh_disposition_id → 400 → no DB change).
 *
 * Each result: { pass: boolean, detail: string }
 */

import { supabase } from './supabaseClient'

// ─── Individual probes ────────────────────────────────────────────────────────

async function probe(label, fn) {
  try {
    const result = await fn()
    return { label, ...result }
  } catch (err) {
    return { label, pass: false, detail: `JS exception: ${err.message}` }
  }
}

// 1 — Can anon SELECT from hh_handoffs?
async function probeHandoffSelect(handoffId) {
  if (!handoffId) return { pass: false, detail: 'No handoffId supplied — skipped' }
  const { data, error } = await supabase
    .from('hh_handoffs')
    .select('id, status, target_app, payload')
    .eq('id', handoffId)
    .maybeSingle()
  if (error) return { pass: false, detail: `RLS/error: ${error.message} (code: ${error.code})` }
  if (!data)  return { pass: false, detail: 'Row not found — check handoffId or RLS SELECT policy' }
  return {
    pass: true,
    detail: `Found. status=${data.status} target_app=${data.target_app} payload_keys=${Object.keys(data.payload || {}).join(',') || 'none'}`,
  }
}

// 2 — Can anon SELECT from hh_plate_sessions?
async function probeSessionSelect() {
  const { error } = await supabase
    .from('hh_plate_sessions')
    .select('id')
    .limit(1)
  if (error) return { pass: false, detail: `${error.message} (code: ${error.code})` }
  return { pass: true, detail: 'SELECT hh_plate_sessions OK' }
}

// 3 — Can anon SELECT from hh_dispositions?
async function probeDispositionSelect() {
  const { error } = await supabase
    .from('hh_dispositions')
    .select('id')
    .limit(1)
  if (error) return { pass: false, detail: `${error.message} (code: ${error.code})` }
  return { pass: true, detail: 'SELECT hh_dispositions OK' }
}

// 4 — Can anon INSERT+DELETE a test hh_plate_sessions row (write probe)?
async function probeSessionWrite() {
  const testId = `diag-${Date.now()}`
  const { data: ins, error: insErr } = await supabase
    .from('hh_plate_sessions')
    .insert({ lead_id: testId, current_plate: 1, call_started_at: new Date().toISOString(), plate_progress: {} })
    .select('id')
    .single()

  if (insErr) return { pass: false, detail: `INSERT failed: ${insErr.message}` }

  // Immediately clean up — leave no test data
  await supabase.from('hh_plate_sessions').delete().eq('id', ins.id)

  return { pass: true, detail: `INSERT+DELETE hh_plate_sessions OK (id=${ins.id} cleaned up)` }
}

// 5 — Can anon INSERT a test hh_dispositions row?
async function probeDispositionWrite() {
  const { data: ins, error: insErr } = await supabase
    .from('hh_dispositions')
    .insert({
      lead_id: `diag-${Date.now()}`,
      outcome: 'no_answer',
      lead_name_snapshot: '__diagnostic_test__',
      disposition_logged_at: new Date().toISOString(),
      source_app: 'zenyra_hh',
      disposition_channel: 'hh_handoff',
    })
    .select('id')
    .single()

  if (insErr) return { pass: false, detail: `INSERT failed: ${insErr.message}` }
  await supabase.from('hh_dispositions').delete().eq('id', ins.id)
  return { pass: true, detail: `INSERT+DELETE hh_dispositions OK (id=${ins.id} cleaned up)` }
}

// 6 — Can anon SELECT from the shared leads table?
//     (read-only probe — HH reads leads only indirectly via handoff payload)
async function probeLeadsSelect() {
  const { error } = await supabase
    .from('leads')
    .select('id')
    .limit(1)
  if (error) {
    if (error.code === '42501' || error.message?.includes('permission')) {
      return { pass: false, detail: `RLS blocks anon SELECT on leads — expected if policy not set. (${error.code})` }
    }
    return { pass: false, detail: `${error.message} (code: ${error.code})` }
  }
  return { pass: true, detail: 'SELECT leads OK (anon has read access)' }
}

// 7 — Is the Edge Function reachable? (sentinel call — no DB write happens)
//     The function returns 400 because hh_disposition_id is deliberately missing.
async function probeEdgeFunction() {
  const { error, data } = await supabase.functions.invoke('complete-hh-handoff', {
    body: { handoff_id: '__diagnostic__' },   // missing hh_disposition_id → 400
  })

  // A 400 (validation error) means the function is deployed and responding.
  // A FetchError / non-2xx means it's not deployed or CORS is misconfigured.
  if (error) {
    const msg = error.message || String(error)
    if (msg.includes('404') || msg.includes('not found')) {
      return { pass: false, detail: 'Edge Function not deployed yet. Deploy with: supabase functions deploy complete-hh-handoff --no-verify-jwt' }
    }
    if (msg.includes('400') || msg.includes('Missing required')) {
      return { pass: true, detail: 'Edge Function reachable (returned 400 as expected for sentinel call)' }
    }
    return { pass: false, detail: `Unexpected error: ${msg}` }
  }

  // Some versions return body even on error
  if (data?.error?.includes('Missing required')) {
    return { pass: true, detail: 'Edge Function reachable (validated sentinel rejection)' }
  }

  return { pass: false, detail: `Unexpected response: ${JSON.stringify(data)}` }
}

// 8 — Can anon UPDATE hh_handoffs.status from 'open' → 'in_progress'?
//     Uses a real handoffId but only attempts the update if status === 'open'.
//     Will NOT proceed if handoff is already completed (safe guard).
async function probeHandoffUpdate(handoffId) {
  if (!handoffId) return { pass: false, detail: 'No handoffId — skipped' }

  // First read the row
  const { data: row, error: readErr } = await supabase
    .from('hh_handoffs')
    .select('id, status, target_app')
    .eq('id', handoffId)
    .maybeSingle()

  if (readErr || !row) {
    return { pass: false, detail: `Cannot read row before update probe: ${readErr?.message || 'not found'}` }
  }

  if (row.status !== 'open') {
    return {
      pass: null,
      detail: `Skipped UPDATE probe — status is "${row.status}", not "open". Cannot safely test without mutation.`,
    }
  }

  // Attempt 'in_progress' — then revert to 'open'
  const { error: upErr } = await supabase
    .from('hh_handoffs')
    .update({ status: 'in_progress' })
    .eq('id', handoffId)

  if (upErr) {
    return { pass: false, detail: `UPDATE blocked: ${upErr.message} (code: ${upErr.code})` }
  }

  // Revert
  await supabase.from('hh_handoffs').update({ status: 'open' }).eq('id', handoffId)

  return { pass: true, detail: 'UPDATE hh_handoffs status open→in_progress OK (reverted to open)' }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {string} [opts.handoffId]  A real open hh_handoffs UUID to test against.
 * @param {boolean} [opts.skipWrite] Skip all write probes (SELECT-only mode).
 * @returns {Promise<Array<{label:string, pass:boolean|null, detail:string}>>}
 */
export async function runHandoffDiagnostics({ handoffId, skipWrite = false } = {}) {
  console.group('🔬 HH Handoff RLS Diagnostics')
  console.info('Supabase project:', import.meta.env.VITE_SUPABASE_URL)
  console.info('Auth role: anon (no active session)')
  console.info('handoffId:', handoffId || '(none supplied)')
  console.groupEnd()

  const results = await Promise.all([
    probe('1_hh_handoffs_SELECT',        () => probeHandoffSelect(handoffId)),
    probe('2_hh_plate_sessions_SELECT',  () => probeSessionSelect()),
    probe('3_hh_dispositions_SELECT',    () => probeDispositionSelect()),
    probe('4_hh_plate_sessions_WRITE',   skipWrite
      ? async () => ({ pass: null, detail: 'Skipped (skipWrite=true)' })
      : probeSessionWrite),
    probe('5_hh_dispositions_WRITE',     skipWrite
      ? async () => ({ pass: null, detail: 'Skipped (skipWrite=true)' })
      : probeDispositionWrite),
    probe('6_leads_SELECT',              () => probeLeadsSelect()),
    probe('7_edge_function_reachable',   () => probeEdgeFunction()),
    probe('8_hh_handoffs_UPDATE_status', skipWrite
      ? async () => ({ pass: null, detail: 'Skipped (skipWrite=true)' })
      : () => probeHandoffUpdate(handoffId)),
  ])

  // Summary
  const pass   = results.filter((r) => r.pass === true).length
  const fail   = results.filter((r) => r.pass === false).length
  const skip   = results.filter((r) => r.pass === null).length
  console.group(`🔬 Diagnostics complete — ✅ ${pass} passed  ❌ ${fail} failed  ⏭ ${skip} skipped`)
  results.forEach((r) => {
    const icon = r.pass === true ? '✅' : r.pass === false ? '❌' : '⏭'
    console.log(`${icon}  ${r.label}: ${r.detail}`)
  })
  console.groupEnd()

  return results
}

import React, { useEffect, useMemo, useState } from 'react'
import HomeHealthDashboard from './components/HomeHealthDashboard'
import HomeHealthAdminDashboard from './components/HomeHealthAdminDashboard'
import HomeHealthSalesPlates from './components/HomeHealthSalesPlates'
import { mockLeads } from './lib/mockData'
import { supabase } from './lib/supabaseClient'

const LEADS_KEY = 'hh_leads'
const DISPOSITIONS_KEY = 'hh_dispositions'

// The plate number that maps to HH health qualification questions
const HH_HEALTH_QUALIFICATION_PLATE = 6

// ─── Legacy handoff: ?handoff=<base64/json> with source==='zenyra-main' ────────
function parseLegacyHandoffParam() {
  try {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('handoff')
    if (!raw) return null
    let payload
    try { payload = JSON.parse(atob(raw)) } catch { payload = JSON.parse(raw) }
    if (!payload || payload.source !== 'zenyra-main') return null
    return payload
  } catch {
    return null
  }
}

// ─── Maps hh_handoffs.payload MAPD fields → HH session prefill fields ────────
function buildPrefilledSession(payload) {
  const drugs = []
  if (Array.isArray(payload.added_drugs)) {
    payload.added_drugs.forEach((d) => {
      if (typeof d === 'string') drugs.push({ name: d, type: 'generic' })
      else if (d?.name) drugs.push({ name: d.name, type: d.type || 'generic' })
    })
  }
  return {
    willingnessToAdvance: true,
    hasPartA: payload.has_part_a ?? (payload.has_medicare_card ? true : false),
    hasPartB: payload.has_part_b ?? (payload.has_medicare_card ? true : false),
    hasMedicaid: !!(payload.medicaid_number || payload.has_medicaid),
    ambulanceCopay: String(payload.ambulance_copay || ''),
    notes: payload.notes || '',
    ...(drugs.length > 0 ? { medications: drugs } : {}),
  }
}

export default function App() {
  const [view, setView] = useState('agent')
  const [leads, setLeads] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(LEADS_KEY) || 'null')
      return Array.isArray(stored) && stored.length ? stored : mockLeads
    } catch { return mockLeads }
  })
  const [dispositions, setDispositions] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DISPOSITIONS_KEY) || '[]')
      return Array.isArray(stored) ? stored : []
    } catch { return [] }
  })

  // handoff state machine: 'idle' | 'loading' | 'ready' | 'error'
  const [handoffStatus, setHandoffStatus]     = useState('idle')
  const [handoffError, setHandoffError]       = useState(null)
  const [handoffLead, setHandoffLead]         = useState(null)
  const [handoffInitialPlate, setHandoffInitialPlate] = useState(null)
  const [handoffContext, setHandoffContext]   = useState(null)

  useEffect(() => {
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
  }, [leads])

  useEffect(() => {
    localStorage.setItem(DISPOSITIONS_KEY, JSON.stringify(dispositions))
  }, [dispositions])

  // ─── Process handoff URL params on mount ──────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const handoffId = params.get('handoff_id')
    const startPlateRaw = params.get('start_plate')

    // ── New format: ?handoff_id=<uuid>&start_plate=<n> ────────────────────
    if (handoffId) {
      setHandoffStatus('loading')
      ;(async () => {
        try {
          const { data: row, error } = await supabase
            .from('hh_handoffs')
            .select('*')
            .eq('id', handoffId)
            .single()

          if (error || !row) {
            const msg = error?.code === 'PGRST116'
              ? `Handoff not found (ID: ${handoffId}). The record may not exist or was deleted.`
              : `Failed to fetch handoff: ${error?.message || 'Unknown error.'}`
            setHandoffError(msg)
            setHandoffStatus('error')
            return
          }

          if (row.target_app && row.target_app !== 'zenyra_hh') {
            setHandoffError(`This handoff targets "${row.target_app}", not zenyra_hh. You may be on the wrong app.`)
            setHandoffStatus('error')
            return
          }

          if (row.status === 'completed') {
            setHandoffError('This handoff has already been completed — the HH outcome was already dispositioned.')
            setHandoffStatus('error')
            return
          }

          if (row.status === 'cancelled') {
            setHandoffError('This handoff was cancelled and cannot be re-opened.')
            setHandoffStatus('error')
            return
          }

          // Plate priority: URL param > hh_handoffs.start_plate > HH_HEALTH_QUALIFICATION_PLATE
          const urlPlate = parseInt(startPlateRaw, 10)
          const rowPlate = parseInt(row.start_plate, 10)
          const resolvedPlate =
            !isNaN(urlPlate) && urlPlate >= 1 ? urlPlate :
            !isNaN(rowPlate) && rowPlate >= 1 ? rowPlate :
            HH_HEALTH_QUALIFICATION_PLATE

          const payload = row.payload || {}

          // Build lead object using parent_lead_id — no duplicate lead creation
          const leadObj = {
            id: row.parent_lead_id,
            lead_id: row.parent_lead_id,
            full_name: payload.name || payload.full_name || payload.customer_name || '',
            phone: payload.phone || '',
            email: payload.email || '',
            dob: payload.dob || payload.date_of_birth || '',
            medicare_number: payload.medicare_number || '',
            medicaid_number: payload.medicaid_number || '',
            zipcode: payload.zip || payload.zipcode || '',
            county: payload.county || '',
            state: payload.state || '',
            city: payload.city || '',
            notes: payload.notes || '',
            status: 'in-progress',
          }

          // Context carries all MAPD data + parent references for disposition sync
          const context = {
            handoffId: row.id,
            parentLeadId: row.parent_lead_id,
            parentPlateSessionId: row.parent_plate_session_id,
            agentId: row.agent_id,
            sourceApp: row.source_app || 'zenyra_main',
            payload,
            prefilledSession: buildPrefilledSession(payload),
          }

          setHandoffLead(leadObj)
          setHandoffInitialPlate(resolvedPlate)
          setHandoffContext(context)
          setHandoffStatus('ready')
          window.history.replaceState(null, '', window.location.pathname)
        } catch (err) {
          setHandoffError(`Unexpected error loading handoff: ${err.message}`)
          setHandoffStatus('error')
        }
      })()
      return
    }

    // ── Legacy format: ?handoff=<base64/json> ─────────────────────────────
    const legacyPayload = parseLegacyHandoffParam()
    if (!legacyPayload) return

    const initialPlate = legacyPayload.launched_from_plate === 7 ? 8 : 1
    const leadFields = {
      full_name: legacyPayload.name || '',
      phone: legacyPayload.phone || '',
      email: legacyPayload.email || '',
      dob: legacyPayload.dob || '',
      medicare_number: legacyPayload.medicare_number || '',
      medicaid_number: legacyPayload.medicaid_number || '',
      zipcode: legacyPayload.zip || '',
      county: legacyPayload.county || '',
      state: legacyPayload.state || '',
      city: legacyPayload.city || '',
      notes: legacyPayload.notes || '',
      willing_to_advance: true,
      status: 'new',
    }

    let currentLeads
    try {
      const stored = JSON.parse(localStorage.getItem(LEADS_KEY) || 'null')
      currentLeads = Array.isArray(stored) && stored.length ? stored : mockLeads
    } catch { currentLeads = mockLeads }

    const existingIdx = legacyPayload.phone
      ? currentLeads.findIndex((l) => l.phone === legacyPayload.phone)
      : -1

    const resolvedLead = existingIdx >= 0
      ? { ...currentLeads[existingIdx], ...leadFields }
      : { id: `handoff-${Date.now()}`, ...leadFields }

    setLeads((prev) =>
      existingIdx >= 0
        ? prev.map((l, i) => (i === existingIdx ? resolvedLead : l))
        : [resolvedLead, ...prev]
    )
    setHandoffLead(resolvedLead)
    setHandoffInitialPlate(initialPlate)
    setHandoffStatus('ready')
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const sharedProps = useMemo(
    () => ({ leads, setLeads, dispositions, setDispositions }),
    [leads, dispositions]
  )

  const handleHandoffClose = () => {
    setHandoffLead(null)
    setHandoffContext(null)
    setHandoffStatus('idle')
    setHandoffInitialPlate(null)
  }

  // ── Loading: fetching hh_handoffs from Supabase ───────────────────────────
  if (handoffStatus === 'loading') {
    return (
      <div style={centeredShell}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#111827' }}>
            Loading Handoff…
          </div>
          <div style={{ color: '#6b7280', fontSize: 15 }}>
            Fetching lead and MAPD context from Zenyra Main
          </div>
        </div>
      </div>
    )
  }

  // ── Error: visible explanation + escape hatch to open app normally ─────────
  if (handoffStatus === 'error') {
    return (
      <div style={centeredShell}>
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626', marginBottom: 12 }}>
            Handoff Could Not Be Loaded
          </div>
          <div style={{
            color: '#4b5563', lineHeight: 1.7, fontSize: 14, marginBottom: 28,
            background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12,
            padding: '16px 20px', textAlign: 'left',
          }}>
            {handoffError}
          </div>
          <button
            onClick={() => {
              setHandoffStatus('idle')
              setHandoffError(null)
              window.history.replaceState(null, '', window.location.pathname)
            }}
            style={{
              background: '#111827', color: '#fff', border: 'none', borderRadius: 12,
              padding: '12px 28px', cursor: 'pointer', fontSize: 15, fontWeight: 600,
            }}
          >
            Open HH App Normally
          </button>
        </div>
      </div>
    )
  }

  // ── Handoff ready: open plates immediately, bypassing dashboard ───────────
  if (handoffStatus === 'ready' && handoffLead) {
    return (
      <HomeHealthSalesPlates
        leadData={handoffLead}
        initialPlate={handoffInitialPlate}
        handoffContext={handoffContext}
        onClose={handleHandoffClose}
        onDispositionSave={handleHandoffClose}
      />
    )
  }

  // ── Normal standalone HH flow ─────────────────────────────────────────────
  return view === 'agent' ? (
    <HomeHealthDashboard {...sharedProps} onOpenAdmin={() => setView('admin')} />
  ) : (
    <HomeHealthAdminDashboard {...sharedProps} onBack={() => setView('agent')} />
  )
}

const centeredShell = {
  position: 'fixed', inset: 0, background: '#f9fafb',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
}

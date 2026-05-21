import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, FileText, Menu, MessageSquare, Phone, X } from 'lucide-react'
import { scoreHomeHealthSession } from '../lib/hhScoring'
import HomeHealthDispositionModal from './HomeHealthDispositionModal'
import { supabase } from '../lib/supabaseClient'

// ─── Plate Definitions — 9 plates, confirmed sequence ────────────────────────
const NAV_PLATES = [
  { id: 1, name: 'Opening & Verification' },
  { id: 2, name: 'Discovery' },
  { id: 3, name: 'Medication Capture' },
  { id: 4, name: 'Plan Review' },
  { id: 5, name: 'Value Framing' },
  { id: 6, name: 'Qualification' },
  { id: 7, name: 'Medicare Education' },
  { id: 8, name: 'Recommendation & Close' },
  { id: 9, name: 'Final Close' },
]

// ─── Objection Options ────────────────────────────────────────────────────────
const OBJECTION_OPTIONS = [
  {
    key: 'cost_concern',
    label: 'Cost Concern',
    response: `That's a fair question… most people ask that before they even know what it solves.\n\nCan I ask — when you think about needing care later on, is your bigger concern the cost of something like this… or what it could cost you if you don't have it?`,
  },
  {
    key: 'healthy',
    label: '"I\'m Healthy"',
    response: `That's actually the best place to be. Most of the people I talk to felt the same way… before something unexpected happened.\n\nCan I ask — have you ever seen someone go from perfectly fine to suddenly needing help?`,
  },
  {
    key: 'faith',
    label: 'Faith / "God\'s Hands"',
    response: `I respect that… a lot of people I speak with feel the same way.\n\nCan I ask — do you feel like part of trusting God also includes preparing so your family doesn't have to struggle if something happens?`,
  },
  {
    key: 'not_interested',
    label: 'Not Interested',
    response: `That makes sense… and I'm not asking you to decide anything right this second.\n\nCan I ask — what is it that makes you feel it's not really worth looking at for you right now?`,
  },
  {
    key: 'already_covered',
    label: 'Already Covered',
    response: `That may very well be true, and if so that's a good thing.\n\nCan I ask — has anyone actually shown you what your current coverage would leave you paying if you needed care at home for an extended period?`,
  },
]

const OBJECTION_REACTION_OPTIONS = [
  { key: 'engaged',              label: 'Engaged' },
  { key: 'neutral',              label: 'Neutral' },
  { key: 'resistant',            label: 'Resistant' },
  { key: 'opened_up_emotionally',label: 'Opened Up Emotionally' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function objectionScoreModifier(events = []) {
  return events.reduce((sum, e) => {
    const r = String(e.prospect_reaction || '')
    if (r === 'opened_up_emotionally') return sum + 15
    if (r === 'engaged') return sum + 10
    if (r === 'neutral') return sum + 5
    return sum
  }, 0)
}

function buildPlateProgress(currentPlate) {
  return NAV_PLATES.reduce((acc, plate) => {
    acc[`plate${plate.id}`] = plate.id <= currentPlate
    return acc
  }, {})
}

function minutesBetween(start, end) {
  if (!start || !end) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (Number.isNaN(s) || Number.isNaN(e)) return null
  return Math.max(0, (e - s) / 60000)
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1) }

// ─── Live Lead Score — progressive scoring per confirmed signal map ───────────
function computeLiveScore(session, objectionModifier = 0) {
  const adlCount = Object.values(session.adls || {}).filter(Boolean).length

  // Knockout conditions
  if (
    session.currentlyInNursingHome ||
    session.currentlyReceivingHomeHealth ||
    adlCount >= 2 ||
    session.memoryConditionLast12Months
  ) return { score: 0, band: 'Disqualify' }

  if (session.willingnessToAdvance === false) return { score: 0, band: 'Disqualify' }

  let s = 0

  // Plate 1
  if (session.willingnessToAdvance === true) s += 15

  // Plate 2 — Discovery
  if (session.lastHospitalization === 'within_1yr') s += 15
  if (session.lastHospitalization === '1_3yrs')     s += 8
  if (session.ambulancePast5Yrs === true)           s += 12
  if (session.currentlyReceivingHomeHelp === true)  s += 12
  if (session.carePreference === 'home')            s += 8
  if (session.carePreference === 'facility' || session.carePreference === 'unsure') s += 3

  // Plate 3 — Medications
  const medCount = (session.medications || []).length
  if (medCount >= 3) s += 12
  else if (medCount >= 1) s += 5

  // Plate 4 — Medicare info
  if (session.hasPartA && session.hasPartB) s += 8
  if (session.hasMedicaid === true)         s += 5

  // Plate 5 — Plan Review (data entered = gaps surfaced)
  if (session.ambulanceCopay)         s += 3
  if (session.homeHealthCost)         s += 3

  // Plate 6 — Value Framing
  if (session.openToProtectionOptions === true)  s += 15
  if (session.openToProtectionOptions === false) s -= 12
  if (session.financialImpactStatement)          s += 5

  // Plate 7 — Qualification
  if (session.qualified === true) s += 12
  if (adlCount === 1)             s += 5

  // Plate 9 — Option selected
  if (session.selectedOptionKey === 'c') s += 15
  if (session.selectedOptionKey === 'b') s += 10
  if (session.selectedOptionKey === 'a') s += 6

  s = Math.min(100, Math.max(0, s + objectionModifier))

  const band =
    s >= 75 ? 'High Opportunity' :
    s >= 50 ? 'Medium Opportunity' :
    s >= 25 ? 'Low Opportunity' : 'Poor Fit'

  return { score: s, band }
}

// ─── Inline Drug Reference ────────────────────────────────────────────────────
const DRUG_REFERENCE = [{"name":"Eliquis","type":"brand"},{"name":"Xarelto","type":"brand"},{"name":"Metformin","type":"generic"},{"name":"Lisinopril","type":"generic"},{"name":"Atorvastatin","type":"generic"},{"name":"Amlodipine","type":"generic"},{"name":"Insulin","type":"brand"},{"name":"Jardiance","type":"brand"},{"name":"Farxiga","type":"brand"},{"name":"Ozempic","type":"brand"},{"name":"Trulicity","type":"brand"},{"name":"Mounjaro","type":"brand"},{"name":"Rybelsus","type":"brand"},{"name":"Tresiba","type":"brand"},{"name":"Humalog","type":"brand"},{"name":"NovoLog","type":"brand"},{"name":"Lantus","type":"brand"},{"name":"Basaglar","type":"brand"},{"name":"Levemir","type":"brand"},{"name":"Toujeo","type":"brand"},{"name":"Victoza","type":"brand"},{"name":"Januvia","type":"brand"},{"name":"Entresto","type":"brand"},{"name":"Losartan","type":"generic"},{"name":"Valsartan","type":"generic"},{"name":"Hydrochlorothiazide","type":"generic"},{"name":"Furosemide","type":"generic"},{"name":"Spironolactone","type":"generic"},{"name":"Metoprolol tartrate","type":"generic"},{"name":"Metoprolol succinate","type":"generic"},{"name":"Carvedilol","type":"generic"},{"name":"Atenolol","type":"generic"},{"name":"Warfarin","type":"generic"},{"name":"Pradaxa","type":"brand"},{"name":"Apixaban","type":"generic"},{"name":"Rivaroxaban","type":"generic"},{"name":"Clopidogrel","type":"generic"},{"name":"Plavix","type":"brand"},{"name":"Aspirin","type":"generic"},{"name":"Rosuvastatin","type":"generic"},{"name":"Crestor","type":"brand"},{"name":"Simvastatin","type":"generic"},{"name":"Omeprazole","type":"generic"},{"name":"Pantoprazole","type":"generic"},{"name":"Esomeprazole","type":"generic"},{"name":"Fluoxetine","type":"generic"},{"name":"Sertraline","type":"generic"},{"name":"Escitalopram","type":"generic"},{"name":"Duloxetine","type":"generic"},{"name":"Gabapentin","type":"generic"},{"name":"Pregabalin","type":"generic"},{"name":"Levothyroxine","type":"generic"},{"name":"Albuterol","type":"generic"},{"name":"Montelukast","type":"generic"},{"name":"Celecoxib","type":"generic"},{"name":"Meloxicam","type":"generic"},{"name":"Tramadol","type":"generic"},{"name":"Acetaminophen","type":"generic"},{"name":"Ibuprofen","type":"generic"},{"name":"Donepezil","type":"generic"},{"name":"Memantine","type":"generic"},{"name":"Carbidopa/levodopa","type":"generic"},{"name":"Hydroxychloroquine","type":"generic"},{"name":"Methotrexate","type":"generic"},{"name":"Humira","type":"brand"},{"name":"Enbrel","type":"brand"},{"name":"Dupixent","type":"brand"},{"name":"Keytruda","type":"brand"},{"name":"Wegovy","type":"brand"},{"name":"Zepbound","type":"brand"},{"name":"Paxlovid","type":"brand"},{"name":"Glipizide","type":"generic"},{"name":"Glyburide","type":"generic"},{"name":"Glimepiride","type":"generic"},{"name":"Pioglitazone","type":"generic"},{"name":"Sitagliptin","type":"generic"},{"name":"Empagliflozin","type":"generic"},{"name":"Dapagliflozin","type":"generic"},{"name":"Semaglutide","type":"generic"},{"name":"Dulaglutide","type":"generic"},{"name":"Tirzepatide","type":"generic"}]

function searchDrugReference(query) {
  const q = (query || '').trim().toLowerCase()
  if (q.length < 2) return []
  return DRUG_REFERENCE
    .filter((item) => item.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.name.toLowerCase().indexOf(q)
      const bi = b.name.toLowerCase().indexOf(q)
      if (ai !== bi) return ai - bi
      return a.name.localeCompare(b.name)
    })
    .slice(0, 12)
}

// ─── Empty Session ────────────────────────────────────────────────────────────
const emptySession = {
  // Plate 1
  willingnessToAdvance: null,
  // Plate 2 — Discovery
  healthConditions: '',
  lastHospitalization: '',
  ambulancePast5Yrs: null,
  currentlyReceivingHomeHelp: null,
  carePreference: '',
  discoveryNotes: '',
  // Plate 3 — Medications
  medications: [],
  // Plate 4 — Medicare Information
  hasPartA: false,
  hasPartB: false,
  hasMedicaid: false,
  // Plate 5 — Plan Review
  ambulanceCopay: '',
  homeHealthCost: '',
  inpatientDays1XCopay: '',
  inpatientDaysXPlusCopay: '',
  planReviewNotes: '',
  // Plate 6 — Value Framing
  financialImpactStatement: '',
  homeCareBurdenConfirmed: '',
  openToProtectionOptions: null,
  // Plate 7 — Qualification
  currentlyInNursingHome: false,
  currentlyReceivingHomeHealth: false,
  memoryConditionLast12Months: false,
  qualified: false,
  adls: { bathing: false, dressing: false, toileting: false, transferring: false, continence: false, feeding: false },
  // Plate 9 — Recommendation & Close
  enteredPremiums: { c: '', b: '', a: '' },
  selectedOptionKey: '',
  // Plate 10
  notes: '',
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HomeHealthSalesPlates({ leadData, onClose, onDispositionSave, initialPlate, handoffPayload }) {
  const [currentPlate, setCurrentPlate]           = useState(initialPlate || 1)
  const [timer, setTimer]                         = useState(0)
  const [isCallActive, setIsCallActive]           = useState(true)
  const [showNotes, setShowNotes]                 = useState(false)
  const [showNavigation, setShowNavigation]       = useState(false)
  const [showDispositionModal, setShowDispositionModal] = useState(false)
  const [showObjectionWidget, setShowObjectionWidget]   = useState(false)
  const [drugSearch, setDrugSearch]               = useState('')
  const [drugSuggestions, setDrugSuggestions]     = useState([])
  const [objectionEvents, setObjectionEvents]     = useState([])
  const [selectedObjectionKey, setSelectedObjectionKey] = useState('')
  const [selectedReactionKey, setSelectedReactionKey]   = useState('')
  const [loggingObjection, setLoggingObjection]   = useState(false)
  const [sessionId, setSessionId]                 = useState(null)
  const [callStartedAt]                           = useState(new Date().toISOString())
  const [session, setSession]                     = useState(emptySession)

  const leadId      = leadData?.id || leadData?.lead_id
  const customerName = leadData?.full_name || 'Customer'

  // ── Session init ────────────────────────────────────────────────────────────
  useEffect(() => {
    const initSession = async () => {
      let activeSessionId = null
      const { data: existing } = await supabase
        .from('hh_plate_sessions').select('*').eq('lead_id', leadId)
        .order('updated_at', { ascending: false }).limit(1)

      if (existing && existing.length > 0) {
        const s = existing[0]
        setSessionId(s.id)
        activeSessionId = s.id
        setCurrentPlate(initialPlate ? Math.min(initialPlate, NAV_PLATES.length) : Math.min(s.current_plate || 1, NAV_PLATES.length))
        setSession({
          ...emptySession,
          willingnessToAdvance: s.willing_to_advance,
          healthConditions: s.health_conditions || '',
          lastHospitalization: s.last_hospitalization || '',
          ambulancePast5Yrs: s.ambulance_past_5_yrs ?? null,
          currentlyReceivingHomeHelp: s.currently_receiving_home_help_discovery ?? null,
          carePreference: s.care_preference || '',
          discoveryNotes: s.discovery_notes || '',
          hasPartA: s.has_part_a ?? false,
          hasPartB: s.has_part_b ?? false,
          hasMedicaid: s.has_medicaid ?? false,
          ambulanceCopay: s.ambulance_copay || '',
          homeHealthCost: s.home_health_cost || '',
          inpatientDays1XCopay: s.inpatient_days_1x_copay || '',
          inpatientDaysXPlusCopay: s.inpatient_days_xplus_copay || '',
          planReviewNotes: s.plan_review_notes || '',
          financialImpactStatement: s.financial_impact_statement || '',
          homeCareBurdenConfirmed: s.home_care_cost_tolerance || '',
          openToProtectionOptions: s.open_to_protection_options ?? null,
          currentlyInNursingHome: s.currently_in_nursing_home ?? false,
          currentlyReceivingHomeHealth: s.currently_receiving_home_health ?? false,
          memoryConditionLast12Months: s.memory_condition_last_12_months ?? false,
          qualified: s.qualified ?? false,
          adls: {
            bathing: s.adl_bathing ?? false, dressing: s.adl_dressing ?? false,
            toileting: s.adl_toileting ?? false, transferring: s.adl_transferring ?? false,
            continence: s.adl_continence ?? false, feeding: s.adl_feeding ?? false,
          },
          enteredPremiums: {
            c: s.entered_option_c_premium ? String(s.entered_option_c_premium) : '',
            b: s.entered_option_b_premium ? String(s.entered_option_b_premium) : '',
            a: s.entered_option_a_premium ? String(s.entered_option_a_premium) : '',
          },
          selectedOptionKey: s.selected_option_key || '',
          notes: s.notes || '',
        })
      } else {
        const { data: created, error } = await supabase
          .from('hh_plate_sessions')
          .insert({ lead_id: leadId, current_plate: 1, call_started_at: callStartedAt, plate_progress: {} })
          .select().single()
        if (error) { console.error('Error creating session:', error); return }
        setSessionId(created.id)
        activeSessionId = created.id
      }

      if (activeSessionId) {
        // Pre-populate session row from handoff payload when present
        if (handoffPayload) {
          await supabase.from('hh_plate_sessions').update({
            willing_to_advance: handoffPayload.willingnessToAdvance ?? handoffPayload.willing_to_advance ?? null,
            ambulance_past_5_yrs: handoffPayload.ambulance_past_5_yrs ?? null,
            currently_receiving_home_help_discovery: handoffPayload.currently_receiving_home_help ?? null,
            last_hospitalization: handoffPayload.last_hospitalization || null,
            has_part_a: handoffPayload.has_part_a ?? false,
            handoff_source: 'zenyra-main',
            handoff_id: handoffPayload.handoff_id,
          }).eq('id', activeSessionId)
        }

        const { data: drugs } = await supabase.from('hh_session_drugs').select('*').eq('session_id', activeSessionId)

        // Insert handoff medications only when none exist for this session yet
        let handoffMeds = []
        if (handoffPayload?.medications?.length > 0 && !(drugs?.length > 0)) {
          const drugInserts = handoffPayload.medications.map((m) => ({
            session_id: activeSessionId,
            drug_name: m.name,
            drug_type: m.type,
            reimbursement_value: m.type === 'brand' ? 25 : 10,
          }))
          const { data: insertedDrugs } = await supabase.from('hh_session_drugs').insert(drugInserts).select()
          handoffMeds = (insertedDrugs || []).length > 0
            ? insertedDrugs.map((d) => ({ name: d.drug_name, type: d.drug_type }))
            : handoffPayload.medications.map((m) => ({ name: m.name, type: m.type }))
        }

        if (drugs?.length > 0) {
          setSession((prev) => ({ ...prev, medications: drugs.map((d) => ({ name: d.drug_name, type: d.drug_type })) }))
        } else if (handoffMeds.length > 0) {
          setSession((prev) => ({ ...prev, medications: handoffMeds }))
        }

        // Apply handoff session field overrides on top of restored state
        if (handoffPayload) {
          setSession((prev) => ({
            ...prev,
            willingnessToAdvance: handoffPayload.willingnessToAdvance ?? handoffPayload.willing_to_advance ?? prev.willingnessToAdvance,
            ambulancePast5Yrs: handoffPayload.ambulance_past_5_yrs ?? prev.ambulancePast5Yrs,
            currentlyReceivingHomeHelp: handoffPayload.currently_receiving_home_help ?? prev.currentlyReceivingHomeHelp,
            lastHospitalization: handoffPayload.last_hospitalization || prev.lastHospitalization,
            hasPartA: handoffPayload.has_part_a ?? prev.hasPartA,
          }))
        }

        const { data: events, error: objErr } = await supabase
          .from('hh_objection_events').select('*').eq('session_id', activeSessionId).order('created_at', { ascending: false })
        if (!objErr && Array.isArray(events)) setObjectionEvents(events)
        else if (objErr) console.warn('hh_objection_events unavailable:', objErr.message)
      }
    }
    if (leadId) initSession()
  }, [leadId, callStartedAt])

  // ── Timer ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = isCallActive ? setInterval(() => setTimer((t) => t + 1), 1000) : null
    return () => interval && clearInterval(interval)
  }, [isCallActive])

  // ── Drug search ─────────────────────────────────────────────────────────────
  useEffect(() => { setDrugSuggestions(searchDrugReference(drugSearch)) }, [drugSearch])

  // ── Live score ──────────────────────────────────────────────────────────────
  const objectionModifier = useMemo(() => objectionScoreModifier(objectionEvents), [objectionEvents])
  const liveScore = useMemo(() => computeLiveScore(session, objectionModifier), [session, objectionModifier])

  // Legacy score for disposition writes
  const score = useMemo(() => scoreHomeHealthSession(session), [session])

  // ── Save to Supabase ────────────────────────────────────────────────────────
  const saveSessionToSupabase = async (sessionData, plate) => {
    if (!sessionId) return
    const adlCount = Object.values(sessionData.adls).filter(Boolean).length
    await supabase.from('hh_plate_sessions').update({
      current_plate: plate,
      willing_to_advance: sessionData.willingnessToAdvance,
      health_conditions: sessionData.healthConditions,
      last_hospitalization: sessionData.lastHospitalization,
      ambulance_past_5_yrs: sessionData.ambulancePast5Yrs,
      currently_receiving_home_help_discovery: sessionData.currentlyReceivingHomeHelp,
      care_preference: sessionData.carePreference,
      discovery_notes: sessionData.discoveryNotes,
      has_part_a: sessionData.hasPartA,
      has_part_b: sessionData.hasPartB,
      has_medicaid: sessionData.hasMedicaid,
      ambulance_copay: sessionData.ambulanceCopay,
      home_health_cost: sessionData.homeHealthCost,
      inpatient_days_1x_copay: sessionData.inpatientDays1XCopay,
      inpatient_days_xplus_copay: sessionData.inpatientDaysXPlusCopay,
      plan_review_notes: sessionData.planReviewNotes,
      financial_impact_statement: sessionData.financialImpactStatement,
      home_care_cost_tolerance: sessionData.homeCareBurdenConfirmed,
      open_to_protection_options: sessionData.openToProtectionOptions,
      currently_in_nursing_home: sessionData.currentlyInNursingHome,
      currently_receiving_home_health: sessionData.currentlyReceivingHomeHealth,
      memory_condition_last_12_months: sessionData.memoryConditionLast12Months,
      qualified: sessionData.qualified,
      adl_bathing: sessionData.adls.bathing, adl_dressing: sessionData.adls.dressing,
      adl_toileting: sessionData.adls.toileting, adl_transferring: sessionData.adls.transferring,
      adl_continence: sessionData.adls.continence, adl_feeding: sessionData.adls.feeding,
      adl_count: adlCount,
      entered_option_c_premium: Number(sessionData.enteredPremiums.c) || 0,
      entered_option_b_premium: Number(sessionData.enteredPremiums.b) || 0,
      entered_option_a_premium: Number(sessionData.enteredPremiums.a) || 0,
      selected_option_key: sessionData.selectedOptionKey || null,
      notes: sessionData.notes,
      score_total: liveScore.score,
      score_band: liveScore.band,
    }).eq('id', sessionId)
  }

  // ── Option calculations — A/B/C all retained ────────────────────────────────
  // Option C cap: $900/yr  |  Option B cap: $600/yr  |  Option A cap: $300/yr
  // All reimbursement display values (monthly, quarterly, annual, effective cost)
  // derive from the capped annual value so nothing ever exceeds the plan cap.
  const optionResults = useMemo(() => {
    const DRUG_VALUES = { brand: 25, generic: 10 }
    const OPTION_META = {
      c: { code: 'c', label: 'Option C', benefitAmount: 150000, reimbursementCap: 900 },
      b: { code: 'b', label: 'Option B', benefitAmount: 100000, reimbursementCap: 600 },
      a: { code: 'a', label: 'Option A', benefitAmount: 50000,  reimbursementCap: 300 },
    }
    const rawMonthlyDrug = session.medications.reduce((s, d) => s + (DRUG_VALUES[d.type] || 0), 0)
    return ['c', 'b', 'a'].map((key) => {
      const opt = OPTION_META[key]
      const entered = Number(session.enteredPremiums[key] || 0)
      const annual = entered * 12
      // Hard-floor annual reimbursement at cap — never exceeds opt.reimbursementCap
      const annualReimb = Math.min(rawMonthlyDrug * 12, opt.reimbursementCap)
      // Derive monthly and quarterly from capped annual so all figures stay consistent
      const cappedMonthlyReimb = annualReimb / 12
      const qtr = annualReimb / 4
      return {
        ...opt,
        enteredMonthlyPremium: entered,
        annualPremiumCost: annual,
        monthlyDrugReimbursement: cappedMonthlyReimb,
        quarterlyReimbursement: qtr,
        annualReimbursementValue: annualReimb,
        effectiveMonthlyCost: entered - cappedMonthlyReimb,
        effectiveAnnualCost: annual - annualReimb,
      }
    })
  }, [session.medications, session.enteredPremiums])

  const update       = (patch) => setSession((prev) => ({ ...prev, ...patch }))
  const updatePremium = (key, val) => setSession((prev) => ({ ...prev, enteredPremiums: { ...prev.enteredPremiums, [key]: val } }))
  const toggleAdl    = (key, val) => setSession((prev) => ({ ...prev, adls: { ...prev.adls, [key]: val } }))
  const adlCount     = Object.values(session.adls).filter(Boolean).length
  const selObj       = OBJECTION_OPTIONS.find((o) => o.key === selectedObjectionKey) || null

  const addDrug = async (drug) => {
    if (session.medications.some((m) => m.name === drug.name)) return
    if (sessionId) {
      await supabase.from('hh_session_drugs').insert({ session_id: sessionId, drug_name: drug.name, drug_type: drug.type, reimbursement_value: drug.type === 'brand' ? 25 : 10 })
    }
    setSession((prev) => ({ ...prev, medications: [...prev.medications, drug] }))
    setDrugSearch(''); setDrugSuggestions([])
  }

  const removeDrug = async (name) => {
    if (sessionId) await supabase.from('hh_session_drugs').delete().eq('session_id', sessionId).eq('drug_name', name)
    setSession((prev) => ({ ...prev, medications: prev.medications.filter((m) => m.name !== name) }))
  }

  const handleLogObjection = async () => {
    if (!sessionId || !selObj || !selectedReactionKey || loggingObjection) return
    setLoggingObjection(true)
    const payload = { session_id: sessionId, lead_id: leadId, plate_number: currentPlate, objection_type: selObj.key, objection_label: selObj.label, response_used: selObj.response, prospect_reaction: selectedReactionKey, created_at: new Date().toISOString() }
    const { data, error } = await supabase.from('hh_objection_events').insert(payload).select().single()
    if (error) { console.error('Error logging objection:', error); setLoggingObjection(false); return }
    setObjectionEvents((prev) => [data || payload, ...prev])
    setSelectedReactionKey('')
    setLoggingObjection(false)
  }

  const handleSaveAndNext = async () => {
    const next = Math.min(currentPlate + 1, NAV_PLATES.length)
    await saveSessionToSupabase(session, next)
    setCurrentPlate(next)
  }

  const handleDispositionSave = async (payload) => {
    const endedAt = new Date().toISOString()
    const qualifiedValue = session.qualified === true ? true : score.qualified === false ? false : null
    const durationMins = Number((timer / 60).toFixed(1))
    const timeToDisp = Number((minutesBetween(callStartedAt, endedAt) || 0).toFixed(1))
    const progress = buildPlateProgress(currentPlate)

    if (sessionId) {
      await supabase.from('hh_plate_sessions').update({ call_ended_at: endedAt, disposition_logged_at: endedAt, call_duration_minutes: durationMins, time_to_disposition_minutes: timeToDisp, score_total: liveScore.score, score_band: liveScore.band, qualified: qualifiedValue, disqualification_reason: score.disqualificationReason || '', selected_option_key: session.selectedOptionKey || null }).eq('id', sessionId)
      await supabase.from('hh_calls').insert({ lead_id: leadId, session_id: sessionId, lead_name_snapshot: customerName, state_snapshot: leadData?.state || '', score_total: liveScore.score, score_band: liveScore.band, qualified: qualifiedValue, disqualification_reason: score.disqualificationReason || '', plate_progress: progress, call_started_at: callStartedAt, call_ended_at: endedAt, disposition_logged_at: endedAt, call_duration_minutes: durationMins, time_to_disposition_minutes: timeToDisp, outcome: payload.outcome, notes: session.notes || payload.notes || '' })
      await supabase.from('hh_dispositions').insert({ lead_id: leadId, session_id: sessionId, outcome: payload.outcome, lead_name_snapshot: customerName, state_snapshot: leadData?.state || '', score_total: liveScore.score, score_band: liveScore.band, qualified: qualifiedValue, disqualification_reason: score.disqualificationReason || '', call_started_at: callStartedAt, call_ended_at: endedAt, disposition_logged_at: endedAt, call_duration_minutes: durationMins, time_to_disposition_minutes: timeToDisp, notes: session.notes || payload.notes || '' })
      await supabase.from('hh_leads').update({ status: payload.outcome, latest_score_total: liveScore.score, latest_score_band: liveScore.band, latest_qualified: qualifiedValue, latest_disqualification_reason: score.disqualificationReason || '', updated_at: endedAt }).eq('id', leadId)
    }

    onDispositionSave?.({ ...payload, score: liveScore.score, scoreBand: liveScore.band, qualified: qualifiedValue, disqualificationReason: score.disqualificationReason || '', notes: session.notes || payload.notes })
    setIsCallActive(false)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={shell}>

      {/* ── Top Nav Bar — Lead Score immediately right of Call Timer ─────── */}
      <div style={topbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onClose} style={iconBtn}><ArrowLeft size={18} /> Exit</button>
          <span style={pill}>{customerName}</span>
          <span style={pill}>Call Time: {formatTime(timer)}</span>
          <span style={scorePill(liveScore.band)}>
            Score: {liveScore.score} · {liveScore.band}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowNavigation((s) => !s)} style={iconBtn}><Menu size={18} /> Plates</button>
          <button onClick={() => setShowObjectionWidget((s) => !s)} style={iconBtn}><MessageSquare size={18} /> Objections</button>
          <button onClick={() => setShowNotes((s) => !s)} style={iconBtn}><FileText size={18} /> Notes</button>
          <button onClick={() => setShowDispositionModal(true)} style={dangerBtn}><Phone size={16} /> End &amp; Log</button>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>
      </div>

      {/* ── Plate Header ───────────────────────────────────────────────────── */}
      <div style={plateHeader}>
        <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
          Plate {currentPlate} of {NAV_PLATES.length}
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 24 }}>
          {NAV_PLATES.find((p) => p.id === currentPlate)?.name}
        </h1>
      </div>

      {/* ── Plate Content ──────────────────────────────────────────────────── */}
      <div style={content}>

        {/* PLATE 1 — Opening & Verification */}
        {currentPlate === 1 && (
          <div>
            <ScriptBlock>"Hey {customerName}, this is [Agent Name] calling. Before we get started, I'm going to verify your information real quick — can you confirm your Social Security number and your Medicare ID for me?"</ScriptBlock>
            <div style={advisoryRow}>
              <AdvisoryField label="SSN" placeholder="••• – •• – ••••" note="Masked · Advisory only · No entry required" />
              <AdvisoryField label="Medicare ID (MBI)" placeholder="•••• – •••• – ••••" note="Masked · Advisory only · No entry required" />
            </div>
            <ScriptBlock>"Perfect. I'm going to go over your benefits with you today — just want to make sure you understand what your plan covers and where any gaps might be. That work for you?"</ScriptBlock>
            <InternalNote>If prospect asks why SSN/MBI is needed: "Just standard verification — making sure I'm looking at the right account for you." Do not elaborate. If they refuse → Unwilling to advance.</InternalNote>
            <ChoiceRow>
              <ToggleButton active={session.willingnessToAdvance === true}  onClick={() => update({ willingnessToAdvance: true  })}>Willing to advance</ToggleButton>
              <ToggleButton active={session.willingnessToAdvance === false} onClick={() => update({ willingnessToAdvance: false })}>Unwilling to advance</ToggleButton>
            </ChoiceRow>
          </div>
        )}

        {/* PLATE 2 — Discovery */}
        {currentPlate === 2 && (
          <div>
            <ScriptBlock>"So before I pull up your plan details, I want to get a quick picture of your health situation — some benefits may be unlocked depending on what you've got going on."</ScriptBlock>
            <Field label="Health Conditions">
              <textarea value={session.healthConditions} onChange={(e) => update({ healthConditions: e.target.value })} style={textarea} placeholder="What current conditions do you have that require medication?" />
            </Field>
            <Field label="Last Hospitalization — &quot;When was the last time you were admitted to a hospital?&quot;">
              <div style={choiceGrid4}>
                {[{ key: 'within_1yr', label: 'Within 1 year' }, { key: '1_3yrs', label: '1–3 years ago' }, { key: '3_5yrs', label: '3–5 years ago' }, { key: '5plus', label: '5+ years / Never' }].map((opt) => (
                  <ToggleButton key={opt.key} active={session.lastHospitalization === opt.key} onClick={() => update({ lastHospitalization: opt.key })}>{opt.label}</ToggleButton>
                ))}
              </div>
            </Field>
            <Field label="Ambulance use in the past 5 years? — &quot;Have you needed an ambulance in the past five years?&quot;">
              <ChoiceRow>
                <ToggleButton active={session.ambulancePast5Yrs === true}  onClick={() => update({ ambulancePast5Yrs: true  })}>Yes</ToggleButton>
                <ToggleButton active={session.ambulancePast5Yrs === false} onClick={() => update({ ambulancePast5Yrs: false })}>No</ToggleButton>
              </ChoiceRow>
            </Field>
            <Field label="Currently receiving help at home? — &quot;Do you currently have anyone helping you at home from time to time?&quot;">
              <ChoiceRow>
                <ToggleButton active={session.currentlyReceivingHomeHelp === true}  onClick={() => update({ currentlyReceivingHomeHelp: true  })}>Yes</ToggleButton>
                <ToggleButton active={session.currentlyReceivingHomeHelp === false} onClick={() => update({ currentlyReceivingHomeHelp: false })}>No</ToggleButton>
              </ChoiceRow>
            </Field>
            <Field label="Care preference — &quot;If your doctor said you needed extra care after a hospital stay — home or facility?&quot;">
              <div style={choiceGrid3}>
                <ToggleButton active={session.carePreference === 'home'}     onClick={() => update({ carePreference: 'home'     })}>Home</ToggleButton>
                <ToggleButton active={session.carePreference === 'facility'} onClick={() => update({ carePreference: 'facility' })}>Facility</ToggleButton>
                <ToggleButton active={session.carePreference === 'unsure'}   onClick={() => update({ carePreference: 'unsure'   })}>Unsure</ToggleButton>
              </div>
            </Field>
            <Field label="Notes">
              <textarea value={session.discoveryNotes} onChange={(e) => update({ discoveryNotes: e.target.value })} style={textarea} placeholder="Additional discovery notes" />
            </Field>
            <InternalNote>Log answers as given. Home preference + hospitalization recency are primary lead score inputs. Do not re-ask on Qualification plate.</InternalNote>
          </div>
        )}

        {/* PLATE 3 — Medication Capture */}
        {currentPlate === 3 && (
          <div>
            <ScriptBlock>"Let me just confirm your medications — go ahead and list them for me."</ScriptBlock>
            <InternalNote>Enter each via Drug Search as prospect speaks. Accuracy here directly affects the rebate calculation shown in options.</InternalNote>
            <Field label="Drug Search">
              <div style={{ position: 'relative' }}>
                <input value={drugSearch} onChange={(e) => setDrugSearch(e.target.value)} style={input} placeholder="Type drug name" />
                {drugSearch.length >= 2 && drugSuggestions.length > 0 && (
                  <div style={suggestionsBox}>
                    {drugSuggestions.map((drug) => (
                      <button key={drug.name} onClick={() => addDrug(drug)} style={suggestionBtn}>
                        <span>{drug.name}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{drug.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Selected Drugs">
              {session.medications.length === 0
                ? <div style={{ color: '#6b7280' }}>No drugs added yet.</div>
                : session.medications.map((drug) => (
                  <div key={drug.name} style={chipRow}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{drug.name}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{drug.type} · ${drug.type === 'brand' ? 25 : 10}/mo rebate</span>
                    </div>
                    <button onClick={() => removeDrug(drug.name)} style={chipRemove}>Remove</button>
                  </div>
                ))
              }
            </Field>
            {session.medications.length > 0 && (
              <div style={reimburseSummary}>
                Monthly drug rebate value: <strong>${session.medications.reduce((s, d) => s + (d.type === 'brand' ? 25 : 10), 0)}/mo</strong>
              </div>
            )}
          </div>
        )}

        {/* PLATE 4 — Plan Review */}
        {currentPlate === 4 && (
          <div>
            <ScriptBlock>"Ok {customerName}, on the surface, this looks like a really good plan for you. I am beginning to see why you went with this plan."</ScriptBlock>
            <ScriptBlock>"We don't need to change this plan at all."</ScriptBlock>
            <InternalNote>Open UNL and begin filling in info for the quote while reviewing the plan. Call out the positives — for example: $0 PCP CoPay, Low or No Medical/Drug Deductible, Dental/Vision/Hearing coverage, Part B Giveback.</InternalNote>
            <Field label="Call out the positives (notes)">
              <textarea value={session.planReviewNotes} onChange={(e) => update({ planReviewNotes: e.target.value })} style={textarea} placeholder="e.g. $0 PCP copay, $0 drug deductible, DVH included, $X Part B giveback" />
            </Field>
            <ScriptBlock>"So {customerName}, are you happy with this plan? Any complaints at all?"</ScriptBlock>
            <ScriptBlock>"I am glad to hear that you are happy with your plan. Now let's check out your hospital coverage."</ScriptBlock>
            <Field label="Ambulance Copay">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>$</span>
                <input value={session.ambulanceCopay} onChange={(e) => update({ ambulanceCopay: e.target.value })} style={{ ...input, maxWidth: 200 }} type="number" placeholder="0.00" />
              </div>
            </Field>
            <Field label="Home Health Cost / Structure">
              <textarea value={session.homeHealthCost} onChange={(e) => update({ homeHealthCost: e.target.value })} style={textarea} placeholder="Describe current plan home health coverage structure / amount" />
            </Field>
            <Field label="Inpatient Hospital — Days 1 through X copay">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>$</span>
                <input value={session.inpatientDays1XCopay} onChange={(e) => update({ inpatientDays1XCopay: e.target.value })} style={{ ...input, maxWidth: 200 }} type="number" placeholder="0.00" />
                <span style={{ color: '#6b7280', fontSize: 13 }}>per day</span>
              </div>
            </Field>
            <Field label="Inpatient Hospital — Day X+ copay">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>$</span>
                <input value={session.inpatientDaysXPlusCopay} onChange={(e) => update({ inpatientDaysXPlusCopay: e.target.value })} style={{ ...input, maxWidth: 200 }} type="number" placeholder="0.00" />
                <span style={{ color: '#6b7280', fontSize: 13 }}>per day</span>
              </div>
            </Field>
            <div style={gapCallout}>"The gap I'm seeing is that there's no extended protection in place for what happens after those initial days — and that's where costs start to add up fast."</div>
          </div>
        )}

        {/* PLATE 5 — Problem Reveal */}
        {currentPlate === 5 && (
          <div>
            <ScriptBlock>"Ok {customerName}, we have a bit of a problem. Unfortunately it looks like your agent didn't complete the hospital coverage. It is not your fault — I am starting to see this more and more."</ScriptBlock>
            <ScriptBlock>"The way that most Medicare Advantage plans work is that they don't pay if you go to the hospital until you have been there for about 7 days. So what this means for you is if you would have gone to the hospital with your plan, you would be responsible for about $2,000 to $3,000 dollars just in the first week of your stay. That would have been a bill that you should have never had to pay."</ScriptBlock>
            <ScriptBlock>"{customerName}, I am going to take a minute to briefly explain how the different parts of Medicare work so that you get the full picture of what's going on here."</ScriptBlock>
            <div style={medicarePartsRow}>
              {[
                { key: 'A', label: 'Part A', desc: 'How you get that red, white, and blue Medicare card. Foundation of Medicare.' },
                { key: 'B', label: 'Part B', desc: "Has a premium taken out of your Social Security benefit before you receive your monthly deposit. Most people don't know they are paying for it. If you are not on Medicaid, the premium this year is $202.90/mo." },
                { key: 'C', label: 'Part C', desc: 'Medicare Advantage — covers your doctors, dental, vision, and hearing coverage.' },
                { key: 'D', label: 'Part D', desc: 'Prescription drug coverage.' },
              ].map((part) => (
                <div key={part.key} style={medicarePartCard(true)}>
                  <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: '#1e3a5f' }}>{part.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6, lineHeight: 1.4 }}>{part.desc}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>✓ You have this</div>
                </div>
              ))}
            </div>
            <ScriptBlock>"Now having Medicare Part A, B, C, and D is very good — however it is incomplete if you want to avoid unnecessary expensive hospital costs. Does that make sense?"</ScriptBlock>
            <Field label="Financial Concern Capture">
              <textarea value={session.financialImpactStatement} onChange={(e) => update({ financialImpactStatement: e.target.value })} style={textarea} placeholder="Capture their financial concern / reaction" />
            </Field>
            <Field label="Home Care Cost Burden">
              <textarea value={session.homeCareBurdenConfirmed} onChange={(e) => update({ homeCareBurdenConfirmed: e.target.value })} style={textarea} placeholder="Capture how burdensome the out-of-pocket cost would be for them" />
            </Field>
            <ScriptBlock>"Would it make sense to at least look at what options might help protect you from that?"</ScriptBlock>
            <ChoiceRow>
              <ToggleButton active={session.openToProtectionOptions === true}  onClick={() => update({ openToProtectionOptions: true  })}>Yes</ToggleButton>
              <ToggleButton active={session.openToProtectionOptions === false} onClick={() => update({ openToProtectionOptions: false })}>No</ToggleButton>
            </ChoiceRow>
          </div>
        )}

        {/* PLATE 6 — Qualification */}
        {currentPlate === 6 && (
          <div>
            <ScriptBlock>"I just need to run through a few quick questions to confirm you qualify for this benefit."</ScriptBlock>
            <InternalNote>Cross-reference Discovery responses where applicable — do not re-ask questions already answered on Plate 2.</InternalNote>
            <ChecklistRow label="Currently in nursing home"                               checked={session.currentlyInNursingHome}        onChange={(v) => update({ currentlyInNursingHome: v })} />
            <ChecklistRow label="Currently receiving home health care"                    checked={session.currentlyReceivingHomeHealth}   onChange={(v) => update({ currentlyReceivingHomeHealth: v })} />
            <ChecklistRow label="Alzheimer's, dementia, or memory loss in the last 12 months" checked={session.memoryConditionLast12Months} onChange={(v) => update({ memoryConditionLast12Months: v })} />
            <div style={{ ...infoCard, marginTop: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, color: '#1e3a5f' }}>ADLs</div>
              {Object.entries(session.adls).map(([key, value]) => (
                <ChecklistRow key={key} label={capitalize(key)} checked={value} onChange={(v) => toggleAdl(key, v)} />
              ))}
              <div style={{ marginTop: 8, color: '#4b5563', fontWeight: 600 }}>Selected ADLs: {adlCount}</div>
              {adlCount >= 2 && <AlertBox color="#dc2626">2 or more ADLs selected — treat as disqualification. Flag for supervisor before proceeding.</AlertBox>}
            </div>
            {score.disqualificationReason && <AlertBox color="#dc2626">Disqualified: {score.disqualificationReason}</AlertBox>}
            {!score.disqualificationReason && (
              <ChoiceRow>
                <ToggleButton active={session.qualified === true}  onClick={() => update({ qualified: true  })}>✓ Qualified</ToggleButton>
                <ToggleButton active={session.qualified === false} onClick={() => update({ qualified: false })}>✗ Not Qualified</ToggleButton>
              </ChoiceRow>
            )}
            {session.qualified && <ScriptBlock>"Okay — looks like you qualify. Let me show you how this works."</ScriptBlock>}
            <InternalNote>If nursing home = checked OR Alzheimer's/dementia = checked: flag for supervisor. Do not disqualify unilaterally on-call. Currently receiving home health care = active care need (positive signal).</InternalNote>
          </div>
        )}

        {/* PLATE 7 — Medicare Education */}
        {currentPlate === 7 && (
          <div>
            <ScriptBlock>"Before I show you your options, let me give you a quick picture of how Medicare is structured — because most people were never fully explained this."</ScriptBlock>
            <div style={medicarePartsRow}>
              {[
                { key: 'A', label: 'Part A', desc: 'Hospital',                                have: true  },
                { key: 'B', label: 'Part B', desc: 'Medical · $202.90/mo from Social Security', have: true  },
                { key: 'C', label: 'Part C', desc: 'Advantage · Doctors, dental, vision',     have: true  },
                { key: 'D', label: 'Part D', desc: 'Prescriptions',                           have: true  },
                { key: 'E', label: 'Part E', desc: 'Extended Care',                           have: false },
              ].map((part) => (
                <div key={part.key} style={medicarePartCard(part.have)}>
                  <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: part.have ? '#1e3a5f' : '#dc2626' }}>{part.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: part.have ? '#374151' : '#dc2626', marginBottom: 6, lineHeight: 1.4 }}>{part.desc}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: part.have ? '#059669' : '#dc2626' }}>{part.have ? '✓ You have this' : '✗ MISSING'}</div>
                </div>
              ))}
            </div>
            <div style={partECallout}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6, color: '#dc2626' }}>What's Missing: Part E — Extended Care</div>
              <div style={{ color: '#7f1d1d', lineHeight: 1.6, fontSize: 14 }}>Covers hospital copays + extends coverage into home healthcare after discharge. Without it, those costs land directly on you.</div>
            </div>
            <ScriptBlock>"Part A and B — that's your foundation. Part B has a monthly premium of $202.90 that comes out of your Social Security before you ever see it."</ScriptBlock>
            <ScriptBlock>"Part C is your Medicare Advantage — covers your doctors, specialists, and extra benefits like dental and vision. Part D covers your prescriptions."</ScriptBlock>
            <ScriptBlock>"Now you have A, B, C, and D — which is solid. But what most people don't realize is there's a Part E — what some call Extended Care — and that's what's missing from your coverage."</ScriptBlock>
            <ScriptBlock>"Part E is what pays your hospital copays and extends your coverage into home healthcare after a discharge. Without it, those costs land directly on you."</ScriptBlock>
            <InternalNote>Part E is a conceptual framework for client education — not an official Medicare government designation. No disclaimer required. Pause after "costs land directly on you" before moving to options.</InternalNote>
          </div>
        )}

        {/* PLATE 8 — Solution Reveal + Close */}
        {currentPlate === 8 && (
          <div>
            <div style={leadScoreBanner(liveScore.band)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>Lead Score</span>
                <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{liveScore.score}</span>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.2)', alignSelf: 'stretch' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{liveScore.band}</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>Agent selects the best option manually</span>
              </div>
            </div>

            <ScriptBlock>"This is why extended hospital coverage is needed. Some people refer to this as Part E. What is great about this is that your Part E is going to be way less than your Part B."</ScriptBlock>
            <ScriptBlock>"{customerName}, I am going to share with you the coverage that should have been presented to you when you first got on this plan."</ScriptBlock>
            <ScriptBlock>"{customerName}, I am going to have you write down your option so that it will be easier for you to understand. If you are able to, go ahead and grab something to write with and let me know when you are ready."</ScriptBlock>
            <InternalNote>Present ONE option only. Build the option using the premium input below. Do not reference Option 2 or multiple options.</InternalNote>

            {(() => {
              const option = optionResults[0]
              return (
                <div style={{ ...optionCard, maxWidth: 420, marginBottom: 20, borderColor: session.selectedOptionKey === option.code ? '#2563eb' : '#e5e7eb', borderWidth: session.selectedOptionKey === option.code ? 2 : 1 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#6b7280' }}>Your Option</div>
                  <div style={{ fontSize: 30, fontWeight: 700, margin: '6px 0 2px' }}>${option.benefitAmount.toLocaleString()}</div>
                  <div style={{ color: '#6b7280', marginBottom: 12, fontSize: 13 }}>Home health benefit</div>
                  <Field label="Entered Monthly Premium">
                    <input value={session.enteredPremiums[option.code]} onChange={(e) => updatePremium(option.code, e.target.value)} style={input} type="number" placeholder="$0.00" />
                  </Field>
                  <div style={{ marginTop: 'auto' }}>
                    <Metric label="Annual Premium"             value={`$${option.annualPremiumCost.toFixed(2)}`} />
                    <Metric label="Drug Reimbursement"         value={`$${option.monthlyDrugReimbursement.toFixed(2)}/mo`} />
                    <Metric label="Quarterly Reimbursement"    value={`$${option.quarterlyReimbursement.toFixed(2)}`} />
                    <Metric label="Annual Reimbursement Value" value={`$${option.annualReimbursementValue.toFixed(2)}`} />
                    <Metric label="Effective Monthly Cost"     value={`$${option.effectiveMonthlyCost.toFixed(2)}`} strong />
                    <Metric label="Effective Annual Cost"      value={`$${option.effectiveAnnualCost.toFixed(2)}`} />
                  </div>
                  <button onClick={() => update({ selectedOptionKey: option.code })} style={{ ...selectOptionBtn, background: session.selectedOptionKey === option.code ? '#1d4ed8' : '#f3f4f6', color: session.selectedOptionKey === option.code ? '#fff' : '#374151' }}>
                    {session.selectedOptionKey === option.code ? '✓ Selected' : 'Select Your Option'}
                  </button>
                </div>
              )
            })()}

            <ScriptBlock>"Both of these benefits work together — your home healthcare coverage and your hospital copay protection. The goal is to make sure that if something happens, you are fully covered and your family is not left with a bill."</ScriptBlock>
            <ScriptBlock>"{customerName}, based on everything we have gone over today — would you like to move forward and get this protection in place for you?"</ScriptBlock>
            {session.selectedOptionKey && (
              <ScriptBlock>"That's a solid choice. You can always adjust your coverage later if your needs change — I'll be here as your Medicare advisor moving forward."</ScriptBlock>
            )}
          </div>
        )}

        {/* PLATE 9 — Final Close */}
        {currentPlate === 9 && (
          <div>
            <ScriptBlock>"Let's go ahead and move forward — I'll get this processed for you."</ScriptBlock>
            <InternalNote>Lead with the assumptive forward move. Only use the timing line below if prospect shows friction — it is a hesitation handle, not the primary close opener.</InternalNote>
            <ScriptBlock>[If they hesitate] "It only takes about 5 to 10 minutes — want to knock it out right now?"</ScriptBlock>
            <ScriptBlock>"And remember — if you ever get a bill from a hospital, call me before you pay it. Billing errors happen all the time and I want to make sure you're only paying what you actually owe."</ScriptBlock>
            <div style={summaryCard}>
              <h3 style={{ marginTop: 0, marginBottom: 14 }}>Call Summary</h3>
              <SummaryRow label="Lead"            value={customerName} />
              <SummaryRow label="Drugs Added"     value={String(session.medications.length)} />
              <SummaryRow label="Selected Option" value={session.selectedOptionKey ? `Option ${session.selectedOptionKey.toUpperCase()}` : 'None'} />
              <SummaryRow label="Qualified"       value={session.qualified ? 'Yes' : 'No'} />
              <SummaryRow label="Lead Score"      value={`${liveScore.score} · ${liveScore.band}`} />
            </div>
          </div>
        )}

      </div>{/* /content */}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={footer}>
        <button onClick={() => setCurrentPlate((p) => Math.max(1, p - 1))} disabled={currentPlate === 1} style={secondaryBtn}>
          <ArrowLeft size={16} /> Back
        </button>
        <button onClick={handleSaveAndNext} disabled={currentPlate === NAV_PLATES.length} style={primaryBtn}>
          {currentPlate === 8 ? 'Proceed to Final Close' : 'Save & Next'} <ArrowRight size={16} />
        </button>
      </div>

      {/* ── Disposition Modal ──────────────────────────────────────────────── */}
      {showDispositionModal && (
        <HomeHealthDispositionModal
          lead={{ ...leadData, score: liveScore.score, scoreBand: liveScore.band, qualified: session.qualified === true ? true : score.qualified === false ? false : null, disqualificationReason: score.disqualificationReason || '' }}
          onClose={() => setShowDispositionModal(false)}
          onSave={handleDispositionSave}
        />
      )}

      {/* ── Objection FAB ──────────────────────────────────────────────────── */}
      <button onClick={() => setShowObjectionWidget((s) => !s)} style={objectionFab} title="Open objection helper">
        <MessageSquare size={18} /> Objection
      </button>

      {/* ── Objection Panel ────────────────────────────────────────────────── */}
      {showObjectionWidget && (
        <aside style={objectionPanel}>
          <div style={sideHeader}>
            <strong>Objection Helper</strong>
            <button onClick={() => setShowObjectionWidget(false)} style={iconBtn}><X size={18} /></button>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Plate {currentPlate} · Logged: {objectionEvents.length}</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Select objection</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {OBJECTION_OPTIONS.map((opt) => (
              <button key={opt.key} onClick={() => setSelectedObjectionKey(opt.key)} style={{ ...navBtn, marginBottom: 0, background: selectedObjectionKey === opt.key ? '#ede9fe' : '#fff', color: selectedObjectionKey === opt.key ? '#6d28d9' : '#111827', border: '1px solid #e5e7eb' }}>
                {opt.label}
              </button>
            ))}
          </div>
          {selObj && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 8px' }}>Suggested NEPQ response</div>
              <div style={{ ...infoCard, background: '#f8fafc', color: '#111827', borderColor: '#cbd5e1', whiteSpace: 'pre-line', fontSize: 13, lineHeight: 1.6 }}>{selObj.response}</div>
              <div style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 8px' }}>Prospect reaction</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {OBJECTION_REACTION_OPTIONS.map((opt) => (
                  <button key={opt.key} onClick={() => setSelectedReactionKey(opt.key)} style={{ ...toggleButton, padding: 10, borderColor: selectedReactionKey === opt.key ? '#2563eb' : '#d1d5db', background: selectedReactionKey === opt.key ? '#eff6ff' : '#fff' }}>{opt.label}</button>
                ))}
              </div>
              <button onClick={handleLogObjection} disabled={!selectedReactionKey || loggingObjection} style={{ ...primaryBtn, width: '100%', justifyContent: 'center', marginTop: 14, opacity: !selectedReactionKey || loggingObjection ? 0.6 : 1 }}>
                {loggingObjection ? 'Logging…' : 'Log Objection'}
              </button>
            </>
          )}
        </aside>
      )}

      {/* ── Navigation Panel ───────────────────────────────────────────────── */}
      {showNavigation && (
        <aside style={sidePanel}>
          <div style={sideHeader}>
            <strong>Navigation</strong>
            <button onClick={() => setShowNavigation(false)} style={iconBtn}><X size={18} /></button>
          </div>
          {NAV_PLATES.map((plate) => (
            <button key={plate.id} onClick={() => { setCurrentPlate(plate.id); setShowNavigation(false) }} style={{ ...navBtn, background: currentPlate === plate.id ? '#ede9fe' : '#fff', color: currentPlate === plate.id ? '#6d28d9' : '#111827' }}>
              {plate.id}. {plate.name}
            </button>
          ))}
        </aside>
      )}

      {/* ── Notes Panel ────────────────────────────────────────────────────── */}
      {showNotes && (
        <aside style={notesPanel}>
          <div style={sideHeader}>
            <strong>Notes</strong>
            <button onClick={() => setShowNotes(false)} style={iconBtn}><X size={18} /></button>
          </div>
          <textarea value={session.notes} onChange={(e) => update({ notes: e.target.value })} style={{ width: '100%', height: 'calc(100vh - 130px)', border: '1px solid #d1d5db', borderRadius: 12, padding: 12, fontSize: 14 }} />
        </aside>
      )}

    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function ScriptBlock({ children }) { return <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, marginBottom: 18, fontSize: 17, lineHeight: 1.6 }}>{children}</div> }
function InternalNote({ children }) { return <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}><strong style={{ marginRight: 4 }}>⚑ Internal:</strong>{children}</div> }
function ToggleButton({ active, onClick, children }) { return <button onClick={onClick} style={{ ...toggleButton, borderColor: active ? '#2563eb' : '#d1d5db', background: active ? '#eff6ff' : '#fff', color: active ? '#1d4ed8' : '#111827', fontWeight: active ? 700 : 400 }}>{children}</button> }
function ChoiceRow({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>{children}</div> }
function Field({ label, children }) { return <div style={{ marginBottom: 18 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>{label}</div>{children}</div> }
function ChecklistRow({ label, checked, onChange }) { return <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e5e7eb', padding: 14, borderRadius: 12, marginBottom: 10, cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label> }
function AlertBox({ color, children }) { return <div style={{ marginTop: 12, border: `1px solid ${color}`, background: '#fef2f2', color, padding: 14, borderRadius: 12, fontWeight: 600 }}>{children}</div> }
function Metric({ label, value, strong }) { return <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: '#4b5563', fontSize: 13 }}><span>{label}</span><strong style={{ color: strong ? '#111827' : '#374151' }}>{value}</strong></div> }
function SummaryRow({ label, value }) { return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}><span style={{ color: '#6b7280' }}>{label}</span><strong>{value}</strong></div> }
function AdvisoryField({ label, placeholder, note }) { return <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</div><div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 10, padding: '12px 16px', color: '#9ca3af', fontSize: 18, letterSpacing: 3, fontFamily: 'monospace' }}>{placeholder}</div><div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{note}</div></div> }

// ─── Style functions ───────────────────────────────────────────────────────────
function scorePill(band) {
  const bg = band === 'Disqualify' ? '#7f1d1d' : band === 'High Opportunity' ? '#14532d' : band === 'Medium Opportunity' ? '#78350f' : band === 'Low Opportunity' ? '#1e3a8a' : '#374151'
  return { background: bg, padding: '8px 14px', borderRadius: 10, fontWeight: 700, color: '#fff', fontSize: 13 }
}
function medicarePartCard(have) { return { flex: 1, background: have ? '#f0fdf4' : '#fef2f2', border: `2px solid ${have ? '#86efac' : '#fca5a5'}`, borderRadius: 14, padding: 14, textAlign: 'center' } }
function leadScoreBanner(band) {
  const bg = band === 'Disqualify' ? '#7f1d1d' : band === 'High Opportunity' ? '#14532d' : band === 'Medium Opportunity' ? '#78350f' : band === 'Low Opportunity' ? '#1e3a8a' : '#374151'
  return { background: bg, color: '#fff', borderRadius: 16, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const shell           = { position: 'fixed', inset: 0, background: '#fff', zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
const topbar          = { background: '#1f2937', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const plateHeader     = { padding: '16px 32px', borderBottom: '1px solid #e5e7eb' }
const content         = { flex: 1, overflowY: 'auto', padding: 32, background: '#f9fafb' }
const footer          = { borderTop: '1px solid #e5e7eb', padding: 16, display: 'flex', justifyContent: 'space-between' }
const primaryBtn      = { background: '#111827', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }
const secondaryBtn    = { background: '#f3f4f6', color: '#111827', border: 'none', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }
const dangerBtn       = { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }
const iconBtn         = { background: 'transparent', color: 'inherit', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }
const pill            = { background: '#374151', padding: '8px 12px', borderRadius: 10, fontWeight: 500, fontSize: 13 }
const sidePanel       = { position: 'fixed', top: 0, right: 0, width: 320, height: '100vh', background: '#fff', borderLeft: '1px solid #e5e7eb', padding: 16, zIndex: 120, overflowY: 'auto' }
const notesPanel      = { position: 'fixed', top: 0, right: 0, width: 380, height: '100vh', background: '#fff', borderLeft: '1px solid #e5e7eb', padding: 16, zIndex: 121 }
const objectionPanel  = { position: 'fixed', top: 0, right: 0, width: 400, maxWidth: '92vw', height: '100vh', background: '#fff', borderLeft: '1px solid #e5e7eb', padding: 16, zIndex: 122, overflowY: 'auto' }
const objectionFab    = { position: 'fixed', right: 24, bottom: 110, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, zIndex: 119, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }
const sideHeader      = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }
const navBtn          = { width: '100%', textAlign: 'left', padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer', marginBottom: 8 }
const input           = { width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: 12, background: '#fff', fontSize: 14 }
const textarea        = { width: '100%', minHeight: 90, border: '1px solid #d1d5db', borderRadius: 12, padding: 12, background: '#fff', fontSize: 14, resize: 'vertical' }
const toggleButton    = { border: '2px solid #d1d5db', borderRadius: 12, padding: 14, background: '#fff', cursor: 'pointer', width: '100%', fontSize: 14 }
const optionsGrid     = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, alignItems: 'stretch', marginBottom: 20 }
const optionCard      = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 18, minHeight: 420, display: 'flex', flexDirection: 'column', gap: 2 }
const summaryCard     = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 18, marginTop: 20 }
const chipRow         = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 8 }
const chipRemove      = { border: 'none', background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }
const infoCard        = { background: '#eef2ff', border: '1px solid #c7d2fe', color: '#312e81', padding: 18, borderRadius: 16 }
const suggestionsBox  = { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 12, marginTop: 6, overflow: 'hidden', zIndex: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }
const suggestionBtn   = { width: '100%', textAlign: 'left', padding: 12, border: 'none', background: '#fff', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const advisoryRow     = { display: 'flex', gap: 16, marginBottom: 20 }
const choiceGrid3     = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }
const choiceGrid4     = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 18 }
const reminderBanner  = { background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, padding: '10px 16px', marginBottom: 18, fontSize: 14, color: '#713f12', fontWeight: 600 }
const scriptHint      = { fontSize: 13, color: '#6b7280', fontStyle: 'italic', marginTop: 8, paddingLeft: 4 }
const gapCallout      = { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 14, padding: 18, marginBottom: 20, fontSize: 15, color: '#7f1d1d', fontWeight: 600, lineHeight: 1.6 }
const medicarePartsRow = { display: 'flex', gap: 10, marginBottom: 20 }
const partECallout    = { background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 14, padding: 18, marginBottom: 24 }
const reimburseSummary = { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 16px', marginTop: 12, fontSize: 14, color: '#14532d' }
const selectOptionBtn  = { marginTop: 14, width: '100%', border: 'none', borderRadius: 10, padding: '10px 0', cursor: 'pointer', fontWeight: 700, fontSize: 14 }

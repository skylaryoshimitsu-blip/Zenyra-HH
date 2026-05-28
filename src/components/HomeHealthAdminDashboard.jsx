import React, { useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle, Clock, MessageSquare, Phone, RotateCcw, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const SCORE_BANDS = [
  { label: 'High (75–100)', min: 75, max: 100 },
  { label: 'Medium (50–74)', min: 50, max: 74 },
  { label: 'Low (25–49)', min: 25, max: 49 },
  { label: 'Poor (0–24)', min: 0, max: 24 },
]

const TRACKED_PLATES = [
  { id: 1, name: 'Opening & Verification' },
  { id: 2, name: 'Discovery & Qualification' },
  { id: 3, name: 'Medication Count' },
  { id: 4, name: 'Plan Review' },
  { id: 5, name: 'Problem Reveal' },
  { id: 6, name: 'Medicare Education' },
  { id: 7, name: 'Product Selection' },
  { id: 8, name: 'Final Close' },
]

const DATE_PRESETS = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_7',    label: 'Last 7 Days' },
  { key: 'last_30',   label: 'Last 30 Days' },
  { key: 'custom',    label: 'Custom Range' },
]

function getPresetRange(preset) {
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  switch (preset) {
    case 'yesterday': {
      const s = new Date(today); s.setDate(s.getDate() - 1)
      const e = new Date(s); e.setHours(23, 59, 59, 999)
      return { start: s, end: e }
    }
    case 'this_week': {
      const s = new Date(today)
      const day = s.getDay()
      s.setDate(s.getDate() - (day === 0 ? 6 : day - 1))
      return { start: s, end: todayEnd }
    }
    case 'last_7': {
      const s = new Date(today); s.setDate(s.getDate() - 6)
      return { start: s, end: todayEnd }
    }
    case 'last_30': {
      const s = new Date(today); s.setDate(s.getDate() - 29)
      return { start: s, end: todayEnd }
    }
    default:
      return { start: today, end: todayEnd }
  }
}

function pct(numerator, denominator) {
  if (!denominator) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function formatDateInput(d) {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

function scoreBand(score) {
  const n = Number(score || 0)
  if (n >= 75) return 'High'
  if (n >= 50) return 'Medium'
  if (n >= 25) return 'Low'
  return 'Poor'
}

export default function HomeHealthAdminDashboard({ leads = [], setLeads, dispositions = [], setDispositions, onBack }) {
  const [activeTab, setActiveTab]           = useState('overview')
  const [calls, setCalls]                   = useState([])
  const [plateSessions, setPlateSessions]   = useState([])
  const [dispositionRows, setDispositionRows] = useState([])
  const [objectionEvents, setObjectionEvents] = useState([])
  const [leadsFromDb, setLeadsFromDb]       = useState([])
  const [loading, setLoading]               = useState(true)
  const [resetting, setResetting]           = useState(false)
  const [activePreset, setActivePreset]     = useState('today')
  const [dateRange, setDateRange]           = useState(getPresetRange('today'))
  const [customStart, setCustomStart]       = useState('')
  const [customEnd, setCustomEnd]           = useState('')

  useEffect(() => {
    fetchDashboardData(dateRange)
  }, [dateRange])

  async function fetchDashboardData({ start, end }) {
    setLoading(true)
    const startIso = start.toISOString()
    const endIso   = end.toISOString()

    const [
      { data: callsData,        error: callsError },
      { data: objectionsData,   error: objectionsError },
      { data: plateSessionsData, error: plateSessionsError },
      { data: dispositionsData,  error: dispositionsError },
      { data: leadsData,         error: leadsError },
    ] = await Promise.all([
      supabase
        .from('hh_calls')
        .select('*, hh_leads(full_name, state)')
        .gte('call_started_at', startIso)
        .lte('call_started_at', endIso)
        .order('call_started_at', { ascending: false }),
      supabase
        .from('hh_objection_events')
        .select('*')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('hh_plate_sessions')
        .select('id, current_plate, created_at')
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      supabase
        .from('hh_dispositions')
        .select('*')
        .gte('disposition_logged_at', startIso)
        .lte('disposition_logged_at', endIso)
        .order('disposition_logged_at', { ascending: false }),
      supabase
        .from('hh_leads')
        .select('lead_id, status')
        .order('created_at', { ascending: false }),
    ])

    if (callsError)         console.error('Error fetching hh_calls:', callsError.message)
    if (objectionsError)    console.warn('hh_objection_events unavailable:', objectionsError.message)
    if (plateSessionsError) console.error('Error fetching hh_plate_sessions:', plateSessionsError.message)
    if (dispositionsError)  console.error('Error fetching hh_dispositions:', dispositionsError.message)
    if (leadsError)         console.error('Error fetching hh_leads:', leadsError.message)

    setCalls(callsData || [])
    setObjectionEvents(objectionsData || [])
    setPlateSessions(plateSessionsData || [])
    setDispositionRows(dispositionsData || [])
    setLeadsFromDb(leadsData || [])
    setLoading(false)
  }

  function applyPreset(preset) {
    setActivePreset(preset)
    if (preset !== 'custom') {
      setDateRange(getPresetRange(preset))
    }
  }

  function applyCustomRange() {
    if (!customStart || !customEnd) return
    const start = new Date(customStart); start.setHours(0, 0, 0, 0)
    const end   = new Date(customEnd);   end.setHours(23, 59, 59, 999)
    setDateRange({ start, end })
  }

  const handleResetDay = async () => {
    if (!window.confirm('Reset the day? This will delete all sessions, drugs, calls, and dispositions logged today.')) return

    setResetting(true)
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const iso = todayStart.toISOString()

      await supabase.from('hh_session_drugs').delete().gte('created_at', iso)
      await supabase.from('hh_dispositions').delete().gte('disposition_logged_at', iso)
      await supabase.from('hh_calls').delete().gte('call_started_at', iso)
      await supabase.from('hh_plate_sessions').delete().gte('created_at', iso)

      const leadIds = leads.map((l) => l.id)
      if (leadIds.length) {
        await supabase.from('hh_leads').update({
          status: 'new',
          latest_qualified: null,
          score: null,
          score_band: null,
          latest_disqualification_reason: null,
          latest_primary_loss_reason: null,
          latest_primary_objection: null,
          latest_breakdown_point: null,
          latest_likely_root_cause: null,
        }).in('lead_id', leadIds)
      }

      setLeads?.((prev) => prev.map((l) => ({
        ...l,
        status: 'new',
        latest_qualified: null,
        latest_score_total: null,
        latest_score_band: null,
        latest_disqualification_reason: null,
        latest_primary_loss_reason: null,
        latest_primary_objection: null,
        latest_breakdown_point: null,
        latest_likely_root_cause: null,
      })))
      setDispositions?.([])
      setCalls([])
      setObjectionEvents([])
      setPlateSessions([])
      setDispositionRows([])
    } catch (err) {
      console.error('Reset failed:', err)
      alert('Reset encountered an error — check the console.')
    } finally {
      setResetting(false)
    }
  }

  // ── Normalize hh_calls rows ─────────────────────────────────────────────────
  const callRows = useMemo(() => calls.map((call) => ({
    ...call,
    callId: call.id,
    callStartedAt: call.call_started_at,
    callEndedAt: call.call_ended_at,
    leadName: call.lead_name_snapshot || call.hh_leads?.full_name || leads.find((l) => String(l.id) === String(call.lead_id))?.full_name || 'Unknown Lead',
    state: call.state_snapshot || call.hh_leads?.state || leads.find((l) => String(l.id) === String(call.lead_id))?.state || '—',
    score: Number(call.score_total || 0),
    scoreBand: call.score_band || scoreBand(call.score_total || 0),
    duration: Number(call.call_duration_minutes || 0),
    timeToDisposition: Number(call.time_to_disposition_minutes || 0),
    outcome: call.outcome || '—',
    qualified: call.qualified,
    disqualificationReason: call.disqualification_reason || '',
    primaryLossReason: call.primary_loss_reason || '',
    primaryObjection: call.primary_objection || '',
    breakdownPoint: call.breakdown_point || '',
    likelyRootCause: call.likely_root_cause || '',
    selectedProduct: call.selected_product || '',
    hiCarrierName: call.hi_carrier_name || '',
    hiMonthlyPremium: call.hi_monthly_premium || null,
    hhCarrierName: call.hh_carrier_name || '',
    hhMonthlyPremium: call.hh_monthly_premium || null,
    notes: call.notes || '',
    plateProgress: call.plate_progress || {},
  })), [calls, leads])

  // ── Overview stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    totalCalls:       callRows.length,
    soldCount:        callRows.filter((r) => String(r.outcome).toLowerCase() === 'sold').length,
    callbacksPending: callRows.filter((r) => String(r.outcome).toLowerCase() === 'callback_requested').length,
    objectionEvents:  objectionEvents.length,
  }), [callRows, objectionEvents])

  // ── Lead pipeline (from leads prop — all-time intentional) ──────────────────
  const pipeline = useMemo(() => {
    const counts = { new: 0, contacted: 0, in_progress: 0, sold: 0 }
    leadsFromDb.forEach((lead) => {
      const key = lead.status === 'sold' ? 'sold' : lead.status === 'contacted' ? 'contacted' : lead.status === 'in_progress' ? 'in_progress' : 'new'
      counts[key] += 1
    })
    return counts
  }, [leadsFromDb])

  // ── Score / conversion analytics (from hh_calls in date range) ─────────────
  const analytics = useMemo(() => {
    const total = callRows.length
    const avgScore = total ? Math.round(callRows.reduce((sum, r) => sum + r.score, 0) / total) : 0
    const high   = callRows.filter((r) => r.score >= 75).length
    const medium = callRows.filter((r) => r.score >= 50 && r.score < 75).length
    const low    = callRows.filter((r) => r.score >= 25 && r.score < 50).length
    const poor   = callRows.filter((r) => r.score < 25).length
    const dq        = callRows.filter((r) => r.qualified === false && r.disqualificationReason).length
    const qualified = callRows.filter((r) => r.qualified === true).length
    const soldRows     = callRows.filter((r) => String(r.outcome).toLowerCase() === 'sold')
    const nonSoldRows  = callRows.filter((r) => String(r.outcome).toLowerCase() !== 'sold')
    const avgSoldScore        = soldRows.length ? Math.round(soldRows.reduce((s, r) => s + r.score, 0) / soldRows.length) : 0
    const avgNonConvertedScore = nonSoldRows.length ? Math.round(nonSoldRows.reduce((s, r) => s + r.score, 0) / nonSoldRows.length) : 0
    const qualifiedSoldRate   = pct(soldRows.filter((r) => r.qualified === true).length, qualified)
    const avgDuration         = total ? (callRows.reduce((s, r) => s + r.duration, 0) / total).toFixed(1) : '0.0'
    const avgTimeToDisposition = total ? (callRows.reduce((s, r) => s + r.timeToDisposition, 0) / total).toFixed(1) : '0.0'

    const reasonMap = {}
    callRows.forEach((r) => {
      if (r.disqualificationReason) reasonMap[r.disqualificationReason] = (reasonMap[r.disqualificationReason] || 0) + 1
    })
    const topDisqualificationReasons = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

    const bandRows = SCORE_BANDS.map((band) => {
      const rows = callRows.filter((r) => r.score >= band.min && r.score <= band.max)
      const sold = rows.filter((r) => String(r.outcome).toLowerCase() === 'sold').length
      return { label: band.label, total: rows.length, sold, closeRate: pct(sold, rows.length) }
    })

    return { total, avgScore, high, medium, low, poor, dq, qualified, avgSoldScore, avgNonConvertedScore, qualifiedSoldRate, avgDuration, avgTimeToDisposition, topDisqualificationReasons, bandRows }
  }, [callRows])

  // ── Plate completion from hh_plate_sessions ─────────────────────────────────
  const plateDropoffs = useMemo(() => {
    return TRACKED_PLATES.map((plate) => {
      const reached   = plateSessions.filter((s) => Number(s.current_plate || 0) >= plate.id).length
      const completed = plateSessions.filter((s) => Number(s.current_plate || 0) > plate.id).length
      return {
        name: plate.name,
        id: plate.id,
        reached,
        completed,
        dropoffRate: reached ? `${Math.max(0, Math.round(((reached - completed) / reached) * 100))}%` : '0%',
      }
    })
  }, [plateSessions])

  // ── Product breakdown from hh_dispositions ──────────────────────────────────
  const productBreakdown = useMemo(() => {
    const hi  = dispositionRows.filter((r) => r.selected_product === 'hospital_indemnity').length
    const hh  = dispositionRows.filter((r) => r.selected_product === 'home_healthcare').length
    const none = dispositionRows.filter((r) => !r.selected_product).length
    return { hospitalIndemnity: hi, homeHealthcare: hh, notSelected: none }
  }, [dispositionRows])

  // ── Objection analytics ─────────────────────────────────────────────────────
  const objectionAnalytics = useMemo(() => {
    const typeMap = {}
    const reactionMap = {}
    const plateMap = {}
    const typeReactionMap = {}

    objectionEvents.forEach((event) => {
      const type     = event.objection_label || event.objection_type || 'Unknown'
      const reaction = event.prospect_reaction || 'unknown'
      const plate    = Number(event.plate_number || 0)
      typeMap[type]     = (typeMap[type] || 0) + 1
      reactionMap[reaction] = (reactionMap[reaction] || 0) + 1
      if (plate) plateMap[plate] = (plateMap[plate] || 0) + 1
      if (!typeReactionMap[type]) typeReactionMap[type] = { total: 0, engaged: 0, emotional: 0, resistant: 0 }
      typeReactionMap[type].total += 1
      if (reaction === 'engaged')                typeReactionMap[type].engaged += 1
      if (reaction === 'opened_up_emotionally')  typeReactionMap[type].emotional += 1
      if (reaction === 'resistant')              typeReactionMap[type].resistant += 1
    })

    const objectionRows = Object.entries(typeReactionMap).map(([type, v]) => ({
      type,
      total: v.total,
      engagedRate:    pct(v.engaged,   v.total),
      emotionalRate:  pct(v.emotional, v.total),
      resistanceRate: pct(v.resistant, v.total),
    })).sort((a, b) => b.total - a.total)

    const objectionByPlateRows = TRACKED_PLATES.map((plate) => ({ name: plate.name, total: plateMap[plate.id] || 0 }))

    return {
      total: objectionEvents.length,
      typeRows:    Object.entries(typeMap).sort((a, b) => b[1] - a[1]),
      reactionRows: Object.entries(reactionMap).sort((a, b) => b[1] - a[1]),
      objectionRows,
      objectionByPlateRows,
    }
  }, [objectionEvents])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>Zenyra Home Health Admin</h1>
          <p style={{ color: '#6b7280', margin: '6px 0 0' }}>Disposition analytics, lead pipeline, objection intelligence, and plate visibility.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleResetDay} disabled={resetting} style={resetBtn}><RotateCcw size={16} />{resetting ? 'Resetting…' : 'Reset Day'}</button>
          <button onClick={onBack} style={backBtn}>Back to Agent View</button>
        </div>
      </div>

      <div style={{ padding: 24 }}>

        {/* Date Range Picker */}
        <div style={dateRangeBar}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                style={{ ...presetBtn, background: activePreset === p.key ? '#7c3aed' : '#fff', color: activePreset === p.key ? '#fff' : '#374151' }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {activePreset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={dateInput} />
              <span style={{ color: '#6b7280' }}>to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={dateInput} />
              <button onClick={applyCustomRange} disabled={!customStart || !customEnd} style={{ ...presetBtn, background: '#7c3aed', color: '#fff', opacity: !customStart || !customEnd ? 0.5 : 1 }}>Apply</button>
            </div>
          )}
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
            Showing: {dateRange.start.toLocaleDateString()} – {dateRange.end.toLocaleDateString()}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {['overview', 'dispositions', 'plates', 'objections'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ ...tabBtn, background: activeTab === tab ? '#7c3aed' : '#fff', color: activeTab === tab ? '#fff' : '#374151' }}>{tab}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Loading dashboard data…</div>
        ) : activeTab === 'overview' ? (
          <>
            {/* Row 1 — Call stats */}
            <div style={grid4}>
              <StatCard icon={<Phone size={18} />}        label="Calls Logged"       value={stats.totalCalls} />
              <StatCard icon={<CheckCircle size={18} />}  label="Sold"               value={stats.soldCount} />
              <StatCard icon={<Clock size={18} />}        label="Callbacks Pending"  value={stats.callbacksPending} />
              <StatCard icon={<MessageSquare size={18} />} label="Objections Logged" value={stats.objectionEvents} />
            </div>

            {/* Row 2 — Averages */}
            <div style={grid4Alt}>
              <StatCard icon={<TrendingUp size={18} />} label="Average Lead Score"       value={analytics.avgScore} />
              <StatCard icon={<Clock size={18} />}      label="Avg Time to Disposition"  value={`${analytics.avgTimeToDisposition} min`} />
              <StatCard icon={<Phone size={18} />}      label="Avg Call Duration"        value={`${analytics.avgDuration} min`} />
              <StatCard icon={<Activity size={18} />}   label="Qualified Rate"           value={pct(analytics.qualified, Math.max(analytics.total, 1))} />
            </div>

            {/* Product Selection breakdown */}
            <div style={{ ...panel, marginTop: 20 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>Product Selection</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div style={productCard('#eff6ff', '#2563eb')}>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>🏥</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{productBreakdown.hospitalIndemnity}</div>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Hospital Indemnity</div>
                </div>
                <div style={productCard('#f0fdf4', '#16a34a')}>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>🏠</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{productBreakdown.homeHealthcare}</div>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Home Healthcare</div>
                </div>
                <div style={productCard('#f9fafb', '#6b7280')}>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>—</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{productBreakdown.notSelected}</div>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Not Selected</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={panel}>
                <h3 style={{ marginTop: 0 }}>Lead Pipeline</h3>
                {Object.entries(pipeline).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ textTransform: 'capitalize' }}>{key.replace('_', ' ')}</span>
                    <strong>{val}</strong>
                  </div>
                ))}
              </div>
              <div style={panel}>
                <h3 style={{ marginTop: 0 }}>Lead Scoring Insights</h3>
                <div style={metricsList}>
                  <MetricRow label="Total Calls Scored"               value={analytics.total} />
                  <MetricRow label="High Opportunity"                 value={analytics.high} />
                  <MetricRow label="Medium Opportunity"               value={analytics.medium} />
                  <MetricRow label="Low Opportunity"                  value={analytics.low} />
                  <MetricRow label="Poor Opportunity"                 value={analytics.poor} />
                  <MetricRow label="Disqualified"                     value={analytics.dq} />
                  <MetricRow label="Qualified Rate"                   value={pct(analytics.qualified, Math.max(analytics.total, 1))} />
                  <MetricRow label="Sold Rate by Qualified Leads"     value={analytics.qualifiedSoldRate} />
                  <MetricRow label="Avg Score of Sold Leads"          value={analytics.avgSoldScore} />
                  <MetricRow label="Avg Score of Non-Converted Leads" value={analytics.avgNonConvertedScore} />
                </div>
              </div>
            </div>
          </>
        ) : activeTab === 'dispositions' ? (
          <div style={panel}>
            <h3 style={{ marginTop: 0 }}>Disposition Tracking — {callRows.length} calls</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Lead', 'State', 'Score', 'Band', 'Qualified', 'DQ Reason', 'Loss Reason', 'Objection', 'Breakdown Point', 'Product', 'Duration', 'Outcome', 'Notes'].map((label) => (
                      <th key={label} style={th}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {callRows.map((row) => (
                    <tr key={row.callId} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={td}>{formatDate(row.callStartedAt)}</td>
                      <td style={td}>{row.leadName}</td>
                      <td style={td}>{row.state}</td>
                      <td style={td}>{row.score}</td>
                      <td style={td}>{row.scoreBand}</td>
                      <td style={td}>{row.qualified === true ? 'Yes' : row.qualified === false ? 'No' : '—'}</td>
                      <td style={td}>{row.disqualificationReason || '—'}</td>
                      <td style={td}>{row.primaryLossReason || '—'}</td>
                      <td style={td}>{row.primaryObjection || '—'}</td>
                      <td style={td}>{row.breakdownPoint || '—'}</td>
                      <td style={td}>{row.selectedProduct ? row.selectedProduct.replace('_', ' ') : '—'}</td>
                      <td style={td}>{row.duration ? `${Number(row.duration).toFixed(1)} min` : '—'}</td>
                      <td style={td}>{row.outcome}</td>
                      <td style={td}>{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'plates' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={panel}>
              <h3 style={{ marginTop: 0 }}>Plate Completion & Drop-Off</h3>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
                Source: {plateSessions.length} sessions in date range
              </div>
              {plateDropoffs.map((row) => (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, padding: '10px 0', borderTop: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: 13 }}>{row.id}. {row.name}</span>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>Reached: {row.reached}</span>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>Done: {row.completed}</span>
                  <strong style={{ fontSize: 13 }}>{row.dropoffRate}</strong>
                </div>
              ))}
            </div>
            <div style={panel}>
              <h3 style={{ marginTop: 0 }}>Plate-Linked Objection Volume</h3>
              {objectionAnalytics.objectionByPlateRows.map((row) => (
                <div key={row.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: 13 }}>{row.name}</span>
                  <strong>{row.total}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={panel}>
              <h3 style={{ marginTop: 0 }}>Objection Performance</h3>
              {objectionAnalytics.objectionRows.length === 0 ? (
                <div style={{ color: '#6b7280' }}>No objection events logged yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Objection', 'Total', 'Engaged', 'Emotional', 'Resistant'].map((label) => <th key={label} style={th}>{label}</th>)}</tr></thead>
                  <tbody>
                    {objectionAnalytics.objectionRows.map((row) => (
                      <tr key={row.type} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={td}>{row.type}</td>
                        <td style={td}>{row.total}</td>
                        <td style={td}>{row.engagedRate}</td>
                        <td style={td}>{row.emotionalRate}</td>
                        <td style={td}>{row.resistanceRate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={panel}>
              <h3 style={{ marginTop: 0 }}>Objection Breakdown</h3>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>By Type</div>
              {objectionAnalytics.typeRows.length === 0
                ? <div style={{ color: '#6b7280' }}>No objection type data yet.</div>
                : objectionAnalytics.typeRows.map(([type, count]) => (
                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f3f4f6' }}>
                    <span>{type}</span><strong>{count}</strong>
                  </div>
                ))
              }
              <div style={{ fontWeight: 700, margin: '18px 0 8px' }}>By Reaction</div>
              {objectionAnalytics.reactionRows.length === 0
                ? <div style={{ color: '#6b7280' }}>No reaction data yet.</div>
                : objectionAnalytics.reactionRows.map(([reaction, count]) => (
                  <div key={reaction} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f3f4f6' }}>
                    <span>{reaction.replaceAll('_', ' ')}</span><strong>{count}</strong>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20 }}>
      <div style={{ color: '#7c3aed' }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 10 }}>{value}</div>
      <div style={{ color: '#6b7280' }}>{label}</div>
    </div>
  )
}

function MetricRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ color: '#4b5563' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function productCard(bg, accent) {
  return { background: bg, border: `2px solid ${accent}20`, borderRadius: 16, padding: 20, textAlign: 'center' }
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const grid4      = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }
const grid4Alt   = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }
const panel      = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20 }
const backBtn    = { border: 'none', background: '#111827', color: '#fff', borderRadius: 12, padding: '12px 16px', cursor: 'pointer' }
const resetBtn   = { border: 'none', background: '#111827', color: '#fff', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }
const tabBtn     = { border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', cursor: 'pointer', textTransform: 'capitalize' }
const metricsList = { display: 'grid', gap: 0 }
const th         = { textAlign: 'left', fontSize: 12, textTransform: 'uppercase', color: '#6b7280', padding: '12px 16px', background: '#f9fafb', whiteSpace: 'nowrap' }
const td         = { padding: '12px 16px', fontSize: 13 }
const dateRangeBar = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '14px 18px', marginBottom: 20 }
const presetBtn  = { border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }
const dateInput  = { border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 12px', fontSize: 13 }

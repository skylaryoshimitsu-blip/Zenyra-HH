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
  { key: 'plate1', label: 'Opening + Verification', id: 1 },
  { key: 'plate2', label: 'Discovery / Needs Assessment', id: 2 },
  { key: 'plate3', label: 'Current Coverage Gaps', id: 3 },
  { key: 'plate4', label: 'Financial Exposure / Problem Awareness', id: 4 },
  { key: 'plate5', label: 'Medication Confirmation', id: 5 },
  { key: 'plate6', label: 'Clinical Qualification Check', id: 6 },
  { key: 'plate7', label: 'Medicare Education + Solution Framing', id: 7 },
  { key: 'plate8', label: 'Premium Inputs', id: 8 },
  { key: 'plate9', label: '3-Option Comparison', id: 9 },
  { key: 'plate10', label: 'Recommendation + Next Steps', id: 10 },
]

function pct(numerator, denominator) {
  if (!denominator) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function scoreBand(score) {
  const n = Number(score || 0)
  if (n >= 75) return 'High'
  if (n >= 50) return 'Medium'
  if (n >= 25) return 'Low'
  return 'Poor'
}

export default function HomeHealthAdminDashboard({ leads = [], setLeads, dispositions = [], setDispositions, onBack }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [calls, setCalls] = useState([])
  const [objectionEvents, setObjectionEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    setLoading(true)
    const [{ data: callsData, error: callsError }, { data: objectionsData, error: objectionsError }] = await Promise.all([
      supabase
        .from('hh_calls')
        .select(`
          *,
          hh_leads (
            full_name,
            state
          )
        `)
        .order('call_started_at', { ascending: false }),
      supabase
        .from('hh_objection_events')
        .select('*')
        .order('created_at', { ascending: false }),
    ])

    if (callsError) {
      console.error('Error fetching hh_calls:', callsError.message)
      setCalls([])
    } else {
      setCalls(callsData || [])
    }

    if (objectionsError) {
      console.warn('hh_objection_events unavailable:', objectionsError.message)
      setObjectionEvents([])
    } else {
      setObjectionEvents(objectionsData || [])
    }

    setLoading(false)
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
          latest_score_total: null,
          latest_score_band: null,
          latest_disqualification_reason: null,
          latest_primary_loss_reason: null,
          latest_primary_objection: null,
          latest_breakdown_point: null,
          latest_likely_root_cause: null,
        }).in('id', leadIds)
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
    } catch (err) {
      console.error('Reset failed:', err)
      alert('Reset encountered an error — check the console.')
    } finally {
      setResetting(false)
    }
  }

  const callRows = useMemo(() => {
    if (calls.length > 0) {
      return calls.map((call) => ({
        ...call,
        callId: call.id,
        callStartedAt: call.call_started_at,
        callEndedAt: call.call_ended_at,
        leadName: call.lead_name_snapshot || call.lead_name || call.hh_leads?.full_name || leads.find((l) => String(l.id) === String(call.lead_id))?.full_name || 'Unknown Lead',
        state: call.state_snapshot || call.state || call.hh_leads?.state || leads.find((l) => String(l.id) === String(call.lead_id))?.state || '—',
        score: Number(call.score_total || 0),
        scoreBand: call.score_band || scoreBand(call.score_total || 0),
        duration: Number(call.call_duration_minutes || 0),
        timeToDisposition: Number(call.time_to_disposition_minutes || 0),
        outcome: call.outcome || '—',
        qualified: call.qualified,
        disqualificationReason: call.disqualification_reason || '',
        notes: call.notes || '',
        plateProgress: call.plate_progress || {},
      }))
    }

    return leads.map((lead) => ({
      callId: `lead-${lead.id}`,
      callStartedAt: lead.updated_at || lead.created_at,
      callEndedAt: lead.updated_at || lead.created_at,
      leadName: lead.full_name,
      state: lead.state || '—',
      score: Number(lead.latest_score_total || lead.score || 0),
      scoreBand: lead.latest_score_band || lead.scoreBand || scoreBand(lead.latest_score_total || lead.score || 0),
      qualified: lead.latest_qualified ?? lead.qualified,
      disqualificationReason: lead.latest_disqualification_reason || lead.disqualificationReason || '',
      outcome: lead.status || '—',
      duration: 0,
      timeToDisposition: 0,
      notes: lead.notes || '',
      plateProgress: {},
    }))
  }, [calls, leads])

  const stats = useMemo(() => ({
    totalCallsToday: callRows.length,
    soldToday: callRows.filter((d) => String(d.outcome).toLowerCase() === 'sold').length,
    callbacksPending: callRows.filter((d) => String(d.outcome).toLowerCase() === 'callback_requested').length,
    objectionEvents: objectionEvents.length,
    scriptAdherenceRate: dispositions.length ? Math.round((dispositions.filter((d) => d.followedScript === 'yes').length / dispositions.length) * 100) : 0,
  }), [callRows, dispositions, objectionEvents])

  const pipeline = useMemo(() => {
    const counts = { new: 0, contacted: 0, in_progress: 0, sold: 0 }
    leads.forEach((lead) => {
      const key = lead.status === 'sold' ? 'sold' : lead.status === 'contacted' ? 'contacted' : lead.status === 'in-progress' ? 'in_progress' : 'new'
      counts[key] += 1
    })
    return counts
  }, [leads])

  const analytics = useMemo(() => {
    const total = callRows.length
    const avgScore = total ? Math.round(callRows.reduce((sum, row) => sum + Number(row.score || 0), 0) / total) : 0
    const high = callRows.filter((r) => Number(r.score || 0) >= 75).length
    const medium = callRows.filter((r) => Number(r.score || 0) >= 50 && Number(r.score || 0) < 75).length
    const low = callRows.filter((r) => Number(r.score || 0) >= 25 && Number(r.score || 0) < 50).length
    const poor = callRows.filter((r) => Number(r.score || 0) < 25).length
    const dq = callRows.filter((r) => r.qualified === false && r.disqualificationReason).length
    const qualified = callRows.filter((r) => r.qualified === true).length
    const soldRows = callRows.filter((r) => String(r.outcome).toLowerCase() === 'sold')
    const nonSoldRows = callRows.filter((r) => String(r.outcome).toLowerCase() !== 'sold')
    const avgSoldScore = soldRows.length ? Math.round(soldRows.reduce((sum, row) => sum + Number(row.score || 0), 0) / soldRows.length) : 0
    const avgNonConvertedScore = nonSoldRows.length ? Math.round(nonSoldRows.reduce((sum, row) => sum + Number(row.score || 0), 0) / nonSoldRows.length) : 0
    const qualifiedSoldRate = pct(soldRows.filter((r) => r.qualified === true).length, qualified)
    const avgDuration = total ? (callRows.reduce((sum, row) => sum + Number(row.duration || 0), 0) / total).toFixed(1) : '0.0'
    const avgTimeToDisposition = total ? (callRows.reduce((sum, row) => sum + Number(row.timeToDisposition || 0), 0) / total).toFixed(1) : '0.0'
    const avgPlatesCompleted = total ? (callRows.reduce((sum, row) => sum + Object.values(row.plateProgress || {}).filter(Boolean).length, 0) / total).toFixed(1) : '0.0'

    const reasonMap = {}
    callRows.forEach((r) => {
      if (r.disqualificationReason) reasonMap[r.disqualificationReason] = (reasonMap[r.disqualificationReason] || 0) + 1
    })
    const topDisqualificationReasons = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

    const bandRows = SCORE_BANDS.map((band) => {
      const rows = callRows.filter((r) => Number(r.score || 0) >= band.min && Number(r.score || 0) <= band.max)
      const sold = rows.filter((r) => String(r.outcome).toLowerCase() === 'sold').length
      return { label: band.label, total: rows.length, sold, closeRate: pct(sold, rows.length) }
    })

    const plateDropoffs = TRACKED_PLATES.map((plate, index) => {
      const reached = callRows.filter((r) => {
        const progress = r.plateProgress || {}
        return TRACKED_PLATES.slice(0, index + 1).every((p, i) => (i === index ? true : progress[p.key] === true))
      }).length
      const completed = callRows.filter((r) => (r.plateProgress || {})[plate.key] === true).length
      return {
        plate: plate.label,
        plateId: plate.id,
        reached,
        completed,
        dropoffRate: reached ? `${Math.max(0, Math.round(((reached - completed) / reached) * 100))}%` : '0%',
      }
    })

    return { total, avgScore, high, medium, low, poor, dq, qualified, avgSoldScore, avgNonConvertedScore, qualifiedSoldRate, avgDuration, avgTimeToDisposition, avgPlatesCompleted, topDisqualificationReasons, bandRows, plateDropoffs }
  }, [callRows])

  const objectionAnalytics = useMemo(() => {
    const typeMap = {}
    const reactionMap = {}
    const plateMap = {}
    const typeReactionMap = {}

    objectionEvents.forEach((event) => {
      const type = event.objection_label || event.objection_type || 'Unknown'
      const reaction = event.prospect_reaction || 'unknown'
      const plate = Number(event.plate_number || 0)
      typeMap[type] = (typeMap[type] || 0) + 1
      reactionMap[reaction] = (reactionMap[reaction] || 0) + 1
      if (plate) plateMap[plate] = (plateMap[plate] || 0) + 1
      if (!typeReactionMap[type]) typeReactionMap[type] = { total: 0, engaged: 0, emotional: 0, resistant: 0 }
      typeReactionMap[type].total += 1
      if (reaction === 'engaged') typeReactionMap[type].engaged += 1
      if (reaction === 'opened_up_emotionally') typeReactionMap[type].emotional += 1
      if (reaction === 'resistant') typeReactionMap[type].resistant += 1
    })

    const objectionRows = Object.entries(typeReactionMap).map(([type, value]) => ({
      type,
      total: value.total,
      engagedRate: pct(value.engaged, value.total),
      emotionalRate: pct(value.emotional, value.total),
      resistanceRate: pct(value.resistant, value.total),
    })).sort((a, b) => b.total - a.total)

    const objectionByPlateRows = TRACKED_PLATES.map((plate) => ({ plate: plate.label, total: plateMap[plate.id] || 0 }))

    return {
      total: objectionEvents.length,
      typeRows: Object.entries(typeMap).sort((a, b) => b[1] - a[1]),
      reactionRows: Object.entries(reactionMap).sort((a, b) => b[1] - a[1]),
      objectionRows,
      objectionByPlateRows,
    }
  }, [objectionEvents])

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {['overview', 'dispositions', 'plates', 'objections'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ ...tabBtn, background: activeTab === tab ? '#7c3aed' : '#fff', color: activeTab === tab ? '#fff' : '#374151' }}>{tab}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Loading dashboard data…</div>
        ) : activeTab === 'overview' ? (
          <>
            <div style={grid4}>
              <StatCard icon={<Phone size={18} />} label="Calls Logged" value={stats.totalCallsToday} />
              <StatCard icon={<CheckCircle size={18} />} label="Sold" value={stats.soldToday} />
              <StatCard icon={<Clock size={18} />} label="Callbacks Pending" value={stats.callbacksPending} />
              <StatCard icon={<MessageSquare size={18} />} label="Objections Logged" value={stats.objectionEvents} />
            </div>
            <div style={grid4Alt}>
              <StatCard icon={<TrendingUp size={18} />} label="Average Lead Score" value={analytics.avgScore} />
              <StatCard icon={<Clock size={18} />} label="Avg Time to Disposition" value={`${analytics.avgTimeToDisposition} min`} />
              <StatCard icon={<Phone size={18} />} label="Avg Call Duration" value={`${analytics.avgDuration} min`} />
              <StatCard icon={<Activity size={18} />} label="Avg Plates Completed" value={analytics.avgPlatesCompleted} />
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
                  <MetricRow label="Total Leads / Calls Scored" value={analytics.total} />
                  <MetricRow label="High Opportunity" value={analytics.high} />
                  <MetricRow label="Medium Opportunity" value={analytics.medium} />
                  <MetricRow label="Low Opportunity" value={analytics.low} />
                  <MetricRow label="Poor Opportunity" value={analytics.poor} />
                  <MetricRow label="Disqualified" value={analytics.dq} />
                  <MetricRow label="Qualified Rate" value={pct(analytics.qualified, Math.max(analytics.total, 1))} />
                  <MetricRow label="Sold Rate by Qualified Leads" value={analytics.qualifiedSoldRate} />
                  <MetricRow label="Avg Score of Sold Leads" value={analytics.avgSoldScore} />
                  <MetricRow label="Avg Score of Non-Converted Leads" value={analytics.avgNonConvertedScore} />
                </div>
              </div>
            </div>
          </>
        ) : activeTab === 'dispositions' ? (
          <div style={panel}>
            <h3 style={{ marginTop: 0 }}>Disposition Tracking</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Date', 'Lead', 'State', 'Score', 'Band', 'Qualified / DQ', 'Reason', 'Call Duration', 'Time to Disposition', 'Outcome', 'Notes'].map((label) => <th key={label} style={th}>{label}</th>)}</tr>
                </thead>
                <tbody>
                  {callRows.map((row) => (
                    <tr key={row.callId} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={td}>{formatDate(row.callStartedAt)}</td>
                      <td style={td}>{row.leadName}</td>
                      <td style={td}>{row.state}</td>
                      <td style={td}>{row.score}</td>
                      <td style={td}>{row.scoreBand}</td>
                      <td style={td}>{row.qualified === true ? 'Qualified' : row.qualified === false ? 'Disqualified' : '—'}</td>
                      <td style={td}>{row.disqualificationReason || '—'}</td>
                      <td style={td}>{row.duration ? `${Number(row.duration).toFixed(1)} min` : '—'}</td>
                      <td style={td}>{row.timeToDisposition ? `${Number(row.timeToDisposition).toFixed(1)} min` : '—'}</td>
                      <td style={td}>{row.outcome || '—'}</td>
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
              {analytics.plateDropoffs.map((row) => (
                <div key={row.plate} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, padding: '10px 0', borderTop: '1px solid #f3f4f6' }}>
                  <span>{row.plate}</span>
                  <span style={{ color: '#6b7280' }}>Reached: {row.reached}</span>
                  <span style={{ color: '#6b7280' }}>Completed: {row.completed}</span>
                  <strong>{row.dropoffRate}</strong>
                </div>
              ))}
            </div>
            <div style={panel}>
              <h3 style={{ marginTop: 0 }}>Plate-Linked Objection Volume</h3>
              {objectionAnalytics.objectionByPlateRows.map((row) => (
                <div key={row.plate} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #f3f4f6' }}>
                  <span>{row.plate}</span>
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
              {objectionAnalytics.typeRows.length === 0 ? <div style={{ color: '#6b7280' }}>No objection type data yet.</div> : objectionAnalytics.typeRows.map(([type, count]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f3f4f6' }}><span>{type}</span><strong>{count}</strong></div>
              ))}
              <div style={{ fontWeight: 700, margin: '18px 0 8px' }}>By Reaction</div>
              {objectionAnalytics.reactionRows.length === 0 ? <div style={{ color: '#6b7280' }}>No reaction data yet.</div> : objectionAnalytics.reactionRows.map(([reaction, count]) => (
                <div key={reaction} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f3f4f6' }}><span>{reaction.replaceAll('_', ' ')}</span><strong>{count}</strong></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }) {
  return <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20 }}><div style={{ color: '#7c3aed' }}>{icon}</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 10 }}>{value}</div><div style={{ color: '#6b7280' }}>{label}</div></div>
}

function MetricRow({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}><span style={{ color: '#4b5563' }}>{label}</span><strong>{value}</strong></div>
}

const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }
const grid4Alt = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }
const panel = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20 }
const backBtn = { border: 'none', background: '#111827', color: '#fff', borderRadius: 12, padding: '12px 16px', cursor: 'pointer' }
const resetBtn = { border: 'none', background: '#111827', color: '#fff', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }
const tabBtn = { border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', cursor: 'pointer', textTransform: 'capitalize' }
const metricsList = { display: 'grid', gap: 0 }
const th = { textAlign: 'left', fontSize: 12, textTransform: 'uppercase', color: '#6b7280', padding: '12px 16px', background: '#f9fafb' }
const td = { padding: '12px 16px', fontSize: 14 }

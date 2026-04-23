import React, { useMemo, useState } from 'react'
import { Activity, AlertTriangle, ClipboardList, Phone, RotateCcw, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import HomeHealthLeadsPage from './HomeHealthLeadsPage'

export default function HomeHealthDashboard({ leads, setLeads, dispositions, setDispositions, onOpenAdmin }) {
  const [activeItem, setActiveItem] = useState('dashboard')
  const [resetting, setResetting] = useState(false)

  const metrics = useMemo(() => ({
    totalLeads: leads.length,
    totalCalls: dispositions.length,
    soldCount: dispositions.filter((d) => d.outcome === 'sold').length,
    qualificationRate: leads.length
      ? Math.round((leads.filter((l) => l.latest_qualified === true || l.qualified === true).length / leads.length) * 100)
      : 0,
    unresolvedCauseCount: leads.filter((l) => !l.latest_likely_root_cause && (l.status && l.status !== 'new')).length,
  }), [leads, dispositions])

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
        await supabase
          .from('hh_leads')
          .update({
            status: 'new',
            latest_qualified: null,
            latest_score_total: null,
            latest_score_band: null,
            latest_disqualification_reason: null,
            latest_primary_loss_reason: null,
            latest_primary_objection: null,
            latest_breakdown_point: null,
            latest_likely_root_cause: null,
          })
          .in('id', leadIds)
      }

      setLeads((prev) => prev.map((l) => ({
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
      setDispositions([])
    } catch (err) {
      console.error('Reset failed:', err)
      alert('Reset encountered an error — check the console.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={sidebar}>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 20 }}>Zenyra HH</div>
        {['dashboard', 'leads', 'calls', 'follow-ups'].map((item) => (
          <button
            key={item}
            onClick={() => setActiveItem(item)}
            style={{
              ...sideBtn,
              background: activeItem === item ? '#ede9fe' : 'transparent',
              color: activeItem === item ? '#6d28d9' : '#374151',
            }}
          >
            {item}
          </button>
        ))}
        <button onClick={onOpenAdmin} style={{ ...sideBtn, marginTop: 16, background: '#111827', color: '#fff' }}>
          Admin View
        </button>
      </aside>

      <main style={{ flex: 1 }}>
        <div style={topbar}>
          <div>
            <h1 style={{ margin: 0 }}>Home Health Dashboard</h1>
          </div>
          <button onClick={handleResetDay} disabled={resetting} style={resetBtn}>
            <RotateCcw size={16} />
            {resetting ? 'Resetting…' : 'Reset Day'}
          </button>
        </div>

        {activeItem === 'dashboard' ? (
          <div style={{ padding: 24 }}>
            <div style={metricsGrid}>
              <MetricCard icon={<Users size={18} />} label="Total Leads" value={metrics.totalLeads} />
              <MetricCard icon={<Phone size={18} />} label="Calls Logged" value={metrics.totalCalls} />
              <MetricCard icon={<ClipboardList size={18} />} label="Sold" value={metrics.soldCount} />
              <MetricCard icon={<Activity size={18} />} label="Qualification Rate" value={`${metrics.qualificationRate}%`} />
            </div>
            <div style={{ ...metricsGrid, marginTop: 16, gridTemplateColumns: 'repeat(1, 1fr)' }}>
              <MetricCard icon={<AlertTriangle size={18} />} label="Leads Missing Root Cause" value={metrics.unresolvedCauseCount} />
            </div>
          </div>
        ) : activeItem === 'leads' ? (
          <HomeHealthLeadsPage
            leads={leads}
            setLeads={setLeads}
            dispositions={dispositions}
            setDispositions={setDispositions}
          />
        ) : (
          <div style={{ padding: 24, color: '#6b7280' }}>Placeholder page for {activeItem}.</div>
        )}
      </main>
    </div>
  )
}

function MetricCard({ icon, label, value }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20 }}>
      <div style={{ color: '#7c3aed', marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
      <div style={{ color: '#6b7280' }}>{label}</div>
    </div>
  )
}

const sidebar = { width: 240, borderRight: '1px solid #e5e7eb', background: '#fff', padding: 20 }
const sideBtn = { width: '100%', textAlign: 'left', border: 'none', padding: 12, borderRadius: 12, cursor: 'pointer', textTransform: 'capitalize', marginBottom: 8 }
const topbar = { padding: 24, borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const metricsGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }
const resetBtn = { background: '#111827', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }

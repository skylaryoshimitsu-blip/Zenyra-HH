import React, { useEffect, useMemo, useState } from 'react'
import HomeHealthDashboard from './components/HomeHealthDashboard'
import HomeHealthAdminDashboard from './components/HomeHealthAdminDashboard'
import HomeHealthSalesPlates from './components/HomeHealthSalesPlates'
import { mockLeads } from './lib/mockData'
import { supabase } from './lib/supabaseClient'

const LEADS_KEY = 'hh_leads'
const DISPOSITIONS_KEY = 'hh_dispositions'

export default function App() {
  const [view, setView] = useState('agent')
  const [leads, setLeads] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(LEADS_KEY) || 'null')
      return Array.isArray(stored) && stored.length ? stored : mockLeads
    } catch {
      return mockLeads
    }
  })
  const [dispositions, setDispositions] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DISPOSITIONS_KEY) || '[]')
      return Array.isArray(stored) ? stored : []
    } catch {
      return []
    }
  })
  const [handoffLead, setHandoffLead] = useState(null)
  const [handoffInitialPlate, setHandoffInitialPlate] = useState(null)
  const [handoffPayload, setHandoffPayload] = useState(null)
  const [handoffError, setHandoffError] = useState('')
  const [handoffLoading, setHandoffLoading] = useState(false)

  useEffect(() => {
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
  }, [leads])

  useEffect(() => {
    localStorage.setItem(DISPOSITIONS_KEY, JSON.stringify(dispositions))
  }, [dispositions])

  // Resolve handoff_id token from Supabase on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const handoffId = params.get('handoff_id')
    if (!handoffId) return

    const resolveHandoff = async () => {
      setHandoffLoading(true)

      const { data: token, error } = await supabase
        .from('hh_handoff_tokens')
        .select('*')
        .eq('handoff_id', handoffId)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .single()

      window.history.replaceState(null, '', window.location.pathname)

      if (error || !token) {
        setHandoffError('This handoff link has expired or already been used.')
        setHandoffLoading(false)
        return
      }

      await supabase
        .from('hh_handoff_tokens')
        .update({ consumed_at: new Date().toISOString() })
        .eq('handoff_id', handoffId)

      const p = token.payload
      const leadData = {
        id: p.lead_id,
        lead_id: p.lead_id,
        full_name: p.full_name || p.customer_name,
        phone: p.phone,
        email: p.email,
        dob: p.dob,
        gender: p.gender,
        city: p.city,
        state: p.state,
        county: p.county,
        zipcode: p.zip_code,
      }

      const initialPlate = p.target_hh_plate || 1

      setHandoffPayload({ ...p, handoff_id: handoffId })
      setHandoffLead(leadData)
      setHandoffInitialPlate(initialPlate)
      setHandoffLoading(false)
    }

    resolveHandoff()
  }, [])

  const sharedProps = useMemo(
    () => ({ leads, setLeads, dispositions, setDispositions }),
    [leads, dispositions]
  )

  if (handoffLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f9fafb', color: '#374151', fontSize: 16 }}>
        Loading handoff…
      </div>
    )
  }

  if (handoffLead) {
    return (
      <HomeHealthSalesPlates
        leadData={handoffLead}
        initialPlate={handoffInitialPlate}
        handoffPayload={handoffPayload}
        onClose={() => setHandoffLead(null)}
        onDispositionSave={() => setHandoffLead(null)}
      />
    )
  }

  return (
    <>
      {handoffError && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#7f1d1d', color: '#fff', padding: '12px 20px', borderRadius: 12, zIndex: 90, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: 14, fontWeight: 500 }}>
          {handoffError}
          <button onClick={() => setHandoffError('')} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}
      {view === 'agent' ? (
        <HomeHealthDashboard
          {...sharedProps}
          onOpenAdmin={() => setView('admin')}
        />
      ) : (
        <HomeHealthAdminDashboard
          {...sharedProps}
          onBack={() => setView('agent')}
        />
      )}
    </>
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import HomeHealthDashboard from './components/HomeHealthDashboard'
import HomeHealthAdminDashboard from './components/HomeHealthAdminDashboard'
import HomeHealthSalesPlates from './components/HomeHealthSalesPlates'
import { mockLeads } from './lib/mockData'

const LEADS_KEY = 'hh_leads'
const DISPOSITIONS_KEY = 'hh_dispositions'

function parseHandoffParam() {
  try {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('handoff')
    if (!raw) return null
    let payload
    try {
      payload = JSON.parse(atob(raw))
    } catch {
      payload = JSON.parse(raw)
    }
    if (!payload || payload.source !== 'zenyra-main') return null
    return payload
  } catch {
    return null
  }
}

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

  useEffect(() => {
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
  }, [leads])

  useEffect(() => {
    localStorage.setItem(DISPOSITIONS_KEY, JSON.stringify(dispositions))
  }, [dispositions])

  // Parse handoff from URL on mount
  useEffect(() => {
    const payload = parseHandoffParam()
    if (!payload) return

    const initialPlate = payload.launched_from_plate === 7 ? 8 : 1

    const leadFields = {
      full_name: payload.name || '',
      phone: payload.phone || '',
      email: payload.email || '',
      dob: payload.dob || '',
      medicare_number: payload.medicare_number || '',
      medicaid_number: payload.medicaid_number || '',
      zipcode: payload.zip || '',
      county: payload.county || '',
      state: payload.state || '',
      city: payload.city || '',
      notes: payload.notes || '',
      willing_to_advance: true,
      status: 'new',
    }

    // Read current leads from localStorage to find existing match
    let currentLeads
    try {
      const stored = JSON.parse(localStorage.getItem(LEADS_KEY) || 'null')
      currentLeads = Array.isArray(stored) && stored.length ? stored : mockLeads
    } catch {
      currentLeads = mockLeads
    }

    const existingIdx = payload.phone
      ? currentLeads.findIndex((l) => l.phone === payload.phone)
      : -1

    let resolvedLead
    if (existingIdx >= 0) {
      resolvedLead = { ...currentLeads[existingIdx], ...leadFields }
    } else {
      resolvedLead = { id: `handoff-${Date.now()}`, ...leadFields }
    }

    setLeads((prev) => {
      if (existingIdx >= 0) {
        return prev.map((l, i) => (i === existingIdx ? resolvedLead : l))
      }
      return [resolvedLead, ...prev]
    })

    setHandoffLead(resolvedLead)
    setHandoffInitialPlate(initialPlate)

    // Clean URL
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const sharedProps = useMemo(
    () => ({ leads, setLeads, dispositions, setDispositions }),
    [leads, dispositions]
  )

  // Handoff: open plates immediately, bypassing the dashboard
  if (handoffLead) {
    return (
      <HomeHealthSalesPlates
        leadData={handoffLead}
        initialPlate={handoffInitialPlate}
        onClose={() => setHandoffLead(null)}
        onDispositionSave={() => setHandoffLead(null)}
      />
    )
  }

  return view === 'agent' ? (
    <HomeHealthDashboard
      {...sharedProps}
      onOpenAdmin={() => setView('admin')}
    />
  ) : (
    <HomeHealthAdminDashboard
      {...sharedProps}
      onBack={() => setView('agent')}
    />
  )
}

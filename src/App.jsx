import React, { useEffect, useMemo, useState } from 'react'
import HomeHealthDashboard from './components/HomeHealthDashboard'
import HomeHealthAdminDashboard from './components/HomeHealthAdminDashboard'
import { mockLeads } from './lib/mockData'

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

  useEffect(() => {
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
  }, [leads])

  useEffect(() => {
    localStorage.setItem(DISPOSITIONS_KEY, JSON.stringify(dispositions))
  }, [dispositions])

  const sharedProps = useMemo(
    () => ({ leads, setLeads, dispositions, setDispositions }),
    [leads, dispositions]
  )

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
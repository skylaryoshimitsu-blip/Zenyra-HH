import React, { useEffect, useMemo, useState } from 'react'
import { Calendar, Bell, Clipboard, FilePenLine, Phone, Plus, Search, Trash2, X } from 'lucide-react'
import HomeHealthSalesPlates from './HomeHealthSalesPlates'
import HomeHealthDispositionModal from './HomeHealthDispositionModal'
import { supabase } from '../lib/supabaseClient'

const DEFAULT_LEAD_DRAFT = { full_name: '', phone: '', zipcode: '', state: '', email: '', notes: '' }
const DEFAULT_EDIT_DRAFT = {
  full_name: '',
  phone: '',
  zipcode: '',
  state: '',
  email: '',
  mbi_number: '',
  status: 'new',
  conditional_notes: '',
  notes: '',
}
const DEFAULT_SESSION_DRAFT = {
  county: '',
  willing_to_advance: null,
  has_part_a: false,
  has_part_b: false,
  has_medicaid: false,
  plan_type: '',
  carrier_name: '',
  specialist_copay_awareness: '',
  hospitalization_cost_awareness: '',
  financial_impact_statement: '',
  prefers_home_care: null,
  home_care_cost_tolerance: '',
  currently_in_nursing_home: false,
  currently_receiving_home_health: false,
  memory_condition_last_12_months: false,
  adl_bathing: false,
  adl_dressing: false,
  adl_toileting: false,
  adl_feeding: false,
  adl_transferring: false,
  adl_continence: false,
  entered_option_c_premium: '',
  entered_option_b_premium: '',
  entered_option_a_premium: '',
  selected_option_key: '',
  notes: '',
}

export default function HomeHealthLeadsPage({ dispositions, setDispositions }) {
  const [leads, setLeads] = useState([])
  const [search, setSearch] = useState('')
  const [showAddLead, setShowAddLead] = useState(false)
  const [showPlates, setShowPlates] = useState(false)
  const [showDisposition, setShowDisposition] = useState(false)
  const [showEditLead, setShowEditLead] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [leadDraft, setLeadDraft] = useState(DEFAULT_LEAD_DRAFT)
  const [editPage, setEditPage] = useState(1)
  const [editLeadDraft, setEditLeadDraft] = useState(DEFAULT_EDIT_DRAFT)
  const [editSessionDraft, setEditSessionDraft] = useState(DEFAULT_SESSION_DRAFT)
  const [editSessionId, setEditSessionId] = useState(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    fetchLeads()
  }, [])

  const fetchLeads = async () => {
    const { data, error } = await supabase.from('hh_leads').select('*').order('created_at', { ascending: false })
    if (error) {
      console.error('Error fetching leads:', error)
      return
    }
    setLeads(data || [])
  }

  const filtered = useMemo(() => leads.filter((lead) => {
    const term = search.toLowerCase()
    return [lead.full_name, lead.phone, lead.zipcode, lead.state, lead.email].some((v) => String(v || '').toLowerCase().includes(term))
  }), [leads, search])

  const addLead = async () => {
    if (!leadDraft.full_name) return
    const { data, error } = await supabase.from('hh_leads').insert({ ...leadDraft, status: 'new' }).select().single()
    if (error) {
      console.error('Error adding lead:', error)
      return
    }
    setLeads([data, ...leads])
    setLeadDraft(DEFAULT_LEAD_DRAFT)
    setShowAddLead(false)
  }

  const deleteLead = async (leadId) => {
    const { error } = await supabase.from('hh_leads').delete().eq('id', leadId)
    if (error) {
      console.error('Error deleting lead:', error)
      return
    }
    setLeads(leads.filter((lead) => lead.id !== leadId))
    setDispositions(dispositions.filter((item) => item.leadId !== leadId))
  }

  const openEditLead = async (lead) => {
    setSelectedLead(lead)
    setEditLeadDraft({
      full_name: lead.full_name || '',
      phone: lead.phone || '',
      zipcode: lead.zipcode || '',
      state: lead.state || '',
      email: lead.email || '',
      mbi_number: lead.mbi_number || lead.mbi || '',
      status: lead.status || 'new',
      conditional_notes: lead.conditional_notes || '',
      notes: lead.notes || '',
    })
    setEditSessionDraft(DEFAULT_SESSION_DRAFT)
    setEditSessionId(null)
    setEditPage(1)
    setShowEditLead(true)
    setEditLoading(true)

    const { data: sessions, error } = await supabase
      .from('hh_plate_sessions')
      .select('*')
      .eq('lead_id', lead.id)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (!error && Array.isArray(sessions) && sessions[0]) {
      const session = sessions[0]
      setEditSessionId(session.id)
      setEditSessionDraft({
        county: session.county || '',
        willing_to_advance: session.willing_to_advance ?? null,
        has_part_a: session.has_part_a ?? false,
        has_part_b: session.has_part_b ?? false,
        has_medicaid: session.has_medicaid ?? false,
        plan_type: session.plan_type || '',
        carrier_name: session.carrier_name || '',
        specialist_copay_awareness: session.specialist_copay_awareness || '',
        hospitalization_cost_awareness: session.hospitalization_cost_awareness || '',
        financial_impact_statement: session.financial_impact_statement || '',
        prefers_home_care: session.prefers_home_care ?? null,
        home_care_cost_tolerance: session.home_care_cost_tolerance || '',
        currently_in_nursing_home: session.currently_in_nursing_home ?? false,
        currently_receiving_home_health: session.currently_receiving_home_health ?? false,
        memory_condition_last_12_months: session.memory_condition_last_12_months ?? false,
        adl_bathing: session.adl_bathing ?? false,
        adl_dressing: session.adl_dressing ?? false,
        adl_toileting: session.adl_toileting ?? false,
        adl_feeding: session.adl_feeding ?? false,
        adl_transferring: session.adl_transferring ?? false,
        adl_continence: session.adl_continence ?? false,
        entered_option_c_premium: session.entered_option_c_premium ? String(session.entered_option_c_premium) : '',
        entered_option_b_premium: session.entered_option_b_premium ? String(session.entered_option_b_premium) : '',
        entered_option_a_premium: session.entered_option_a_premium ? String(session.entered_option_a_premium) : '',
        selected_option_key: session.selected_option_key || '',
        notes: session.notes || '',
      })
    }

    setEditLoading(false)
  }

  const saveEditedLead = async () => {
    if (!selectedLead?.id || editSaving) return
    setEditSaving(true)

    const leadPayload = {
      full_name: editLeadDraft.full_name,
      phone: editLeadDraft.phone,
      zipcode: editLeadDraft.zipcode,
      state: editLeadDraft.state,
      email: editLeadDraft.email,
      mbi_number: editLeadDraft.mbi_number,
      status: editLeadDraft.status,
      conditional_notes: editLeadDraft.conditional_notes,
      notes: editLeadDraft.notes,
      updated_at: new Date().toISOString(),
    }

    const { data: updatedLead, error: leadError } = await supabase
      .from('hh_leads')
      .update(leadPayload)
      .eq('id', selectedLead.id)
      .select()
      .single()

    if (leadError) {
      console.error('Error updating lead:', leadError)
      alert('Unable to save lead changes.')
      setEditSaving(false)
      return
    }

    if (editSessionId) {
      const adlCount = [
        editSessionDraft.adl_bathing,
        editSessionDraft.adl_dressing,
        editSessionDraft.adl_toileting,
        editSessionDraft.adl_feeding,
        editSessionDraft.adl_transferring,
        editSessionDraft.adl_continence,
      ].filter(Boolean).length

      const sessionPayload = {
        county: editSessionDraft.county,
        willing_to_advance: editSessionDraft.willing_to_advance,
        has_part_a: editSessionDraft.has_part_a,
        has_part_b: editSessionDraft.has_part_b,
        has_medicaid: editSessionDraft.has_medicaid,
        plan_type: editSessionDraft.plan_type,
        carrier_name: editSessionDraft.carrier_name,
        specialist_copay_awareness: editSessionDraft.specialist_copay_awareness,
        hospitalization_cost_awareness: editSessionDraft.hospitalization_cost_awareness,
        financial_impact_statement: editSessionDraft.financial_impact_statement,
        prefers_home_care: editSessionDraft.prefers_home_care,
        home_care_cost_tolerance: editSessionDraft.home_care_cost_tolerance,
        currently_in_nursing_home: editSessionDraft.currently_in_nursing_home,
        currently_receiving_home_health: editSessionDraft.currently_receiving_home_health,
        memory_condition_last_12_months: editSessionDraft.memory_condition_last_12_months,
        adl_bathing: editSessionDraft.adl_bathing,
        adl_dressing: editSessionDraft.adl_dressing,
        adl_toileting: editSessionDraft.adl_toileting,
        adl_feeding: editSessionDraft.adl_feeding,
        adl_transferring: editSessionDraft.adl_transferring,
        adl_continence: editSessionDraft.adl_continence,
        adl_count: adlCount,
        entered_option_c_premium: Number(editSessionDraft.entered_option_c_premium) || 0,
        entered_option_b_premium: Number(editSessionDraft.entered_option_b_premium) || 0,
        entered_option_a_premium: Number(editSessionDraft.entered_option_a_premium) || 0,
        selected_option_key: editSessionDraft.selected_option_key || null,
        notes: editSessionDraft.notes,
        zipcode: editLeadDraft.zipcode,
        state: editLeadDraft.state,
      }

      const { error: sessionError } = await supabase
        .from('hh_plate_sessions')
        .update(sessionPayload)
        .eq('id', editSessionId)

      if (sessionError) {
        console.error('Error updating session:', sessionError)
        alert('Lead saved, but plate-session details could not be updated.')
      }
    }

    setLeads((prev) => prev.map((lead) => lead.id === selectedLead.id ? { ...lead, ...updatedLead } : lead))
    setShowEditLead(false)
    setSelectedLead(null)
    setEditSaving(false)
  }

  const applyDisposition = async (leadId, payload) => {
    if (!leadId) {
      console.error('Path B: leadId undefined — skipping disposition write')
      return
    }
    const dbPayload = {
      lead_id: leadId,
      outcome: payload.outcome,
      lead_name_snapshot: payload.leadName,
      state_snapshot: payload.state,
      score_total: payload.score ?? 0,
      score_band: payload.scoreBand ?? '',
      qualified: payload.qualified ?? false,
      disqualification_reason: payload.disqualificationReason ?? '',
      notes: payload.notes ?? '',
      disposition_logged_at: new Date().toISOString(),
      primary_loss_reason: payload.primaryLossReason || null,
      secondary_loss_reason: payload.secondaryLossReason || null,
      primary_objection: payload.primaryObjection || null,
      secondary_objection: payload.secondaryObjection || null,
      breakdown_point: payload.breakdownPoint || null,
      admin_qualified: payload.adminQualified ?? null,
      sales_qualified: payload.salesQualified ?? null,
      problem_acknowledged: payload.problemAcknowledged ?? null,
      emotional_pain_expressed: payload.emotionalPainExpressed ?? null,
      urgency_present: payload.urgencyPresent ?? null,
      affordability_confirmed: payload.affordabilityConfirmed ?? null,
      recommendation_reached: payload.recommendationReached ?? null,
      trial_close_attempted: payload.trialCloseAttempted ?? null,
      buying_signals_present: payload.buyingSignalsPresent ?? null,
      objection_handled_effectively: payload.objectionHandledEffectively || null,
      likely_root_cause: payload.likelyRootCause || null,
      call_momentum_score: payload.callMomentumScore ?? null,
      pain_score: payload.painScore ?? null,
      sales_readiness_score: payload.salesReadinessScore ?? null,
      objection_risk_score: payload.objectionRiskScore ?? null,
    }

    const { error: dispError } = await supabase.from('hh_dispositions').insert(dbPayload)
    if (dispError) console.error('Error saving disposition:', dispError)

    const { error: leadError } = await supabase
      .from('hh_leads')
      .update({
        status: payload.outcome,
        latest_score_total: payload.score ?? 0,
        latest_score_band: payload.scoreBand ?? '',
        latest_qualified: payload.qualified ?? false,
        latest_disqualification_reason: payload.disqualificationReason ?? '',
        latest_primary_loss_reason: payload.primaryLossReason || null,
        latest_primary_objection: payload.primaryObjection || null,
        latest_breakdown_point: payload.breakdownPoint || null,
        latest_likely_root_cause: payload.likelyRootCause || null,
        notes: payload.notes ?? '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
    if (leadError) console.error('Error updating lead:', leadError)

    setDispositions([payload, ...dispositions])
    setLeads(leads.map((lead) => lead.id === leadId ? {
      ...lead,
      status: payload.outcome,
      latest_score_total: payload.score ?? lead.latest_score_total ?? 0,
      latest_score_band: payload.scoreBand ?? lead.latest_score_band ?? '',
      latest_qualified: payload.qualified ?? lead.latest_qualified ?? false,
      latest_disqualification_reason: payload.disqualificationReason ?? lead.latest_disqualification_reason ?? '',
      latest_primary_loss_reason: payload.primaryLossReason ?? lead.latest_primary_loss_reason ?? '',
      latest_primary_objection: payload.primaryObjection ?? lead.latest_primary_objection ?? '',
      latest_breakdown_point: payload.breakdownPoint ?? lead.latest_breakdown_point ?? '',
      latest_likely_root_cause: payload.likelyRootCause ?? lead.latest_likely_root_cause ?? '',
      notes: payload.notes ?? lead.notes,
      updated_at: new Date().toISOString(),
    } : lead))
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Leads Management</h1>
          <p style={{ color: '#6b7280' }}>Manage and work leads through Home Health Plates.</p>
        </div>
        <button onClick={() => setShowAddLead(true)} style={primaryBtn}><Plus size={16} /> Add Lead</button>
      </div>

      <div style={card}>
        <div style={{ padding: 20, borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ position: 'relative', maxWidth: 420 }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: '#9ca3af' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, phone, ZIP, state, or email..." style={{ ...input, paddingLeft: 40 }} />
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>{['Beneficiary Name', 'Phone', 'ZIP', 'Status', 'Latest Cause', 'Actions'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((lead) => (
              <tr key={lead.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={td}>{lead.full_name}</td>
                <td style={td}>{lead.phone || '—'}</td>
                <td style={td}>{lead.zipcode || '—'}</td>
                <td style={td}><span style={statusPill(lead.status)}>{lead.status}</span></td>
                <td style={td}>{lead.latest_likely_root_cause || lead.latest_primary_loss_reason || '—'}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => { setSelectedLead(lead); setShowDisposition(true) }} style={smallBtn}><Phone size={13} /> Log Outcome</button>
                    <button style={smallBtn}><Calendar size={13} /> Set Follow-Up</button>
                    <button style={smallBtn}><Bell size={13} /> Set Reminder</button>
                    <button onClick={() => openEditLead(lead)} style={neutralBtn}><FilePenLine size={13} /> Edit</button>
                    <button onClick={() => { setSelectedLead(lead); setShowPlates(true) }} style={accentBtn}><Clipboard size={13} /> Open Plates</button>
                    <button onClick={() => deleteLead(lead.id)} style={dangerBtn}><Trash2 size={13} /> Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddLead && (
        <div style={overlay}><div style={modal}>
          <div style={modalHeader}><h3 style={{ margin: 0 }}>Add Lead</h3><button onClick={() => setShowAddLead(false)} style={iconBtn}><X size={18} /></button></div>
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {['full_name', 'phone', 'zipcode', 'state', 'email'].map((key) => (
              <div key={key}><div style={label}>{key.replace('_', ' ')}</div><input value={leadDraft[key]} onChange={(e) => setLeadDraft({ ...leadDraft, [key]: e.target.value })} style={input} /></div>
            ))}
            <div style={{ gridColumn: '1 / -1' }}><div style={label}>notes</div><textarea value={leadDraft.notes} onChange={(e) => setLeadDraft({ ...leadDraft, notes: e.target.value })} style={textarea} /></div>
          </div>
          <div style={modalFooter}><button onClick={() => setShowAddLead(false)} style={secondaryBtn}>Cancel</button><button onClick={addLead} style={primaryBtn}>Save Lead</button></div>
        </div></div>
      )}

      {showEditLead && (
        <div style={overlay}><div style={editModal}>
          <div style={modalHeader}>
            <div>
              <h3 style={{ margin: 0 }}>Edit Lead</h3>
              <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Page {editPage} of 2</div>
            </div>
            <button onClick={() => setShowEditLead(false)} style={iconBtn}><X size={18} /></button>
          </div>

          <div style={{ padding: 20, overflowY: 'auto', maxHeight: '70vh' }}>
            {editLoading ? (
              <div style={{ color: '#6b7280' }}>Loading…</div>
            ) : editPage === 1 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <LabeledInput label="Name" value={editLeadDraft.full_name} onChange={(value) => setEditLeadDraft((prev) => ({ ...prev, full_name: value }))} />
                <LabeledInput label="Phone" value={editLeadDraft.phone} onChange={(value) => setEditLeadDraft((prev) => ({ ...prev, phone: value }))} />
                <LabeledInput label="Zip Code" value={editLeadDraft.zipcode} onChange={(value) => setEditLeadDraft((prev) => ({ ...prev, zipcode: value }))} />
                <LabeledInput label="State" value={editLeadDraft.state} onChange={(value) => setEditLeadDraft((prev) => ({ ...prev, state: value }))} />
                <LabeledInput label="Email" value={editLeadDraft.email} onChange={(value) => setEditLeadDraft((prev) => ({ ...prev, email: value }))} />
                <LabeledInput label="MBI #" value={editLeadDraft.mbi_number} onChange={(value) => setEditLeadDraft((prev) => ({ ...prev, mbi_number: value }))} />
                <div>
                  <div style={label}>Status</div>
                  <select value={editLeadDraft.status} onChange={(e) => setEditLeadDraft((prev) => ({ ...prev, status: e.target.value }))} style={input}>
                    {['new', 'contacted', 'in-progress', 'sold', 'callback_requested', 'needs_information', 'reviewing_with_family', 'not_interested', 'premium_too_high', 'not_eligible', 'do_not_contact', 'no_answer', 'voicemail_left', 'wrong_number', 'application_started'].map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={label}>Conditional Notes</div>
                  <textarea value={editLeadDraft.conditional_notes} onChange={(e) => setEditLeadDraft((prev) => ({ ...prev, conditional_notes: e.target.value }))} style={textarea} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <LabeledInput label="County" value={editSessionDraft.county} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, county: value }))} />
                <LabeledInput label="Plan Type" value={editSessionDraft.plan_type} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, plan_type: value }))} />
                <LabeledInput label="Carrier Name" value={editSessionDraft.carrier_name} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, carrier_name: value }))} />
                <LabeledInput label="Specialist Copay Awareness" value={editSessionDraft.specialist_copay_awareness} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, specialist_copay_awareness: value }))} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={label}>Hospital Cost Awareness</div>
                  <textarea value={editSessionDraft.hospitalization_cost_awareness} onChange={(e) => setEditSessionDraft((prev) => ({ ...prev, hospitalization_cost_awareness: e.target.value }))} style={textarea} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={label}>Financial Impact Statement</div>
                  <textarea value={editSessionDraft.financial_impact_statement} onChange={(e) => setEditSessionDraft((prev) => ({ ...prev, financial_impact_statement: e.target.value }))} style={textarea} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={label}>Home Care Cost Tolerance</div>
                  <textarea value={editSessionDraft.home_care_cost_tolerance} onChange={(e) => setEditSessionDraft((prev) => ({ ...prev, home_care_cost_tolerance: e.target.value }))} style={textarea} />
                </div>

                <BooleanSelect label="Willing to Advance" value={editSessionDraft.willing_to_advance} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, willing_to_advance: value }))} />
                <BooleanSelect label="Prefers Home Care" value={editSessionDraft.prefers_home_care} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, prefers_home_care: value }))} />
                <BooleanCheckbox label="Has Part A" checked={editSessionDraft.has_part_a} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, has_part_a: value }))} />
                <BooleanCheckbox label="Has Part B" checked={editSessionDraft.has_part_b} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, has_part_b: value }))} />
                <BooleanCheckbox label="Has Medicaid" checked={editSessionDraft.has_medicaid} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, has_medicaid: value }))} />
                <BooleanCheckbox label="Currently in Nursing Home" checked={editSessionDraft.currently_in_nursing_home} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, currently_in_nursing_home: value }))} />
                <BooleanCheckbox label="Currently Receiving Home Health" checked={editSessionDraft.currently_receiving_home_health} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, currently_receiving_home_health: value }))} />
                <BooleanCheckbox label="Memory Condition Last 12 Months" checked={editSessionDraft.memory_condition_last_12_months} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, memory_condition_last_12_months: value }))} />

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ ...label, marginBottom: 10 }}>ADLs</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <BooleanCheckbox label="Bathing" checked={editSessionDraft.adl_bathing} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, adl_bathing: value }))} />
                    <BooleanCheckbox label="Dressing" checked={editSessionDraft.adl_dressing} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, adl_dressing: value }))} />
                    <BooleanCheckbox label="Toileting" checked={editSessionDraft.adl_toileting} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, adl_toileting: value }))} />
                    <BooleanCheckbox label="Feeding" checked={editSessionDraft.adl_feeding} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, adl_feeding: value }))} />
                    <BooleanCheckbox label="Transferring" checked={editSessionDraft.adl_transferring} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, adl_transferring: value }))} />
                    <BooleanCheckbox label="Continence" checked={editSessionDraft.adl_continence} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, adl_continence: value }))} />
                  </div>
                </div>

                <LabeledInput label="Option C Premium" value={editSessionDraft.entered_option_c_premium} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, entered_option_c_premium: value }))} />
                <LabeledInput label="Option B Premium" value={editSessionDraft.entered_option_b_premium} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, entered_option_b_premium: value }))} />
                <LabeledInput label="Option A Premium" value={editSessionDraft.entered_option_a_premium} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, entered_option_a_premium: value }))} />
                <LabeledInput label="Selected Option" value={editSessionDraft.selected_option_key} onChange={(value) => setEditSessionDraft((prev) => ({ ...prev, selected_option_key: value }))} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={label}>General Notes</div>
                  <textarea value={editLeadDraft.notes} onChange={(e) => setEditLeadDraft((prev) => ({ ...prev, notes: e.target.value }))} style={textarea} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={label}>Plate Notes</div>
                  <textarea value={editSessionDraft.notes} onChange={(e) => setEditSessionDraft((prev) => ({ ...prev, notes: e.target.value }))} style={textarea} />
                </div>
              </div>
            )}
          </div>

          <div style={modalFooter}>
            <button onClick={() => setShowEditLead(false)} style={secondaryBtn} disabled={editSaving}>Cancel</button>
            <div style={{ display: 'flex', gap: 12 }}>
              {editPage > 1 && <button onClick={() => setEditPage(1)} style={secondaryBtn} disabled={editSaving}>Back</button>}
              {editPage === 1 ? (
                <button onClick={() => setEditPage(2)} style={primaryBtn} disabled={editLoading}>Next</button>
              ) : (
                <button onClick={saveEditedLead} style={primaryBtn} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Lead'}</button>
              )}
            </div>
          </div>
        </div></div>
      )}

      {showPlates && selectedLead && (
        <HomeHealthSalesPlates
          leadData={selectedLead}
          onClose={() => { setShowPlates(false); setSelectedLead(null) }}
          onDispositionSave={(payload) => {
            applyDisposition(selectedLead.id || selectedLead.lead_id, payload)
            setShowPlates(false)
            setSelectedLead(null)
          }}
        />
      )}

      {showDisposition && selectedLead && (
        <HomeHealthDispositionModal
          lead={selectedLead}
          onClose={() => { setShowDisposition(false); setSelectedLead(null) }}
          onSave={(payload) => {
            applyDisposition(selectedLead.id || selectedLead.lead_id, payload)
            setShowDisposition(false)
            setSelectedLead(null)
          }}
        />
      )}
    </div>
  )
}

function LabeledInput({ label: text, value, onChange }) {
  return (
    <div>
      <div style={label}>{text}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={input} />
    </div>
  )
}

function BooleanCheckbox({ label: text, checked, onChange }) {
  return (
    <label style={checkboxCard}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{text}</span>
    </label>
  )
}

function BooleanSelect({ label: text, value, onChange }) {
  return (
    <div>
      <div style={label}>{text}</div>
      <select value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')} style={input}>
        <option value="">Unclear</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </div>
  )
}

const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, overflow: 'hidden' }
const primaryBtn = { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }
const secondaryBtn = { background: '#f3f4f6', color: '#111827', border: 'none', borderRadius: 12, padding: '12px 16px', cursor: 'pointer' }
const smallBtn = { background: '#ecfdf5', color: '#065f46', border: 'none', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }
const neutralBtn = { background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }
const accentBtn = { background: '#f5f3ff', color: '#6d28d9', border: 'none', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }
const dangerBtn = { background: '#fef2f2', color: '#991b1b', border: 'none', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }
const th = { textAlign: 'left', fontSize: 12, textTransform: 'uppercase', color: '#6b7280', padding: '12px 20px' }
const td = { padding: '16px 20px', fontSize: 14 }
const input = { width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: 12 }
const textarea = { width: '100%', minHeight: 100, border: '1px solid #d1d5db', borderRadius: 12, padding: 12 }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150 }
const modal = { width: 'min(720px, 92vw)', background: '#fff', borderRadius: 16, overflow: 'hidden' }
const editModal = { width: 'min(920px, 94vw)', background: '#fff', borderRadius: 16, overflow: 'hidden' }
const modalHeader = { padding: 20, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const modalFooter = { padding: 20, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: 12 }
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }
const label = { fontSize: 13, fontWeight: 600, marginBottom: 6, textTransform: 'capitalize' }
const checkboxCard = { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }
const statusPill = () => ({ display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#f3f4f6', color: '#374151', fontSize: 12, textTransform: 'capitalize' })

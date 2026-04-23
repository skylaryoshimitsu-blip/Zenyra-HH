import React, { useMemo, useState } from 'react'
import { X, CheckCircle } from 'lucide-react'

const OUTCOME_GROUPS = [
  {
    group: 'Sale',
    options: [
      { value: 'sold', label: 'Sold' },
      { value: 'application_started', label: 'Application Started' },
    ],
  },
  {
    group: 'Recoverable',
    options: [
      { value: 'callback_requested', label: 'Callback Requested' },
      { value: 'needs_information', label: 'Needs Information' },
      { value: 'reviewing_with_family', label: 'Reviewing With Family' },
    ],
  },
  {
    group: 'Not Recoverable',
    options: [
      { value: 'not_interested', label: 'Not Interested' },
      { value: 'premium_too_high', label: 'Premium Too High' },
      { value: 'not_eligible', label: 'Not Eligible' },
      { value: 'do_not_contact', label: 'Do Not Contact' },
    ],
  },
  {
    group: 'Contact Issues',
    options: [
      { value: 'no_answer', label: 'No Answer' },
      { value: 'voicemail_left', label: 'Voicemail Left' },
      { value: 'wrong_number', label: 'Wrong Number' },
    ],
  },
]

const LOSS_REASONS = [
  'No clear need uncovered',
  'Prospect felt adequately covered',
  'Could not afford premium',
  'Price objection not overcome',
  'Prospect not decision-ready',
  'No trust / low engagement',
  'Weak qualification',
  'Product mismatch',
  'Call ended before recommendation',
  'Follow-up needed',
  'Non-responsive / disconnected',
  'Compliance / process interruption',
]

const OBJECTION_OPTIONS = [
  'no_perceived_need',
  'already_covered',
  'too_expensive',
  'wants_to_think',
  'family_decision',
  'distrust',
  'bad_timing',
  'does_not_understand_product',
  'does_not_want_recurring_payment',
  'fear_of_change',
  'happy_with_current_plan',
  'confused_or_overloaded',
]

const BREAKDOWN_POINTS = [
  'opening',
  'trust_compliance',
  'eligibility_confirmation',
  'current_coverage_exploration',
  'pain_discovery',
  'affordability_discovery',
  'transition_to_recommendation',
  'pricing_presentation',
  'objection_handling',
  'trial_close',
  'close_ask',
  'follow_up_setup',
]

const PAGE_TITLES = {
  1: 'Disposition Information',
  2: 'Diagnostic Cause Tracking',
  3: 'Qualification + Momentum',
  4: 'Call Execution',
}

function titleize(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

export default function HomeHealthDispositionModal({ lead, onClose, onSave, diagnosticDefaults = {} }) {
  const [page, setPage] = useState(1)
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [followedScript, setFollowedScript] = useState('yes')
  const [zenyraHelped, setZenyraHelped] = useState(true)
  const [primaryLossReason, setPrimaryLossReason] = useState(diagnosticDefaults.primaryLossReason || '')
  const [secondaryLossReason, setSecondaryLossReason] = useState(diagnosticDefaults.secondaryLossReason || '')
  const [primaryObjection, setPrimaryObjection] = useState(diagnosticDefaults.primaryObjection || '')
  const [secondaryObjection, setSecondaryObjection] = useState(diagnosticDefaults.secondaryObjection || '')
  const [breakdownPoint, setBreakdownPoint] = useState(diagnosticDefaults.breakdownPoint || '')
  const [objectionHandledEffectively, setObjectionHandledEffectively] = useState(diagnosticDefaults.objectionHandledEffectively || 'partial')
  const [adminQualified, setAdminQualified] = useState(diagnosticDefaults.adminQualified ?? lead?.adminQualified ?? null)
  const [salesQualified, setSalesQualified] = useState(diagnosticDefaults.salesQualified ?? lead?.salesQualified ?? null)
  const [problemAcknowledged, setProblemAcknowledged] = useState(diagnosticDefaults.problemAcknowledged ?? lead?.problemAcknowledged ?? false)
  const [emotionalPainExpressed, setEmotionalPainExpressed] = useState(diagnosticDefaults.emotionalPainExpressed ?? lead?.emotionalPainExpressed ?? false)
  const [urgencyPresent, setUrgencyPresent] = useState(diagnosticDefaults.urgencyPresent ?? lead?.urgencyPresent ?? false)
  const [affordabilityConfirmed, setAffordabilityConfirmed] = useState(diagnosticDefaults.affordabilityConfirmed ?? lead?.affordabilityConfirmed ?? false)
  const [recommendationReached, setRecommendationReached] = useState(diagnosticDefaults.recommendationReached ?? lead?.recommendationReached ?? false)
  const [trialCloseAttempted, setTrialCloseAttempted] = useState(diagnosticDefaults.trialCloseAttempted ?? lead?.trialCloseAttempted ?? false)
  const [buyingSignalsPresent, setBuyingSignalsPresent] = useState(diagnosticDefaults.buyingSignalsPresent ?? lead?.buyingSignalsPresent ?? false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const canSave = useMemo(() => Boolean(outcome), [outcome])

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave?.({
        leadId: lead?.id,
        leadName: lead?.full_name || 'Lead',
        outcome,
        notes,
        followedScript,
        zenyraHelped,
        score: lead?.score ?? 0,
        scoreBand: lead?.scoreBand ?? '',
        qualified: lead?.qualified ?? null,
        disqualificationReason: lead?.disqualificationReason ?? '',
        primaryLossReason,
        secondaryLossReason,
        primaryObjection,
        secondaryObjection,
        breakdownPoint,
        objectionHandledEffectively,
        adminQualified,
        salesQualified,
        problemAcknowledged,
        emotionalPainExpressed,
        urgencyPresent,
        affordabilityConfirmed,
        recommendationReached,
        trialCloseAttempted,
        buyingSignalsPresent,
        callMomentumScore: lead?.callMomentumScore ?? 0,
        painScore: lead?.painScore ?? 0,
        salesReadinessScore: lead?.salesReadinessScore ?? 0,
        objectionRiskScore: lead?.objectionRiskScore ?? 0,
        likelyRootCause: lead?.likelyRootCause ?? '',
        created_at: new Date().toISOString(),
      })
      setSaved(true)
      setTimeout(() => onClose?.(), 700)
    } catch (err) {
      console.error('Failed to save disposition:', err)
      alert('Something went wrong saving the outcome. Please try again.')
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div style={overlay}>
        <div style={modalSmall}>
          <CheckCircle size={40} color="#16a34a" />
          <h3 style={{ margin: '12px 0 4px' }}>Outcome Logged</h3>
        </div>
      </div>
    )
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <div>
            <h2 style={{ margin: 0 }}>Log Outcome</h2>
            <p style={{ margin: '4px 0 0', color: '#6b7280' }}>{lead?.full_name || 'Lead'}</p>
          </div>
          <button onClick={onClose} style={iconButton}><X size={20} /></button>
        </div>

        <div style={stepHeader}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
            Page {page} of 4
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{PAGE_TITLES[page]}</div>
        </div>

        <div style={{ padding: 24, overflowY: 'auto' }}>
          {page === 1 && (
            <>
              {OUTCOME_GROUPS.map((group) => (
                <div key={group.group} style={{ marginBottom: 18 }}>
                  <div style={groupLabel}>{group.group}</div>
                  <div style={grid2}>
                    {group.options.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setOutcome(option.value)}
                        style={{
                          ...selectCard,
                          borderColor: outcome === option.value ? '#7c3aed' : '#e5e7eb',
                          background: outcome === option.value ? '#f5f3ff' : '#fff',
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div>
                <div style={fieldLabel}>Notes</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={textarea}
                  placeholder="Add any call notes here…"
                />
              </div>
            </>
          )}

          {page === 2 && (
            <>
              <div style={sectionTitle}>Diagnostic Cause Tracking</div>
              <div style={grid2}>
                <SelectField label="Primary Loss Reason" value={primaryLossReason} onChange={setPrimaryLossReason} options={LOSS_REASONS} />
                <SelectField label="Secondary Loss Reason" value={secondaryLossReason} onChange={setSecondaryLossReason} options={LOSS_REASONS} />
                <SelectField label="Primary Objection" value={primaryObjection} onChange={setPrimaryObjection} options={OBJECTION_OPTIONS.map(titleize)} optionValues={OBJECTION_OPTIONS} />
                <SelectField label="Secondary Objection" value={secondaryObjection} onChange={setSecondaryObjection} options={OBJECTION_OPTIONS.map(titleize)} optionValues={OBJECTION_OPTIONS} />
                <SelectField label="Breakdown Point" value={breakdownPoint} onChange={setBreakdownPoint} options={BREAKDOWN_POINTS.map(titleize)} optionValues={BREAKDOWN_POINTS} />
                <SelectField label="Objection Handling" value={objectionHandledEffectively} onChange={setObjectionHandledEffectively} options={['yes', 'partial', 'no']} />
              </div>
            </>
          )}

          {page === 3 && (
            <>
              <div style={sectionTitle}>Qualification + Momentum</div>
              <div style={grid2}>
                <BooleanField label="Administrative Qualified" value={adminQualified} onChange={setAdminQualified} />
                <BooleanField label="Sales Qualified" value={salesQualified} onChange={setSalesQualified} />
                <BooleanField label="Problem Acknowledged" value={problemAcknowledged} onChange={setProblemAcknowledged} />
                <BooleanField label="Emotional Pain Expressed" value={emotionalPainExpressed} onChange={setEmotionalPainExpressed} />
                <BooleanField label="Urgency Present" value={urgencyPresent} onChange={setUrgencyPresent} />
                <BooleanField label="Affordability Confirmed" value={affordabilityConfirmed} onChange={setAffordabilityConfirmed} />
                <BooleanField label="Recommendation Reached" value={recommendationReached} onChange={setRecommendationReached} />
                <BooleanField label="Trial Close Attempted" value={trialCloseAttempted} onChange={setTrialCloseAttempted} />
                <BooleanField label="Buying Signals Present" value={buyingSignalsPresent} onChange={setBuyingSignalsPresent} />
              </div>
            </>
          )}

          {page === 4 && (
            <>
              <div style={sectionTitle}>Call Execution</div>
              <div style={{ marginBottom: 16 }}>
                <div style={fieldLabel}>Did you follow the script?</div>
                <div style={grid3}>
                  {['yes', 'partial', 'no'].map((v) => (
                    <button
                      key={v}
                      onClick={() => setFollowedScript(v)}
                      style={{ ...selectCard, borderColor: followedScript === v ? '#7c3aed' : '#e5e7eb' }}
                    >
                      {titleize(v)}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={fieldLabel}>Did Zenyra Home Health help?</div>
                <div style={grid2}>
                  <button
                    onClick={() => setZenyraHelped(true)}
                    style={{ ...selectCard, borderColor: zenyraHelped === true ? '#7c3aed' : '#e5e7eb' }}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setZenyraHelped(false)}
                    style={{ ...selectCard, borderColor: zenyraHelped === false ? '#7c3aed' : '#e5e7eb' }}
                  >
                    No
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={footer}>
          <button onClick={onClose} style={secondaryBtn} disabled={saving}>Cancel</button>
          <div style={{ display: 'flex', gap: 12 }}>
            {page > 1 && (
              <button onClick={() => setPage((prev) => prev - 1)} style={secondaryBtn} disabled={saving}>Back</button>
            )}
            {page < 4 ? (
              <button onClick={() => setPage((prev) => prev + 1)} style={primaryBtn}>
                Next
              </button>
            ) : (
              <button onClick={handleSave} style={{ ...primaryBtn, opacity: (!canSave || saving) ? 0.6 : 1 }} disabled={!canSave || saving}>
                {saving ? 'Saving…' : 'Save Outcome'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SelectField({ label, value, onChange, options = [], optionValues }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={fieldLabel}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectInput}>
        <option value="">Select</option>
        {options.map((option, index) => (
          <option key={`${option}-${index}`} value={optionValues ? optionValues[index] : option}>{option}</option>
        ))}
      </select>
    </div>
  )
}

function BooleanField({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={fieldLabel}>{label}</div>
      <div style={grid3}>
        <button onClick={() => onChange(true)} style={{ ...selectCard, borderColor: value === true ? '#7c3aed' : '#e5e7eb' }}>Yes</button>
        <button onClick={() => onChange(false)} style={{ ...selectCard, borderColor: value === false ? '#7c3aed' : '#e5e7eb' }}>No</button>
        <button onClick={() => onChange(null)} style={{ ...selectCard, borderColor: value === null ? '#7c3aed' : '#e5e7eb' }}>Unclear</button>
      </div>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }
const modal = { width: 'min(980px, 95vw)', maxHeight: '92vh', background: '#fff', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
const modalSmall = { background: '#fff', borderRadius: 16, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center' }
const header = { padding: 20, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const stepHeader = { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#fafafa' }
const footer = { padding: 20, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: 12 }
const groupLabel = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#6b7280', marginBottom: 10 }
const selectCard = { border: '2px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff', cursor: 'pointer', textAlign: 'left' }
const selectInput = { width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: 12, background: '#fff' }
const primaryBtn = { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', cursor: 'pointer' }
const secondaryBtn = { background: '#f3f4f6', color: '#111827', border: 'none', borderRadius: 10, padding: '12px 16px', cursor: 'pointer' }
const iconButton = { background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }
const textarea = { width: '100%', minHeight: 96, border: '1px solid #d1d5db', borderRadius: 12, padding: 12 }
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }
const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }
const fieldLabel = { fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }
const sectionTitle = { margin: '0 0 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#6b7280' }

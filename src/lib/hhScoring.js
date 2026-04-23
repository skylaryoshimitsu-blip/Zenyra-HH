// hhScoring.js — aligned to v3.0 plate structure field names

export function scoreHomeHealthSession(session = {}) {
  const adlSelections = session.adls || {}
  const adlCount = Object.values(adlSelections).filter(Boolean).length

  // Knockout conditions
  const knockoutReason =
    session.currentlyInNursingHome        ? 'Currently in nursing home' :
    session.currentlyReceivingHomeHealth  ? 'Currently receiving home health care' :
    adlCount >= 2                         ? '2 or more ADLs selected' :
    session.memoryConditionLast12Months   ? 'Memory condition in last 12 months' :
    null

  if (knockoutReason) {
    return {
      scoreTotal: 0,
      scoreBand: 'Disqualify',
      recommendedOptionKey: null,
      disqualificationReason: knockoutReason,
      qualified: false,
    }
  }

  let score = 0

  // Plate 1
  if (session.willingnessToAdvance === true) score += 15

  // Plate 2 — Discovery (updated field names)
  if (session.lastHospitalization === 'within_1yr') score += 15
  if (session.lastHospitalization === '1_3yrs')     score += 8
  if (session.ambulancePast5Yrs === true)           score += 12
  if (session.currentlyReceivingHomeHelp === true)  score += 12
  if (session.carePreference === 'home')            score += 8
  if (session.carePreference === 'facility' || session.carePreference === 'unsure') score += 3

  // Plate 3 — Medications
  const medCount = (session.medications || []).length
  if (medCount >= 3) score += 12
  else if (medCount >= 1) score += 5

  // Plate 4 — Medicare
  if (session.hasPartA && session.hasPartB) score += 8
  if (session.hasMedicaid === true)         score += 5

  // Plate 5 — Plan Review (data captured = gaps surfaced)
  if (session.ambulanceCopay)   score += 3
  if (session.homeHealthCost)   score += 3

  // Plate 6 — Value Framing
  if (session.openToProtectionOptions === true)  score += 15
  if (session.openToProtectionOptions === false) score -= 12
  if (session.financialImpactStatement)          score += 5

  // Plate 7 — Qualification
  if (session.qualified === true) score += 12
  if (adlCount === 1)             score += 5

  // Plate 9 — Option selected
  if (session.selectedOptionKey === 'c') score += 15
  if (session.selectedOptionKey === 'b') score += 10
  if (session.selectedOptionKey === 'a') score += 6

  // Verification signals (advisory only — minor boost if confirmed)
  if (session.mbiVerified || session.ssnVerified) score += 3

  score = Math.min(100, Math.max(0, score))

  const recommendedOptionKey = score >= 75 ? 'c' : score >= 50 ? 'b' : 'a'
  const scoreBand =
    score >= 75 ? 'High Opportunity' :
    score >= 50 ? 'Medium Opportunity' :
    score >= 25 ? 'Low Opportunity' : 'Poor Fit'

  return {
    scoreTotal: score,
    scoreBand,
    recommendedOptionKey,
    disqualificationReason: null,
    qualified: null,
  }
}

export function buildDiagnosticSnapshot(session = {}, score = {}) {
  const plateProgress = session.plateProgress || {}
  const recommendationReached  = Boolean(plateProgress.plate9 || session.selectedOptionKey)
  const trialCloseAttempted    = Boolean(plateProgress.plate10 || session.trialCloseAttempted)
  const problemAcknowledged    = Boolean(session.financialImpactStatement || session.homeCareBurdenConfirmed || session.problemAcknowledged)
  const emotionalPainExpressed = Boolean(session.financialImpactStatement || session.homeCareBurdenConfirmed || session.emotionalPainExpressed)
  const urgencyPresent         = Boolean(session.urgencyPresent || session.openToProtectionOptions)
  const affordabilityConfirmed = Boolean(session.affordabilityConfirmed)
  const buyingSignalsPresent   = Boolean(session.buyingSignalsPresent || session.selectedOptionKey)
  const adminQualified         = Boolean(session.hasPartA && session.hasPartB)
  const salesQualified         = Boolean(problemAcknowledged && urgencyPresent && affordabilityConfirmed)

  const objectionRiskScore = [
    !problemAcknowledged,
    !urgencyPresent,
    !affordabilityConfirmed,
    !buyingSignalsPresent,
    Boolean(score?.disqualificationReason),
  ].filter(Boolean).length * 20

  const painScore = Math.min(100,
    [problemAcknowledged, emotionalPainExpressed, urgencyPresent].filter(Boolean).length * 33 +
    (emotionalPainExpressed ? 1 : 0)
  )
  const salesReadinessScore = [adminQualified, salesQualified, buyingSignalsPresent, recommendationReached].filter(Boolean).length * 25
  const callMomentumScore   = [problemAcknowledged, urgencyPresent, buyingSignalsPresent, recommendationReached, trialCloseAttempted].filter(Boolean).length * 20

  return {
    adminQualified,
    salesQualified,
    problemAcknowledged,
    emotionalPainExpressed,
    urgencyPresent,
    affordabilityConfirmed,
    recommendationReached,
    trialCloseAttempted,
    buyingSignalsPresent,
    callMomentumScore,
    painScore,
    salesReadinessScore,
    objectionRiskScore: Math.min(100, objectionRiskScore),
  }
}

export function deriveLikelyRootCause({ score, diagnostics, primaryObjection, primaryLossReason, outcome }) {
  if (score?.disqualificationReason)                                                  return 'Administrative/product disqualification'
  if (primaryLossReason)                                                              return primaryLossReason
  if (primaryObjection === 'too_expensive' && !diagnostics?.affordabilityConfirmed)  return 'Affordability not established before pricing'
  if (diagnostics?.problemAcknowledged && !diagnostics?.emotionalPainExpressed)      return 'Insufficient pain development'
  if (!diagnostics?.problemAcknowledged)                                             return 'No clear need uncovered'
  if (diagnostics?.problemAcknowledged && !diagnostics?.urgencyPresent)              return 'Need identified without urgency'
  if (diagnostics?.salesQualified === false && diagnostics?.adminQualified === true)  return 'Administratively qualified but not sales-qualified'
  if (diagnostics?.recommendationReached && !diagnostics?.trialCloseAttempted)       return 'Weak transition from recommendation to close'
  if (String(outcome || '').toLowerCase() === 'not_interested')                      return 'Low intent / passive engagement'
  return 'General conversion breakdown'
}

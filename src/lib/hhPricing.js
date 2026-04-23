const DRUG_VALUES = { brand: 25, generic: 10 }

const OPTION_META = {
  b: {
    code: 'b',
    label: 'Option 1',
    benefitAmount: 100000,
    reimbursementCap: 600,
    caregiverBenefit: 3500,
    hospitalCopayCoverage: 'Fully covered',
    homeHealthLabel: '$100,000 total benefit',
    homeHealthDetail: 'Covers full cost with no coinsurance, copays, or out-of-pocket expenses',
    durationLabel: 'Can last up to ~2 years depending on usage',
    resetLabel: 'If unused for 180 days, the full benefit resets',
  },
  a: {
    code: 'a',
    label: 'Option 2',
    benefitAmount: 50000,
    reimbursementCap: 300,
    caregiverBenefit: 3500,
    hospitalCopayCoverage: 'Fully covered',
    homeHealthLabel: '$50,000 total benefit',
    homeHealthDetail: 'About 1 year of care depending on usage',
    durationLabel: 'Reduced benefit versus Option 1',
    resetLabel: '',
  },
}

export function getDrugReimbursementValue(drugs = []) {
  return drugs.reduce((sum, drug) => sum + (DRUG_VALUES[drug.type] || 0), 0)
}

export function calculateHomeHealthOptions(drugs = [], premiums = {}) {
  const monthlyDrugReimbursement = getDrugReimbursementValue(drugs)

  return ['b', 'a'].map((key) => {
    const option = OPTION_META[key]
    const enteredMonthlyPremium = Number(premiums[key] || 0)
    const annualPremiumCost = enteredMonthlyPremium * 12
    const annualReimbursementValue = Math.min(monthlyDrugReimbursement * 12, option.reimbursementCap)
    const appliedReimbursement = annualReimbursementValue
    const effectiveMonthlyCost = enteredMonthlyPremium - monthlyDrugReimbursement
    const effectiveAnnualCost = annualPremiumCost - annualReimbursementValue

    return {
      ...option,
      enteredMonthlyPremium,
      annualPremiumCost,
      monthlyDrugReimbursement,
      annualReimbursementValue,
      appliedReimbursement,
      effectiveMonthlyCost,
      effectiveAnnualCost,
    }
  })
}

import { hhDrugReference } from '../data/hhDrugReference'
import { supabase } from './supabaseClient'

export async function searchDrugs(query) {
  const term = String(query || '').trim()
  if (term.length < 2) return []

  if (supabase) {
    const { data, error } = await supabase
      .from('hh_drug_reference')
      .select('drug_name, drug_type')
      .ilike('drug_name', `%${term}%`)
      .limit(8)

    if (!error && Array.isArray(data)) {
      return data.map((row) => ({ name: row.drug_name, type: row.drug_type }))
    }
  }

  return hhDrugReference.filter((drug) => drug.name.toLowerCase().includes(term.toLowerCase())).slice(0, 8)
}

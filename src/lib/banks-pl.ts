// Polish banks written short, with the full name in the six cases (nominative, genitive, dative, accusative, instrumental, locative) and the gender of the name:
// "ING BSK" is the ING Bank Śląski, so "zysk ING BSK" is "zysk ING Banku Śląskiego" and "w ING BSK" "w ING Banku Śląskim" (say.ts, sayInstitutions, which reads this list
// beside institutions-eu.ts and central-banks.ts). The "ING" in the name is said as letters by the names of names-firms.ts ("I En Gie"), also where the bank is written
// in full ("ING Banku Śląskiego").
import type { EuGender } from './institutions-eu'
export const POLISH_BANKS: readonly (readonly [abbreviations: readonly string[], forms: readonly [string, string, string, string, string, string], gender: EuGender, guard?: string])[] = [
  [['ING BSK'], ['ING Bank Śląski', 'ING Banku Śląskiego', 'ING Bankowi Śląskiemu', 'ING Bank Śląski', 'ING Bankiem Śląskim', 'ING Banku Śląskim'], 'm'],
]

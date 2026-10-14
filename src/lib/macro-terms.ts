// Terms of the macro data that Polish news writes short, with the full name in the six cases (nominative, genitive, dative, accusative, instrumental, locative), the gender of
// the name and the guard that says where the letters mean the term: "Deficyt C - A" is "Deficyt rachunku bieżącego" (the current account of the balance of payments, which
// the NBP and the news write "C-A", "C - A" or "C/A"; said as letters with the dash a voice stops between them: "ce, a"). Read by say.ts (sayInstitutions) beside
// institutions-eu.ts, central-banks.ts and banks-pl.ts. The guard is the words that must stand round the letters (the balance, the deficit, the NBP…) and those that must not.
import type { EuGender } from './institutions-eu'
export const MACRO_TERMS: readonly (readonly [abbreviations: readonly string[], forms: readonly [string, string, string, string, string, string], gender: EuGender, guard?: string])[] = [
  [['C-A', 'C - A', 'C–A', 'C – A', 'C/A'], ['rachunek bieżący', 'rachunku bieżącego', 'rachunkowi bieżącemu', 'rachunek bieżący', 'rachunkiem bieżącym', 'rachunku bieżącym'], 'm', 'C-A'],
]
export const MACRO_GUARDS: Record<string, { need?: string; no?: string; number?: boolean; before?: string }> = {
  'C-A': { need: 'deficyt|nadwy[żz]k|saldo|bilans|płatnicz|NBP|rachun|PKB|konsensus|eksport|import|obrotów|mln\\s+euro|mld\\s+euro', no: 'witamin' },
}

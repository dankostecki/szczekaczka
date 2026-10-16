// Names and abbreviations of exchanges, regulators, reports, indices and instruments of world markets as a Polish voice should say them (say.ts, sayUsNames,
// which reads this list beside names-us.ts and names-firms.ts): the written form, how it is said the English way (written with Polish letters), whether
// Polish headlines decline it, and, for a name that means something else without a word near it, a condition: the sentence must have one of those words (a
// regular expression, any case). Letters are named as an English speaker names them (C "si", E "i", X "eks"); an abbreviation in letters never takes
// endings. The respellings were put together without hearing them: a name that sounds wrong is changed here.
export const MARKET_NAMES: readonly (readonly [written: string, said: string, inflects: boolean, needs?: string])[] = []

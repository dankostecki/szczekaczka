// Names of companies and institutions of the United States as a Polish voice should say them (say.ts, sayUsNames): the written form, how it is said
// (the English way, written with Polish letters), and whether Polish headlines decline it ("kurs Nvidii", "od Microsoftu").
export const US_NAMES: readonly (readonly [written: string, said: string, inflects: boolean])[] = [
  ['JPMorgan Chase', 'Dżej Pi Morgan Czejs', false],
  ['JPMorgan', 'Dżej Pi Morgan', true],
  ['Nvidia', 'Enwidia', true],
]

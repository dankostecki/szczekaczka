// Seed: replaced by the full table
export type TitleKind = 'n' | 'a' | 'i'
export const TITLES: readonly (readonly [abbreviations: readonly string[], kind: TitleKind, forms: readonly [string, string, string, string, string]])[] = [
  [['prof.', 'prof'], 'n', ['profesor', 'profesora', 'profesorowi', 'profesorem', 'profesorze']],
  [['dr', 'dr.', 'dra'], 'n', ['doktor', 'doktora', 'doktorowi', 'doktorem', 'doktorze']],
  [['hab.', 'hab'], 'a', ['habilitowany', 'habilitowanego', 'habilitowanemu', 'habilitowanym', 'habilitowanym']],
  [['mgr', 'mgr.'], 'n', ['magister', 'magistra', 'magistrowi', 'magistrem', 'magistrze']],
  [['inż.', 'inż'], 'n', ['inżynier', 'inżyniera', 'inżynierowi', 'inżynierem', 'inżynierze']],
  [['ks.', 'ks'], 'n', ['ksiądz', 'księdza', 'księdzu', 'księdzem', 'księdzu']],
  [['płk', 'płk.'], 'n', ['pułkownik', 'pułkownika', 'pułkownikowi', 'pułkownikiem', 'pułkowniku']],
]
export const FEMININE_NAMES: readonly string[] = ['Anna', 'Maria', 'Ewa', 'Katarzyna']

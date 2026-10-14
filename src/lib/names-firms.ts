// Names of audit, consulting, research and law firms as a Polish voice should say them (say.ts, sayUsNames, which reads this list beside names-us.ts): the
// written form, how it is said (the English way, written with Polish letters; the letters of an abbreviation one by one, as Polish financial newsreaders
// say them) and whether Polish headlines decline the name ("raportu Deloitte'a"). "&" is said "end", as in names-us.ts. Names whose plain Polish reading is
// already right (Mazars, Kroll, Dentons, Gartner, Roland Berger) are not here. The respellings were put together without hearing them: a name that sounds
// wrong is changed here.
export const FIRM_NAMES: readonly (readonly [written: string, said: string, inflects: boolean])[] = [
  // the Big Four
  ['Ernst & Young', 'Ernst end Jang', false],
  ['Ernst&Young', 'Ernst end Jang', false],
  ['Ernst and Young', 'Ernst end Jang', false],
  ['EY', 'Ernst end Jang', false],
  ['PricewaterhouseCoopers', 'Prajswoterhałskupers', false],
  ['Pricewaterhouse Coopers', 'Prajswoterhałskupers', false],
  ['Price Waterhouse Coopers', 'Prajswoterhałskupers', false],
  ['PwC', 'Prajswoterhałskupers', false],
  ['PWC', 'Prajswoterhałskupers', false],
  ['Deloitte Touche Tohmatsu', 'Dilojt Tusz Tomatsu', false],
  ['Deloitte', 'Dilojt', true],
  ['KPMG', 'Ka Pe Em Gie', false],
  ['Big Four', 'Big For', false],
  ['Big 4', 'Big For', false],
  ['Big4', 'Big For', false],
  ['Arthur Andersen', 'Artur Anderson', false],
  // audit and accounting beyond the four
  ['BDO', 'Be De O', false],
  ['RSM', 'Er Es Em', false],
  ['Grant Thornton', 'Grant Tornton', false],
  ['Baker Tilly', 'Bejker Tili', false],
  ['Crowe', 'Krou', false],
  // consulting and research
  ['McKinsey', 'Makkinzi', false],
  ['Boston Consulting Group', 'Boston Konsalting Grup', false],
  ['BCG', 'Be Ce Gie', false],
  ['Bain', 'Bejn', false],
  ['Oliver Wyman', 'Oliwer Łajman', false],
  ['Capgemini', 'Kapżemini', false],
  ['Cognizant', 'Kognizant', false],
  ['IDC', 'Aj Di Si', false],
  ['GfK', 'Ge Ef Ka', false],
  // law firms
  ['Baker McKenzie', 'Bejker Makenzi', false],
  ['DLA Piper', 'Di El Ej Pajper', false],
  ['Clifford Chance', 'Klifford Czans', false],
  ['Allen & Overy', 'Alen end Ouwery', false],
  ['Linklaters', 'Linklejters', false],
  ['White & Case', 'Łajt end Kejs', false],
]

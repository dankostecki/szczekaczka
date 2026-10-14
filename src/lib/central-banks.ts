// Central banks: their abbreviations as Polish markets news writes them (BoJ, BoE, BoC, SNB, RBA, MNB, ČNB...), the full Polish name in the six cases and a guard where
// the same letters mean something else (BOE: barrels of oil equivalent; BOC: Bank of China; BOK: Biuro Obsługi Klienta; RBI: Raiffeisen Bank International; BIS: the US
// Bureau of Industry and Security). say.ts (sayInstitutions) says the name in the case the sentence needs: "decyzja BoJ" is "decyzja Banku Japonii", "szef BoJ" "szef Banku
// Japonii", "w BoE" "w Banku Anglii". The Fed, the Bundesbank, the Riksbank and Norges Bank are said as they are (they decline as words), and NBP and RPP, which everybody spells
// as letters, stay abbreviations. Collected by agents from the Polish names in use; the full tables are in docs/banki-centralne.md.
import type { EuGender } from './institutions-eu'
export const CENTRAL_BANKS: readonly (readonly [abbreviations: readonly string[], forms: readonly [string, string, string, string, string, string], gender: EuGender, guard?: string])[] = [
  [['BoJ'], ['Bank Japonii', 'Banku Japonii', 'Bankowi Japonii', 'Bank Japonii', 'Bankiem Japonii', 'Banku Japonii'], 'm'],
  [['BOJ'], ['Bank Japonii', 'Banku Japonii', 'Bankowi Japonii', 'Bank Japonii', 'Bankiem Japonii', 'Banku Japonii'], 'm'],
  [['BoE'], ['Bank Anglii', 'Banku Anglii', 'Bankowi Anglii', 'Bank Anglii', 'Bankiem Anglii', 'Banku Anglii'], 'm'],
  [['BOE'], ['Bank Anglii', 'Banku Anglii', 'Bankowi Anglii', 'Bank Anglii', 'Bankiem Anglii', 'Banku Anglii'], 'm', 'BOE'],
  [['BoC'], ['Bank Kanady', 'Banku Kanady', 'Bankowi Kanady', 'Bank Kanady', 'Bankiem Kanady', 'Banku Kanady'], 'm', 'BoC'],
  [['BOC'], ['Bank Kanady', 'Banku Kanady', 'Bankowi Kanady', 'Bank Kanady', 'Bankiem Kanady', 'Banku Kanady'], 'm', 'BOC'],
  [['SNB'], ['Szwajcarski Bank Narodowy', 'Szwajcarskiego Banku Narodowego', 'Szwajcarskiemu Bankowi Narodowemu', 'Szwajcarski Bank Narodowy', 'Szwajcarskim Bankiem Narodowym', 'Szwajcarskim Banku Narodowym'], 'm', 'SNB'],
  [['RBA'], ['Rezerwowy Bank Australii', 'Rezerwowego Banku Australii', 'Rezerwowemu Bankowi Australii', 'Rezerwowy Bank Australii', 'Rezerwowym Bankiem Australii', 'Rezerwowym Banku Australii'], 'm', 'RBA'],
  [['RBNZ'], ['Rezerwowy Bank Nowej Zelandii', 'Rezerwowego Banku Nowej Zelandii', 'Rezerwowemu Bankowi Nowej Zelandii', 'Rezerwowy Bank Nowej Zelandii', 'Rezerwowym Bankiem Nowej Zelandii', 'Rezerwowym Banku Nowej Zelandii'], 'm'],
  [['PBoC', 'PBOC'], ['Ludowy Bank Chin', 'Ludowego Banku Chin', 'Ludowemu Bankowi Chin', 'Ludowy Bank Chin', 'Ludowym Bankiem Chin', 'Ludowym Banku Chin'], 'm'],
  [['BoK'], ['Bank Korei', 'Banku Korei', 'Bankowi Korei', 'Bank Korei', 'Bankiem Korei', 'Banku Korei'], 'm'],
  [['BOK'], ['Bank Korei', 'Banku Korei', 'Bankowi Korei', 'Bank Korei', 'Bankiem Korei', 'Banku Korei'], 'm', 'BOK'],
  [['RBI'], ['Rezerwowy Bank Indii', 'Rezerwowego Banku Indii', 'Rezerwowemu Bankowi Indii', 'Rezerwowy Bank Indii', 'Rezerwowym Bankiem Indii', 'Rezerwowym Banku Indii'], 'm', 'RBI'],
  [['MPC'], ['Komitet Polityki Pieniężnej', 'Komitetu Polityki Pieniężnej', 'Komitetowi Polityki Pieniężnej', 'Komitet Polityki Pieniężnej', 'Komitetem Polityki Pieniężnej', 'Komitecie Polityki Pieniężnej'], 'm', 'MPC'],
  [['BIS'], ['Bank Rozrachunków Międzynarodowych', 'Banku Rozrachunków Międzynarodowych', 'Bankowi Rozrachunków Międzynarodowych', 'Bank Rozrachunków Międzynarodowych', 'Bankiem Rozrachunków Międzynarodowych', 'Banku Rozrachunków Międzynarodowych'], 'm', 'BIS'],
  [['BRM'], ['Bank Rozrachunków Międzynarodowych', 'Banku Rozrachunków Międzynarodowych', 'Bankowi Rozrachunków Międzynarodowych', 'Bank Rozrachunków Międzynarodowych', 'Bankiem Rozrachunków Międzynarodowych', 'Banku Rozrachunków Międzynarodowych'], 'm'],
  [['MNB'], ['Węgierski Bank Narodowy', 'Węgierskiego Banku Narodowego', 'Węgierskiemu Bankowi Narodowemu', 'Węgierski Bank Narodowy', 'Węgierskim Bankiem Narodowym', 'Węgierskim Banku Narodowym'], 'm'],
  [['ČNB'], ['Czeski Bank Narodowy', 'Czeskiego Banku Narodowego', 'Czeskiemu Bankowi Narodowemu', 'Czeski Bank Narodowy', 'Czeskim Bankiem Narodowym', 'Czeskim Banku Narodowym'], 'm'],
  [['CNB'], ['Czeski Bank Narodowy', 'Czeskiego Banku Narodowego', 'Czeskiemu Bankowi Narodowemu', 'Czeski Bank Narodowy', 'Czeskim Bankiem Narodowym', 'Czeskim Banku Narodowym'], 'm', 'CNB'],
  [['NBU'], ['Narodowy Bank Ukrainy', 'Narodowego Banku Ukrainy', 'Narodowemu Bankowi Ukrainy', 'Narodowy Bank Ukrainy', 'Narodowym Bankiem Ukrainy', 'Narodowym Banku Ukrainy'], 'm', 'NBU'],
  [['CBR'], ['Bank Rosji', 'Banku Rosji', 'Bankowi Rosji', 'Bank Rosji', 'Bankiem Rosji', 'Banku Rosji'], 'm', 'CBR'],
  [['TCMB'], ['Bank Centralny Turcji', 'Banku Centralnego Turcji', 'Bankowi Centralnemu Turcji', 'Bank Centralny Turcji', 'Bankiem Centralnym Turcji', 'Banku Centralnym Turcji'], 'm'],
  [['CBRT'], ['Bank Centralny Turcji', 'Banku Centralnego Turcji', 'Bankowi Centralnemu Turcji', 'Bank Centralny Turcji', 'Bankiem Centralnym Turcji', 'Banku Centralnym Turcji'], 'm'],
  [['SARB'], ['Południowoafrykański Bank Rezerw', 'Południowoafrykańskiego Banku Rezerw', 'Południowoafrykańskiemu Bankowi Rezerw', 'Południowoafrykański Bank Rezerw', 'Południowoafrykańskim Bankiem Rezerw', 'Południowoafrykańskim Banku Rezerw'], 'm'],
  [['BCB'], ['Bank Centralny Brazylii', 'Banku Centralnego Brazylii', 'Bankowi Centralnemu Brazylii', 'Bank Centralny Brazylii', 'Bankiem Centralnym Brazylii', 'Banku Centralnym Brazylii'], 'm', 'BCB'],
  [['Banxico', 'BANXICO'], ['Bank Meksyku', 'Banku Meksyku', 'Bankowi Meksyku', 'Bank Meksyku', 'Bankiem Meksyku', 'Banku Meksyku'], 'm'],
  [['NY Fed', 'NYFed'], ['Fed z Nowego Jorku', 'Fedu z Nowego Jorku', 'Fedowi z Nowego Jorku', 'Fed z Nowego Jorku', 'Fedem z Nowego Jorku', 'Fedzie z Nowego Jorku'], 'm'],
  [['Philly Fed'], ['Fed z Filadelfii', 'Fedu z Filadelfii', 'Fedowi z Filadelfii', 'Fed z Filadelfii', 'Fedem z Filadelfii', 'Fedzie z Filadelfii'], 'm'],
]
// guard -> the words (regular expressions for a case-insensitive test of the text round the abbreviation) that must be there (need) and must not be (no); `number`: not after a digit or
// a unit ("5 mln BOE"); `before`: not after these words ("Komitet MPC" has the committee already)
export const CENTRAL_BANK_GUARDS: Record<string, { need?: string; no?: string; number?: boolean; before?: string }> = {
  BOE: { need: String.raw`stopy|stopa|stóp|inflacj|Bailey|funt|GBP|brytyjsk|Brytani|Londyn|MPC|gilt`, no: String.raw`baryłk|wydobyci|ropa|ropy|złoż|produkcj|OLED|wyświetlacz|Technology|Apple|Hiszpani|Boletín`, number: true },
  BoC: { no: String.raw`Cypr` },
  BOC: { need: String.raw`stopy|stopa|stóp|Kanad|kanadyjsk|Macklem|CAD|loonie|Ottaw`, no: String.raw`Chin|chińsk|Hongkong|Aviation|ICBC|CCB|Cypr|Ceylon` },
  SNB: { no: String.raw`Saudi|Saudyjsk|Arabi|Aramco|Tadawul|Rijad` },
  RBA: { no: String.raw`oparte na ryzyku|opartego na ryzyku|opartym na ryzyku|AML|KYC|compliance|Responsible Business Alliance` },
  BOK: { need: String.raw`Kore|koreańsk|Seul|(?<![\p{L}])won(?![\p{L}])|KRW|Rhee`, no: String.raw`klient|obsług|infolini|biuro|Oklahom` },
  RBI: { need: String.raw`Indi|indyjsk|rupi|INR|Malhotra|repo|Mumbaj|Bombaj|Delhi`, no: String.raw`Raiffeisen|Austri|austriack|Rosj|rosyjsk|Polbank|Wiedn|MLB|baseball|home run` },
  MPC: { need: String.raw`Anglii|BoE|Bailey|funt|brytyjsk|Brytani|stopy|stóp|głosowan|głosował|członk|RBNZ|Zelandii|RBI|Indii|inflacj|pieniężn`, no: String.raw`MPC Capital|MPC Container|kontener|statk|szyfr|obliczeń|multi-party|sterowani|predykcyjn|konsumpcj|kryptograf` },
  BIS: { need: String.raw`Bazyle|Rozrachunk|banki centraln|banków centraln|bankom centraln|kapitał|płynnoś|stablecoin|CBDC|Hernández|Carstens|raport kwartaln`, no: String.raw`Departament Handlu|eksport|Nvidia|chip|licencj|lista podmiotów|Commerce|Huawei|półprzewodnik|Entity` },
  CNB: { need: String.raw`czesk|Czech|Praga|Pradze|Pragi|Michl|korona|korony|koronie|koronę|koroną|koron|CZK`, no: String.raw`Chin|chińsk|China|Hongkong` },
  NBU: { no: String.raw`Uzbek|Taszkent` },
  CBR: { need: String.raw`Rosj|rosyjsk|rubel|rubl|Nabiullin|Moskw|Kreml`, no: String.raw`badań|badaw|R&D|laborator` },
  BCB: { need: String.raw`Brazyl|brazylijsk|Selic|Galípolo|Galipolo|Campos Neto|Brasília|Brasilia`, no: String.raw`Boliwi|boliwijsk` },
}

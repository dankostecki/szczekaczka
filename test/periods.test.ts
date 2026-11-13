// Periods of time in a translation (src/lib/periods.ts): the unit the original has, put back where the model took a month for a year
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixPeriods } from '../src/lib/periods'
import { readTranslation } from '../worker/translate'
import { inLanguage, withTime } from '../src/lib/news'

test('a month taken for a year: the compound and the noun, in their forms', () => {
  const en = 'US 10-YEAR YIELD FALLS TO THREE-MONTH LOW'
  assert.equal(fixPeriods('Rentowność 10-letnich obligacji USA spada do trzyletniego minimum', en),
    'Rentowność 10-letnich obligacji USA spada do trzymiesięcznego minimum', 'the 10 years stay: the original has them')
  assert.equal(fixPeriods('Rentowność 10-letnich obligacji USA najniżej od trzech lat', en), 'Rentowność 10-letnich obligacji USA najniżej od trzech miesięcy')
  for (const [pl, fixed] of [
    ['trzyletnie minimum', 'trzymiesięczne minimum'], ['Trzyletnie minimum ropy', 'Trzymiesięczne minimum ropy'], ['trzyletnia seria', 'trzymiesięczna seria'],
    ['trzyletnim dołku', 'trzymiesięcznym dołku'], ['trzyletnich minimów', 'trzymiesięcznych minimów'], ['trzyletnią passę', 'trzymiesięczną passę'],
    ['od trzech lat', 'od trzech miesięcy'], ['trzy lata', 'trzy miesiące'], ['w trzech latach', 'w trzech miesiącach'], ['od 3 lat', 'od 3 miesięcy'],
    ['3-letnie minimum', '3-miesięczne minimum'], ['TRZYLETNIE MINIMUM', 'TRZYMIESIĘCZNE MINIMUM'],
  ]) assert.equal(fixPeriods(pl, 'GOLD AT THREE-MONTH LOW'), fixed, pl)
})

test('every unit, every way the original writes it', () => {
  assert.equal(fixPeriods('Akcje najwyżej od sześciu lat; sześcioletnie maksimum', 'STOCKS AT SIX-WEEK HIGH'), 'Akcje najwyżej od sześciu tygodni; sześciotygodniowe maksimum')
  assert.equal(fixPeriods('52-letnie maksimum', 'Nvidia hits a 52-week high'), '52-tygodniowe maksimum')
  assert.equal(fixPeriods('najdłuższa od dwóch miesięcy; dwumiesięczny szczyt', 'longest in two years, a two-year peak'), 'najdłuższa od dwóch lat; dwuletni szczyt')
  assert.equal(fixPeriods('wzrost przez trzy lata', 'rally for three days'), 'wzrost przez trzy dni')
  assert.equal(fixPeriods('trzyletnia passa', 'THREE-DAY WINNING STREAK'), 'trzydniowa passa')
  assert.equal(fixPeriods('od trzech dni; trzy dni', 'three weeks'), 'od trzech tygodni; trzy tygodnie', '"dni": the genitive after "od", the nominative after "trzy"')
  assert.equal(fixPeriods('od 3 dni; przez 3 dni; od 5 dni', '3 months, 5 months'), 'od 3 miesięcy; przez 3 miesiące; od 5 miesięcy')
  assert.equal(fixPeriods('pięć lat', 'five months'), 'pięć miesięcy')
  assert.equal(fixPeriods('wieloletnie minimum; najniżej od kilku lat', 'MULTI-MONTH LOW'), 'wielomiesięczne minimum; najniżej od kilku miesięcy')
  assert.equal(fixPeriods('kilkuletni dołek', 'several weeks'), 'kilkutygodniowy dołek')
  assert.equal(fixPeriods('Ropa najwyżej od roku', 'OIL AT ONE-MONTH HIGH'), 'Ropa najwyżej od miesiąca')
  assert.equal(fixPeriods('Ropa najwyżej od miesiąca', 'OIL HIGHEST IN A YEAR'), 'Ropa najwyżej od roku')
})

test('left as it is: what the original says, a number it has with two units or none, words that only look like a period', () => {
  // the original has the year too
  assert.equal(fixPeriods('trzyletnie maksimum, trzymiesięczny spadek', 'THREE-YEAR HIGH AFTER A THREE-MONTH SLIDE'), 'trzyletnie maksimum, trzymiesięczny spadek')
  // no period in the original, or another number
  assert.equal(fixPeriods('najniżej od trzech lat', 'GOLD FALLS'), 'najniżej od trzech lat')
  assert.equal(fixPeriods('najniżej od trzech lat', 'SIX-MONTH LOW'), 'najniżej od trzech lat')
  assert.equal(fixPeriods('2-letnie obligacje i trzymiesięczne bony', '2-YEAR NOTES AND THREE-MONTH BILLS'), '2-letnie obligacje i trzymiesięczne bony')
  // "od roku" where the original has a year; "w tym roku" is not a period; "od dnia" is a date as often
  assert.equal(fixPeriods('Najwyżej od miesiąca, w tym roku +10%', 'ONE-MONTH HIGH, UP 10% THIS YEAR'), 'Najwyżej od miesiąca, w tym roku +10%')
  assert.equal(fixPeriods('Wzrost od dnia wyborów, najwyżej od miesiąca', 'ONE-YEAR HIGH SINCE THE ELECTION DAY'), 'Wzrost od dnia wyborów, najwyżej od roku')
  assert.equal(fixPeriods('od roku 2020', 'ONE-MONTH HIGH'), 'od roku 2020')
  // not inside a word: "letnia sesja" (a summer one), "dwulatek", "latarnia"
  assert.equal(fixPeriods('letnia sesja, latarnia, Wielkie lato', 'THREE-MONTH LOW'), 'letnia sesja, latarnia, Wielkie lato')
  assert.equal(fixPeriods('', 'THREE-MONTH LOW'), '')
})

test('in the translation as the server receives it, and in one kept from before (the page and the saved posts)', () => {
  const src = { title: 'EURO FALLS TO THREE-MONTH LOW VS DOLLAR', description: 'The euro is at its lowest in three months.' }
  assert.deepEqual(readTranslation('Euro spada do trzyletniego minimum wobec dolara\nEuro jest najniżej od trzech lat.', src),
    { title: 'Euro spada do trzymiesięcznego minimum wobec dolara', description: 'Euro jest najniżej od trzech miesięcy.' })
  const kept = withTime({ id: 'WALTER:TELEGRAM:1', title: 'EURO FALLS TO THREE-MONTH LOW VS DOLLAR', description: '', link: 'https://t.me/x/1',
    pubDate: '2026-11-13T10:00:00Z', source: 'WALTER', label: 'TELEGRAM', pl: { title: 'Euro spada do trzyletniego minimum wobec dolara', description: '' } })
  assert.equal(inLanguage(kept, []).title, 'Euro spada do trzymiesięcznego minimum wobec dolara')
  assert.equal(inLanguage(kept, ['WALTER:TELEGRAM']).title, 'EURO FALLS TO THREE-MONTH LOW VS DOLLAR', 'the original as it is')
})

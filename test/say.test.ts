// The rules of reading aloud (src/lib/say.ts): what a voice would get wrong, said in words
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sayAloud, sayNumbers } from '../src/lib/say'

test('a range of percentages is "od … do … procent", not "minus": the target range of the Fed', () => {
  assert.equal(sayAloud('FED utrzymuje stopy na poziomie 3,75%–4,00%'), 'FED utrzymuje stopy na poziomie od 3,75 do czterech procent')
  // a hyphen, spaces, the short word, the written-out range
  assert.equal(sayNumbers('stopy w przedziale 3,75%-4,00%'), 'stopy w przedziale od 3,75 do czterech procent')
  assert.equal(sayNumbers('stopy w przedziale 3,75 % – 4,00 %'), 'stopy w przedziale od 3,75 do czterech procent')
  assert.equal(sayNumbers('Rentowność 4,25-4,50 proc. w tym roku'), 'Rentowność od 4,25 do 4,50 procent w tym roku')
  assert.equal(sayNumbers('od 3,75% do 4,00%'), 'od 3,75 do czterech procent')
  assert.equal(sayNumbers('od 2 do 3%'), 'od dwóch do trzech procent')
  // whole numbers are in the genitive that "do" asks for, "jednego procenta" after a lone one, "zera" for none
  assert.equal(sayNumbers('przedział 15-20% w 2026'), 'przedział od piętnastu do dwudziestu procent w 2026')
  assert.equal(sayNumbers('od 0,5% do 1%'), 'od 0,5 do jednego procenta')
  assert.equal(sayNumbers('odpis 0–1%'), 'odpis od zera do jednego procenta')
})

test('a change or an estimate takes no second "od"', () => {
  assert.equal(sayNumbers('wzrost o 2–3%'), 'wzrost o dwa do trzech procent')
  assert.equal(sayNumbers('około 2–3 proc. rocznie'), 'około dwóch do trzech procent rocznie')
  assert.equal(sayNumbers('inflacja z 2% do 4%'), 'inflacja z dwóch do czterech procent')
  assert.equal(sayNumbers('od 2-3%'), 'od dwóch do trzech procent')
})

test('the dot of "proc." that ends a sentence stays', () => {
  assert.equal(sayNumbers('Wzrost o 2–3 proc. Kolejne zdanie.'), 'Wzrost o dwa do trzech procent. Kolejne zdanie.')
})

test('what is no range of percentages is left alone', () => {
  assert.equal(sayNumbers('stopy 3,75%'), 'stopy 3,75%')
  assert.equal(sayNumbers('wzrost 5% do 7% w ciągu roku'), 'wzrost 5% do 7% w ciągu roku') // "do" with no "od" is no range
  assert.equal(sayNumbers('wynik 3-2%'), 'wynik 3-2%') // the first is not the smaller
  assert.equal(sayNumbers('spadek -0,5%'), 'spadek minus 0,5%')
  // said once: the result has no digits to say again
  const once = sayNumbers('stopy 3,75%–4,00%')
  assert.equal(sayNumbers(once), once)
})

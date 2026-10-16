// Polish ordinals the translation model sometimes builds by analogy with "czwarty" and "piąty": "siódty" and "ósty" are
// not words (siódmy, ósmy). Put right in every case form ("siódtą sesję z rzędu" → "siódmą sesję z rzędu"), in the
// translation as the server receives it and in the ones already kept (the page, saved posts).
const ENDING = '(?:y|a|e|ą|ej|ego|emu|ym|ych|ymi)'
const SLIPS = ['siód', 'ós'].map((stem) => new RegExp(`(?<!\\p{L})(${stem})(t)(${ENDING})(?!\\p{L})`, 'giu'))

export const fixOrdinals = (text: string): string =>
  SLIPS.reduce((s, re) => s.replace(re, (_, stem: string, t: string, end: string) => stem + (t === 'T' ? 'M' : 'm') + end), text)

'use client'

import { IMPORTANCE, importanceLevel } from '@/lib/top'

// The importance of a news as the AI rated it (lib/top.ts): four bars, as many lit as its step, in the step's colour (green: quiet, red: very important)
export function Importance({ ai }: { ai: number }) {
  const level = importanceLevel(ai)
  const said = `Ważność według AI: ${IMPORTANCE[level - 1].name}`
  return (
    <span className={`imp l${level}`} role="img" aria-label={said} title={said}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= level ? 'on' : undefined} />)}
    </span>
  )
}

// What the colours mean
export function ImportanceLegend() {
  return (
    <p className="imp-legend">
      {IMPORTANCE.map((step) => <span key={step.name}><Importance ai={step.from} />{step.name}</span>)}
    </p>
  )
}

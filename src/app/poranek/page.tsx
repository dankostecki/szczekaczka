import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'
import Briefing from '@/components/Briefing'

export const metadata: Metadata = {
  title: 'Poranny przegląd rynków · Szczekaczka',
  description: 'Najważniejsze informacje z rynków od wieczora do rana, do wysłuchania i przeczytania, ze źródłami każdej informacji.',
}

export default function MorningBriefing() {
  return (
    <LegalPage title="Poranny przegląd rynków" dated={false}>
      <Briefing />
    </LegalPage>
  )
}

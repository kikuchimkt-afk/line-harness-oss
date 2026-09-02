export type EventItem = {
  id: string
  title: string
  audience?: string
  status?: string
  period: string
  publishedAt: string
  newUntil?: string
  href: string
  external?: boolean
  description: string
}

export const events: EventItem[] = [
  {
    id: 'kisogaku-stepup-autumn-2026',
    title: '基礎学ステップアップ講座',
    audience: '中学3年生対象',
    period: '2026年9月7日〜10月31日',
    publishedAt: '2026-09-02',
    newUntil: '2026-09-08',
    href: '/events/kisogaku-stepup-autumn-2026',
    description: '基礎学力テストに向けて、これまでの学習を整理し、次に取り組むことを明確にする講座です。',
  },
  {
    id: 'eiken-intensive-autumn-2026',
    title: '英検 集中講座',
    status: '募集中',
    period: '2026年9月1日〜10月2日',
    publishedAt: '2026-08-25',
    href: '/documents/eiken-autumn-2026-aizumi-flyer.pdf',
    external: true,
    description: '講座の対象、実施日時、受講料、学習の進め方を案内PDFでご確認いただけます。',
  },
].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: '藍住校のイベント・講座 | ECCベストワン',
    template: '%s | ECCベストワン藍住校',
  },
  description: 'ECCベストワン藍住校が、季節や学習時期に合わせて実施するイベント・講座をご案内します。',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}

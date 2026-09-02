# 藍住校 イベント・講座LP

「つながるベストワン」の藍住校メニューから遷移する、イベント・講座一覧と企画紹介ページです。

## ローカル確認

```bash
pnpm --filter aizumi-events-lp dev
pnpm --filter aizumi-events-lp typecheck
pnpm --filter aizumi-events-lp build
```

## Vercel

Vercelでは、このモノレポの `apps/aizumi-events-lp` を Root Directory に指定します。

- Framework Preset: Next.js
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter aizumi-events-lp build`

英検案内PDFは `public/documents/` に置き、同じVercelドメインから配信します。

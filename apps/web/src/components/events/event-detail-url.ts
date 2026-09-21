const HTTPS_ABSOLUTE_URL_MESSAGE = 'レッスン詳細ページ URL は https:// から始まる完全な URL を入力してください'

export function normalizeEventDetailUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized || null
}

export function validateEventDetailUrl(value: string | null | undefined): string | null {
  const normalized = normalizeEventDetailUrl(value)
  if (!normalized) return null

  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:' || !url.hostname) return HTTPS_ABSOLUTE_URL_MESSAGE
    if (url.username || url.password) return HTTPS_ABSOLUTE_URL_MESSAGE
    return null
  } catch {
    return HTTPS_ABSOLUTE_URL_MESSAGE
  }
}

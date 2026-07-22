interface ChatImageMessageProps {
  content: string
  isIncoming: boolean
}

export interface ChatImageSource {
  displayUrl: string
  downloadUrl: string
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function buildImageDownloadUrl(imageUrl: string): string {
  const url = new URL(imageUrl)
  url.searchParams.set('download', '1')
  return url.toString()
}

export function parseChatImageSource(content: string): ChatImageSource | null {
  let candidate: unknown = content.trim()

  try {
    const parsed = JSON.parse(content) as unknown
    if (typeof parsed === 'string') {
      candidate = parsed
    } else if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      candidate = record.originalContentUrl ?? record.previewImageUrl
    }
  } catch {
    // Older records may contain the image URL directly instead of JSON.
  }

  const displayUrl = safeHttpUrl(candidate)
  if (!displayUrl) return null

  return {
    displayUrl,
    downloadUrl: buildImageDownloadUrl(displayUrl),
  }
}

export default function ChatImageMessage({ content, isIncoming }: ChatImageMessageProps) {
  const source = parseChatImageSource(content)

  if (!source) return <span>画像を表示できません</span>

  return (
    <div className="relative overflow-hidden rounded-md">
      <img
        src={source.displayUrl}
        alt="受信画像"
        className="block max-h-[420px] max-w-[240px] object-contain"
        loading="lazy"
      />
      {isIncoming && (
        <a
          href={source.downloadUrl}
          download="LINE-image"
          aria-label="受信画像を保存"
          title="元の画像を端末に保存"
          className="absolute bottom-2 right-2 inline-flex min-h-9 items-center gap-1 rounded-md border border-gray-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          <span aria-hidden="true">↓</span>
          保存
        </a>
      )}
    </div>
  )
}

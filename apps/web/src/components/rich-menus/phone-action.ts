const PHONE_LENGTH_MIN = 8
const PHONE_LENGTH_MAX = 15

function normalizePhoneCharacters(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[‐‑‒–—―ー]/g, '-')
    .trim()
}

export function normalizePhoneNumber(value: string): string | null {
  const normalized = normalizePhoneCharacters(value)
  if (!normalized || !/^\+?[\d\s()-]+$/.test(normalized)) return null

  const international = normalized.startsWith('+')
  const digits = normalized.replace(/\D/g, '')
  if (digits.length < PHONE_LENGTH_MIN || digits.length > PHONE_LENGTH_MAX) return null

  return `${international ? '+' : ''}${digits}`
}

export function buildPhoneUri(value: string): string | null {
  const phoneNumber = normalizePhoneNumber(value)
  return phoneNumber ? `tel:${phoneNumber}` : null
}

export function phoneInputFromActionData(data: Record<string, unknown>): string {
  if (typeof data.phoneNumber === 'string') return data.phoneNumber
  if (typeof data.uri === 'string' && data.uri.toLowerCase().startsWith('tel:')) {
    return data.uri.slice(4)
  }
  return ''
}

export function isPhoneActionData(data: Record<string, unknown>): boolean {
  return data.kind === 'phone'
    || (typeof data.uri === 'string' && data.uri.toLowerCase().startsWith('tel:'))
}

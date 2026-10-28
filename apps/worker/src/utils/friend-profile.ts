export const FRIEND_PROFILE_KEYS = [
  'harnessDisplayName',
  'profileType',
  'kana',
  'schoolGrade',
  'phone',
  'email',
  'memo',
] as const;

export type FriendProfileKey = typeof FRIEND_PROFILE_KEYS[number];

export function parseFriendMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function stringMeta(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getHarnessDisplayName(metadata: Record<string, unknown>): string | null {
  return stringMeta(metadata, 'harnessDisplayName');
}

export function resolveFriendDisplayName(
  lineDisplayName: string | null | undefined,
  metadata: Record<string, unknown>,
): string {
  return getHarnessDisplayName(metadata) || lineDisplayName || '名前なし';
}

export function mergeFriendProfile(
  existing: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...existing };
  for (const key of FRIEND_PROFILE_KEYS) {
    if (!(key in input)) continue;
    const raw = input[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value) {
      next[key] = value;
    } else {
      delete next[key];
    }
  }
  return next;
}

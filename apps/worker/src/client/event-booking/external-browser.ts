export interface LiffExternalWindowApi {
  isInClient(): boolean;
  openWindow(params: { url: string; external: boolean }): void;
}

function globalLiff(): LiffExternalWindowApi | null {
  const candidate = (globalThis as typeof globalThis & { liff?: LiffExternalWindowApi }).liff;
  return candidate ?? null;
}

/**
 * Only fully-qualified HTTPS URLs may be exposed as an external lesson link.
 * The Worker validates writes as well, but this client-side guard keeps legacy
 * or manually edited rows from becoming an unsafe navigation target.
 */
export function normalizeExternalHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Opens a URL in the device browser when running inside LINE. Returns false
 * outside the LINE client (or when the LIFF call fails) so an anchor element
 * can continue with its normal target="_blank" navigation.
 */
export function openWithLiffExternal(
  url: string,
  liffApi: LiffExternalWindowApi | null = globalLiff(),
): boolean {
  try {
    if (!liffApi?.isInClient()) return false;
    liffApi.openWindow({ url, external: true });
    return true;
  } catch {
    return false;
  }
}

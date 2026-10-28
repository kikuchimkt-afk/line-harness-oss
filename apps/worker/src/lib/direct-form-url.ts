/**
 * Convert the friend-add LIFF URL into the direct form page URL while
 * preserving attribution and account-selection query parameters.
 */
export function buildDirectFormUrl(currentUrl: string, formId: string): string {
  const url = new URL(currentUrl);
  url.searchParams.delete('form');
  url.searchParams.set('page', 'form');
  url.searchParams.set('id', formId);
  return url.toString();
}

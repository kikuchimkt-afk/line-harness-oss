import type { Message, RichMenuObject } from './types.js';

const ZOOM_ROOT_DOMAINS = [
  'zoom.us',
  'zoom.com',
  'zoomgov.com',
  'zoom.cn',
] as const;

const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_PUNCTUATION = /[.,;:!?)}\]}>、。！？）」』】]+$/u;

export function isZoomUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    return ZOOM_ROOT_DOMAINS.some(
      (root) => hostname === root || hostname.endsWith(`.${root}`),
    );
  } catch {
    return false;
  }
}

export function appendOpenExternalBrowser(url: string): string {
  const hashIndex = url.indexOf('#');
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const fragment = hashIndex >= 0 ? url.slice(hashIndex) : '';

  if (/([?&])openExternalBrowser=/i.test(base)) {
    return `${base.replace(
      /([?&])openExternalBrowser=[^&#]*/i,
      '$1openExternalBrowser=1',
    )}${fragment}`;
  }

  const separator = base.endsWith('?') || base.endsWith('&')
    ? ''
    : base.includes('?')
      ? '&'
      : '?';
  return `${base}${separator}openExternalBrowser=1${fragment}`;
}

export function forceExternalBrowserForZoomUrls(text: string): string {
  return text.replace(URL_PATTERN, (candidate) => {
    const url = candidate.replace(TRAILING_PUNCTUATION, '');
    const suffix = candidate.slice(url.length);
    return isZoomUrl(url)
      ? `${appendOpenExternalBrowser(url)}${suffix}`
      : candidate;
  });
}

function transformZoomLinks<T>(value: T): T {
  if (typeof value === 'string') {
    return forceExternalBrowserForZoomUrls(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => transformZoomLinks(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, transformZoomLinks(item)]),
    ) as T;
  }

  return value;
}

export function prepareMessagesForLine(messages: Message[]): Message[] {
  return transformZoomLinks(messages);
}

export function prepareRichMenuForLine(menu: RichMenuObject): RichMenuObject {
  return transformZoomLinks(menu);
}

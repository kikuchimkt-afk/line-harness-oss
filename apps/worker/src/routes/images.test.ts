import { describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import { images } from './images.js';

function setupApp(get: ReturnType<typeof vi.fn>) {
  const app = new Hono<{ Bindings: { IMAGES: R2Bucket } }>();
  app.route('/', images);
  return {
    app,
    env: { IMAGES: { get } as unknown as R2Bucket },
  };
}

function imageObject(originalFilename?: string) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
  return {
    body,
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: originalFilename ? { originalFilename } : {},
    etag: 'test-etag',
  };
}

describe('GET /images/:key', () => {
  test('serves the image inline by default', async () => {
    const get = vi.fn().mockResolvedValue(imageObject());
    const { app, env } = setupApp(get);

    const res = await app.request('/images/incoming-message.jpg', {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  test('returns an attachment when download=1 is requested', async () => {
    const get = vi.fn().mockResolvedValue(imageObject('受信画像.jpg'));
    const { app, env } = setupApp(get);

    const res = await app.request('/images/incoming-message.jpg?download=1', {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('attachment;');
    expect(res.headers.get('Content-Disposition')).toContain("filename*=UTF-8''%E5%8F%97%E4%BF%A1%E7%94%BB%E5%83%8F.jpg");
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  test('uses a friendly fallback filename for older stored images', async () => {
    const get = vi.fn().mockResolvedValue(imageObject());
    const { app, env } = setupApp(get);

    const res = await app.request('/images/legacy-image.jpg?download=1', {}, env);

    expect(res.headers.get('Content-Disposition')).toContain('filename="LINE-image.jpg"');
  });
});

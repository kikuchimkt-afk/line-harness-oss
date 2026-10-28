import { describe, expect, test } from 'vitest'
import { buildImageDownloadUrl, parseChatImageSource } from './chat-image-message.js'

describe('parseChatImageSource', () => {
  test('uses the original image URL and adds the download flag', () => {
    expect(parseChatImageSource(JSON.stringify({
      originalContentUrl: 'https://worker.example.com/images/incoming-1.jpg',
      previewImageUrl: 'https://worker.example.com/images/preview-1.jpg',
    }))).toEqual({
      displayUrl: 'https://worker.example.com/images/incoming-1.jpg',
      downloadUrl: 'https://worker.example.com/images/incoming-1.jpg?download=1',
    })
  })

  test('supports older records containing a direct URL', () => {
    expect(parseChatImageSource('https://worker.example.com/images/old.png')?.displayUrl)
      .toBe('https://worker.example.com/images/old.png')
  })

  test('rejects non-http URLs', () => {
    expect(parseChatImageSource('{"originalContentUrl":"javascript:alert(1)"}')).toBeNull()
    expect(parseChatImageSource('[image]')).toBeNull()
  })
})

describe('buildImageDownloadUrl', () => {
  test('preserves existing query parameters', () => {
    expect(buildImageDownloadUrl('https://worker.example.com/images/a.jpg?size=large'))
      .toBe('https://worker.example.com/images/a.jpg?size=large&download=1')
  })
})

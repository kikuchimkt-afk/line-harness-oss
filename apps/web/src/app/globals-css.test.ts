import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('global modal positioning styles', () => {
  it('does not turn the body into a containing block for fixed dialogs', () => {
    const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
    const bodyRule = css.match(/body\.bg-gray-50\s*\{([^}]*)\}/)?.[1]

    expect(bodyRule).toBeDefined()
    expect(bodyRule).toMatch(/-webkit-backdrop-filter:\s*none/)
    expect(bodyRule).toMatch(/(?:^|\s)backdrop-filter:\s*none/)
  })
})

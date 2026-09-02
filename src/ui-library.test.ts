import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const root = new URL('../public/', import.meta.url)
const sampleFiles = [
  'ui-library/index.html',
  'ui-library/buttons.html',
  'ui-library/account-chip.html',
  'ui-library/composer.html',
  'ui-library/message-bubble.html',
  'ui-library/call-mini.html',
  'ui-library/incoming-call.html',
  'ui-library/call-avatar.html',
]

describe('UI library samples', () => {
  test('removes the old combined demo', () => {
    expect(existsSync(new URL('demo/index.html', root))).toBe(false)
  })

  test('keeps each approved UI sample as its own page', () => {
    for (const file of sampleFiles) {
      expect(existsSync(new URL(file, root)), file).toBe(true)
    }
  })

  test('catalog links to every standalone sample', () => {
    const index = readFileSync(new URL('ui-library/index.html', root), 'utf8')
    for (const file of sampleFiles.slice(1)) {
      expect(index).toContain(file.split('/').at(-1)!)
    }
  })
})

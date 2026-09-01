import { describe, expect, it } from 'vitest'
import workflow from '../../.github/workflows/android-apk.yml?raw'

describe('Android debug APK workflow', () => {
  it('is manual-only so PWA production pushes do not build APKs', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/\n\s*push:\s*\n/)
  })
})

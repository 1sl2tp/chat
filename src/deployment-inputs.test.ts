import { describe, expect, it } from 'vitest'
import viteConfigSource from '../vite.config.ts?raw'

describe('Vite production inputs', () => {
  it('keeps diagnostics opt-in and product entries as the default', () => {
    expect(viteConfigSource).toContain("process.env.VITE_INCLUDE_DIAGNOSTICS === 'true'")
    expect(viteConfigSource).toContain('const productInputs =')
    expect(viteConfigSource).toContain('const diagnosticInputs =')
    expect(viteConfigSource).toContain('includeDiagnostics ? { ...productInputs, ...diagnosticInputs } : productInputs')
  })
})

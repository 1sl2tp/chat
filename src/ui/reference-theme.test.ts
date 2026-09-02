import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const config = fs.readFileSync('tailwind.config.cjs', 'utf8')
const css = fs.readFileSync('src/ui/reference.css', 'utf8')

describe('approved reference theme', () => {
  it('locks the reference font and Chatwoot accent', () => {
    expect(config).toContain("'Plus Jakarta Sans'")
    expect(config).toContain("500: '#1f93ff'")
    expect(config).toContain("darkMode: 'class'")
  })

  it('keeps the source scrollbar and pulse helpers', () => {
    expect(css).toContain('.custom-scrollbar::-webkit-scrollbar')
    expect(css).toContain('@keyframes pulse-ring')
  })
})

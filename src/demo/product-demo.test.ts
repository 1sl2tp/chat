import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const demoPath = fileURLToPath(new URL('../../public/demo/index.html', import.meta.url))
const demo = readFileSync(demoPath, 'utf8')

describe('product-like user demo', () => {
  it('does not expose the old test harness as the product UI', () => {
    expect(demo).not.toContain('class="demo-bar"')
    expect(demo).not.toContain('class="device"')
    expect(demo).not.toContain('class="status"')
    expect(demo).not.toContain('hang-mini')
  })

  it('keeps demo controls hidden behind one subtle trigger', () => {
    expect(demo).toContain('id="demoTrigger"')
    expect(demo).toContain('id="demoPanel"')
  })

  it('models the four real product states without extra call controls', () => {
    expect(demo).toContain('id="chatScreen"')
    expect(demo).toContain('id="callScreen"')
    expect(demo).toContain('id="incomingActions"')
    expect(demo).toContain('id="activeControls"')
    expect(demo).toContain('id="callPill"')
    expect(demo).toContain('Loa')
    expect(demo).toContain('Mic')
    expect(demo).toContain('Tin nhắn')
    expect(demo).toContain('Kết thúc')
  })
})

import { describe, expect, it } from 'vitest'
import { iconSvg, type AppIconName } from './icons'

const required: AppIconName[] = [
  'menu', 'call', 'back', 'plus', 'send', 'mic', 'image', 'file',
  'heart', 'copy', 'share', 'account', 'notification', 'more', 'close',
  'minimize', 'speaker', 'speakerOff', 'mute', 'unmute', 'endCall', 'acceptCall',
]

describe('shared icon set', () => {
  it('renders every product icon as one coherent SVG contract', () => {
    for (const name of required) {
      const svg = iconSvg(name)
      expect(svg).toContain('<svg')
      expect(svg).toContain('viewBox="0 0 24 24"')
      expect(svg).toContain('stroke="currentColor"')
      expect(svg).not.toMatch(/[☎️➤📎📄🎤❤️]/u)
    }
  })

  it('keeps decorative icon markup hidden from screen readers', () => {
    expect(iconSvg('call')).toContain('aria-hidden="true"')
  })
})

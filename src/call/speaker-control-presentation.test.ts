import { describe, expect, it } from 'vitest'
import { phoneSpeakerButtonPresentation } from './speaker-control-presentation'

describe('phone speaker button presentation', () => {
  it('always presents the phone toggle as Loa ngoài while exposing off/on state separately', () => {
    expect(phoneSpeakerButtonPresentation(false)).toEqual({
      label: 'Loa ngoài',
      icon: '🔊',
      title: 'Chạm để bật loa ngoài',
      pressed: false,
    })

    expect(phoneSpeakerButtonPresentation(true)).toEqual({
      label: 'Loa ngoài',
      icon: '🔊',
      title: 'Chạm để tắt loa ngoài',
      pressed: true,
    })
  })
})

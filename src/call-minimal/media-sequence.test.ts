import { describe, expect, it } from 'vitest'
import { enableCallAudio } from './media-sequence'

describe('enableCallAudio', () => {
  it('acquires and publishes microphone before starting room audio', async () => {
    const calls: string[] = []

    const publication = await enableCallAudio({
      enableMicrophone: async () => {
        calls.push('microphone')
        return { track: { id: 'mic-track' } }
      },
      startAudio: async () => {
        calls.push('startAudio')
      },
    })

    expect(calls).toEqual(['microphone', 'startAudio'])
    expect(publication).toEqual({ track: { id: 'mic-track' } })
  })
})

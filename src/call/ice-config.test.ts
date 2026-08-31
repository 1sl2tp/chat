import { describe, expect, it } from 'vitest'
import { hasTurnRelay, normalizeCallIceServers } from './ice-config'

describe('call ICE configuration', () => {
  it('keeps Cloudflare STUN/TURN credentials and requires a relay entry', () => {
    const servers = normalizeCallIceServers({
      iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:5349?transport=tcp'], username: 'u', credential: 'p' },
      ],
    })

    expect(servers).toHaveLength(2)
    expect(hasTurnRelay(servers)).toBe(true)
    expect(servers[1]).toMatchObject({ username: 'u', credential: 'p' })
  })

  it('rejects malformed schemes from broker payload', () => {
    const servers = normalizeCallIceServers({ iceServers: [{ urls: ['https://example.com', ''] }] })
    expect(servers).toEqual([])
    expect(hasTurnRelay(servers)).toBe(false)
  })
})

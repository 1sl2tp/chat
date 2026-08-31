import {
  MatrixCallOwner as DiagnosticMatrixCallOwner,
  MATRIX_LIVEKIT_VERSION,
  MATRIX_ROOM_NAME,
} from './matrix-owner-v153.js'
import { captureIOSRecoveryTrack } from './ios-capture-recovery'

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export class MatrixCallOwner extends DiagnosticMatrixCallOwner {
  async setupProfile(profile) {
    await this.connectRoom(profile)
    await this.waitForMatchingPeer(profile)

    if (isIOS()) {
      const result = await captureIOSRecoveryTrack(profile.id, navigator.mediaDevices, navigator)
      this.localStream = result.stream
      this.localTrack = result.track
      this.log(`ios recovery=${profile.id} audioSession=${result.audioSessionType} constraints=${JSON.stringify(result.constraints.audio)}`)
      await this.publishLiveKit(result.track, profile)
      return
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const track = this.localStream.getAudioTracks()[0]
    if (!track) throw new Error('control microphone missing')
    this.localTrack = track
    this.log(`control capture profile=${profile.id}`)
    await this.publishLiveKit(track, profile)
  }
}

export { MATRIX_LIVEKIT_VERSION, MATRIX_ROOM_NAME }

from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

policy=read('audio-capture-policy.js')
for token in [
    'echoCancellation:true',
    'noiseSuppression:true',
    'autoGainControl:true',
    'channelCount:1',
    'devicechange',
    'enumerateDevices',
    'audio_capture_busy',
    'claimExternal',
    'releaseExternal'
]:
    assert token in policy, token
assert 'AudioContext' not in policy
assert "MODULE_CONTRACT_VERSION='audio-capture-v1'" in policy
assert "RELEASE_VERSION='V21.72.39'" in policy
assert 'createMediaStreamDestination' not in policy

app=read('app.js')
start=app[app.index('async function startRecording()'):app.index('function stopRecording',app.index('async function startRecording()'))]
assert 'audioCapturePolicy().acquire' in start
assert 'window.V21AudioCapturePolicy' in app
assert 'audio:true' not in start
assert 'getUserMedia({' not in start

livekit=read('v21-livekit-session.js')
assert 'V21AudioCapturePolicy' in livekit
assert 'claimExternal' in livekit
assert 'releaseExternal' in livekit
assert 'remoteAudioAttachments' in livekit
assert 'remoteTrackKey' in livekit

source=read('index.source.html')
assert '<link rel="manifest" href="./manifest.webmanifest">' in source
assert 'name="app-release-version" content="V21.72.39"' in source
assert 'name="app-build-id" content="__APP_BUILD_ID__"' in source
assert 'apple-mobile-web-app-title" content="TAPHOA Chat"' in source
assert '<title>TAPHOA Chat</title>' in source
assert './audio-capture-policy.js' in source
assert './app-update-controller.js' in source
assert 'apple-mobile-web-app-capable' in source
assert 'mobile-web-app-capable' in source

manifest=json.loads(read('manifest.webmanifest'))
assert manifest['display']=='standalone'
assert manifest['name']=='TAPHOA Chat'
assert manifest['short_name']=='TAPHOA Chat'
assert manifest['start_url']=='./'
assert manifest['scope']=='./'
sizes={icon.get('sizes') for icon in manifest.get('icons',[])}
assert '192x192' in sizes and '512x512' in sizes

sw=read('sw.js')
for token in ['skipWaiting','clients.claim','version.json','cache: \'no-store\'','request.mode===\'navigate\'']:
    assert token in sw, token
for token in ["self.addEventListener('push'","self.addEventListener('notificationclick'",'ADMIN_PUSH_STATE','ADMIN_PUSH_OPEN','showNotification','chat:']:
    assert token in sw, token

update=read('app-update-controller.js')
assert "MODULE_CONTRACT_VERSION='app-update-v2'" in update
assert "RELEASE_VERSION='V21.72.39'" in update
for token in [
    'version.json',
    'build_id',
    "BUILD_PARAM='__build'",
    "cache:'no-store'",
    'visibilitychange',
    'setInterval',
    'V21InteractionController',
    'V21AudioCapturePolicy',
    'V21SyncEngine',
    "document.getElementById('editor')",
    "document.getElementById('attachmentTray')",
    'location.replace',
    'serviceWorker.register'
]:
    assert token in update, token
print('V21.72.39 audio/PWA/update contract PASS')

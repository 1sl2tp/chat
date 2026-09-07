from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

app=read("app.js")
source=read("index.source.html")

assert "V21.72.39" in source

# Timer truth: monotonic clock begins from MediaRecorder's actual start event.
assert "function recordingNowMs()" in app
assert "performance.now" in app
assert "mediaRecorder.addEventListener('start',()=>{" in app
assert "recordingStartedAt=recordingNowMs();" in app
assert "recordingTimer=setInterval(updateRuntime,80);" in app
assert "Date.now()-recordingStartedAt" not in app

# Live waveform truth: microphone time-domain amplitude, not seconds-driven decoration.
assert "function startRecordingLevelMeter(stream)" in app
assert "window.AudioContext||window.webkitAudioContext" in app
assert "context.createMediaStreamSource(stream)" in app
assert "context.createAnalyser()" in app
assert "recordingAnalyser.getByteTimeDomainData(recordingAnalyserData)" in app
assert "function sampleRecordingLevel()" in app
assert "function renderRecordingWaveform(target)" in app
assert "updateAudioWaveform(" not in app
assert "sampleRecordingLevel();" in app
assert "renderRecordingWaveform(surface?.querySelector?.('.audio-recording-waveform'));" in app

# Smooth attack/release and low silent floor avoid jitter.
assert "const smoothing=level>recordingSmoothedLevel ? .44 : .18;" in app
assert "recordingWaveformSamples.push(Math.max(.04,recordingSmoothedLevel));" in app

# Final duration prefers file metadata, but live elapsed time is a safe fallback.
assert "const metadataDurationMs=await readAudioDurationMs(blob);" in app
assert "const elapsedFallbackMs=recordingElapsedMsAtStop>0" in app
assert "metadataDurationMs==null&&elapsedFallbackMs>0" in app

# Meter/timer lifetime is recording-scoped and is released on stop/error.
assert "function stopRecordingLevelMeter()" in app
assert "void context.close?.().catch?.(()=>{});" in app
stop_start=app.index("function stopRecording({discard=false}={})")
stop_end=app.index("micButton.addEventListener",stop_start)
stop_body=app[stop_start:stop_end]
assert "recordingElapsedMsAtStop=recordingElapsedMs();" in stop_body
assert "stopRecordingTimer();" in stop_body
assert "stopRecordingLevelMeter();" in stop_body

print("V21.72.39 audio recorder runtime contract PASS")

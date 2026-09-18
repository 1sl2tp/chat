from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')
app=(ROOT/'app.js').read_text('utf-8')
controller=(ROOT/'interaction-controller.js').read_text('utf-8')

assert 'data-build-source="interaction-controller.js"' in source
assert source.index('data-build-source="interaction-controller.js"') < source.index('data-build-source="app.js"')
assert "const InteractionMode=window.V21InteractionMode;" in app
assert "const InteractionController=window.V21InteractionController;" in app
assert "interaction_controller_missing" in app
assert "const InteractionMode=Object.freeze({" not in app
assert "window.V21InteractionController=InteractionController;" not in app

for token in [
    "IMAGE_VIEWER:'IMAGE_VIEWER'",
    "PROFILE_MODAL:'PROFILE_MODAL'",
    "ACCOUNT_SETTINGS:'ACCOUNT_SETTINGS'",
    "MESSAGE_FORWARD:'MESSAGE_FORWARD'",
    "AUDIO_RECORDING:'AUDIO_RECORDING'",
    "CALL_RINGING:'CALL_RINGING'",
    "function setBaseUiLocked",
    "function canEnter",
    "function transition",
    "function forceReset",
    "window.V21InteractionController=InteractionController",
]:
    assert token in controller, token
print('shared interaction controller contract PASS')

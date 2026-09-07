from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

app=read("app.js")
source=read("index.source.html")

assert "V21.72.39" in source

# Hidden state is immediate: the wrapper may collapse without an absolute child
# animating down into Composer.
motion_start=source.index("#threadScrollControlMotion{")
motion_end=source.index("#stageLayout[data-scroll-from-end] #threadScrollControlMotion{",motion_start)
hidden_motion=source[motion_start:motion_end]
assert "transition:none;" in hidden_motion
assert "transform 90ms ease" not in hidden_motion
assert "opacity 90ms ease" not in hidden_motion

# Only appearance is animated.
visible_start=source.index("#stageLayout[data-scroll-from-end] #threadScrollControlMotion{")
visible_end=source.index(".thread-scroll-control-button{",visible_start)
visible_motion=source[visible_start:visible_end]
assert "transform 120ms ease" in visible_motion
assert "opacity 120ms ease" in visible_motion

# A tail transaction owns arrow visibility from the click until it settles.
assert "function suppressScrollFromEndControlForTail()" in app
suppress=app[app.index("function suppressScrollFromEndControlForTail()"):app.index("function updateScrollFromEndControl()",app.index("function suppressScrollFromEndControlForTail()"))]
assert "scrollRoot.removeAttribute('data-scroll-from-end');" in suppress
assert "stageLayout.removeAttribute('data-scroll-from-end');" in suppress
assert "threadScrollControl.disabled=true;" in suppress
assert "threadScrollControl.setAttribute('aria-hidden','true');" in suppress
assert "threadScrollUnseenBadge.hidden=true;" in suppress

update_start=app.index("function updateScrollFromEndControl()")
update_end=app.index("document.addEventListener('v21-conversation-switch'",update_start)
update=app[update_start:update_end]
assert "if(pendingTailReason){" in update
assert "suppressScrollFromEndControlForTail();" in update
assert update.index("if(pendingTailReason){") < update.index("threadScrollControl.disabled=false;")

# claimTailIntent publishes ownership before asking the control to render.
claim_start=app.index("function claimTailIntent")
claim_end=app.index("function tailGeometrySignature",claim_start)
claim=app[claim_start:claim_end]
assert "pendingTailReason=String(reason||'explicit');" in claim
assert "updateScrollFromEndControl();" in claim
assert claim.index("pendingTailReason=String(reason||'explicit');") < claim.index("updateScrollFromEndControl();")

# On abort or final settle, ownership is cleared before the control can reappear.
scroll_start=app.index("function scrollToTail")
scroll_end=app.index("function firstVisibleAnchor",scroll_start)
scroll=app[scroll_start:scroll_end]
assert scroll.count("pendingTailReason='';") >= 2
assert "updateScrollFromEndControl();" in scroll

# Arrow button remains viewport-only.
click_start=app.index("threadScrollControl.addEventListener('click'")
click_end=app.index("/* =========================================================\n   REMOTE TYPING",click_start)
click=app[click_start:click_end]
assert "scrollToTail('user-arrow')" in click
assert "reconcileCurrent" not in click

print("V21.72.39 scroll-arrow hide stability contract PASS")

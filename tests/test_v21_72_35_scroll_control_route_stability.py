from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

app=read("app.js")
shell=read("shell.js")
source=read("index.source.html")

assert "V21.72.39" in source

# Scroll-control lane changes geometry instantly; only the button itself animates.
wrap=source[source.index("#threadScrollControlWrap{"):source.index("#threadScrollControlMotion{")]
assert "transition:none;" in wrap
assert "height 140ms" not in wrap
motion=source[source.index("#threadScrollControlMotion{"):source.index(".thread-scroll-control-button{")]
assert "300ms ease 300ms" not in motion
assert "transform 120ms ease" in motion
assert "opacity 120ms ease" in motion

# The arrow is a viewport command only. Data reconciliation belongs to Sync/MessageStore.
arrow_start=app.index("threadScrollControl.addEventListener('click'")
arrow_end=app.index("/* =========================================================\n   REMOTE TYPING",arrow_start)
arrow=app[arrow_start:arrow_end]
assert "scrollToTail('user-arrow')" in arrow
assert "reconcileCurrent" not in arrow
assert "await new Promise" not in arrow

# A running explicit tail transaction absorbs geometry changes instead of
# spawning another tail transaction.
publish_start=app.index("function publishViewportGeometryChange")
publish_end=app.index("function scrollToTail",publish_start)
publish=app[publish_start:publish_end]
assert "if(!chatRouteVisible()||scrollGeometrySuspended())return false;" in publish
assert "if(pendingTailFrame||pendingTailReason)return true;" in publish

# Route lifecycle captures Chat before display:none can clamp scrollTop, ignores
# hidden-route ResizeObserver noise, then restores before normal Chat operation.
assert "navigation-will-change" in shell
nav_start=shell.index("const NavigationCommand={")
nav_end=shell.index("function formatCallElapsed",nav_start)
nav=shell[nav_start:nav_end]
assert "detail:{from:previousRoute,to:nextRoute}" in nav
assert nav.index("navigation-will-change") < nav.index("route=nextRoute")

assert "let routeScrollSnapshot=null;" in app
assert "let routeGeometrySuspended=false;" in app
assert "function chatRouteVisible()" in app
assert "document.addEventListener('navigation-will-change'" in app
assert "anchor:viewport.mode===VIEWPORT_STATES.USER_AWAY?firstVisibleAnchor():null" in app
assert "cancelPendingTailTransaction();" in app
assert "document.addEventListener('navigation-change'" in app
assert "if(snapshot?.mode===VIEWPORT_STATES.FOLLOW_TAIL)" in app
assert "if(snapshot.anchor)restoreAnchor(snapshot.anchor);" in app
assert "routeGeometrySuspended=false;" in app

print("V21.72.39 scroll-control/route stability contract PASS")

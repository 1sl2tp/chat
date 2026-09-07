from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

app=read("app.js")
sync=read("v21-sync-engine.js")
source=read("index.source.html")

assert "V21.72.38" in source

# Conversation Root publishes a switch gate before stashing/rendering the old view.
open_start=sync.index("async function openContact(contactId)")
open_end=sync.index("async function queueText",open_start)
open_body=sync[open_start:open_end]
assert "const previousContactId=currentContactId?String(currentContactId):null;" in open_body
assert "publishSwitch('start');" in open_body
assert open_body.index("publishSwitch('start');") < open_body.index("messages()?.stashCurrentView?.();")

# Local/session hydration owns the mount boundary; optional network work happens after it.
assert "const hydrated=await hydrateContactFromCache" in open_body
assert "publishSwitch('mounted');" in open_body
assert open_body.index("publishSwitch('mounted');") < open_body.index("ensureConversation(target)")
assert "if(!switchMounted)publishSwitch('abort');" in open_body

# Viewport gate removes stale arrow geometry immediately and cancels prior transactions.
assert "let contactSwitchGate=null;" in app
assert "function suppressScrollFromEndControl()" in app
assert "scrollRoot.removeAttribute('data-scroll-from-end');" in app
assert "stageLayout.removeAttribute('data-scroll-from-end');" in app
assert "stageLayout.dataset.contactSwitching='true';" in app
assert "threadScrollControl.disabled=true;" in app
assert "cancelPendingTailTransaction();" in app

# Geometry observers and arrow presentation are suspended for the active contact switch.
assert "function scrollGeometrySuspended()" in app
assert "return routeGeometrySuspended||Boolean(contactSwitchGate);" in app
publish=app[app.index("function publishViewportGeometryChange"):app.index("function scrollToTail",app.index("function publishViewportGeometryChange"))]
assert "scrollGeometrySuspended()" in publish
control=app[app.index("function updateScrollFromEndControl"):app.index("function appendScrollPolicy",app.index("function updateScrollFromEndControl"))]
assert "if(!chatRouteVisible()||scrollGeometrySuspended())" in control
assert "if(contactSwitchGate)suppressScrollFromEndControl();" in control

# The new contact gets two paint frames to finish its own restore before arrow state is recomputed.
settle=app[app.index("function settleContactSwitchGate"):app.index("/* =========================================================",app.index("function settleContactSwitchGate"))]
assert "contactSwitchSettleFrame=requestAnimationFrame" in settle
assert "contactSwitchSettleFrame2=requestAnimationFrame" in settle
assert "delete stageLayout.dataset.contactSwitching;" in settle
assert "scrollToTail('contact-switch-settled');" in settle
assert "updateScrollFromEndControl();" in settle

# CSS is a hard guard: stale data-scroll-from-end cannot reserve a lane or overlap Composer.
assert '#stageLayout[data-contact-switching="true"] #threadScrollControlWrap{' in source
gate_css=source[source.index('#stageLayout[data-contact-switching="true"] #threadScrollControlWrap{'):source.index('#threadScrollControlMotion{',source.index('#stageLayout[data-contact-switching="true"] #threadScrollControlWrap{'))]
assert "height:0!important;" in gate_css
assert "margin-bottom:0!important;" in gate_css
assert "opacity:0!important;" in gate_css
assert "pointer-events:none!important;" in gate_css
assert "transition:none!important;" in gate_css

print("V21.72.38 contact-switch scroll gate contract PASS")

from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/"app.js").read_text("utf-8")

def compact(value):
    return "".join(value.split())

c=compact(app)

# Mobile/touch: outside tap closes, another message closes the previous rail,
# and long-press remains the only opener.
assert "functiontoggleActionsForTurn(turn,force)" in c
assert "if(!turn){closeAllTurnActions();return;}" in c
assert "if(turn.dataset.actionsOpen!=='true'){closeAllTurnActions();}" in c
assert "toggleActionsForTurn(turn,true);" in app

# Keyboard users can dismiss the currently-open rail without changing route.
assert "messageWindow.addEventListener('keydown',event=>" in app
assert "if(event.key!=='Escape')return;" in app
assert "constopenTurn=messageWindow.querySelector('.message-turn[data-actions-open=\"true\"]');" in c
assert "closeAllTurnActions();" in app

# Scroll/contact/interaction changes cannot leave a stale action rail behind.
assert "scrollRoot.addEventListener('scroll',()=>{closeAllTurnActions();},{passive:true});" in c
assert "document.addEventListener('v21-active-contact-change',()=>{closeAllTurnActions();});" in c
abort=app[app.index("document.addEventListener('v21-interaction-abort'"):][:500]
assert "closeAllTurnActions();" in abort

print("V21.72.50 Region 2 message action contract PASS")

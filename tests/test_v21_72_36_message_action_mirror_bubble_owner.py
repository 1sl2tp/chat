from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

app=read("app.js")
source=read("index.source.html")

assert "V21.72.37" in source

# Action rail position remains outside the content on each side.
assert ".message-action-group.user-actions{" in source
assert "right:100%;" in source
assert ".message-action-group.assistant-actions{" in source
assert "left:100%;" in source

# DOM order mirrors by sender so visual order and keyboard/focus order agree.
action_start=app.index("function createActionGroup(message)")
action_end=app.index("let replyTarget=null;",action_start)
action=app[action_start:action_end]
assert "const actions=[];" in action
assert "actions.push(makeActionButton({" in action
assert "actions.push(copy);" in action
assert "const orderedActions=isSelf?actions:[...actions].reverse();" in action
assert "group.append(...orderedActions);" in action

# Sender surfaces are deliberately asymmetric.
assert ".user-message-unit>.message-text{" in source
user=source[source.index(".user-message-unit>.message-text{"):source.index(".assistant-message-unit>.message-text{")]
assert "background:var(--theme-surface-secondary);" in user
assert "border-radius:22px;" in user
assert "padding:9px 13px;" in user

assistant=source[source.index(".assistant-message-unit>.message-text{"):source.index("/* Desktop hover owner",source.index(".assistant-message-unit>.message-text{"))]
assert "background:transparent!important;" in assistant
assert "border:0!important;" in assistant
assert "border-radius:0!important;" in assistant
assert "box-shadow:none!important;" in assistant
assert "padding:0!important;" in assistant

# Media remains a sibling of message-text, so its own file/audio/image container is not double wrapped.
assert "unit.appendChild(text);" in app
assert "if(message.media){" in app
assert "if(mediaNode)unit.appendChild(mediaNode);" in app

# Reply quote stays inside the text surface: outgoing inherits bubble; incoming stays canvas-native.
assert "const replyQuote=createReplyQuote(message.replyTo);" in app
assert "if(replyQuote)text.appendChild(replyQuote);" in app

print("V21.72.37 message action mirror / bubble owner contract PASS")
